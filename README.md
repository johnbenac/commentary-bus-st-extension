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
├── claude-commentary-bridge/     # 🌉 Claude Code → Commentary Bus bridge
│   ├── bridge.js                 # Main bridge service with HTTP API
│   ├── package.json             # Bridge dependencies
│   ├── README.md                # Bridge-specific documentation
│   └── filters.yaml             # Message filtering configuration
├── extension/                    # 🔌 SillyTavern extension
│   ├── index.js                 # Extension main file
│   ├── manifest.json            # Extension metadata
│   └── README.md                # Extension documentation
├── server/                       # 📡 Commentary Bus SSE server
│   ├── commentary-bus.js        # Main server
│   ├── package.json             # Server dependencies
│   └── README.md                # Server documentation
├── docs/                         # 📚 Comprehensive documentation
├── examples/                     # 🔧 Usage examples
└── README.md                     # This file
```

## 🚀 Quick Start

### 1. Start the Commentary Bus Server
```bash
cd server/
npm install
npm start
```
Server runs on http://127.0.0.1:5055

### 2. Start the Claude Commentary Bridge
```bash
cd claude-commentary-bridge/
npm install

# Set your Claude project folder and start monitoring
SESSION_DIR="/var/workstation/my-project" node bridge.js
```

### 3. Install Extension in SillyTavern
1. Go to Extensions → Install Extension
2. Enter: `https://github.com/johnbenac/commentary-bus-st-extension`
3. Click Install
4. Enable in Extensions panel

### 4. Configure Extension
1. In Extensions panel, find "Commentary Bus"
2. Set **Project Directory Path** to your Claude project folder
3. Example: `/var/workstation/assistants/commentator`

### 5. Add Commentator to Group
Create a character named "Commentator" and add to your group chat

### 6. Test It!

**Manual test:**
```bash
curl -X POST http://127.0.0.1:5055/ingest \
  -H 'Content-Type: application/json' \
  -d '{"channel":"default","name":"Commentator","text":"Hello from the commentary bus!"}'
```

**Live Claude activity:**
- Use Claude Code in your monitored project
- Activity will automatically appear in SillyTavern as commentary

## 🏗️ Architecture

### Complete System Flow
```
Claude Code Activity → Bridge Processing → Commentary Bus → SillyTavern Chat
     *.jsonl              ↓                    ↓                ↓
                    Message Parsing      SSE Broadcast    Chat Injection
                    + Formatting         + Channel        + Character
                                          Routing           Display
```

### Component Integration
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  Claude Code    │ -> │ Commentary Bridge│ -> │ Commentary Bus  │
│  Session Files  │    │ (folder monitor) │    │ (SSE server)    │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                                         ↓
                       ┌─────────────────┐    ┌─────────────────┐
                       │ SillyTavern     │ <- │ ST Extension    │
                       │ Chat Interface  │    │ (SSE client)    │
                       └─────────────────┘    └─────────────────┘
```

## 🌟 What's New in v2.0

### Folder-Based Claude Monitoring
- **Set once, forget forever** - Configure a Claude project folder and it works for all sessions
- **Multi-chat support** - Monitor multiple concurrent Claude conversations automatically  
- **Auto-discovery** - New Claude sessions are picked up instantly without reconfiguration
- **Clean architecture** - No fallbacks or complex auto-discovery, just reliable folder monitoring
- **Path transformation shim** - Enter intuitive project paths, bridge handles Claude's internal format

### Dynamic Configuration
- **HTTP API** - Runtime configuration changes via REST endpoints
- **No restarts needed** - Switch monitored folders on-the-fly
- **User-friendly paths** - Enter `/var/workstation/my-project/` instead of cryptic Claude session paths

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