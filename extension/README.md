# Commentary Bus SillyTavern Extension

The client-side extension that connects to the Unified Commentary Service and injects messages into your chats with proper agent attribution.

## Features

- Real-time SSE connection to the unified service
- Automatic reconnection on connection loss
- Dynamic channel routing (auto or static)
- Claude project monitoring configuration
- Inline metadata display showing message types and attribution

## Installation

1. Go to SillyTavern Extensions panel
2. Click "Install Extension"
3. Enter: `https://github.com/johnbenac/commentary-bus-st-extension`
4. Click Install and Enable

## Configuration

### Service URL
Set to `http://127.0.0.1:5055` - the unified service endpoint.

### Channel Mode
- **Static** (e.g., "default") - Always uses the same channel
- **Auto** - Creates dynamic channels:
  - `group-{id}` for group chats
  - `char-{name}` for solo chats

### Speaker Name
Character name for messages (default: "Commentator"). Create this character in your chat.

### Project Directory
Enter your Claude project path for monitoring:
- Example: `/var/workstation/assistants/commentator`
- Automatically transformed to Claude's internal format
- Updates monitoring in real-time

### Assistant Character Name
Override "Claude" with a custom name (optional).

### Metadata Display
- **Inline** (default) - Shows type info as muted text below messages
- **Prefix** - Shows type info before message content
- **None** - Hides type information

## How It Works

1. Connects to the unified service via EventSource (SSE)
2. Configures Claude monitoring through the service API
3. Receives real-time messages on the configured channel
4. Injects messages using SillyTavern's `/sendas` command
5. Shows proper attribution (human vs AI vs system)

## Agent Attribution

The extension now displays who is responsible for each action:

- **Human decisions**: Shows with user's persona name
  - Approvals: "✅ Approved · Plan Title"
  - Rejections: "❌ Rejected"
- **AI actions**: Shows as "Claude" (or custom name)
- **System outputs**: Shows as "Tools"

## Message Types

Each message shows its type and origin:
```
type:user · subtype:user_approval · origin:human
type:assistant · subtype:assistant_tool_use · origin:assistant
type:user · subtype:user_tool_result · origin:tool
```

## Requirements

- SillyTavern v1.13.2 or later
- Unified Commentary Service running on port 5055
- Character matching the speaker name in your chat

## Troubleshooting

### Extension Not Connecting
1. Verify service is running: `curl http://127.0.0.1:5055/status`
2. Check browser console for errors (F12)
3. Try the Reconnect button

### Messages Not Appearing
1. Ensure character "Commentator" exists in chat
2. Check channel configuration matches
3. Verify extension is enabled

### Attribution Issues
1. Update to latest version (2.1.1+)
2. Check service has attribution fix applied
3. Restart both service and browser

## Version History

- **2.1.1** - Added proper agent attribution
- **2.1.0** - Added metadata display modes
- **2.0.0** - Unified service support

---

*Part of the Commentary Bus system - Real-time commentary with accountability*