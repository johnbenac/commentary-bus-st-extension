#!/usr/bin/env node
// Unified Commentary Service - SSE Server + Claude File Monitor
// Combines Commentary Bus (SSE) and Claude Commentary Bridge (file monitoring)

import express from 'express';
import cors from 'cors';
import chokidar from 'chokidar';
import TailFile from 'tail-file';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

// ==================== Configuration ====================
const PORT = process.env.PORT || 5055;
const AUTH_TOKEN = process.env.CBUS_TOKEN || null;
const CONFIG_FILE = process.env.CONFIG_FILE || './filters.yaml';

// Mutable session directory (can be updated via API)
let SESSION_DIR = process.env.SESSION_DIR || '/root/.claude/projects/-var-workstation-assistants-commentator';

// ==================== SSE Server State ====================
const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(cors({ origin: '*', credentials: false }));

// Per-channel client sets and circular buffers
const clientsByChannel = new Map();   // channel -> Set(res)
const buffersByChannel = new Map();   // channel -> Array<{ id, data }>
const MAX_BUFFER = 50;
let nextId = 1;

// ==================== File Monitor State ====================
const tails = new Map(); // filepath -> TailFile
const rateLimits = new Map(); // channel -> { tokens, lastRefill }
const seen = new Set();      // de-dupe
const MAX_SEEN = 10000;

// Rate limiting
const RATE_LIMIT_PER_MIN = 10;
const RATE_BURST = 20;

// Global state for dynamic folder switching
let currentWatcher = null;

// Default config (can be overridden by YAML)
let config = {
  enabled: true,
  channels: { default: 'claude-meta' },
  filters: {
    include_types: ['assistant', 'tool_call', 'git_action', 'file_operation', 'session_start', 'user'],
    include_subtypes: ['assistant_text', 'assistant_tool_use', 'user_text', 'session_start', 'session_end'],
    exclude_subtypes: [],
    exclude_patterns: ['.*heartbeat.*', '.*ping.*'],
    min_message_length: 10
  },
  ordering: { stabilization_ms: 150 }
};

// Load config overrides
try {
  if (fs.existsSync(CONFIG_FILE)) {
    const yamlStr = fs.readFileSync(CONFIG_FILE, 'utf8');
    const loaded = yaml.load(yamlStr);
    config = { ...config, ...loaded };
    console.log(`📝 Loaded config from ${CONFIG_FILE}`);
  }
} catch (e) {
  console.error(`⚠️  Config load error:`, e.message);
}

// ==================== SSE Functions ====================
function getChannel(name) {
  const key = String(name || 'default');
  if (!clientsByChannel.has(key)) clientsByChannel.set(key, new Set());
  if (!buffersByChannel.has(key)) buffersByChannel.set(key, []);
  return key;
}

function writeSSE(res, { event, data, id }) {
  if (id) res.write(`id: ${id}\n`);
  if (event) res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function broadcast(channel, event, payload) {
  const id = nextId++;
  // buffer for late joiners
  const normalizedChannel = getChannel(channel);
  const buf = buffersByChannel.get(normalizedChannel);
  buf.push({ id, data: payload });
  if (buf.length > MAX_BUFFER) buf.shift();

  const set = clientsByChannel.get(normalizedChannel);
  for (const res of set) {
    writeSSE(res, { event, data: payload, id });
  }
}

// ==================== File Monitoring Functions ====================

// Path transformation (user-friendly to Claude format)
function projectPathToSessionPath(inputPath) {
  if (!inputPath) return null;
  
  // Already in Claude format?
  if (inputPath.startsWith('/root/.claude/projects/')) {
    return inputPath;
  }
  
  // Transform: /var/workstation/my-project -> /root/.claude/projects/-var-workstation-my-project
  const cleanPath = inputPath.replace(/\/+$/, ''); // Remove trailing slashes
  const transformed = cleanPath.replace(/^\//, '').replace(/\//g, '-');
  return `/root/.claude/projects/-${transformed}`;
}

// Message filtering - now includes subtype support
function shouldSend(event) {
  if (!config.enabled) return false;
  
  // First check base type
  const eventType = event.event || event.type || 'unknown';
  if (config.filters.include_types?.length && !config.filters.include_types.includes(eventType)) {
    return false;
  }

  // Then check subtype filtering
  const subtype = classifyEvent(event);
  if (config.filters.include_subtypes?.length && !config.filters.include_subtypes.includes(subtype)) {
    return false;
  }
  if (config.filters.exclude_subtypes?.length && config.filters.exclude_subtypes.includes(subtype)) {
    return false;
  }

  const text = JSON.stringify(event);
  if (config.filters.exclude_patterns?.length) {
    for (const pattern of config.filters.exclude_patterns) {
      if (new RegExp(pattern).test(text)) return false;
    }
  }

  if (config.filters.min_message_length && text.length < config.filters.min_message_length) {
    return false;
  }

  const hash = `${event.ts || Date.now()}-${eventType}-${text.substring(0, 100)}`;
  if (seen.has(hash)) return false;
  
  seen.add(hash);
  if (seen.size > MAX_SEEN) {
    const arr = [...seen];
    arr.slice(0, MAX_SEEN / 2).forEach(h => seen.delete(h));
  }

  return true;
}

// Helper function from working bridge
function truncate(s, n = 3000) { return !s ? '' : (s.length <= n ? s : s.slice(0, n) + '...'); }

// ---------- Unified message helpers ----------

// Extract all text blocks in order (works for user & assistant)
function extractTextBlocks(event) {
  const c = event?.message?.content;
  if (typeof c === 'string') return c;  // Plain string (user text messages)
  if (Array.isArray(c)) {
    const out = [];
    for (const b of c) {
      if (b?.type === 'text' && typeof b.text === 'string' && b.text.trim()) {
        out.push(b.text);
      }
    }
    return out.join('\n');
  }
  return '';
}

// Summarize user tool_result blocks (if you choose to show them)
function formatUserToolResult(event) {
  const blocks = (event?.message?.content || []).filter(b => b?.type === 'tool_result');
  if (!blocks.length) return '';
  const parts = [];
  for (const [i, b] of blocks.entries()) {
    const raw = typeof b.content === 'string' ? b.content
      : (Array.isArray(b.content) ? JSON.stringify(b.content) : String(b.content ?? ''));
    parts.push(`#${i+1} ${truncate(raw, 800)}`);
    if (i === 1 && blocks.length > 2) { // cap preview
      parts.push(`(+${blocks.length - 2} more)`);
      break;
    }
  }
  return `🧰 Tool result${blocks.length > 1 ? 's' : ''}: ${parts.join(' | ')}`;
}

// Subtype classifier: one place to decide routing
function classifyEvent(event) {
  const t = event?.type || event?.event || 'unknown';
  const c = event?.message?.content;
  
  if (t === 'assistant') {
    return event.tool_name ? 'assistant_tool_use' : 'assistant_text';
  }
  
  if (t === 'user') {
    // Handle string content (plain user text)
    if (typeof c === 'string') return 'user_text';
    
    // Handle array content
    if (Array.isArray(c)) {
      const first = c[0];
      if (first?.type === 'tool_result') return 'user_tool_result';
      if (first?.type === 'text' && /\binterrupted\b/i.test(first.text || '')) return 'user_interrupt';
      if (c.some(b => b?.type === 'text')) return 'user_text';
    }
    return 'user_text'; // Default for user messages
  }
  
  return t; // session_start, session_end, error, etc.
}

// Map subtype -> speaker name (overridable later via config if desired)
function speakerFor(subtype) {
  if (subtype === 'user_tool_result') return 'Tools';   // Synthetic tool results
  if (subtype === 'user_interrupt')  return 'System';   // System interruptions
  return subtype.startsWith('user_') ? 'You' : 'Claude';
}

// Map subtype -> origin type for clearer tagging
function originFor(subtype) {
  if (subtype === 'user_tool_result') return 'tool';
  if (subtype === 'user_interrupt')  return 'system';
  if (subtype.startsWith('user_'))   return 'human';
  return 'assistant';
}

// Format tool messages - copied from working bridge
function formatToolMessage(event) {
  const toolName = event.tool_name;
  if (!toolName) return `🔧 Tool executed`;
  let toolInput = {};
  if (event.message?.content) {
    for (const c of event.message.content) {
      if (c.type === 'tool_use' && c.name === toolName) { toolInput = c.input || {}; break; }
    }
  }
  switch (toolName) {
    case 'Bash':  return `${toolInput.command || ''} → ${toolInput.description || ''}`;
    case 'Write': {
      const p = toolInput.file_path || ''; const content = toolInput.content || '';
      return `Writing ${p} (${content.length}B): ${truncate(content, 2000)}`;
    }
    case 'Read':  return `Reading ${toolInput.file_path || ''}${toolInput.limit ? ` (${toolInput.limit} lines)` : ''}: ${toolInput.description || ''}`;
    case 'Edit':  return `Editing ${toolInput.file_path || ''}: "${truncate(toolInput.old_string || '', 500)}" → "${truncate(toolInput.new_string || '', 500)}"`;
    case 'MultiEdit': {
      const p = toolInput.file_path || ''; const editsCount = toolInput.edits?.length || 0;
      const details = toolInput.edits?.slice(0,2).map(e => `"${truncate(e.old_string,100)}" → "${truncate(e.new_string,100)}"`).join('; ') || '';
      return `MultiEdit ${p}: ${editsCount} changes - ${details}`;
    }
    case 'Glob':  return `Searching files: "${toolInput.pattern || ''}" in ${toolInput.path || '.'}`;
    case 'Grep': {
      const opts = [];
      if (toolInput['-i']) opts.push('case insensitive');
      if (toolInput.glob) opts.push(`glob: ${toolInput.glob}`);
      return `Searching "${toolInput.pattern || ''}" in ${toolInput.path || '.'}${opts.length ? ` (${opts.join(', ')})` : ''}`;
    }
    case 'TodoWrite': {
      const n = toolInput.todos?.length || 0;
      const d = toolInput.todos?.slice(0,2).map(t => `${t.status}: "${truncate(t.content, 100)}"`).join('; ') || '';
      return `${n} todos updated → ${d}${n>2?` (and ${n-2} more)`:''}`;
    }
    case 'LS':    return `Listing ${toolInput.path || ''}${toolInput.ignore ? ` (ignoring: ${toolInput.ignore.join(', ')})` : ''}`;
    default:      return `${toolName}: ${toolInput.description || ''}`;
  }
}

// Format messages for display - unified registry-based approach with type info
function formatMessage(event) {
  const subtype = classifyEvent(event);
  
  // Collect all type information
  const types = [];
  
  // Base type
  if (event.type) types.push(`type:${event.type}`);
  if (event.event) types.push(`event:${event.event}`);
  
  // Subtype
  types.push(`subtype:${subtype}`);
  
  // Origin type for clarity
  const origin = originFor(subtype);
  types.push(`origin:${origin}`);
  
  // Content types if they exist
  const content = event?.message?.content;
  if (Array.isArray(content)) {
    const contentTypes = content.map(c => c?.type).filter(Boolean);
    if (contentTypes.length > 0) {
      types.push(`content:[${contentTypes.join(',')}]`);
    }
  } else if (typeof content === 'string') {
    types.push(`content:string`);
  }
  
  // Tool name if present
  if (event.tool_name) types.push(`tool:${event.tool_name}`);
  
  // Format type prefix
  const typePrefix = `[${types.join(' ')}] `;

  const HANDLERS = {
    'assistant_tool_use': e => typePrefix + formatToolMessage(e),
    'assistant_text':     e => typePrefix + truncate(extractTextBlocks(e), 2500),
    'user_text':          e => typePrefix + truncate(extractTextBlocks(e), 2500),
    'user_tool_result':   e => typePrefix + formatUserToolResult(e),
    'session_start':      () => typePrefix + '🚀 New Claude session started',
    'session_end':        () => typePrefix + '🏁 Session ended',
    'error':              e => typePrefix + `⚠️ ${truncate(extractTextBlocks(e) || JSON.stringify(e).slice(0, 2000), 2000)}`,
    'unknown':            () => typePrefix + 'Activity'
  };

  return (HANDLERS[subtype] || HANDLERS['unknown'])(event);
}

// Rate limiting
function checkRateLimit(channel) {
  const now = Date.now();
  let limiter = rateLimits.get(channel);
  
  if (!limiter) {
    limiter = { tokens: RATE_BURST, lastRefill: now };
    rateLimits.set(channel, limiter);
  }

  const elapsed = now - limiter.lastRefill;
  const refillTokens = Math.floor(elapsed / 60000 * RATE_LIMIT_PER_MIN);
  
  if (refillTokens > 0) {
    limiter.tokens = Math.min(RATE_BURST, limiter.tokens + refillTokens);
    limiter.lastRefill = now;
  }

  if (limiter.tokens <= 0) {
    return false;
  }

  limiter.tokens--;
  return true;
}

// Process and send message - now with dynamic speaker names
async function processMessage(event, sessionFile) {
  if (!shouldSend(event)) return;

  // Always use 'default' channel so clients can connect easily
  const channel = event.channel || 'default';
  
  if (!checkRateLimit(channel)) {
    console.log(`⏳ Rate limited: ${channel}`);
    return;
  }

  const text = formatMessage(event);
  const subtype = classifyEvent(event);
  const speaker = speakerFor(subtype);
  
  const payload = {
    channel,
    name: speaker,
    text,
    ts: event.ts || Date.now(),
    type: event.event || event.type,
    subtype: subtype,
    sessionFile: path.basename(sessionFile),
    isUserMessage: subtype === 'user_text'  // Flag for real user messages
  };

  // Broadcast via SSE
  broadcast(channel, 'chat', payload);
  // console.log('📣 broadcast', { channel, type: payload.type, subtype });
}

// Message ordering buffer
const pendingMessages = [];
let orderingTimer = null;

function flushMessages() {
  if (pendingMessages.length === 0) return;
  
  pendingMessages.sort((a, b) => (a.msg.ts || 0) - (b.msg.ts || 0));
  
  for (const { msg, sessionFile } of pendingMessages) {
    processMessage(msg, sessionFile);
  }
  
  pendingMessages.length = 0;
}

function queueMessage(msg, sessionFile) {
  pendingMessages.push({ msg, sessionFile });
  
  if (orderingTimer) clearTimeout(orderingTimer);
  orderingTimer = setTimeout(flushMessages, config.ordering.stabilization_ms || 150);
}

// File monitoring
function tailFile(filepath) {
  if (tails.has(filepath)) return;

  // Start from end, emit one 'line' per newline (per tail-file docs)
  const tail = new TailFile(filepath, { encoding: 'utf8', startPos: 'end' });
  tails.set(filepath, tail);

  console.log(`👂 Tail started: ${filepath}`);

  tail.on('line', (line) => {
    try {
      const msg = JSON.parse(line);
      // Detect tool usage in assistant messages
      if (msg.type === 'assistant' && msg.message?.content) {
        for (const c of msg.message.content) {
          if (c.type === 'tool_use') {
            msg.tool_name = c.name;
            msg.tool_input = c.input;
            break;
          }
        }
      }
      queueMessage(msg, filepath);
    } catch (e) {
      console.error(`❌ Parse error in ${filepath}:`, e.message);
    }
  });

  tail.on('error', err => {
    console.error(`❌ Tail error ${filepath}:`, err.message);
    tails.delete(filepath);
  });

  tail.on('eof', () => {
    console.log(`📄 EOF reached: ${filepath}`);
  });

  tail.on('move', (oldPath, newPath) => {
    console.log(`🔄 File moved: ${oldPath} → ${newPath}`);
  });

  // Promise-returning start helps surface startup errors
  tail.startP().catch(err => {
    console.error(`💥 failed to start tail [${filepath}]: ${err.message}`);
    tails.delete(filepath);
  });
}

function untailFile(filepath) {
  const tail = tails.get(filepath);
  if (!tail) return;

  tail.stop();
  tails.delete(filepath);
  console.log(`🛑 Tail stopped: ${filepath}`);
}

// Folder watching
function startWatching(folder) {
  if (!fs.existsSync(folder)) {
    throw new Error(`Not a directory: ${folder}`);
  }

  // Stop previous watcher if switching folders
  if (currentWatcher) {
    console.log(`🛑 Stopping previous folder watch`);
    currentWatcher.close();
    
    // Stop all tails
    for (const [fp] of tails) {
      untailFile(fp);
    }
  }

  const pattern = path.join(folder, '*.jsonl');
  
  currentWatcher = chokidar.watch(pattern, {
    persistent: true,
    ignoreInitial: false,
    followSymlinks: false,
    depth: 0,
    awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 }
  });

  currentWatcher
    .on('add', fp => {
      console.log(`➕ Session file discovered: ${fp}`);
      tailFile(fp);
    })
    .on('unlink', fp => {
      console.log(`➖ Session file removed: ${fp}`);
      untailFile(fp);
    })
    .on('error', err => {
      console.error(`❌ Watcher error:`, err);
    });

  SESSION_DIR = folder;
  console.log(`👀 Watching folder: ${folder}`);
}

// ==================== HTTP Routes ====================

// SSE endpoint
app.get('/events', (req, res) => {
  const channel = getChannel(req.query.channel);
  console.log('[SSE] client connect →', channel);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // nginx

  // Send connected event
  const connPayload = { 
    type: 'connected', 
    ts: Date.now(), 
    channel,
    clients: clientsByChannel.get(channel).size + 1
  };
  writeSSE(res, { event: 'connected', data: connPayload });

  // Replay buffer
  const afterId = parseInt(req.headers['last-event-id']) || 0;
  const buffer = buffersByChannel.get(channel);
  for (const { id, data } of buffer) {
    if (id > afterId) {
      writeSSE(res, { event: 'chat', data, id });
    }
  }

  // Add to channel
  clientsByChannel.get(channel).add(res);

  // Heartbeat
  const hb = setInterval(() => {
    const hbPayload = { 
      type: 'heartbeat', 
      ts: Date.now(), 
      channel,
      clients: clientsByChannel.get(channel).size
    };
    writeSSE(res, { event: 'heartbeat', data: hbPayload });
  }, 5000);

  // Cleanup on disconnect
  const cleanup = () => {
    clearInterval(hb);
    clientsByChannel.get(channel).delete(res);
    console.log('[SSE] client disconnect ←', channel);
  };

  res.on('close', cleanup);
  res.on('error', cleanup);
});

// Message ingestion endpoint
app.post('/ingest', (req, res) => {
  // Backward compat: accept either Authorization: Bearer or X-Auth-Token
  const bearerOk = req.headers.authorization === `Bearer ${AUTH_TOKEN}`;
  const headerOk = req.get('X-Auth-Token') === AUTH_TOKEN;
  if (AUTH_TOKEN && !(bearerOk || headerOk)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { channel: reqChannel, name = 'System', text } = req.body;
  if (!text) {
    return res.status(400).json({ error: 'Missing text' });
  }

  const channel = getChannel(reqChannel);
  const payload = { channel, name, text, ts: Date.now() };
  
  broadcast(channel, 'chat', payload);
  res.json({ ok: true, channel, id: nextId - 1 });
});

// Status endpoint
app.get('/status', (req, res) => {
  const status = {
    clients: {},
    buffers: {},
    totalClients: 0,
    monitoring: {
      enabled: !!SESSION_DIR,
      sessionDir: SESSION_DIR,
      activeTails: tails.size,
      watcherActive: !!currentWatcher
    }
  };

  for (const [ch, set] of clientsByChannel) {
    status.clients[ch] = set.size;
    status.totalClients += set.size;
  }

  for (const [ch, buf] of buffersByChannel) {
    status.buffers[ch] = buf.length;
  }

  res.json(status);
});

// Configuration endpoints
app.get('/config/session-dir', (req, res) => {
  res.json({
    sessionDir: SESSION_DIR,
    watching: !!currentWatcher,
    activeTails: tails.size
  });
});

app.post('/config/session-dir', (req, res) => {
  const { sessionDir } = req.body;
  
  if (!sessionDir) {
    return res.status(400).json({ error: 'Missing sessionDir' });
  }

  try {
    // Transform user-friendly path to Claude format
    const transformedPath = projectPathToSessionPath(sessionDir);
    
    // Verify directory exists
    if (!fs.existsSync(transformedPath)) {
      return res.status(400).json({ 
        error: `Session directory not found: ${transformedPath}`,
        inputPath: sessionDir,
        transformedPath
      });
    }

    // Start watching new directory
    startWatching(transformedPath);
    
    res.json({ 
      success: true, 
      sessionDir: transformedPath,
      inputPath: sessionDir
    });
  } catch (err) {
    res.status(500).json({ 
      error: err.message,
      inputPath: sessionDir
    });
  }
});

// ==================== Startup ====================
async function startup() {
  console.log(`🌉 Unified Commentary Service starting...`);
  console.log(`📡 Port: ${PORT}`);
  console.log(`🔧 Auth: ${AUTH_TOKEN ? 'token required' : 'none'}`);
  
  // Start folder watching if SESSION_DIR provided
  if (SESSION_DIR) {
    try {
      const transformedPath = projectPathToSessionPath(SESSION_DIR);
      startWatching(transformedPath);
    } catch (err) {
      console.error(`⚠️  Initial folder watch failed:`, err.message);
      console.log(`💡 Configure via POST /config/session-dir`);
    }
  } else {
    console.log(`💡 No SESSION_DIR set - configure via POST /config/session-dir`);
  }

  // Start HTTP server
  app.listen(PORT, '127.0.0.1', () => {
    console.log(`✅ Unified service running on http://127.0.0.1:${PORT}`);
    console.log(`🚀 Ready! Endpoints:`);
    console.log(`   GET  /events - SSE stream`);
    console.log(`   POST /ingest - Send messages`);
    console.log(`   GET  /status - Service status`);
    console.log(`   GET  /config/session-dir - Current config`);
    console.log(`   POST /config/session-dir - Update folder`);
  });
}

// Handle shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down...');
  
  if (currentWatcher) {
    currentWatcher.close();
  }
  
  for (const [fp] of tails) {
    untailFile(fp);
  }
  
  process.exit(0);
});

// Start service
startup().catch(err => {
  console.error('❌ Startup failed:', err);
  process.exit(1);
});