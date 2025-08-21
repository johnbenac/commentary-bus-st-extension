# Examples 💡

## Claude Code Monitoring

### Live Development Commentary

When you set a project directory path in the extension, Claude's activity automatically appears:

```
Claude: Reading config.yaml (46 lines)
Claude: Writing server.js (1234B): // Express server setup...
Claude: Searching for "TODO" in ./src
Claude: 5 todos updated → pending: "Add error handling"...
```

No additional setup needed - just configure the project path!

## Basic Message Sending

### Bash/cURL

```bash
# Simple message
curl -X POST http://127.0.0.1:5055/ingest \
  -H 'Content-Type: application/json' \
  -d '{"text": "Hello from bash!"}'

# With custom speaker
curl -X POST http://127.0.0.1:5055/ingest \
  -H 'Content-Type: application/json' \
  -d '{"name": "System", "text": "CPU usage is high!"}'

# To specific channel
curl -X POST http://127.0.0.1:5055/ingest \
  -H 'Content-Type: application/json' \
  -d '{"channel": "alerts", "text": "Disk space low"}'
```

## Scripted Narration

### Random Events Script

```bash
#!/bin/bash
# random-events.sh - Send random events every few minutes

EVENTS=(
  "A mysterious merchant arrives at the tavern"
  "Thunder rumbles in the distance"
  "You hear wolves howling nearby"
  "The wind picks up, rustling through the trees"
  "A shooting star streaks across the sky"
)

while true; do
  # Pick random event
  EVENT="${EVENTS[$RANDOM % ${#EVENTS[@]}]}"
  
  # Send to Commentary Bus
  curl -s -X POST http://127.0.0.1:5055/ingest \
    -H 'Content-Type: application/json' \
    -d "{\"name\": \"Narrator\", \"text\": \"$EVENT\"}"
  
  # Wait 3-10 minutes
  sleep $((180 + RANDOM % 420))
done
```

## System Monitoring

### Python System Monitor

```python
#!/usr/bin/env python3
# system-monitor.py - Report system stats periodically

import psutil
import requests
import time

def send_message(text, name="System Monitor"):
    requests.post('http://127.0.0.1:5055/ingest', 
                  json={'name': name, 'text': text})

def monitor_system():
    while True:
        # CPU check
        cpu = psutil.cpu_percent(interval=1)
        if cpu > 80:
            send_message(f"⚠️ High CPU usage: {cpu}%")
        
        # Memory check
        mem = psutil.virtual_memory().percent
        if mem > 90:
            send_message(f"⚠️ Low memory: {mem}% used")
        
        # Disk check
        disk = psutil.disk_usage('/').percent
        if disk > 90:
            send_message(f"⚠️ Low disk space: {disk}% used")
        
        time.sleep(60)  # Check every minute

if __name__ == "__main__":
    monitor_system()
```

## Game Integration

### Dice Roller with Commentary

```javascript
// dice-roller.js - Roll dice and narrate results

function rollDice(sides = 20) {
  return Math.floor(Math.random() * sides) + 1;
}

async function narratedRoll(character, action) {
  const roll = rollDice();
  let narration;
  
  if (roll === 20) {
    narration = `🎯 CRITICAL SUCCESS! ${character} ${action} with incredible skill!`;
  } else if (roll === 1) {
    narration = `💥 CRITICAL FAILURE! ${character} completely botches ${action}!`;
  } else if (roll >= 15) {
    narration = `✅ Success! ${character} ${action} effectively. (Rolled ${roll})`;
  } else if (roll >= 10) {
    narration = `📊 Partial success. ${character} ${action}, but with complications. (Rolled ${roll})`;
  } else {
    narration = `❌ Failure. ${character} fails to ${action}. (Rolled ${roll})`;
  }
  
  await fetch('http://127.0.0.1:5055/ingest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Dice Master',
      text: narration
    })
  });
}

// Usage
narratedRoll("Aragorn", "leap across the chasm");
narratedRoll("Gimli", "persuade the bartender");
```

## Time-Based Events

### Daily Schedule

```python
#!/usr/bin/env python3
# daily-events.py - Send time-based narrative events

import schedule
import requests
from datetime import datetime

def send(text, name="Timekeeper"):
    requests.post('http://127.0.0.1:5055/ingest',
                  json={'name': name, 'text': text})

def morning():
    send("☀️ The sun rises over the horizon. A new day begins.")

def noon():
    send("🌞 The sun reaches its peak. The market square bustles with activity.")

def evening():
    send("🌅 The sun sets, painting the sky in shades of orange and purple.")

def night():
    send("🌙 Night falls. The stars twinkle overhead.")

def hourly():
    hour = datetime.now().hour
    if hour == 13:
        send("🕐 The church bells toll once. It's 1 o'clock.")
    elif hour == 0:
        send("🕛 Midnight strikes! The witching hour begins...")

# Schedule events
schedule.every().day.at("06:00").do(morning)
schedule.every().day.at("12:00").do(noon)
schedule.every().day.at("18:00").do(evening)
schedule.every().day.at("22:00").do(night)
schedule.every().hour.do(hourly)

print("Daily events scheduler running...")
while True:
    schedule.run_pending()
    time.sleep(60)
```

## Integration Examples

### Discord Bot Integration

```python
# discord-bridge.py - Forward Discord messages to SillyTavern

import discord
import requests

class CommentaryBot(discord.Client):
    async def on_message(self, message):
        # Ignore bot's own messages
        if message.author == self.user:
            return
        
        # Forward messages from specific channel
        if message.channel.name == "tavern-events":
            requests.post('http://127.0.0.1:5055/ingest', json={
                'name': f"Discord/{message.author.name}",
                'text': message.content,
                'channel': 'discord-bridge'
            })

# Run the bot
bot = CommentaryBot()
bot.run('YOUR_DISCORD_TOKEN')
```

### Weather Updates

```bash
#!/bin/bash
# weather-updates.sh - Post weather to chat

while true; do
  # Get weather (requires 'curl' and 'jq')
  WEATHER=$(curl -s "wttr.in/London?format=j1" | jq -r '.current_condition[0]')
  TEMP=$(echo "$WEATHER" | jq -r '.temp_C')
  DESC=$(echo "$WEATHER" | jq -r '.weatherDesc[0].value')
  
  curl -X POST http://127.0.0.1:5055/ingest \
    -H 'Content-Type: application/json' \
    -d "{\"name\": \"Weather Service\", \"text\": \"🌤️ Current weather: ${DESC}, ${TEMP}°C\"}"
  
  sleep 3600  # Update hourly
done
```

## Advanced Patterns

### Multi-Channel Router

```javascript
// channel-router.js - Route different types of messages

class CommentaryRouter {
  constructor(baseUrl = 'http://127.0.0.1:5055') {
    this.baseUrl = baseUrl;
  }

  async send(channel, name, text) {
    return fetch(`${this.baseUrl}/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel, name, text })
    });
  }

  // Different message types to different channels
  async systemAlert(text) {
    return this.send('alerts', 'System', `🚨 ${text}`);
  }

  async gameEvent(text) {
    return this.send('game', 'Game Master', text);
  }

  async narration(text) {
    return this.send('story', 'Narrator', `📖 ${text}`);
  }

  async weatherUpdate(text) {
    return this.send('environment', 'Weather', `🌤️ ${text}`);
  }
}

// Usage
const router = new CommentaryRouter();
router.systemAlert("Backup completed successfully");
router.gameEvent("A new quest is available!");
router.narration("Meanwhile, in the forgotten ruins...");
```

### Message Queue with Retry

```python
# reliable-sender.py - Queue messages with retry logic

import requests
import time
from queue import Queue
from threading import Thread

class ReliableCommentaryBus:
    def __init__(self, base_url='http://127.0.0.1:5055'):
        self.base_url = base_url
        self.queue = Queue()
        self.worker = Thread(target=self._process_queue)
        self.worker.daemon = True
        self.worker.start()
    
    def send(self, text, **kwargs):
        self.queue.put({'text': text, **kwargs})
    
    def _process_queue(self):
        while True:
            msg = self.queue.get()
            retries = 3
            
            while retries > 0:
                try:
                    requests.post(
                        f'{self.base_url}/ingest',
                        json=msg,
                        timeout=5
                    )
                    break  # Success
                except Exception as e:
                    retries -= 1
                    if retries > 0:
                        time.sleep(2)  # Wait before retry
                    else:
                        print(f"Failed to send: {msg}")

# Usage
bus = ReliableCommentaryBus()
bus.send("This message will be queued and retried if needed")
```

## Tips & Best Practices

1. **Rate Limiting**: Don't flood the chat - space messages appropriately
2. **Character Names**: Use consistent names for different types of messages
3. **Channels**: Use channels to organize different message streams
4. **Error Handling**: Always handle connection failures gracefully
5. **Message Format**: Keep messages concise and relevant
6. **Timestamps**: The server adds timestamps automatically
7. **Emojis**: Use sparingly but effectively for visual distinction

Happy automating! 🎯