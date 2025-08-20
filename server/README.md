# Commentary Bus Server

This is the SSE (Server-Sent Events) backend that broadcasts messages to connected SillyTavern clients.

## Quick Start

```bash
npm install
npm start
```

The server will start on `http://127.0.0.1:5055`

## Features

- **Multi-channel support** - Route messages to specific chats
- **Message replay** - New clients receive recent messages (last 50 per channel)  
- **CORS enabled** - Works with any origin
- **Lightweight** - Simple Express.js server
- **Resilient** - Handles client disconnections gracefully

## Endpoints

- `POST /ingest` - Send a message
- `GET /events` - SSE stream (use `?channel=name`)
- `GET /status` - Server health check

## Configuration

Currently configured via constants in the code:
- Port: 5055
- Max buffer: 50 messages per channel
- Heartbeat interval: 5 seconds

## Development

To run with auto-restart on changes:
```bash
npm install -g nodemon
nodemon commentary-bus.js
```

## Logs

Server output goes to `commentary-bus.log` when started with the launcher script.