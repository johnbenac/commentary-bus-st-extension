# Examples 💡

## Claude Code Monitoring with Attribution

### Live Development Commentary

When monitoring a Claude project, you'll see activity with proper attribution:

```
Claude: Reading config.yaml (46 lines)
Claude: Writing server.js (1234B): // Express server setup...
Claude: ExitPlanMode: Implement OAuth2 Authentication

## Plan to Implement OAuth2
- Add passport dependency
- Create auth middleware
- Set up Google OAuth strategy

Johnny: ✅ Approved · Implement OAuth2 Authentication
Claude: npm install passport passport-google-oauth20
Tools: added 15 packages in 2.341s
Claude: Writing auth/oauth.js (567B): const passport = require('passport')...
```

Notice how:
- **Claude's actions** show as "Claude"
- **Your approval** shows with your name (Johnny)
- **System outputs** show as "Tools"

## Basic Message Sending

### Simple Message
```bash
curl -X POST http://127.0.0.1:5055/ingest \
  -H 'Content-Type: application/json' \
  -d '{"text": "Hello from bash!"}'
```

### Custom Speaker
```bash
curl -X POST http://127.0.0.1:5055/ingest \
  -H 'Content-Type: application/json' \
  -d '{"name": "System Monitor", "text": "CPU usage: 45%"}'
```

### Specific Channel
```bash
curl -X POST http://127.0.0.1:5055/ingest \
  -H 'Content-Type: application/json' \
  -d '{"channel": "alerts", "text": "Disk space low", "name": "Monitor"}'
```

## Monitoring Agent Attribution

### Watch Attribution in Real-Time

Connect to the SSE stream and observe attribution:

```javascript
const events = new EventSource('http://127.0.0.1:5055/events');

events.addEventListener('chat', (e) => {
  const msg = JSON.parse(e.data);
  const actor = msg.attribution.actor_type;
  const decision = msg.attribution.decision;
  
  console.log(`[${actor}] ${msg.name || 'User'}: ${msg.text}`);
  
  if (decision) {
    console.log(`  → Decision: ${decision}`);
  }
});
```

Output:
```
[assistant] Claude: ExitPlanMode: Database Migration Plan
[human] Johnny: ✅ Approved · Database Migration Plan
  → Decision: approved
[assistant] Claude: psql -U postgres -d myapp
[tool] Tools: Database connection established
```

## Decision Tracking Script

### Log Human Decisions

Track all approvals and rejections:

```python
#!/usr/bin/env python3
import json
import requests
import sseclient
from datetime import datetime

# Connect to SSE stream
response = requests.get('http://127.0.0.1:5055/events', stream=True)
client = sseclient.SSEClient(response)

decisions = []

for event in client.events():
    if event.event == 'chat':
        data = json.loads(event.data)
        attr = data.get('attribution', {})
        
        # Track human decisions
        if attr.get('decision') in ['approved', 'rejected']:
            decision = {
                'timestamp': datetime.now().isoformat(),
                'user': data.get('name', 'Unknown'),
                'decision': attr['decision'],
                'tool': attr.get('subject_tool'),
                'text': data['text']
            }
            decisions.append(decision)
            print(f"[{decision['timestamp']}] {decision['user']} {decision['decision']} {decision['tool']}")
            
            # Save to file
            with open('decisions.jsonl', 'a') as f:
                f.write(json.dumps(decision) + '\n')
```

## Game Integration with Attribution

### Dice Roller with Clear Attribution

```javascript
class AttributedDiceRoller {
  constructor(baseUrl = 'http://127.0.0.1:5055') {
    this.baseUrl = baseUrl;
  }

  async narrateRoll(character, action, isPlayer = true) {
    const roll = Math.floor(Math.random() * 20) + 1;
    const speaker = isPlayer ? character : 'Dice Master';
    
    let narration;
    if (roll === 20) {
      narration = `🎯 CRITICAL SUCCESS! ${character} ${action} brilliantly!`;
    } else if (roll === 1) {
      narration = `💥 CRITICAL FAILURE! ${character} fails spectacularly!`;
    } else if (roll >= 15) {
      narration = `✅ Success! ${character} ${action}. (${roll})`;
    } else if (roll >= 10) {
      narration = `📊 Partial success. ${character} ${action} with difficulty. (${roll})`;
    } else {
      narration = `❌ Failure. ${character} cannot ${action}. (${roll})`;
    }
    
    await fetch(`${this.baseUrl}/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: speaker,
        text: narration,
        channel: 'game',
        meta: {
          isPlayerAction: isPlayer,
          roll: roll,
          character: character
        }
      })
    });
  }
}

// Usage showing clear attribution
const roller = new AttributedDiceRoller();

// Player action - attributed to player
await roller.narrateRoll("Aragorn", "leap across the chasm", true);

// NPC action - attributed to Dice Master
await roller.narrateRoll("Goblin", "attack with crude sword", false);
```

## Audit Trail Generator

### Track All Human-AI Interactions

```python
#!/usr/bin/env python3
import json
import requests
import sseclient
from collections import defaultdict

class AuditTracker:
    def __init__(self):
        self.stats = defaultdict(lambda: defaultdict(int))
        
    def track(self):
        response = requests.get('http://127.0.0.1:5055/events', stream=True)
        client = sseclient.SSEClient(response)
        
        for event in client.events():
            if event.event == 'chat':
                data = json.loads(event.data)
                attr = data.get('attribution', {})
                actor = attr.get('actor_type', 'unknown')
                subtype = data.get('subtype', 'unknown')
                
                # Track by actor type
                self.stats[actor][subtype] += 1
                
                # Special tracking for decisions
                if attr.get('decision'):
                    self.stats['decisions'][attr['decision']] += 1
                
                # Print running totals
                self.print_stats()
    
    def print_stats(self):
        print("\033[2J\033[H")  # Clear screen
        print("=== Commentary Bus Attribution Stats ===\n")
        
        for actor in ['human', 'assistant', 'tool', 'system']:
            if actor in self.stats:
                print(f"{actor.upper()}:")
                for subtype, count in self.stats[actor].items():
                    print(f"  {subtype}: {count}")
                print()
        
        if 'decisions' in self.stats:
            print("DECISIONS:")
            for decision, count in self.stats['decisions'].items():
                print(f"  {decision}: {count}")

# Run the tracker
tracker = AuditTracker()
tracker.track()
```

Output:
```
=== Commentary Bus Attribution Stats ===