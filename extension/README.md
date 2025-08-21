# Commentary Bus SillyTavern Extension

This is the client-side extension that connects to the Commentary Bus server and injects messages into your chats. It also provides dynamic configuration for the Claude Commentary Bridge.

## Files

- `index.js` - Main extension code
- `manifest.json` - Extension metadata (must be at repository root for SillyTavern)

## How It Works

1. Connects to the SSE server on app start
2. Configures the Claude Commentary Bridge via HTTP API
3. Listens for chat messages on the configured channel
4. Injects messages using SillyTavern's `/sendas` command
5. Auto-reconnects if connection is lost
6. Updates channel when switching chats (if using "auto" mode)

## Configuration Panel

The extension adds a comprehensive settings panel with:

### Connection Settings
- **Enable/disable toggle** - Turn the extension on/off
- **Commentary Bus URL** - SSE server endpoint (default: `http://127.0.0.1:5055`)
- **Bridge URL** - Bridge API endpoint (default: `http://127.0.0.1:5056`)

### Channel Configuration
- **Channel selection** - Choose static channel or "auto" mode
- **Speaker name** - Character name for injected messages (default: "Commentator")

### Project Directory Configuration
- **Project Directory Path** - Enter your Claude project path
  - Example: `/var/workstation/assistants/commentator`
  - Automatically transformed to Claude's format
  - Updates bridge monitoring in real-time
  - Shows success/error feedback

### Debug Options
- **Log heartbeats** - Enable SSE heartbeat logging in console

## Channel Modes

- **Static** (e.g., "default") - Always uses the same channel
- **Auto** - Dynamically creates channels based on current context:
  - `group-{id}` for group chats
  - `char-{name}` for solo chats

## Path Transformation

When you enter a project path, the extension communicates with the bridge to:

1. **Accept user-friendly paths**: `/var/workstation/my-project`
2. **Transform to Claude format**: `/root/.claude/projects/-var-workstation-my-project`
3. **Validate directory exists**: Shows error if path not found
4. **Update monitoring**: Bridge switches to new project immediately

### Examples

| You Enter | Bridge Monitors |
|-----------|-----------------|
| `/var/workstation/assistants/commentator` | `/root/.claude/projects/-var-workstation-assistants-commentator` |
| `/opt/centroid-tools/dictation` | `/root/.claude/projects/-opt-centroid-tools-dictation` |
| `/home/user/project` | `/root/.claude/projects/-home-user-project` |

## Troubleshooting

### Bridge Connection Issues
- **Error: "Failed to fetch"** - Ensure bridge is running on port 5056
- **Error: "Session directory not found"** - Verify the project path exists
- **No activity showing** - Check that Claude is creating sessions in the monitored folder

### SSE Connection Issues  
- **Not connecting** - Verify Commentary Bus is running on port 5055
- **Messages not appearing** - Ensure "Commentator" character exists in chat
- **Reconnection loops** - Check browser console for CORS or network errors

## Development Notes

- Uses modern SillyTavern extension APIs
- Requires no special permissions  
- Works with SillyTavern v1.13.2+
- Handles UI re-rendering with MutationObserver
- Includes CORS support for cross-origin API calls