# Unified Commentary Service 🎯

> Single service combining SSE server + Claude file monitoring with agent attribution

The Unified Commentary Service is the heart of the Commentary Bus system, providing real-time message streaming and Claude Code monitoring with proper attribution of human vs AI actions.

## ✨ Key Features

- **Single Service**: Everything runs on port 5055
- **Agent Attribution**: Distinguishes human decisions from AI/system actions
- **Claude Monitoring**: Automatic session file discovery and tailing
- **SSE Streaming**: Real-time message delivery to SillyTavern
- **Dynamic Configuration**: Change monitored projects without restart

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Start the service
node commentary-service.js

# Or with custom port:
PORT=5055 node commentary-service.js
```

## 🌟 Agent Attribution

The service now properly attributes actions to the correct agent:

### Attribution Types

1. **user_approval** - Human approvals of AI plans
   - Speaker: User's persona name
   - Origin: "human"
   - Example: "✅ Approved · Implement OAuth2"

2. **user_rejection** - Human rejections of AI actions
   - Speaker: User's persona name  
   - Origin: "human"
   - Example: "❌ Rejected"

3. **user_tool_result** - System-generated outputs
   - Speaker: "Tools"
   - Origin: "tool"
   - Example: "📄 Created: config.json"

4. **user_text** - Direct human messages
   - Speaker: User's persona name
   - Origin: "human"

### Decision Detection

The service uses pattern matching to identify human decisions:

```javascript
// Approval patterns
/user has approved/i
/\bapproved\b/i
/\bconsent(s|ed)?\b/i

// Rejection patterns  
/doesn['']?t want to proceed/i
/\breject(s|ed|ion)\b/i
/\bcancel(led|s)?\b/i
```

### Attribution Metadata

Each message includes attribution metadata:

```javascript
{
  attribution: {
    actor_type: "human",      // human|assistant|tool|system
    actor_label: null,        // null = user persona
    subject_tool: "ExitPlanMode",
    decision: "approved"      // approved|rejected|null
  }
}
```

## 📡 API Endpoints

All endpoints are on port 5055:

| Endpoint | Method | Description |
|----------|---------|-------------|
| `/events` | GET | SSE stream for real-time events |
| `/ingest` | POST | Send messages to channels |
| `/status` | GET | Service health and stats |
| `/config/session-dir` | GET | Current monitoring config |
| `/config/session-dir` | POST | Update monitored directory |
| `/config/truncation` | POST | Configure message truncation |

## ⚙️ Configuration

### Environment Variables
- `PORT` - Service port (default: 5055)
- `CBUS_TOKEN` - Optional auth token
- `SESSION_DIR` - Initial monitoring directory
- `CONFIG_FILE` - YAML config path (default: ./filters.yaml)

### Filters Configuration (filters.yaml)

```yaml
enabled: true
filters:
  include_types:
    - assistant
    - user
    - tool_call
    - session_start
  include_subtypes:
    - assistant_text
    - assistant_tool_use
    - user_text
    - user_approval      # Human approvals
    - user_rejection     # Human rejections
    - session_start
    - session_end
```

## 🏗️ Architecture

```
Claude Sessions (*.jsonl)
        ↓
File Monitoring (chokidar + tail)
        ↓
Event Classification & Attribution
        ↓
Message Formatting & Filtering
        ↓
SSE Broadcasting (port 5055)
        ↓
SillyTavern Extension
```

## 🔧 Technical Details

### Message Processing Pipeline

1. **File Discovery**: Chokidar watches for new JSONL files
2. **Real-time Tailing**: tail-file follows file changes
3. **Event Parsing**: JSONL events parsed and classified
4. **Decision Detection**: Pattern matching identifies approvals/rejections
5. **Attribution**: Correct speaker and origin assigned
6. **Formatting**: Clean, contextual message creation
7. **Broadcasting**: SSE delivery to connected clients

### Rate Limiting
- 10 messages/minute per channel
- Burst capacity: 20 messages
- Token bucket algorithm

### Message Buffering
- Last 50 messages per channel
- Replay for late-joining clients
- Automatic cleanup

## 🛠️ Systemd Service

Create `/etc/systemd/system/commentary-service.service`:

```ini
[Unit]
Description=Unified Commentary Service
After=network.target

[Service]
Type=simple
User=youruser
WorkingDirectory=/path/to/unified-service
ExecStart=/usr/bin/node commentary-service.js
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

## 📊 Monitoring

```bash
# Check status
curl http://127.0.0.1:5055/status | jq

# Monitor logs
journalctl -u commentary-service -f

# Test attribution
curl -X POST http://127.0.0.1:5055/ingest \
  -H 'Content-Type: application/json' \
  -d '{"text": "Test message", "channel": "default"}'
```

## 🐛 Troubleshooting

### Attribution Issues

If approvals/rejections show as "Tools":
1. Check service is running latest version
2. Verify `user_approval` and `user_rejection` are in include_subtypes
3. Check browser console for errors
4. Restart service and extension

### Common Issues

- **Port in use**: Kill old processes with `pkill -f commentary-service`
- **No Claude activity**: Verify project path is correct
- **Messages not appearing**: Check character name matches speaker

## 🎯 Benefits

1. **Clear Accountability**: Know who made each decision
2. **Audit Trail**: Track human approvals and rejections
3. **User Trust**: Human agency properly represented
4. **Single Process**: Easy to manage and monitor
5. **Performance**: Shared resources, efficient operation

---

*The unified approach with proper attribution - simple, powerful, accountable* 🚀