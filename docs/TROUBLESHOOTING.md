# Troubleshooting Guide ❓

## Common Issues

### "Failed to reach Commentary Bus" Error

**Symptoms:**
- Test Connection button shows error
- No messages appearing in chat
- Extension appears disconnected

**Solutions:**

1. **Check server is running:**
   ```bash
   curl http://127.0.0.1:5055/status
   ```
   Should return JSON with `"status": "running"`

2. **Verify correct URL in extension settings:**
   - Should be `http://127.0.0.1:5055` (no trailing slash)
   - NOT `https://` (no SSL)
   - NOT `localhost` (use 127.0.0.1)

3. **Check browser console (F12):**
   - Look for CORS errors
   - Look for "net::ERR_CONNECTION_REFUSED"

4. **Restart the server:**
   ```bash
   cd commentary-bus-st-extension/server
   npm start
   ```

### Messages Not Appearing in Chat

**Symptoms:**
- Server shows client connected
- `/ingest` returns success
- But no messages in SillyTavern

**Solutions:**

1. **Verify character exists:**
   - Create a character named "Commentator" (or your configured name)
   - Add them to your group chat

2. **Check channel matching:**
   - If using "auto" channel, note the actual channel name
   - Send messages to the correct channel

3. **Enable extension:**
   - Extensions panel → Commentary Bus → Checkbox enabled

4. **Browser console errors:**
   - Look for `/sendas` command failures
   - Check for JavaScript errors

### Connection Keeps Dropping

**Symptoms:**
- "Connection lost, retrying..." notifications
- Server logs show repeated connect/disconnect

**Solutions:**

1. **Update CORS settings:**
   - Server should use `origin: '*'` for open access
   - Or add your specific SillyTavern URL

2. **Check firewall:**
   - Ensure port 5055 is not blocked
   - Windows Defender may block Node.js

3. **Browser extensions:**
   - Ad blockers might interfere
   - Try in incognito mode

### Extension Not Visible

**Symptoms:**
- Installed but no settings panel
- Can't find Commentary Bus in extensions

**Solutions:**

1. **Hard refresh SillyTavern:**
   - Ctrl+F5 (Windows/Linux)
   - Cmd+Shift+R (Mac)

2. **Check installation:**
   - Extensions → Manage → Is it listed?
   - Try reinstalling

3. **Console errors:**
   - Check for JavaScript errors on load
   - Look for "Failed to load extension"

## Diagnostic Commands

### Check Server Health
```bash
# Is it running?
curl http://127.0.0.1:5055/status

# Check specific channel
curl -N "http://127.0.0.1:5055/events?channel=default" | head -20

# Test message sending
curl -X POST http://127.0.0.1:5055/ingest \
  -H 'Content-Type: application/json' \
  -d '{"text": "Test message"}'
```

### Check Process
```bash
# Find Node.js processes
ps aux | grep node

# Check port usage
netstat -an | grep 5055  # Linux/Mac
netstat -an | findstr 5055  # Windows
```

### Browser Debugging
```javascript
// Run in browser console (F12)

// Check if extension loaded
console.log(SillyTavern.getContext().extensionSettings.commentaryBus);

// Check EventSource support
console.log(typeof EventSource);

// Test connection manually
const es = new EventSource('http://127.0.0.1:5055/events');
es.onmessage = (e) => console.log('Message:', e.data);
es.onerror = (e) => console.error('Error:', e);
```

## Error Messages Explained

### "net::ERR_CONNECTION_REFUSED"
- Server not running
- Wrong port number
- Firewall blocking connection

### "CORS policy" errors
- Server CORS not configured for your URL
- Using http:// with https:// SillyTavern
- Browser security blocking local connections

### "Failed to execute /sendas"
- Character name doesn't exist
- Not in a group chat
- SillyTavern API changed (update needed)

### "text required"
- Message text is empty or missing
- JSON formatting error in request

## Platform-Specific Issues

### Windows
- Windows Defender may block Node.js
- PowerShell may need different quote escaping
- Use `127.0.0.1` not `localhost`

### Linux
- May need to allow port 5055 in firewall
- SELinux might block connections
- Check systemd logs if using as service

### macOS
- May prompt to allow incoming connections
- Gatekeeper might block unsigned Node.js
- Use `127.0.0.1` for reliability

## Advanced Debugging

### Enable Debug Logging

1. **In extension settings:**
   - Enable "Log heartbeats" checkbox
   - Watch browser console for activity

2. **Server verbose mode:**
   ```javascript
   // Add to server code
   app.use((req, res, next) => {
     console.log(`${req.method} ${req.path}`);
     next();
   });
   ```

3. **Network inspection:**
   - Browser DevTools → Network tab
   - Look for "eventsource" connections
   - Check request/response headers

### Reset Everything

If all else fails:

1. Stop server (Ctrl+C)
2. Clear browser cache
3. Disable/re-enable extension
4. Restart server
5. Hard refresh SillyTavern

## Getting Help

1. **Check the logs:**
   - Server: `commentary-bus.log`
   - Browser: F12 console
   - SillyTavern: Check for error toasts

2. **Version info:**
   - Node.js: `node --version` (needs 16+)
   - Check `manifest.json` for extension version
   - SillyTavern version in About dialog

3. **Report issues:**
   - Include error messages
   - Server and browser logs
   - Steps to reproduce

Remember: Most issues are connection-related. Ensure the server is running and accessible!