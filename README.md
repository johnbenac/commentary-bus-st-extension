# Commentary Bus for SillyTavern 🎙️

> Real-time commentary injection for SillyTavern with live Claude Code monitoring and proper agent attribution.

## What is this?

Commentary Bus is a unified service that streams messages into your SillyTavern chats via Server-Sent Events (SSE). The flagship feature is **real-time Claude Code monitoring** with **proper agent attribution** - see exactly who (human or AI) is responsible for each action.

### 🎯 Key Features

- **🤖 Claude Code Integration** - Monitor Claude sessions in real-time
- **👤 Agent Attribution** - Clear distinction between human decisions and AI/system actions
- **📡 Real-time Streaming** - Messages appear instantly via SSE
- **🔄 Auto-reconnection** - Resilient to network interruptions
- **📢 Multi-channel Support** - Route messages to specific chats
- **💾 Message Buffering** - Late joiners see recent messages
- **🎨 Clean Integration** - Messages appear as proper characters
- **📁 Folder Monitoring** - Set project path once, monitor all sessions

## 🚀 Quick Start

### 1. Start the Unified Service
```bash
cd unified-service/
npm install
node commentary-service.js
```
Service runs on http://127.0.0.1:5055

### 2. Install Extension in SillyTavern
1. Go to Extensions → Install Extension
2. Enter: `https://github.com/johnbenac/commentary-bus-st-extension`
3. Click Install and Enable

### 3. Configure Extension
1. Set **Service URL** to: `http://127.0.0.1:5055`
2. Set **Project Directory Path** to your Claude project
3. Create a "Commentator" character in your chat

### 4. Test It!
```bash
curl -X POST http://127.0.0.1:5055/ingest \
  -H 'Content-Type: application/json' \
  -d '{"text": "🎉 Commentary Bus is working!"}'
```

## 🏗️ Architecture

```
┌─────────────────┐         ┌─────────────────────┐         ┌──────────────┐
│ SillyTavern     │ ------> │ Unified Commentary  │ ------> │ SillyTavern  │
│ Extension       │  HTTP   │ Service (:5055)     │   SSE   │ Chat         │
└─────────────────┘         └─────────────────────┘         └──────────────┘
                                      ↑
                                      │
                            ┌─────────────────────┐
                            │ Claude Session      │
                            │ Files (*.jsonl)     │
                            └─────────────────────┘
```

## 🌟 Agent Attribution (New!)

The system now properly attributes actions to the correct agent:

### Human Actions
- **Approvals**: "✅ Approved · Plan Title" (shown as user)
- **Rejections**: "❌ Rejected" (shown as user)
- **Direct messages**: Shown with user's persona name

### AI Actions  
- **Tool usage**: "Reading file.py" (shown as Claude)
- **Responses**: AI-generated text (shown as Claude)

### System Actions
- **Tool outputs**: File contents, command results (shown as Tools)
- **Interruptions**: System messages (shown as System)

This clear attribution helps with:
- **Accountability** - Know who made each decision
- **Audit trails** - Track human approvals/rejections
- **Trust** - See human agency properly represented
- **Debugging** - Understand decision flows

## 📦 Repository Structure

```
commentary-bus/
├── unified-service/          # Main service (SSE + monitoring)
│   ├── commentary-service.js # Unified service with attribution
│   ├── filters.yaml         # Message filtering config
│   └── README.md           # Service documentation
├── extension/              # SillyTavern extension
│   ├── index.js           # Extension code
│   └── README.md          # Extension documentation
├── docs/                   # Documentation
│   ├── API.md            # API reference
│   ├── EXAMPLES.md       # Usage examples
│   ├── QUICKSTART.md     # Getting started
│   └── TROUBLESHOOTING.md # Common issues
└── manifest.json          # Extension manifest
```

## 🔗 API Overview

All endpoints on port 5055:

- `GET /events?channel=NAME` - SSE stream
- `POST /ingest` - Send messages
- `GET /status` - Service status
- `POST /config/session-dir` - Configure Claude monitoring

## 🛠️ Use Cases

### Claude Code Monitoring
- **Live coding commentary** - See file operations and tool usage
- **Decision tracking** - Human approvals/rejections clearly attributed
- **Multi-project support** - Switch between projects seamlessly
- **Learning tool** - Understand AI-assisted development

### General Commentary
- **Game narration** - Dynamic story events
- **System monitoring** - Server alerts
- **External integrations** - Discord, webhooks, IoT
- **Automated updates** - Weather, news, time-based events

## 📋 Requirements

- Node.js 16+
- SillyTavern (recent version)
- Claude Code (for monitoring features)

## 🎉 Features in Action

When you approve a plan in Claude:
- **Before**: "Tools: approved"
- **After**: "Johnny: ✅ Approved · Implement OAuth2"

The system now properly shows that YOU made the decision, not "Tools"!

---

*Real-time commentary with proper attribution - know who's responsible for what* 🎯