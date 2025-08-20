# Commentary Bus for SillyTavern 🎙️

> Inject live commentary into your SillyTavern chats from external processes!

## What is this?

Commentary Bus is a Server-Sent Events (SSE) based system that allows external processes to inject messages into your SillyTavern group chats. Think of it as a third character that only speaks when your scripts, automation, or monitoring systems have something to say.

### Features

- 🎯 **One-way communication** - External processes push messages, no responses needed
- 📡 **Real-time delivery** - Messages appear instantly via SSE
- 🔄 **Auto-reconnection** - Resilient to network hiccups
- 📢 **Channel support** - Route messages to specific chats
- 💾 **Message replay** - Late joiners see recent messages
- 🎨 **Clean integration** - Messages appear as a proper character in chat

## Quick Start

1. **Start the server**:
   ```bash
   cd server
   npm install
   npm start
   ```

2. **Install the extension** in SillyTavern:
   - Go to Extensions → Install Extension
   - Enter: `https://github.com/johnbenac/commentary-bus-st-extension`
   - Enable it in the Extensions panel

3. **Send a test message**:
   ```bash
   curl -X POST http://127.0.0.1:5055/ingest \
     -H 'Content-Type: application/json' \
     -d '{"text": "Hello from Commentary Bus!"}'
   ```

## Components

### Server (`/server`)
Node.js/Express SSE server that:
- Accepts messages via POST `/ingest`
- Broadcasts to connected clients via SSE `/events`
- Supports multiple channels for routing
- Maintains a replay buffer for reliability

### Extension (`/extension`)
SillyTavern UI extension that:
- Connects to the SSE stream
- Injects messages using `/sendas` command
- Auto-reconnects on disconnection
- Provides configuration UI

### Examples (`/examples`)
Ready-to-use scripts and code samples for various languages and use cases.

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

## Documentation

- [📚 Full Documentation](docs/README.md)
- [🚀 Quick Start Guide](docs/QUICKSTART.md)
- [🔌 API Reference](docs/API.md)
- [❓ Troubleshooting](docs/TROUBLESHOOTING.md)
- [💡 Examples](docs/EXAMPLES.md)

## Use Cases

- **Game narration** - "The dragon awakens..."
- **System monitoring** - "Server CPU at 90%"
- **Time-based events** - "It's midnight, the spell wears off"
- **External integrations** - Discord bots, webhooks, IoT devices
- **Automated storytelling** - Weather updates, news, random events

## Requirements

- Node.js 16+
- SillyTavern (latest version recommended)
- A character named "Commentator" in your group (optional but recommended)

## License

MIT - Feel free to modify and share!

## Created By

Johnny B, with assistance from Claude and the SillyTavern community.

---

*Working fantastically well as of August 2025!* 🎉