# API Reference 🔌

## Unified Service Endpoints (Port 5055)

All functionality is available on a single port.

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
  "channel": "default",
  "id": 123
}
```

**Example:**
```bash
curl -X POST http://127.0.0.1:5055/ingest \
  -H 'Content-Type: application/json' \
  -d '{"text": "Hello from the API!", "channel": "game-updates"}'
```

### GET `/events`

Server-Sent Events stream for receiving messages.

**Query Parameters:**
- `channel` - Channel to subscribe to (default: "default")

**Event Types:**
- `connected` - Initial connection confirmation
- `heartbeat` - Keepalive pulses every 5 seconds
- `chat` - Actual messages to display

**Message Payload with Attribution:**
```json
{
  "channel": "default",
  "name": null,              // null = user persona
  "text": "✅ Approved · Implement OAuth2",
  "ts": 1756789123456,
  "type": "user",
  "subtype": "user_approval",
  "sessionFile": "session-123.jsonl",
  "isUserMessage": true,
  "attribution": {
    "actor_type": "human",
    "actor_label": null,
    "subject_tool": "ExitPlanMode",
    "decision": "approved"
  }
}
```

**Example:**
```bash
curl -N "http://127.0.0.1:5055/events?channel=default"

# Output:
event: connected
data: {"type":"connected","ts":1756789123456,"channel":"default","clients":1}

event: chat
data: {"channel":"default","name":null,"text":"✅ Approved","ts":1756789123456,"type":"user","subtype":"user_approval","isUserMessage":true,"attribution":{"actor_type":"human","decision":"approved"}}

event: heartbeat
data: {"type":"heartbeat","ts":1756789128456,"channel":"default","clients":1}
```

### GET `/status`

Check service health and connection statistics.

**Response:**
```json
{
  "clients": {
    "default": 2,
    "game-updates": 1
  },
  "buffers": {
    "default": 45,
    "game-updates": 12
  },
  "totalClients": 3,
  "monitoring": {
    "enabled": true,
    "sessionDir": "/root/.claude/projects/-var-workstation-assistants-commentator",
    "activeTails": 2,
    "watcherActive": true
  }
}
```

### GET `/config/session-dir`

Get the current monitored directory configuration.

**Response:**
```json
{
  "sessionDir": "/root/.claude/projects/-var-workstation-assistants-commentator",
  "watching": true,
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
  "success": true,
  "sessionDir": "/root/.claude/projects/-var-workstation-my-project",
  "inputPath": "/var/workstation/my-project"
}
```

**Error Response (400):**
```json
{
  "error": "Session directory not found: /root/.claude/projects/-invalid-path",
  "inputPath": "/invalid/path",
  "transformedPath": "/root/.claude/projects/-invalid-path"
}
```

### POST `/config/truncation`

Configure message truncation settings at runtime.

**Request Body:**
```json
{
  "enabled": true,
  "limits": {
    "assistant_text": 500,
    "user_tool_result": 200
  }
}
```

**Response:**
```json
{
  "ok": true,
  "truncation": {
    "enabled": true,
    "indicator": "…",
    "limits": {
      "assistant_text": 500,
      "user_tool_result": 200
    }
  }
}
```

## Message Attribution

### Subtypes and Attribution

| Subtype | Speaker | Origin | Description |
|---------|---------|--------|-------------|
| `user_approval` | User persona | human | Human approved an AI plan |
| `user_rejection` | User persona | human | Human rejected an AI action |
| `user_text` | User persona | human | Direct human message |
| `user_tool_result` | Tools | tool | System-generated output |
| `user_interrupt` | System | system | User interrupted execution |
| `assistant_text` | Claude | assistant | AI text response |
| `assistant_tool_use` | Claude | assistant | AI using a tool |

### Attribution Examples

**Human Approval:**
```json
{
  "name": null,
  "text": "✅ Approved · Implement OAuth2 Authentication",
  "subtype": "user_approval",
  "attribution": {
    "actor_type": "human",
    "actor_label": null,
    "subject_tool": "ExitPlanMode",
    "decision": "approved"
  }
}
```

**Tool Output:**
```json
{
  "name": "Tools",
  "text": "📄 Created: config/auth.js",
  "subtype": "user_tool_result",
  "attribution": {
    "actor_type": "tool",
    "actor_label": "Tools",
    "subject_tool": "Write",
    "decision": null
  }
}
```

## Rate Limits

- **Per channel**: 10 messages/minute
- **Burst capacity**: 20 messages
- **Buffer size**: 50 messages per channel

## Authentication

Optional authentication via `CBUS_TOKEN` environment variable:

```bash
# Start service with auth
CBUS_TOKEN=mysecret node commentary-service.js

# Send authenticated request
curl -X POST http://127.0.0.1:5055/ingest \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer mysecret' \
  -d '{"text": "Authenticated message"}'
```

## CORS

The service accepts requests from any origin (`*`). All necessary CORS headers are included for browser-based access.

## Client Libraries

### JavaScript/Browser
```javascript
// Connect to SSE stream
const events = new EventSource('http://127.0.0.1:5055/events?channel=default');

events.onmessage = (e) => {
  const data = JSON.parse(e.data);
  console.log(`${data.name || 'User'}: ${data.text}`);
  console.log(`Attribution: ${data.attribution.actor_type}`);
};

// Send a message
fetch('http://127.0.0.1:5055/ingest', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    text: 'Hello from JavaScript!',
    channel: 'default'
  })
});
```

### Python
```python
import requests
import sseclient

# Send a message
requests.post('http://127.0.0.1:5055/ingest', 
  json={'text': 'Hello from Python!', 'channel': 'default'})

# Receive messages
response = requests.get('http://127.0.0.1:5055/events?channel=default', 
  stream=True)
client = sseclient.SSEClient(response)

for event in client.events():
    data = json.loads(event.data)
    print(f"{data.get('name', 'User')}: {data['text']}")
    print(f"Actor: {data['attribution']['actor_type']}")
```

## Error Responses

### 400 Bad Request
- Missing required `text` field
- Invalid JSON in request body
- Invalid session directory path

### 401 Unauthorized
- Invalid or missing auth token (when `CBUS_TOKEN` is set)

### 500 Internal Server Error
- Service configuration error
- File system permissions issue