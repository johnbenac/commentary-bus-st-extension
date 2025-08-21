# API Reference 🔌

## Unified Service Endpoints (Port 5055)

The unified service combines all functionality on a single port.

### POST `/ingest`

Send a message to be broadcast to connected clients.

**Request Body:**
```json
{
  "channel": "default",      // Optional, defaults to "default"
  "name": "Commentator",     // Optional, defaults to "Commentator"
  "text": "Your message",    // Required
  "meta": {}                 // Optional metadata
}
```

**Response:**
```json
{
  "ok": true,
  "posted": {
    "type": "chat",
    "name": "Commentator",
    "text": "Your message",
    "ts": 1755662794873,
    "channel": "default"
  }
}
```

**Example:**
```bash
curl -X POST http://127.0.0.1:5055/ingest \
  -H 'Content-Type: application/json' \
  -d '{"text": "Hello!", "channel": "game-updates"}'
```

### GET `/events`

Server-Sent Events stream for receiving messages.

**Query Parameters:**
- `channel` - Channel to subscribe to (default: "default")

**Event Types:**
- `connected` - Initial connection confirmation
- `heartbeat` - Keepalive pulses every 5 seconds
- `chat` - Actual messages to display

**Example:**
```bash
curl -N "http://127.0.0.1:5055/events?channel=game-updates"

# Output:
event: connected
data: {"message":"connected","channel":"game-updates","ts":1755662794873}

event: heartbeat
data: {"type":"heartbeat","ts":1755662799877,"channel":"game-updates","clients":1}

event: chat
data: {"type":"chat","name":"Commentator","text":"Hello!","ts":1755662804881,"channel":"game-updates"}
```

### GET `/status`

Check server health and connection count.

**Response:**
```json
{
  "status": "running",
  "clientsTotal": 3,
  "channels": {
    "default": 2,
    "game-updates": 1
  },
  "ts": 1755662794873
}
```

## Message Format

### Basic Message
```json
{
  "text": "The simplest message"
}
```

### Full Message
```json
{
  "channel": "my-game",
  "name": "Game Master",
  "text": "A goblin appears!",
  "meta": {
    "priority": "high",
    "sound": "alert.mp3"
  }
}
```

## Channel Patterns

### Static Channels
Use fixed channel names:
- `"default"` - Main channel
- `"alerts"` - System notifications
- `"game"` - Game events

### Dynamic Channels
The extension supports `"auto"` mode which creates channels like:
- `"group-123"` - For group chat #123
- `"char-alice"` - For character "alice"

## Rate Limits

- No hard rate limits enforced
- Buffer stores last 50 messages per channel
- Recommended: Max 10 messages/second per channel

## Error Responses

### 400 Bad Request
```json
{
  "error": "text required"
}
```

Occurs when:
- Missing or empty `text` field
- Invalid JSON in request body

### CORS

The server accepts requests from any origin (`*`). For production use, you may want to restrict this in the server configuration.

### GET `/config/session-dir`

Get the current monitored directory configuration.

**Response:**
```json
{
  "sessionDir": "/var/workstation/assistants/commentator",
  "isActive": true,
  "activeTails": 2
}
```

### POST `/config/session-dir`

Update the monitored directory dynamically (no restart needed).

**Request Body:**
```json
{
  "sessionDir": "/var/workstation/my-project"
}
```

**Response:**
```json
{
  "sessionDir": "/var/workstation/my-project",
  "transformed": "/root/.claude/projects/-var-workstation-my-project",
  "watchStarted": true
}
```

**Example:**
```bash
curl -X POST http://127.0.0.1:5055/config/session-dir \
  -H 'Content-Type: application/json' \
  -d '{"sessionDir": "/var/workstation/assistants/commentator"}'
```

## Client Libraries

### JavaScript/Node.js
```javascript
class CommentaryBusClient {
  constructor(baseUrl = 'http://127.0.0.1:5055') {
    this.baseUrl = baseUrl;
  }

  async send(text, options = {}) {
    const response = await fetch(`${this.baseUrl}/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        channel: options.channel || 'default',
        name: options.name || 'Commentator',
        meta: options.meta
      })
    });
    return response.json();
  }
}
```

### Python
```python
import requests

class CommentaryBusClient:
    def __init__(self, base_url='http://127.0.0.1:5055'):
        self.base_url = base_url
    
    def send(self, text, channel='default', name='Commentator', meta=None):
        return requests.post(
            f'{self.base_url}/ingest',
            json={
                'text': text,
                'channel': channel,
                'name': name,
                'meta': meta or {}
            }
        ).json()
```

## WebSocket Alternative?

No WebSocket support currently. SSE was chosen for:
- Simplicity (one-way communication)
- Native browser support
- Automatic reconnection
- Works through proxies/firewalls
- Lower overhead for this use case