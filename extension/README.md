# Commentary Bus SillyTavern Extension

This is the client-side extension that connects to the Commentary Bus server and injects messages into your chats.

## Files

- `index.js` - Main extension code
- `manifest.json` - Extension metadata

## How It Works

1. Connects to the SSE server on app start
2. Listens for chat messages on the configured channel
3. Injects messages using SillyTavern's `/sendas` command
4. Auto-reconnects if connection is lost
5. Updates channel when switching chats (if using "auto" mode)

## Configuration

The extension adds a settings panel with:
- Enable/disable toggle
- Server URL configuration
- Channel selection (including "auto" mode)
- Speaker name customization
- Debug options

## Channel Modes

- **Static** (e.g., "default") - Always uses the same channel
- **Auto** - Dynamically creates channels based on current context:
  - `group-{id}` for group chats
  - `char-{name}` for solo chats

## Development Notes

- Uses modern SillyTavern extension APIs
- Requires no special permissions
- Works with latest ST versions (2024+)
- Handles UI re-rendering with MutationObserver