#!/usr/bin/env node
// Claude Commentary Bridge — Folder-based monitoring (v1.1)
import chokidar from 'chokidar';
import TailFile from 'tail-file';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import express from 'express';
import cors from 'cors';

// ==================== Config & Env ====================
const BUS_URL     = process.env.BUS_URL      || 'http://127.0.0.1:5055';
const AUTH_TOKEN  = process.env.CBUS_TOKEN   || null;
const BRIDGE_PORT = process.env.BRIDGE_PORT  || 5056;  // Bridge API port
let SESSION_DIR   = process.env.SESSION_DIR  || process.argv[2] || null;  // <- FOLDER, not file (mutable)
const CONFIG_FILE = process.env.CONFIG_FILE  || './filters.yaml';

// Rate limiting
const RATE_LIMIT_PER_MIN = 10;
const RATE_BURST = 20;

// In-memory
const tails = new Map(); // filepath -> TailFile
const rateLimits = new Map(); // channel -> { tokens, lastRefill }
const seen = new Set();      // de-dupe
const MAX_SEEN = 10000;

// Global state for dynamic folder switching
let currentWatcher = null;

// Default config (can be overridden by YAML)
let config = {
  enabled: true,
  channels: {
    default: 'claude-meta'
  },
  filters: {
    include_types: ['assistant', 'tool_call', 'git_action', 'file_operation', 'session_start', 'user'],
    exclude_patterns: ['.*heartbeat.*', '.*ping.*'],
    min_message_length: 10
  },
  ordering: {
    // 150ms buffer to sort bursts by event.timestamp across multiple sessions
    stabilization_ms: 150
  }
};

// Load overrides
try {
  if (fs.existsSync(CONFIG_FILE)) {
    config = { ...config, ...yaml.load(fs.readFileSync(CONFIG_FILE, 'utf8')) };
    console.log(`📝 Loaded config from ${CONFIG_FILE}`);
  }
} catch (err) {
  console.warn(`⚠️  Failed to load config: ${err.message}`);
}

// ==================== Utilities ====================
function checkRateLimit(channel) {
  const now = Date.now();
  if (!rateLimits.has(channel)) rateLimits.set(channel, { tokens: RATE_BURST, lastRefill: now });
  const bucket = rateLimits.get(channel);
  const elapsed = now - bucket.lastRefill;
  const tokensToAdd = Math.floor(elapsed / 6000); // ~10/min
  if (tokensToAdd > 0) {
    bucket.tokens = Math.min(RATE_BURST, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;
  }
  if (bucket.tokens > 0) { bucket.tokens--; return true; }
  return false;
}

async function sendToCommentaryBus(text, channel = 'default', name = 'Claude Meta') {
  if (!checkRateLimit(channel)) return false;
  const headers = { 'Content-Type': 'application/json' };
  if (AUTH_TOKEN) headers['X-Auth-Token'] = AUTH_TOKEN;
  const res = await fetch(`${BUS_URL}/ingest`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ channel, name, text })
  });
  if (!res.ok) throw new Error(`Bus ${res.status}`);
  return true;
}

function truncate(s, n = 3000) { return !s ? '' : (s.length <= n ? s : s.slice(0, n) + '...'); }

function getChannel(/* event */) {
  // Hook for future {cwd, gitBranch} mapping; "default" for now
  return 'default';
}

function formatToolMessage(event, branchLabel, dir) {
  const toolName = event.tool_name;
  if (!toolName) return `🔧 Tool executed in ${dir}${branchLabel}`;
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

function formatMessage(event) {
  const dir = path.basename(event.cwd || '') || 'unknown';
  const branch = event.gitBranch && event.gitBranch !== 'main' ? ` [${event.gitBranch}]` : '';
  switch (event.type) {
    case 'user': {
      const s = truncate(event.message?.content || '', 2500);
      return `${s}`;
    }
    case 'assistant': {
      if (event.tool_name) return formatToolMessage(event, branch, dir);
      const txt = event.message?.content?.[0]?.text || '';
      return `${truncate(txt, 2500)}`;
    }
    case 'tool_call':
      return formatToolMessage(event, branch, dir);
    default:
      return `Activity in ${dir}${branch}`;
  }
}

// ==================== Multi-file tail orchestration ====================
function startTail(filepath) {
  if (tails.has(filepath)) return;

  const tail = new TailFile(filepath, {
    startPos: 'end',
    retryTimeout: 5000,
    pollFileIntervalMs: 1000
  })
    .on('line', line => enqueueEvent(line))
    .on('rotate', (oldP, newP) => console.log(`🔄 rotate ${oldP} → ${newP}`))
    .on('error', err => {
      console.error(`💥 tail error [${filepath}]: ${err.message}`);
      stopTail(filepath);
    });

  tail.startP().then(() => {
    tails.set(filepath, tail);
    console.log(`👂 Tail started: ${filepath}`);
  }).catch(err => {
    console.error(`💥 failed to start tail [${filepath}]: ${err.message}`);
  });
}

function stopTail(filepath) {
  const t = tails.get(filepath);
  if (t) {
    try { t.stop(); } catch {}
    tails.delete(filepath);
    console.log(`🛑 Tail stopped: ${filepath}`);
  }
}

// Small ordering buffer across sessions
let buffer = [];
let flushTimer = null;
function enqueueEvent(line) {
  try {
    const raw = JSON.parse(line);
    // Normalize to your event schema
    let event;
    if (raw.message && raw.cwd && raw.type) {
      event = {
        type: raw.type,
        user: raw.userType === 'external' ? 'root' : raw.userType,
        cwd: raw.cwd,
        sessionId: raw.sessionId,
        timestamp: raw.timestamp,
        gitBranch: raw.gitBranch || 'main',
        version: raw.version,
        message: raw.message,
        tool_name: null
      };
      if (raw.message?.content) {
        for (const c of raw.message.content) {
          if (c.type === 'tool_use') { event.tool_name = c.name; break; }
        }
      }
    } else {
      // If some other format sneaks in, keep it but ensure timestamp/session
      event = { ...raw, gitBranch: raw.gitBranch || 'main' };
    }

    const id = `${event.timestamp}-${event.sessionId}-${event.type}`;
    if (seen.has(id)) return;
    seen.add(id);
    if (seen.size > MAX_SEEN) {
      const arr = Array.from(seen);
      seen.clear();
      arr.slice(-5000).forEach(x => seen.add(x));
    }

    if (!config.enabled) return;
    if (!config.filters.include_types.includes(event.type)) return;

    const s = JSON.stringify(event).toLowerCase();
    for (const pat of config.filters.exclude_patterns) {
      if (new RegExp(pat).test(s)) return;
    }

    buffer.push(event);
    if (!flushTimer) {
      flushTimer = setTimeout(flushBuffer, config.ordering.stabilization_ms || 0);
    }
  } catch (err) {
    console.error(`💥 parse error: ${err.message}`);
  }
}

async function flushBuffer() {
  const events = buffer;
  buffer = [];
  flushTimer = null;

  // Order by timestamp if provided
  events.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

  for (const event of events) {
    const channel = getChannel(event);
    const text = formatMessage(event);
    if (text && text.length >= config.filters.min_message_length) {
      try { await sendToCommentaryBus(text, channel); }
      catch (e) { console.error(`❌ bus send failed: ${e.message}`); }
    }
  }
}

// ==================== Dynamic Folder Switching ====================
async function stopCurrentWatcher() {
  if (currentWatcher) {
    console.log(`🛑 Stopping folder monitoring for: ${SESSION_DIR}`);
    try { await currentWatcher.close(); } catch {}
    currentWatcher = null;
  }
  
  // Stop all active tails
  for (const fp of Array.from(tails.keys())) {
    stopTail(fp);
  }
}

async function startFolderWatching(newSessionDir) {
  // Validate directory
  const validation = validateSessionPath(newSessionDir);
  if (!validation.valid) {
    throw new Error(validation.error);
  }
  
  // Stop current watching
  await stopCurrentWatcher();
  
  // Update global state
  SESSION_DIR = newSessionDir;
  console.log(`📁 Switching to folder: ${SESSION_DIR}`);
  
  // Check for existing files
  const initial = fs.readdirSync(SESSION_DIR).filter(f => f.endsWith('.jsonl'));
  if (initial.length === 0) {
    console.log(`⚠️  No .jsonl session files found in ${SESSION_DIR} (watching for new ones)`);
  }
  
  // Start new folder watcher
  const pattern = path.join(SESSION_DIR, '*.jsonl');
  const watcher = chokidar.watch(pattern, {
    ignoreInitial: false,   // start tails for existing files too
    depth: 0,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 }
  });
  
  watcher
    .on('add',    fp => startTail(fp))
    .on('change', _  => {}) // TailFile handles appended lines
    .on('unlink', fp => stopTail(fp))
    .on('error',  err => console.error(`💥 watcher error: ${err.message}`));
  
  currentWatcher = watcher;
  
  // Notify Commentary Bus
  try { 
    await sendToCommentaryBus(`🔄 Bridge switched to folder: ${SESSION_DIR}`, 'default', 'Bridge System'); 
  } catch {}
  
  return {
    sessionDir: SESSION_DIR,
    sessionFiles: initial.length,
    message: `Successfully switched to monitoring ${SESSION_DIR}`
  };
}

// ==================== Path Transformation ====================
function projectPathToSessionPath(inputPath) {
  // If already a session path, use as-is
  if (inputPath.startsWith('/root/.claude/projects/')) {
    return inputPath;
  }
  
  // Transform project path to session path
  // Remove trailing slashes for consistency
  const cleanPath = inputPath.replace(/\/+$/, '');
  
  // Remove leading slash and replace remaining slashes with dashes
  const transformed = cleanPath.replace(/^\//, '').replace(/\//g, '-');
  
  return `/root/.claude/projects/-${transformed}`;
}

function validateSessionPath(sessionPath) {
  if (!fs.existsSync(sessionPath)) {
    return { valid: false, error: `Session directory not found: ${sessionPath}` };
  }
  
  if (!fs.statSync(sessionPath).isDirectory()) {
    return { valid: false, error: `Not a directory: ${sessionPath}` };
  }
  
  return { valid: true };
}

// ==================== HTTP API ====================
function createBridgeAPI() {
  const app = express();
  app.use(express.json());
  app.use(cors({
    origin: '*',
    credentials: false
  }));
  
  // Get current session directory
  app.get('/config/session-dir', (req, res) => {
    res.json({ 
      sessionDir: SESSION_DIR,
      activeTails: tails.size,
      watcherActive: !!currentWatcher
    });
  });
  
  // Set new session directory
  app.post('/config/session-dir', async (req, res) => {
    const { sessionDir } = req.body;
    
    if (!sessionDir) {
      return res.status(400).json({ error: 'sessionDir is required' });
    }
    
    try {
      // Transform project path to session path if needed
      const actualSessionPath = projectPathToSessionPath(sessionDir);
      
      // Validate the transformed path
      const validation = validateSessionPath(actualSessionPath);
      if (!validation.valid) {
        return res.status(400).json({ 
          error: validation.error,
          inputPath: sessionDir,
          transformedPath: actualSessionPath
        });
      }
      
      const result = await startFolderWatching(actualSessionPath);
      res.json({
        ...result,
        inputPath: sessionDir,
        transformedPath: actualSessionPath
      });
    } catch (error) {
      console.error(`❌ Failed to switch folder: ${error.message}`);
      res.status(400).json({ error: error.message });
    }
  });
  
  // Bridge status
  app.get('/status', (req, res) => {
    res.json({
      sessionDir: SESSION_DIR,
      activeTails: tails.size,
      watcherActive: !!currentWatcher,
      busUrl: BUS_URL,
      configEnabled: config.enabled
    });
  });
  
  return app;
}

// ==================== Startup ====================
async function main() {
  console.log('🌉 Claude Commentary Bridge starting (folder mode + HTTP API)…');
  console.log(`📡 Bus: ${BUS_URL}`);
  console.log(`🔧 Auth: ${AUTH_TOKEN ? 'configured' : 'none'}`);
  console.log(`🌐 Bridge API: http://127.0.0.1:${BRIDGE_PORT}`);

  // Ping bus
  try {
    const r = await fetch(`${BUS_URL}/status`);
    if (!r.ok) throw new Error(`status ${r.status}`);
    const st = await r.json().catch(() => ({}));
    console.log(`✅ Bus connected (clients: ${st.clientsTotal ?? st.clients ?? 'n/a'})`);
  } catch (e) {
    console.error(`❌ Bus unreachable: ${e.message}`);
    process.exit(2);
  }

  // Start HTTP API server
  const apiApp = createBridgeAPI();
  const apiServer = apiApp.listen(BRIDGE_PORT, '127.0.0.1', () => {
    console.log(`✅ Bridge API listening on port ${BRIDGE_PORT}`);
  });

  // Start initial folder watching if SESSION_DIR provided
  if (SESSION_DIR) {
    try {
      await startFolderWatching(SESSION_DIR);
      console.log(`✅ Initial folder monitoring started: ${SESSION_DIR}`);
    } catch (error) {
      console.error(`❌ Failed to start initial monitoring: ${error.message}`);
      // Don't exit - API can still be used to set folder
    }
  } else {
    console.log(`⚠️  No SESSION_DIR specified - use API to set folder: POST /config/session-dir`);
  }

  // Notify
  try { 
    await sendToCommentaryBus(`🌉 Bridge started with API on port ${BRIDGE_PORT}`, 'default', 'Bridge System'); 
  } catch {}
  console.log('🚀 Bridge running! Use API for dynamic folder switching. Ctrl+C to stop');

  // Graceful shutdown
  const shutdown = async () => {
    console.log('🛑 Shutting down…');
    try {
      await stopCurrentWatcher();
      apiServer.close();
    } catch {}
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(err => {
  console.error(`💥 Bridge failed: ${err.message}`);
  process.exit(1);
});