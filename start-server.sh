#!/bin/bash
# Start Commentary Bus server with proper setup

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR/server"

echo "🎙️ Starting Commentary Bus Server..."

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Start server
echo "🚀 Starting server on http://127.0.0.1:5055"
echo "Press Ctrl+C to stop"
echo ""
node commentary-bus.js