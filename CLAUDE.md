# CLAUDE.md - Commentary Bus Project Guidelines

This file contains project-specific guidelines for AI agents working on the Commentary Bus extension.

## 🚨 Git Configuration - SPECIAL CASE

**This project uses GitHub, not GitLab!** Unlike other Centroid projects, we push to github.com:

```bash
# CORRECT - Just use simple git push
git push

# WRONG - Don't overcomplicate it
sudo -u johnb git push  # NOT needed here!
```

**Why?** This is a public open-source project hosted on GitHub for the SillyTavern community. Other Centroid projects use internal GitLab, but this one is intentionally external.

## 🏗️ Architecture Overview

- **Unified Service** on port 5055 (SSE server + Claude monitoring)
- **SillyTavern Extension** connects via EventSource
- **Real-time streaming** of Claude Code activity with proper attribution

Key files:
- `/unified-service/commentary-service.js` - Main service
- `/extension/index.js` - SillyTavern extension
- `/unified-service/filters.yaml` - Message filtering config

## 🎯 Critical Features to Preserve

### Agent Attribution
The system properly attributes actions to humans vs AI:
- User approvals show as "Johnny: ✅ Approved"
- AI actions show as "Claude: Reading file.py"
- System outputs show as "Tools: Created config.json"

**DO NOT BREAK THIS!** Attribution is critical for accountability.

## 🔧 Development Workflow

### Testing Changes
1. Make your changes
2. Restart the service:
   ```bash
   pkill -f commentary-service
   cd unified-service/
   node commentary-service.js
   ```
3. Hard refresh SillyTavern (Ctrl+F5)
4. Test in a chat with "Commentator" character

### Common Debugging
```bash
# Check service status
curl http://127.0.0.1:5055/status

# Watch logs
tail -f nohup.out

# Test message
curl -X POST http://127.0.0.1:5055/ingest \
  -H 'Content-Type: application/json' \
  -d '{"text": "Test from CLAUDE.md!"}'
```

## 📝 Documentation Standards

- **Keep it current** - No legacy 3-component references
- **Show attribution** - Include examples of human vs AI actions
- **Public audience** - This is open source, write clearly
- **Clean commits** - This is a public repo, use proper messages

## 🛠️ Common Tasks

### Update Extension Version
1. Edit `/manifest.json` version
2. Update `/extension/index.js` if needed
3. Test thoroughly
4. Commit with clear message
5. Push to GitHub (just `git push`)

### Add New Message Subtype
1. Update decision patterns in `commentary-service.js`
2. Add to `filters.yaml` include_subtypes
3. Update `speakerFor()` and `originFor()` mappings
4. Test attribution is correct
5. Update documentation

### Debug Attribution Issues
1. Check service logs for decision detection
2. Verify subtype in browser console
3. Check `isUserMessage` flag
4. Ensure speaker returns correct value

## ⚠️ What NOT to Do

- **Don't break attribution** - Human decisions must show as human
- **Don't reference old architecture** - We use 2 components, not 3
- **Don't use sudo for git** - Just `git push` works here
- **Don't add migration guides** - Git history is enough
- **Don't create .md files proactively** - Only when needed

## 🔗 Integration Context

This project bridges:
- **Claude Code** - AI coding assistant with file monitoring
- **SillyTavern** - Frontend for AI chat interactions
- **Commentary Bus** - Real-time event streaming system

The goal: Show what Claude is doing in real-time with clear attribution of who (human or AI) is responsible for each action.

## 💡 Quick Tips

- Service already running? `pkill -f commentary-service` first
- Extension not updating? Hard refresh browser (Ctrl+F5)
- Messages not appearing? Check "Commentator" character exists
- Attribution wrong? Check decision patterns and subtype

## 🚀 Remember

This is a public project that helps the SillyTavern community see AI actions in real-time. Keep it clean, well-documented, and always preserve proper agent attribution. When in doubt, test the attribution!