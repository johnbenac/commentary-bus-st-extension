# Quick Start Guide 🚀

Get Commentary Bus running in 5 minutes!

## Step 1: Clone and Setup (1 minute)

```bash
# Clone the repository
git clone https://github.com/johnbenac/commentary-bus-st-extension.git
cd commentary-bus-st-extension

# Install server dependencies
cd server
npm install
```

## Step 2: Start the Server (30 seconds)

```bash
# From the server directory
npm start

# You should see:
# Commentary bus http://127.0.0.1:5055
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
3. Click **Test Connection** - should show "Bus OK"

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
- Check out the [Examples](EXAMPLES.md) for more ideas

## Troubleshooting

If messages aren't appearing:
1. Check the server is running (`curl http://127.0.0.1:5055/status`)
2. Look for errors in browser console (F12)
3. Ensure extension shows as connected
4. Try the **Reconnect** button in extension settings

Happy commenting! 🎙️