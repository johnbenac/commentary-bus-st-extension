# Commentary Bus Extension for SillyTavern

Receive live commentary from external processes in your SillyTavern chats! This extension connects to a local Server-Sent Events (SSE) server and injects messages into your active chat as a third character.

## Features

- 🎙️ Real-time message injection from external processes
- 📡 Server-Sent Events (SSE) for reliable one-way communication
- 🔄 Auto-reconnection on connection loss
- 📢 Channel-based message routing
- ⚙️ Configurable through SillyTavern's Extensions panel
- 🎭 Messages appear as a character in your group chat

## Prerequisites

1. **Commentary Bus Server** - You need the SSE backend running:
   ```bash
   cd /path/to/commentary-bus
   npm install
   npm start
   ```
   
2. **Commentator Character** - Create a character named "Commentator" (or your chosen name) and add them to your group chat for proper avatar/name display.

## Installation

1. In SillyTavern, go to **Extensions** → **Install Extension**
2. Enter the Git URL of this repository
3. Click Install
4. Enable the extension in the Extensions panel

## Configuration

After installation, you'll find these settings in the Extensions panel:

- **Enable Commentary Bus** - Toggle the extension on/off
- **Server URL** - Commentary Bus server address (default: `http://127.0.0.1:5055`)
- **Channel** - Message channel to subscribe to:
  - `default` - Static channel name
  - `auto` - Automatically uses group/character ID
  - Any custom string for specific routing
- **Default Speaker Name** - Character name for messages (default: `Commentator`)
- **Log heartbeats** - Debug option to log heartbeat messages

## Usage

### Basic Example

Send a message from any process:

```bash
curl -X POST http://127.0.0.1:5055/ingest \
  -H 'Content-Type: application/json' \
  -d '{
    "channel": "default",
    "name": "Commentator",
    "text": "The party enters the dungeon..."
  }'
```

### Channel-Based Routing

Use different channels for different chats:

```bash
# For a specific group
curl -X POST http://127.0.0.1:5055/ingest \
  -d '{"channel": "group-adventure", "text": "A dragon appears!"}'

# Auto-channel (matches current chat)
# Set channel to "auto" in settings
```

### Python Example

```python
import requests

def send_commentary(text, name="Commentator", channel="default"):
    requests.post('http://127.0.0.1:5055/ingest', json={
        'channel': channel,
        'name': name,
        'text': text
    })

# Use it
send_commentary("The AI has achieved consciousness... probably.")
```

### Node.js Example

```javascript
async function sendCommentary(text, name = 'Commentator', channel = 'default') {
  await fetch('http://127.0.0.1:5055/ingest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel, name, text })
  });
}

// Use it
sendCommentary("Rolling for initiative...");
```

## Troubleshooting

1. **No messages appearing?**
   - Check the Commentary Bus server is running
   - Verify the character name exists in your group
   - Check browser console for errors
   - Use "Test Connection" button in settings

2. **Connection keeps dropping?**
   - Ensure server URL is correct
   - Check for firewall/security software blocking local connections
   - Try manual reconnect button

3. **Messages appear but wrong character?**
   - Ensure the speaker name matches a character in your group
   - Check the "Default Speaker Name" setting

## Development

The extension uses:
- SillyTavern's extension API for integration
- EventSource API for SSE consumption  
- `/sendas` slash command for message injection
- Auto-reconnection with exponential backoff

## License

MIT - Feel free to modify and share!

## Support

For issues or questions:
1. Check the browser console for error messages
2. Verify the Commentary Bus server is accessible
3. Ensure SillyTavern has the latest updates