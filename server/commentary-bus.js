// Commentary Bus (SSE) - channels + ingest + replay
import express from 'express';
import cors from 'cors';

// Auth token for ingest endpoint
const AUTH_TOKEN = process.env.CBUS_TOKEN || null;

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(cors({
  origin: '*',
  credentials: false
}));

// Per-channel client sets and circular buffers
const clientsByChannel = new Map();   // channel -> Set(res)
const buffersByChannel = new Map();   // channel -> Array<{ id, data }>
const MAX_BUFFER = 50;
let nextId = 1;

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
  const buf = buffersByChannel.get(channel);
  buf.push({ id, data: payload });
  if (buf.length > MAX_BUFFER) buf.shift();

  const set = clientsByChannel.get(channel);
  for (const res of set) {
    writeSSE(res, { event, data: payload, id });
  }
}

app.get('/events', (req, res) => {
  const channel = getChannel(req.query.channel);
  console.log('[SSE] client connect →', channel);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
    'Access-Control-Allow-Origin': '*',
  });
  // reconnection delay
  res.write('retry: 3000\n\n');

  // connected notice
  writeSSE(res, {
    event: 'connected',
    data: { message: 'connected', channel, ts: Date.now() },
    id: nextId++
  });

  // replay recent messages for this channel (honor Last-Event-ID)
  const lastId = Number(req.headers['last-event-id'] || 0);
  const recent = buffersByChannel.get(channel);
  for (const item of recent) {
    if (item.id > lastId) {
      writeSSE(res, { event: 'chat', data: item.data, id: item.id });
    }
  }

  // heartbeat timer
  const t = setInterval(() => {
    writeSSE(res, {
      event: 'heartbeat',
      data: { type: 'heartbeat', ts: Date.now(), channel, clients: clientsByChannel.get(channel).size },
      id: nextId++
    });
  }, 5000);

  // track client and cleanup
  clientsByChannel.get(channel).add(res);
  req.on('close', () => {
    clearInterval(t);
    clientsByChannel.get(channel).delete(res);
    console.log('[SSE] client disconnect ←', channel);
  });
});

// Post a chat message into the bus
app.post('/ingest', (req, res) => {
  // Check auth token if configured
  if (AUTH_TOKEN && req.get('X-Auth-Token') !== AUTH_TOKEN) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  
  const channel = getChannel(req.body.channel);
  const name = String(req.body.name || 'Commentator');
  const text = String(req.body.text || '').trim();
  if (!text) return res.status(400).json({ error: 'text required' });

  const payload = { type: 'chat', name, text, ts: Date.now(), channel };
  broadcast(channel, 'chat', payload);
  res.json({ ok: true, posted: payload });
});

// Monitor a project folder - for SillyTavern extension integration
app.post('/monitor-project', (req, res) => {
  const { projectPath } = req.body;
  
  if (!projectPath) {
    return res.status(400).json({ error: 'projectPath required' });
  }
  
  // For now, just return success - the Bridge will need to be restarted manually with the discovered session file
  // TODO: In future, could integrate with Bridge process management
  
  const projectName = projectPath.split('/').pop();
  
  res.json({ 
    success: true, 
    projectPath,
    projectName,
    sessionFile: 'Manual restart required', // Placeholder
    message: `Project folder selected: ${projectName}. Please restart Bridge with discovered session file.`
  });
  
  console.log(`📁 Project monitoring requested: ${projectPath}`);
});

// status
app.get('/status', (req, res) => {
  const channels = {};
  let total = 0;
  for (const [ch, set] of clientsByChannel) {
    channels[ch] = set.size;
    total += set.size;
  }
  res.json({ status: 'running', clientsTotal: total, channels, ts: Date.now() });
});

const PORT = 5055;
app.listen(PORT, '127.0.0.1', () => {
  console.log(`Commentary bus http://127.0.0.1:${PORT}`);
});
