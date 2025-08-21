# Unified Commentary Service 🎯

> Single service combining SSE server + Claude file monitoring (v2.0)

The Unified Commentary Service merges the Commentary Bus server and Claude Commentary Bridge into one streamlined Node.js service. This follows the consultant's recommendation for simpler operations and deployment.

## ✨ What's New

- **Single Service**: One process instead of two separate services
- **One Port**: Everything runs on port 5055 (configurable)
- **All Features**: SSE streaming + file monitoring + dynamic configuration
- **Simpler Operations**: Start one service, configure from SillyTavern

## 🚀 Quick Start

### 1. Install Dependencies
```bash
cd unified-service/
npm install
```

### 2. Start the Service
```bash
node commentary-service.js
# or with custom port:
PORT=5055 node commentary-service.js
```

### 3. Configure in SillyTavern
- Set both "Commentary Bus URL" and "Bridge URL" to: `http://127.0.0.1:5055`
- Enter your project path in the extension UI
- Everything else works the same!

## 📡 API Endpoints

All endpoints are now on a single port (5055):

| Endpoint | Method | Description |
|----------|---------|-------------|
| `/events` | GET | SSE stream for real-time events |
| `/ingest` | POST | Send messages to channels |
| `/status` | GET | Service health and client count |
| `/config/session-dir` | GET | Current monitoring configuration |
| `/config/session-dir` | POST | Update monitored directory |

## 🏗️ Architecture

```
SillyTavern Extension
        ↓ HTTP API
Unified Commentary Service (:5055)
    ├── SSE Server (channels, buffering)
    ├── File Monitor (chokidar + tail)
    └── Configuration API
        ↓
Claude Session Files (*.jsonl)
```

## ⚙️ Configuration

### Environment Variables
- `PORT` - Service port (default: 5055)
- `CBUS_TOKEN` - Optional auth token for /ingest
- `SESSION_DIR` - Initial monitoring directory (optional)
- `CONFIG_FILE` - YAML config path (default: ./filters.yaml)

### Dynamic Configuration
The service can be configured at runtime via the SillyTavern extension - no restarts needed!

## 🔄 Migration from Separate Services

If you're upgrading from the 3-component system:

1. Stop the old services:
   ```bash
   # Stop Commentary Bus server
   pkill -f commentary-bus.js
   # Stop Claude Commentary Bridge  
   pkill -f bridge.js
   ```

2. Start the unified service:
   ```bash
   cd unified-service/
   node commentary-service.js
   ```

3. Update SillyTavern extension settings to point both URLs to port 5055

## 🛠️ Systemd Service

Create `/etc/systemd/system/commentary-service.service`:

```ini
[Unit]
Description=Unified Commentary Service
After=network.target

[Service]
Type=simple
User=youruser
WorkingDirectory=/var/workstation/assistants/commentator/unified-service
ExecStart=/usr/bin/node commentary-service.js
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable commentary-service
sudo systemctl start commentary-service
```

## 📊 Monitoring

Check service status:
```bash
curl http://127.0.0.1:5055/status | jq
```

View logs:
```bash
journalctl -u commentary-service -f
```

## 🎯 Benefits of Unified Architecture

1. **Simpler Operations**: One service to start/stop/monitor
2. **Better Resource Usage**: Shared event loop and memory
3. **Easier Deployment**: Single container/pod for Kubernetes
4. **Cleaner Logs**: All output in one place
5. **Reduced Complexity**: No inter-service communication needed

## 🐛 Troubleshooting

### Port Already in Use
If you get "EADDRINUSE" error, the old services might still be running:
```bash
# Find what's using port 5055
ss -tulpn | grep 5055
# Kill old processes
pkill -f commentary
```

### No Claude Activity
- Verify Claude is creating sessions in the monitored folder
- Check `/status` endpoint to see active tails
- Ensure project path is correctly transformed

### Extension Can't Connect
- Verify service is running on expected port
- Check CORS is enabled (it is by default)
- Both URL fields in extension should point to same service

## 📚 Technical Details

The unified service combines:
- **Express** for HTTP/SSE server
- **Chokidar** for cross-platform file watching
- **tail-file** for real-time file following
- **CORS** enabled for browser access
- **Rate limiting** per channel (10 msg/min, burst 20)
- **Message buffering** for late-joining clients (50 messages)
- **Path transformation** for user-friendly directory input

---

*Part of the Commentary Bus system - Now simpler with just 2 components!* 🚀