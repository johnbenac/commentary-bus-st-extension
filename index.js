/**
 * Commentary Bus Extension for SillyTavern
 * Receives messages from external processes and injects them into group chats
 */

(() => {
  const MODULE = 'commentaryBus';
  const MODULE_DISPLAY = 'Commentary Bus';

  function getCtx() { 
    return SillyTavern.getContext(); 
  }

  // Store current connection
  let currentConnection = null;

  async function connect() {
    const ctx = getCtx();
    
    // Initialize settings with defaults
    if (!ctx.extensionSettings[MODULE]) {
      ctx.extensionSettings[MODULE] = {
        enabled: true,
        serverUrl: 'http://127.0.0.1:5055',
        channel: 'default',
        speaker: 'Commentator',
        logHeartbeats: false,
      };
      ctx.saveSettingsDebounced();
    }

    const settings = ctx.extensionSettings[MODULE];
    
    // Skip if disabled
    if (!settings.enabled) {
      console.log(`[${MODULE_DISPLAY}] Extension disabled`);
      disconnect();
      return;
    }

    // Determine channel based on current context
    const activeGroupId = ctx.groupId || 'solo';
    const activeCharacter = ctx.characterId || 'unknown';
    const contextId = ctx.groupId ? `group-${activeGroupId}` : `char-${activeCharacter}`;
    const channel = settings.channel === 'auto' ? contextId : settings.channel;

    // Close existing connection
    disconnect();

    try {
      const url = `${settings.serverUrl.replace(/\/$/, '')}/events?channel=${encodeURIComponent(channel)}`;
      console.log(`[${MODULE_DISPLAY}] Connecting to ${url}`);
      
      const es = new EventSource(url);
      currentConnection = es;

      es.addEventListener('connected', (e) => {
        console.log(`[${MODULE_DISPLAY}] Connected:`, e.data);
        toastr.success(`Connected to channel: ${channel}`, MODULE_DISPLAY);
      });

      es.addEventListener('heartbeat', (e) => {
        if (settings.logHeartbeats) {
          console.debug(`[${MODULE_DISPLAY}] Heartbeat:`, e.data);
        }
      });

      es.addEventListener('chat', async (e) => {
        try {
          const payload = JSON.parse(e.data || '{}');
          const name = String(payload.name || settings.speaker);
          const text = String(payload.text || '').trim();
          
          if (!text) {
            console.warn(`[${MODULE_DISPLAY}] Received empty message`);
            return;
          }

          console.log(`[${MODULE_DISPLAY}] Received message from ${name}: ${text}`);

          // Use /sendas to inject the message
          try {
            const { executeSlashCommands } = await import('/scripts/slash-commands.js');
            // Escape quotes in the text
            const escapedText = text.replace(/"/g, '\\"');
            const command = `/sendas name="${name}" ${escapedText}`;
            
            console.debug(`[${MODULE_DISPLAY}] Executing command:`, command);
            await executeSlashCommands(command);
            
          } catch (cmdError) {
            console.error(`[${MODULE_DISPLAY}] Failed to execute /sendas:`, cmdError);
            toastr.error('Failed to inject message', MODULE_DISPLAY);
          }
          
        } catch (parseError) {
          console.error(`[${MODULE_DISPLAY}] Failed to parse chat message:`, parseError);
        }
      });

      es.onerror = (e) => {
        console.error(`[${MODULE_DISPLAY}] Connection error:`, e);
        toastr.error('Connection lost, retrying...', MODULE_DISPLAY);
        
        // Auto-reconnect after a delay
        setTimeout(() => {
          if (currentConnection === es && ctx.extensionSettings[MODULE]?.enabled) {
            connect();
          }
        }, 2000);
      };

    } catch (error) {
      console.error(`[${MODULE_DISPLAY}] Failed to connect:`, error);
      toastr.error('Failed to connect to Commentary Bus', MODULE_DISPLAY);
    }
  }

  function disconnect() {
    if (currentConnection) {
      try {
        currentConnection.close();
        console.log(`[${MODULE_DISPLAY}] Disconnected`);
      } catch (e) {
        // Ignore close errors
      }
      currentConnection = null;
    }
  }

  // Register extension
  SillyTavern.registerExtension(MODULE, {
    name: MODULE_DISPLAY,
    init: async () => {
      const ctx = getCtx();
      
      // Register event handlers
      ctx.eventSource.on(ctx.event_types.APP_READY, connect);
      ctx.eventSource.on(ctx.event_types.CHAT_CHANGED, connect);
      
      // Add settings UI
      const settingsHtml = `
        <div class="commentary-bus-settings">
          <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
              <b>${MODULE_DISPLAY}</b>
              <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
              <label class="checkbox_label">
                <input id="commentary-bus-enabled" type="checkbox" />
                <span>Enable Commentary Bus</span>
              </label>
              
              <label for="commentary-bus-server">Server URL:</label>
              <input id="commentary-bus-server" class="text_pole" type="text" placeholder="http://127.0.0.1:5055" />
              
              <label for="commentary-bus-channel">Channel:</label>
              <input id="commentary-bus-channel" class="text_pole" type="text" placeholder="default or auto" />
              <small>Use "auto" to automatically use group/character ID</small>
              
              <label for="commentary-bus-speaker">Default Speaker Name:</label>
              <input id="commentary-bus-speaker" class="text_pole" type="text" placeholder="Commentator" />
              
              <label class="checkbox_label">
                <input id="commentary-bus-log-heartbeats" type="checkbox" />
                <span>Log heartbeats (debug)</span>
              </label>
              
              <div class="commentary-bus-actions" style="margin-top: 10px;">
                <button id="commentary-bus-test" class="menu_button">Test Connection</button>
                <button id="commentary-bus-reconnect" class="menu_button">Reconnect</button>
              </div>
            </div>
          </div>
        </div>
      `;
      
      $('#extensions_settings').append(settingsHtml);
      
      // Load settings into UI
      const settings = ctx.extensionSettings[MODULE] || {};
      $('#commentary-bus-enabled').prop('checked', settings.enabled ?? true);
      $('#commentary-bus-server').val(settings.serverUrl || 'http://127.0.0.1:5055');
      $('#commentary-bus-channel').val(settings.channel || 'default');
      $('#commentary-bus-speaker').val(settings.speaker || 'Commentator');
      $('#commentary-bus-log-heartbeats').prop('checked', settings.logHeartbeats ?? false);
      
      // Handle settings changes
      $('#commentary-bus-enabled').on('change', function() {
        ctx.extensionSettings[MODULE].enabled = this.checked;
        ctx.saveSettingsDebounced();
        if (this.checked) {
          connect();
        } else {
          disconnect();
        }
      });
      
      $('#commentary-bus-server').on('input', function() {
        ctx.extensionSettings[MODULE].serverUrl = this.value;
        ctx.saveSettingsDebounced();
      });
      
      $('#commentary-bus-channel').on('input', function() {
        ctx.extensionSettings[MODULE].channel = this.value;
        ctx.saveSettingsDebounced();
      });
      
      $('#commentary-bus-speaker').on('input', function() {
        ctx.extensionSettings[MODULE].speaker = this.value;
        ctx.saveSettingsDebounced();
      });
      
      $('#commentary-bus-log-heartbeats').on('change', function() {
        ctx.extensionSettings[MODULE].logHeartbeats = this.checked;
        ctx.saveSettingsDebounced();
      });
      
      // Action buttons
      $('#commentary-bus-test').on('click', async () => {
        const settings = ctx.extensionSettings[MODULE];
        try {
          const response = await fetch(`${settings.serverUrl}/status`);
          const data = await response.json();
          toastr.success(`Server running with ${data.clients} clients`, MODULE_DISPLAY);
        } catch (error) {
          toastr.error('Failed to reach server', MODULE_DISPLAY);
        }
      });
      
      $('#commentary-bus-reconnect').on('click', () => {
        disconnect();
        setTimeout(connect, 100);
      });
      
      // Start connection if enabled
      if (settings.enabled) {
        connect();
      }
      
      console.log(`[${MODULE_DISPLAY}] Extension initialized`);
    },
    
    onExit: () => {
      disconnect();
    }
  });
})();