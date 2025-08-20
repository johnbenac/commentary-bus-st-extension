#!/bin/bash
# send-message.sh - Quick message sender for Commentary Bus

# Default values
SERVER="http://127.0.0.1:5055"
CHANNEL="default"
NAME="Commentator"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -c|--channel)
            CHANNEL="$2"
            shift 2
            ;;
        -n|--name)
            NAME="$2"
            shift 2
            ;;
        -s|--server)
            SERVER="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: $0 [OPTIONS] \"Your message text\""
            echo ""
            echo "Options:"
            echo "  -c, --channel CHANNEL   Channel to send to (default: default)"
            echo "  -n, --name NAME        Speaker name (default: Commentator)"
            echo "  -s, --server URL       Server URL (default: http://127.0.0.1:5055)"
            echo "  -h, --help            Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0 \"Hello, world!\""
            echo "  $0 -n \"Game Master\" \"Roll for initiative!\""
            echo "  $0 -c alerts -n System \"Backup completed\""
            exit 0
            ;;
        *)
            MESSAGE="$1"
            shift
            ;;
    esac
done

# Check if message provided
if [ -z "$MESSAGE" ]; then
    echo "Error: No message provided"
    echo "Usage: $0 [OPTIONS] \"Your message text\""
    exit 1
fi

# Send the message
echo "📤 Sending to channel '$CHANNEL' as '$NAME'..."
RESPONSE=$(curl -s -X POST "$SERVER/ingest" \
    -H 'Content-Type: application/json' \
    -d "{\"channel\": \"$CHANNEL\", \"name\": \"$NAME\", \"text\": \"$MESSAGE\"}")

# Check response
if echo "$RESPONSE" | grep -q '"ok":true'; then
    echo "✅ Message sent successfully!"
else
    echo "❌ Failed to send message"
    echo "Response: $RESPONSE"
    exit 1
fi