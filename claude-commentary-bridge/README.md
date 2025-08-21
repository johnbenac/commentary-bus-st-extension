# Claude Commentary Bridge 🌉

> Folder-based monitoring bridge that streams Claude Code activity to Commentary Bus

The Claude Commentary Bridge is a Node.js service that monitors Claude Code session folders and forwards activity to the Commentary Bus for real-time integration with SillyTavern. This creates a live commentary feed of your Claude interactions directly in your chat interface.

## 🎯 Key Features

- **📁 Folder-Based Monitoring** - Set a project folder once, monitors all current and future Claude sessions
- **🔄 Multi-Session Support** - Handles multiple concurrent Claude conversations automatically  
- **📡 Real-Time Streaming** - Live activity feeds via Server-Sent Events to SillyTavern
- **🛠️ Clean Architecture** - No fallbacks, fail-fast error handling, single monitoring approach
- **📊 Message Ordering** - 150ms stabilization window for proper cross-session message ordering
- **🔍 Rich Filtering** - Configurable message types, patterns, and rate limiting

## 🏗️ Architecture

```
SillyTavern Extension
      ↓ HTTP API (5056)
      ↓ Configure project path
Claude Commentary Bridge
      ↓ Monitor folder
Claude Session Files → chokidar → tail-file → Commentary Bus → SillyTavern Chat
     *.jsonl            ↓            ↓              ↓ (5055)        ↓ SSE
                 File Discovery   Message      Channel Routing   Chat Injection
                 + Lifecycle      Parsing      + Broadcasting    + /sendas
```

### How It Works

1. **Configuration**: SillyTavern extension sends project path to bridge API (port 5056)
2. **Path Transform**: Bridge converts user path to Claude's format automatically
3. **Folder Watching**: Uses `chokidar` to monitor the Claude project folder for `*.jsonl` files
4. **Dynamic Tailing**: Automatically starts `tail-file` instances for each discovered session
5. **Message Processing**: Parses JSONL events, filters, formats, and forwards to Commentary Bus
6. **Broadcasting**: Commentary Bus streams messages via SSE to connected SillyTavern clients
7. **Chat Injection**: Extension injects messages as commentary in active chats

## 📦 Installation

```bash
cd /var/workstation/assistants/commentator/claude-commentary-bridge
npm install
```

## 🚀 Usage

### Starting the Bridge

```bash
cd /var/workstation/assistants/commentator/claude-commentary-bridge
node bridge.js
```

The bridge starts with a default monitoring directory but is designed to be configured dynamically from SillyTavern.

### HTTP API (Port 5056)

The bridge exposes an HTTP API for dynamic configuration:

**Update Session Directory:**
```bash
POST http://127.0.0.1:5056/config/session-dir
Content-Type: application/json

{
  "sessionDir": "/var/workstation/my-project"
}
```

The API automatically transforms regular paths to Claude's format:
- `/var/workstation/my-project` → `/root/.claude/projects/-var-workstation-my-project`

### Environment Variables (Optional)

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `SESSION_DIR` | Initial project folder (optional - can be set via API) | `/root/.claude/projects/-var-workstation-assistants-commentator` | `/root/.claude/projects/my-project` |
| `BUS_URL` | Commentary Bus server URL | `http://127.0.0.1:5055` | `http://localhost:3000` |
| `CBUS_TOKEN` | Optional auth token for Commentary Bus | None | `secret123` |
| `CONFIG_FILE` | YAML configuration file path | `./filters.yaml` | `/path/to/custom.yaml` |

### Basic Usage

**Start the bridge service:**
```bash
node bridge.js
# or in background:
nohup node bridge.js > bridge.log 2>&1 &
```

**Configure from SillyTavern:**
1. In SillyTavern's Extensions panel, find "Commentary Bus"
2. Enter your project path in "Project Directory Path" field
3. Example: `/var/workstation/assistants/commentator`
4. The bridge automatically transforms this to Claude's format

### Dynamic Project Switching

Change the monitored project at any time from SillyTavern without restarting the bridge:

1. Enter a new project path in SillyTavern
2. Bridge receives the update via API
3. Automatically stops monitoring old project
4. Starts monitoring new project
5. All Claude activity from the new project streams to SillyTavern

### Path Transformation

The bridge handles Claude's path format automatically:

| User Enters | Bridge Monitors |
|-------------|----------------|
| `/var/workstation/my-project` | `/root/.claude/projects/-var-workstation-my-project` |
| `/opt/tools/assistant` | `/root/.claude/projects/-opt-tools-assistant` |
| `/home/user/code` | `/root/.claude/projects/-home-user-code` |

Transformation rules: Leading `/` removed, remaining `/` become `-`

## ⚙️ Configuration

### Default Configuration (`filters.yaml`)

```yaml
enabled: true
channels:
  default: 'claude-meta'
filters:
  include_types:
    - 'assistant'      # Claude responses
    - 'tool_call'      # Tool executions  
    - 'git_action'     # Git operations
    - 'file_operation' # File read/write
    - 'session_start'  # Session begins
    - 'user'          # User messages
  exclude_patterns:
    - '.*heartbeat.*'  # Filter out heartbeats
    - '.*ping.*'       # Filter out pings
  min_message_length: 10
ordering:
  stabilization_ms: 150  # Message ordering window
```

### Rate Limiting

- **10 messages per minute** per channel
- **Burst capacity**: 20 messages  
- Token bucket algorithm with 6-second refill interval

## 🌐 HTTP API Reference

The bridge exposes an HTTP API on port 5056 for dynamic configuration:

### Endpoints

#### `POST /config/session-dir`
Update the monitored session directory dynamically.

**Request:**
```json
{
  "sessionDir": "/var/workstation/my-project"
}
```

**Success Response (200):**
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

### CORS Support

The API includes CORS headers for browser-based access from SillyTavern:
- `Access-Control-Allow-Origin: *`
- Supports preflight requests for cross-origin communication

## 🔄 Multi-Session Support

The bridge automatically handles multiple concurrent Claude sessions:

```bash
👂 Tail started: /root/.claude/projects/my-project/session-1.jsonl
👂 Tail started: /root/.claude/projects/my-project/session-2.jsonl
👂 Tail started: /root/.claude/projects/my-project/session-3.jsonl
```

**Benefits:**
- **Seamless switching** - Move between Claude conversations without reconfiguration
- **Parallel monitoring** - Multiple active sessions stream simultaneously
- **Ordered delivery** - Messages are timestamp-ordered across sessions
- **Automatic cleanup** - Removed session files automatically stop being monitored

## 📝 Message Formatting

The bridge creates clean, contextual messages for different activity types:

### Tool Executions
```
git status → Shows working tree status
Writing /path/file.js (1.2KB): const app = require('express')...
Reading /path/config.json (50 lines): Load application configuration
```

### User Messages
```
How do I implement OAuth2 authentication?
```

### Assistant Responses  
```
I'll help you implement OAuth2 authentication. Let me create a complete setup...
```

## 🛠️ Troubleshooting

### Common Issues

**Bridge API not accessible from SillyTavern:**
```bash
[Commentary Bus] Bridge error: Failed to fetch
```
**Solution**: Ensure bridge is running and listening on port 5056

**Invalid project path:**
```javascript
{
  "error": "Session directory not found: /root/.claude/projects/-invalid-path"
}
```
**Solution**: 
- Verify the project directory exists
- Make sure you're entering the actual project path (e.g., `/var/workstation/my-project`)
- The bridge will handle the transformation to Claude's format

**No session files after setting directory:**
```bash
⚠️  No .jsonl session files found in /path/folder (watching for new ones)
```
**Status**: Normal - bridge will detect new sessions as Claude creates them

**Commentary Bus unreachable:**
```bash
❌ Bus unreachable: status 500
```
**Solution**: Ensure Commentary Bus server is running on port 5055

**CORS errors in browser console:**
```
Access to fetch at 'http://127.0.0.1:5056/config/session-dir' from origin 'http://localhost:8000' has been blocked by CORS policy
```
**Solution**: Update bridge to latest version which includes CORS support

### Debug Output

**Successful startup:**
```
📝 Loaded config from ./filters.yaml
🌉 Claude Commentary Bridge starting (folder mode)…
📡 Bus: http://127.0.0.1:5055
🔧 Auth: none
✅ Bus connected (clients: 1)
👂 Tail started: /root/.claude/projects/my-project/session-123.jsonl
🚀 Bridge running! Ctrl+C to stop
```

### Log Analysis

**Monitor bridge activity:**
```bash
tail -f bridge.log
```

**Check for rate limiting:**
```bash
grep "Rate limited" bridge.log
```

**Verify file discovery:**
```bash
grep "Tail started" bridge.log
```

## 🔄 Compared to Legacy Session File Mode

| Feature | **Folder Mode (Current)** | Legacy Session File Mode |
|---------|--------------------------|-------------------------|
| **Setup** | Set folder once | Manual UUID file paths |
| **Multi-chat** | ✅ Automatic | ❌ Single session only |
| **New sessions** | ✅ Auto-detected | ❌ Requires reconfiguration |
| **Fallbacks** | ❌ Clean fail-fast | ❌ Complex auto-discovery |
| **Architecture** | 🎯 Single approach | 🔀 Multiple code paths |
| **UX** | 🚀 Set once, forget forever | 😤 Manual per-session config |

## 📁 File Structure

```
claude-commentary-bridge/
├── bridge.js           # Main application
├── package.json        # Dependencies & scripts
├── filters.yaml        # Configuration file
├── bridge.log          # Runtime logs
└── README.md          # This documentation
```

## 🎯 Integration with Commentary Bus System

The Claude Commentary Bridge is part of the complete Commentary Bus architecture:

1. **Commentary Bus Server** - SSE server accepting messages via POST `/ingest`
2. **Claude Commentary Bridge** - This component - monitors Claude and forwards activity  
3. **SillyTavern Extension** - Receives SSE stream and injects into chat interface

**Complete flow:**
```
Claude Activity → Bridge Processing → Commentary Bus → SillyTavern Chat
```

## 🤝 Development

**Built with modern architecture principles:**
- ES6 modules with clean imports
- Promise-based async/await patterns  
- Defensive error handling with fail-fast philosophy
- Battle-tested libraries: `chokidar` (used by webpack), `tail-file`
- Single responsibility: folder monitoring with clean handoff to Commentary Bus

**Created through consultant collaboration using the Big Picture Protocol:**
- Initial UX problems identified and analyzed
- Comprehensive architectural consultation requested
- Clean solution designed and implemented
- Zero zombie code or fallback complexity

---

*Part of the Commentary Bus system - Real-time Claude activity integration for SillyTavern* 🎉