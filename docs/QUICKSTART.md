# Quick Start Guide 🚀

Get Commentary Bus running in 5 minutes!

## Step 1: Clone and Setup (1 minute)

```bash
# Clone the repository
git clone https://github.com/johnbenac/commentary-bus-st-extension.git
cd commentary-bus-st-extension

# Install unified service dependencies
cd unified-service
npm install
```

## Step 2: Start the Unified Service (30 seconds)

```bash
# From the unified-service directory
npm start

# You should see:
# 🚀 Unified Commentary Service running on http://127.0.0.1:5055
# 📡 SSE endpoint: http://127.0.0.1:5055/events?channel=<channel>
# 💬 Ingest endpoint: http://127.0.0.1:5055/ingest
```

Leave this running in a terminal.

## Step 3: Install Extension in SillyTavern (1 minute)

1. Open SillyTavern in your browser
2. Go to **Extensions** panel (puzzle piece icon)
3. Click **Install Extension**
4. Paste: `https://github.com/johnbenac/commentary-bus-st-extension`
5. Click **Install**

## Step 4: Configure Extension (30 seconds)

1. Find **Commentary Bus** in the Extensions panel
2. Ensure it's **enabled** (checkbox checked)
3. Set **Service URL** to: `http://127.0.0.1:5055`
4. Click **Test Connection** - should show service status
5. (Optional) Set **Project Directory Path** for Claude monitoring

## Step 5: Send Your First Message! (30 seconds)

Open a new terminal and run:

```bash
curl -X POST http://127.0.0.1:5055/ingest \
  -H 'Content-Type: application/json' \
  -d '{"text": "🎉 Commentary Bus is working!"}'
```

## Success! 🎊

You should now see the message in your SillyTavern chat!

## What's Next?

- Create a character named "Commentator" for proper avatars
- Try different channels with `{"channel": "my-channel"}`
- Set up automated messages with cron or scripts
- Enable Claude monitoring by setting a project directory path
- Check out the [Examples](EXAMPLES.md) for more ideas

## Troubleshooting

If messages aren't appearing:
1. Check the unified service is running (`curl http://127.0.0.1:5055/status`)
2. Look for errors in browser console (F12)
3. Ensure extension shows as connected
4. Try the **Reconnect** button in extension settings
5. Verify the Service URL is set to port 5055

Happy commenting! 🎙️