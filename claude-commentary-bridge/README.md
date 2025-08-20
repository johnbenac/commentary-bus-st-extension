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
Claude Session Files → chokidar (folder watch) → tail-file (per session) → Commentary Bus → SillyTavern
     *.jsonl              ↓                           ↓                       ↓
                    File Discovery              Message Parsing         SSE Broadcast
                    + Lifecycle                + Formatting            + Channel Routing
```

### How It Works

1. **Folder Watching**: Uses `chokidar` to monitor a Claude project folder for `*.jsonl` files
2. **Dynamic Tailing**: Automatically starts `tail-file` instances for each discovered session
3. **Message Processing**: Parses JSONL events, filters, formats, and forwards to Commentary Bus
4. **Multi-Session Coordination**: Orders messages across concurrent sessions using timestamps

## 📦 Installation

```bash
cd /var/workstation/assistants/commentator/claude-commentary-bridge
npm install
```

## 🚀 Usage

### Environment Variables

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `SESSION_DIR` | **Required** - Claude project folder to monitor | None | `/root/.claude/projects/my-project` |
| `BUS_URL` | Commentary Bus server URL | `http://127.0.0.1:5055` | `http://localhost:3000` |
| `CBUS_TOKEN` | Optional auth token for Commentary Bus | None | `secret123` |
| `CONFIG_FILE` | YAML configuration file path | `./filters.yaml` | `/path/to/custom.yaml` |

### Basic Usage

**Start monitoring a Claude project folder:**
```bash
SESSION_DIR="/root/.claude/projects/-var-workstation-assistants-commentator" node bridge.js
```

**Background service with logging:**
```bash
SESSION_DIR="/root/.claude/projects/my-project" nohup node bridge.js > bridge.log 2>&1 &
```

### Finding Your Project Folder

Claude creates project folders using this pattern:
```
Project Path: /var/workstation/my-project/
Claude Folder: /root/.claude/projects/-var-workstation-my-project/
```

The transformation: `/` becomes `-`, leading `/` removed.

**To find your current project folder:**
```bash
# From within your Claude project directory
pwd                    # Shows: /var/workstation/assistants/commentator
basename $(pwd)        # Shows: commentator
# Your SESSION_DIR: /root/.claude/projects/-var-workstation-assistants-commentator
```

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

**Bridge won't start:**
```bash
❌ SESSION_DIR is required (env or argv[2])
```
**Solution**: Provide the `SESSION_DIR` environment variable

**Folder not found:**
```bash
❌ Not a directory: /path/to/nonexistent
```
**Solution**: Verify the Claude project folder exists and is readable

**No session files:**
```bash
⚠️  No .jsonl session files found in /path/folder (watching for new ones)
```
**Status**: Normal - bridge will detect new sessions as they're created

**Commentary Bus unreachable:**
```bash
❌ Bus unreachable: status 500
```
**Solution**: Ensure Commentary Bus server is running on the specified URL

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