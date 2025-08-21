# Commentary Bus for SillyTavern 🎙️

> Complete system for injecting live commentary into SillyTavern chats from external processes, with specialized Claude Code activity monitoring.

## What is this?

Commentary Bus is a comprehensive Server-Sent Events (SSE) based system that allows external processes to inject messages into your SillyTavern group chats. The flagship feature is **real-time Claude Code monitoring** that streams your AI development activity directly into SillyTavern as commentary.

### 🎯 Key Features

- **🤖 Claude Code Integration** - Monitor Claude sessions in real-time with folder-based architecture
- **📡 Real-time delivery** - Messages appear instantly via SSE
- **🔄 Auto-reconnection** - Resilient to network hiccups  
- **📢 Channel support** - Route messages to specific chats
- **💾 Message replay** - Late joiners see recent messages
- **🎨 Clean integration** - Messages appear as proper character in chat
- **📁 Folder-based monitoring** - Set once, monitor all current and future Claude sessions
- **🔄 Multi-session support** - Handle concurrent Claude conversations automatically

## 📦 Repository Structure

```
commentary-bus/
├── unified-service/              # 🎯 Unified Commentary Service v2.0
│   ├── commentary-service.js    # Combined SSE server + Claude monitor
│   ├── filters.yaml             # Message filtering configuration
│   ├── package.json             # Service dependencies
│   └── README.md                # Service documentation
├── extension/                    # 🔌 SillyTavern extension
│   ├── index.js                 # Extension main file
│   ├── manifest.json            # Extension metadata (at repo root)
│   └── README.md                # Extension documentation
├── docs/                         # 📚 Comprehensive documentation
├── examples/                     # 🔧 Usage examples
├── README.md                     # This file
│
├── claude-commentary-bridge/     # 📦 Legacy: Original bridge service
├── server/                       # 📦 Legacy: Original SSE server
└── manifest.json                 # Extension manifest (required at root)
```

## 🚀 Quick Start

### 1. Start the Unified Commentary Service
```bash
cd unified-service/
npm install
node commentary-service.js
# or with nohup:
nohup node commentary-service.js &
```
Service runs on http://127.0.0.1:5055 (combines SSE server + Claude monitoring)

### 2. Install Extension in SillyTavern
1. Go to Extensions → Install Extension
2. Enter: `https://github.com/johnbenac/commentary-bus-st-extension`
3. Click Install
4. Enable in Extensions panel

### 3. Configure Extension
1. In Extensions panel, find "Commentary Bus"
2. Set **Service URL** to: `http://127.0.0.1:5055`
3. Set **Project Directory Path** to your Claude project folder
4. Example: `/var/workstation/assistants/commentator`
5. The service automatically transforms this to Claude's internal format

### 4. Add Commentator to Group
Create a character named "Commentator" and add to your group chat

### 5. Test It!

**Manual test:**
```bash
curl -X POST http://127.0.0.1:5055/ingest \
  -H 'Content-Type: application/json' \
  -d '{"channel":"default","name":"Commentator","text":"Hello from Commentary Bus v2.0!"}'
```

**Live Claude activity:**
- Use Claude Code in your monitored project
- Activity appears instantly in SillyTavern as commentary
- See tool usage like: `Reading file.yaml (50 lines)`

## 🏗️ Architecture

### Unified Service Architecture (v2.0)
```
SillyTavern Extension → Unified Commentary Service → SillyTavern Chat
    Config UI              (Port 5055)               Chat Display
        ↓                      ↓                          ↓
   Set Project Path    Monitor + Broadcast         Inject as /sendas
```

### Complete System Flow
```
┌─────────────────┐         ┌─────────────────────────┐
│ SillyTavern     │ ------> │ Unified Commentary      │
│ Extension UI    │  HTTP   │ Service (Port 5055)    │
│                 │         │ • SSE Server            │
│                 │         │ • Claude File Monitor   │
│                 │         │ • Dynamic Config API    │
└─────────────────┘         └─────────────────────────┘
        ↑                              ↓
        │                         SSE Stream
        │                              ↓
        └──────────────────────────────┘
```

### Data Flow
1. **Configuration**: Extension sends project path to service API
2. **Monitoring**: Service watches Claude session files (*.jsonl)
3. **Processing**: Messages are parsed, formatted, and filtered
4. **Broadcasting**: Formatted messages sent via SSE to subscribers
5. **Display**: Extension injects messages into SillyTavern chat

## 🌟 What's New in v2.0

### Folder-Based Claude Monitoring
- **Set once, forget forever** - Configure a Claude project folder and it works for all sessions
- **Multi-chat support** - Monitor multiple concurrent Claude conversations automatically  
- **Auto-discovery** - New Claude sessions are picked up instantly without reconfiguration
- **Clean architecture** - No fallbacks or complex auto-discovery, just reliable folder monitoring
- **Path transformation shim** - Enter intuitive project paths, bridge handles Claude's internal format

### Dynamic Configuration from SillyTavern
- **UI-based configuration** - Set project paths directly in SillyTavern's extension panel
- **HTTP API** - Bridge exposes API on port 5056 for runtime configuration
- **No restarts needed** - Switch monitored folders instantly from SillyTavern
- **User-friendly paths** - Enter `/var/workstation/my-project/` instead of cryptic Claude session paths
- **Automatic path transformation** - Bridge converts to Claude's internal format transparently

## 📖 Documentation

- **[Bridge Documentation](claude-commentary-bridge/README.md)** - Claude Code monitoring setup
- **[Extension Documentation](extension/README.md)** - SillyTavern integration
- **[Server Documentation](server/README.md)** - Commentary Bus server setup
- **[API Documentation](docs/API.md)** - HTTP endpoints and usage
- **[Examples](docs/EXAMPLES.md)** - Common use cases and scripts

## 🛠️ Use Cases

### 🆕 Claude Code Integration
- **Live coding commentary** - See Claude's file operations and tool usage in real-time
- **Multi-project monitoring** - Switch between Claude projects while maintaining chat continuity  
- **Development collaboration** - Share Claude's decision-making process with team members
- **Documentation assistance** - Automatic commentary on code changes and architecture decisions
- **Learning & teaching** - Visual representation of AI-assisted development workflows

### General Commentary
- **Game narration** - "The dragon awakens..."
- **System monitoring** - "Server CPU at 90%"  
- **Time-based events** - "It's midnight, the spell wears off"
- **External integrations** - Discord bots, webhooks, IoT devices
- **Automated storytelling** - Weather updates, news, random events

## 🔗 API Endpoints

### Commentary Bus Server (Port 5055)
- `GET /events?channel=NAME` - SSE stream for channel
- `POST /ingest` - Send message to channel
- `GET /status` - Server status and client counts

### Claude Commentary Bridge (Port 5056)  
- `GET /config/session-dir` - Get current monitored folder
- `POST /config/session-dir` - Change monitored folder dynamically
- `GET /status` - Bridge status and active sessions

## 📋 Requirements

- Node.js 16+
- SillyTavern (recent version)
- Claude Code (for Claude monitoring features)

## 🎉 Success Stories

*Working fantastically well as of August 2025!* 

The system successfully bridges the gap between Claude Code development workflows and SillyTavern chat experiences, creating a seamless integration that enhances both productivity and collaboration.

---

*Powered by the Claude Commentary Bridge with chokidar + tail-file architecture* 🌉