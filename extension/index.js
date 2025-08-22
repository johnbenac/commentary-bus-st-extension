/**
 * Commentary Bus (refactored for modern SillyTavern, 2025-08)
 * - Visible drawer in Extensions panel (#extensions_settings2, with fallback)
 * - Uses SillyTavern.getContext() APIs
 * - Robust SSE connection with reconnect + channeling
 * - Injects messages via /sendas using current slash-command engine
 */
(() => {
  const MODULE = 'commentaryBus';
  const TITLE = 'Commentary Bus';
  const UI_ROOT_ID = 'cbus-settings-root';

  const defaults = Object.freeze({
    settingsSchemaVersion: 2,
    enabled: true,
    serviceUrl: 'http://127.0.0.1:5055',
    channel: 'default',      // or "auto"
    speaker: 'Commentator',
    logHeartbeats: false,
    sessionDir: '',          // current session folder being monitored (project path)
    metaMode: 'inline'       // 'inline' | 'tooltip' | 'off' - how to display message metadata
  });

  /** @type {ReturnType<typeof SillyTavern.getContext>} */
  const ctx = SillyTavern.getContext();
  const { eventSource, event_types } = ctx;

  // --- State ---
  let es = null;           // EventSource handle
  let lastUrl = '';        // last connected URL (for logs)
  let mounted = false;     // settings drawer mounted?
  let hasConfigApi = false; // service supports /config/session-dir?

  // --- Settings helpers ---
  function ensureSettings() {
    if (!ctx.extensionSettings[MODULE]) {
      ctx.extensionSettings[MODULE] = { ...defaults };
      ctx.saveSettingsDebounced();
    } else {
      // backfill any missing keys to survive ST updates
      for (const [k, v] of Object.entries(defaults)) {
        if (!Object.hasOwn(ctx.extensionSettings[MODULE], k)) {
          ctx.extensionSettings[MODULE][k] = v;
        }
      }
      ctx.saveSettingsDebounced();
    }
  }

  function getSettings() {
    ensureSettings();
    return ctx.extensionSettings[MODULE];
  }

  // --- Migration from v1 to v2 ---
  function migrateSettingsIfNeeded() {
    const st = getSettings();
    if (!('settingsSchemaVersion' in st) || st.settingsSchemaVersion < 2) {
      // Compute new serviceUrl from old settings
      st.serviceUrl = st.serviceUrl || st.serverUrl || st.bridgeUrl || 'http://127.0.0.1:5055';
      st.__migratedFromV1 = !!(st.serverUrl || st.bridgeUrl);
      st.settingsSchemaVersion = 2;

      // Stop saving legacy keys going forward
      delete st.serverUrl;
      delete st.bridgeUrl;

      ctx.saveSettingsDebounced();
      
      // Show migration toast
      try { 
        toastr.info('Commentary Bus upgraded to unified service (v2.0)', TITLE); 
      } catch {}
    }
  }

  // --- Service capability detection ---
  async function serviceSupportsConfigApi(base) {
    try {
      const r = await fetch(base.replace(/\/$/, '') + '/config/session-dir', { method: 'GET' });
      return r.ok; // 200 with JSON {sessionDir,...}
    } catch { 
      return false; 
    }
  }

  // --- Channel helper (auto = per group/char) ---
  function computeChannel() {
    const st = getSettings();
    if (st.channel !== 'auto') return st.channel;

    const gid = ctx.groupId;
    const cid = ctx.characterId;
    return gid ? `group-${gid}` : `char-${cid ?? 'unknown'}`;
  }

  // --- UI ---
  function settingsHtml() {
    return `
      <div id="${UI_ROOT_ID}" class="commentary-bus-settings">
        <div class="inline-drawer">
          <div class="inline-drawer-toggle inline-drawer-header">
            <b>${TITLE}</b>
            <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
          </div>
          <div class="inline-drawer-content">
            <label class="checkbox_label">
              <input id="cbus-enabled" type="checkbox" />
              <span>Enable</span>
            </label>

            <label for="cbus-service">Service URL:</label>
            <input id="cbus-service" class="text_pole" type="text" placeholder="http://127.0.0.1:5055" />

            <label for="cbus-channel">Channel:</label>
            <input id="cbus-channel" class="text_pole" type="text" placeholder="default or auto" />
            <small>Use <code>auto</code> to bind to the current group/character.</small>

            <label for="cbus-speaker">Assistant Character Name:</label>
            <input id="cbus-speaker" class="text_pole" type="text" placeholder="Claude" />
            <small>Override how Claude appears in chat (leave blank to use default)</small>

            <label class="checkbox_label" title="Log heartbeat events to console">
              <input id="cbus-log-heartbeats" type="checkbox" />
              <span>Log heartbeats</span>
            </label>

            <label for="cbus-meta-mode">Metadata display:</label>
            <select id="cbus-meta-mode" class="text_pole">
              <option value="inline">Inline (default)</option>
              <option value="tooltip">Tooltip</option>
              <option value="off">Off</option>
            </select>
            <small>Show message type info as muted text, tooltip, or hide</small>

            <div style="margin-top: 10px; padding: 8px; border: 1px solid var(--SmartThemeBorderColor); border-radius: 4px;">
              <label style="font-weight: bold; margin-bottom: 5px; display: block;">Project Directory Path:</label>
              <div style="margin-bottom: 8px;">
                <input id="cbus-session-dir" class="text_pole" type="text" placeholder="Enter your Claude project directory" style="width: 100%;" />
                <div style="font-size: 0.85em; color: var(--SmartThemeBodyColor45); margin-top: 4px;">
                  Example: /var/workstation/assistants/commentator
                </div>
              </div>
            </div>

            <div class="commentary-bus-actions" style="margin-top: 10px;">
              <button id="cbus-test" class="menu_button">Test Connection</button>
              <button id="cbus-reconnect" class="menu_button">Reconnect</button>
            </div>

            <div class="monospace" style="margin-top:6px;color:var(--SmartThemeBodyColor45)">
              <div>Active Channel: <code id="cbus-active-channel">?</code></div>
              <div>Last URL: <code id="cbus-last-url">-</code></div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function getExtensionsPanel() {
    return document.querySelector('#extensions_settings2') || document.querySelector('#extensions_settings');
  }

  function mountSettings() {
    const panel = getExtensionsPanel();
    if (!panel) return;
    // Idempotent mount
    const existing = document.getElementById(UI_ROOT_ID);
    if (existing) { mounted = true; return; }
    panel.insertAdjacentHTML('beforeend', settingsHtml());
    bindSettings();
    mounted = true;
    refreshSettingsUI();
  }

  function bindSettings() {
    const st = getSettings();

    $('#cbus-enabled').on('change', function () {
      st.enabled = this.checked;
      ctx.saveSettingsDebounced();
      if (st.enabled) connect();
      else disconnect();
    });

    $('#cbus-service').on('input', function () {
      st.serviceUrl = this.value.trim();
      ctx.saveSettingsDebounced();
    });

    $('#cbus-channel').on('input', function () {
      st.channel = this.value.trim();
      ctx.saveSettingsDebounced();
      // update channel indicator
      $('#cbus-active-channel').text(computeChannel());
    });

    $('#cbus-speaker').on('input', function () {
      st.speaker = this.value.trim();
      ctx.saveSettingsDebounced();
    });

    $('#cbus-log-heartbeats').on('change', function () {
      st.logHeartbeats = this.checked;
      ctx.saveSettingsDebounced();
    });

    $('#cbus-meta-mode').on('change', function () {
      st.metaMode = this.value;
      ctx.saveSettingsDebounced();
    });

    $('#cbus-test').on('click', async () => {
      try {
        const res = await fetch(st.serviceUrl.replace(/\/$/, '') + '/status');
        const data = await res.json();
        toastr.success(`Service OK · clients: ${data.clientsTotal ?? data.clients ?? 'n/a'}`, TITLE);
      } catch (e) {
        console.error(`[${TITLE}] Failed to reach /status`, e);
        toastr.error('Service error', TITLE);
      }
    });

    $('#cbus-reconnect').on('click', () => {
      disconnect();
      setTimeout(connect, 100);
    });

    $('#cbus-session-dir').on('input', async function () {
      const st = getSettings();
      const projectPath = this.value.trim();
      st.sessionDir = projectPath;
      ctx.saveSettingsDebounced();
      
      if (projectPath) {
        // Check if service supports config API
        if (!hasConfigApi) {
          toastr.info('Your service does not support project path configuration. Upgrade the backend to use this feature.', TITLE);
          return;
        }
        
        try {
          // Send project path to unified service for monitoring
          const response = await fetch(`${st.serviceUrl.replace(/\/$/, '')}/config/session-dir`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionDir: projectPath })
          });
          
          if (response.ok) {
            const result = await response.json();
            toastr.success(`Now monitoring: ${projectPath.split('/').pop()}`, TITLE);
            console.log(`[${TITLE}] Service switched to:`, result);
          } else {
            const error = await response.json();
            toastr.error(`Service error: ${error.error}`, TITLE);
            console.error(`[${TITLE}] Service error:`, error);
          }
        } catch (err) {
          toastr.warning(`Project path saved, but service communication failed`, TITLE);
          console.error(`[${TITLE}] Service communication error:`, err);
        }
      } else {
        toastr.info('Project path cleared', TITLE);
      }
    });
  }

  // Session file is now set directly via text input - no server discovery needed

  function refreshSettingsUI() {
    const st = getSettings();
    $('#cbus-enabled').prop('checked', !!st.enabled);
    $('#cbus-service').val(st.serviceUrl);
    $('#cbus-channel').val(st.channel);
    $('#cbus-speaker').val(st.speaker);
    $('#cbus-log-heartbeats').prop('checked', !!st.logHeartbeats);
    $('#cbus-meta-mode').val(st.metaMode || 'inline');
    $('#cbus-session-dir').val(st.sessionDir || '');
    $('#cbus-active-channel').text(computeChannel());
    $('#cbus-last-url').text(lastUrl || '-');
  }

  // Remount when Extensions panel re-renders
  const mo = new MutationObserver(() => {
    if (!document.getElementById(UI_ROOT_ID)) {
      mounted = false;
      mountSettings();
    }
  });
  mo.observe(document.body, { childList: true, subtree: true });

  // --- SSE connection ---
  function disconnect() {
    if (es) {
      try { es.close(); } catch {}
      es = null;
      lastUrl = '';
    }
  }

  async function sendAs(name, text, isUserMessage = false) {
    try {
      const ctx = SillyTavern.getContext();
      const run = ctx.executeSlashCommandsWithOptions || ctx.executeSlashCommands;

      // STscript: prefer ( ... ) for the unnamed text arg; escape ) and backslashes.
      const escaped = String(text)
        .replace(/\\/g, '\\\\')    // backslashes first
        .replace(/\)/g, '\\)');    // balance the ( ... ) arg

      if (isUserMessage) {
        // Adds a message as the CURRENT PERSONA (that's what we want). 
        // Docs: `/send (text)`
        await run(`/send (${escaped})`, { quiet: true });
      } else {
        // Adds a message as a specific character by NAME.
        // Docs: `/sendas name=char (text)`
        const target = String(name || 'Commentator');
        await run(`/sendas name=${JSON.stringify(target)} (${escaped})`, { quiet: true });
      }
    } catch (err) {
      console.error(`[${TITLE}] STscript injection failed`, err);
      try { toastr.error('Failed to inject message', TITLE); } catch {}
    }
  }

  // --- Prefix parser: extracts meta + clean text
  function parsePrefix(raw) {
    let s = String(raw ?? '');
    let meta = null;
    // Case A: "([type: ... ] rest)" → capture inner then split
    let m = s.match(/^\s*\(\s*\[([^\]]+)\]\s+([\s\S]*?)\)\s*$/);
    if (!m) {
      // Case B: "[type: ... ] rest"
      m = s.match(/^\s*\[([^\]]+)\]\s+([\s\S]*)$/);
    }
    if (m) {
      meta = parseMetaBlock(m[1]);
      s = m[2];
    }
    return { text: s.trim(), meta };
  }

  function parseMetaBlock(block) {
    // block like: 'type:assistant event:assistant subtype:assistant_text origin:assistant content:[text] tool:Bash'
    const parts = block.trim().split(/\s+/);
    const kv = {};
    for (const p of parts) {
      const idx = p.indexOf(':');
      if (idx > 0) {
        const k = p.slice(0, idx);
        const v = p.slice(idx + 1);
        kv[k] = v;
      }
    }
    // Build a concise label
    const bits = [];
    if (kv.type) bits.push(`type:${kv.type}`);
    if (kv.subtype) bits.push(`subtype:${kv.subtype}`);
    if (kv.origin) bits.push(`origin:${kv.origin}`);
    if (kv.tool) bits.push(`tool:${kv.tool}`);
    return { kv, label: bits.join(' · ') || block.trim() };
  }

  function appendInlineMeta(text, metaLabel) {
    if (!metaLabel) return text;
    // Muted, italic formatting for metadata
    return `${text}\n\n*${metaLabel}*`;
  }

  function attachTooltipToLastBubble(metaLabel) {
    if (!metaLabel) return;
    try {
      const $bubbles = $('.mes');          // SillyTavern message items
      const $last = $bubbles.last();
      const $txt = $last.find('.mes_text').last();
      if ($txt.length) $txt.attr('title', metaLabel);
    } catch {}
  }

  function connect() {
    const st = getSettings();
    if (!st.enabled) return;

    disconnect();

    const channel = computeChannel();
    const url = `${st.serviceUrl.replace(/\/$/, '')}/events?channel=${encodeURIComponent(channel)}`;
    lastUrl = url;
    refreshSettingsUI();

    try {
      es = new EventSource(url);

      es.addEventListener('connected', (e) => {
        console.log(`[${TITLE}] connected → ${url}`, e?.data);
        toastr.success(`Connected (${channel})`, TITLE);
      });

      es.addEventListener('heartbeat', (e) => {
        if (st.logHeartbeats) {
          try { 
            const data = JSON.parse(e.data);
            console.debug(`[${TITLE}] heartbeat`, data);
          }
          catch { 
            console.debug(`[${TITLE}] heartbeat`, e.data);
          }
        }
      });

      es.addEventListener('chat', async (e) => {
        try {
          const payload = JSON.parse(e.data ?? '{}');
          const parsed = parsePrefix(payload.text ?? '');
          let text = parsed.text;
          const metaLabel = parsed.meta?.label || '';
          const isUserMessage = payload.isUserMessage === true;
          
          if (!text) return;

          const st = getSettings();
          const metaMode = st.metaMode || 'inline';
          
          // Apply metadata display mode
          if (metaMode === 'inline' && metaLabel) {
            text = appendInlineMeta(text, metaLabel);
          }
          
          // For user messages, ignore the name entirely
          if (isUserMessage) {
            await sendAs(null, text, true);
            if (metaMode === 'tooltip' && metaLabel) {
              // Small delay to let bubble render
              setTimeout(() => attachTooltipToLastBubble(metaLabel), 50);
            }
          } else {
            // For other messages, check if we should override the name
            let name = payload.name;
            
            // If this is an assistant message and user has configured a custom name, use it
            if (payload.subtype === 'assistant_text' || payload.subtype === 'assistant_tool_use') {
              const customAssistantName = st.speaker?.trim();
              if (customAssistantName) {
                name = customAssistantName;
              }
            }
            
            // Fall back to payload name or default
            name = String(name || 'Claude');
            await sendAs(name, text, false);
            if (metaMode === 'tooltip' && metaLabel) {
              setTimeout(() => attachTooltipToLastBubble(metaLabel), 50);
            }
          }
        } catch (err) {
          console.error(`[${TITLE}] bad chat payload`, err, e?.data);
        }
      });

      es.onerror = () => {
        console.warn(`[${TITLE}] SSE error, will retry`, url);
        toastr.error('Connection lost, retrying…', TITLE);
        // Let EventSource auto-retry; if it fully closes, kick a reconnect
        setTimeout(() => {
          if (es && es.readyState === EventSource.CLOSED && getSettings().enabled) connect();
        }, 2000);
      };
    } catch (err) {
      console.error(`[${TITLE}] failed to connect`, err);
      toastr.error('Failed to connect to Commentary Bus', TITLE);
    }
  }

  // --- Lifecycle hooks ---
  ensureSettings();
  // connect at app ready, and on chat/group switch if using auto channel
  eventSource.on(event_types.APP_READY, async () => {
    // Migrate settings from v1 to v2 if needed
    migrateSettingsIfNeeded();
    
    mountSettings();
    
    // Check service capabilities
    const st = getSettings();
    hasConfigApi = await serviceSupportsConfigApi(st.serviceUrl);
    
    // If legacy service, show notice and disable project path input
    if (!hasConfigApi) {
      $('#cbus-session-dir').prop('disabled', true);
      try { 
        toastr.warning('Service is pre-2.0 (no project path support). SSE will still work. Consider upgrading the backend.', TITLE); 
      } catch {}
    }
    
    if (st.enabled) connect();
  });

  eventSource.on(event_types.CHAT_CHANGED, () => {
    if (getSettings().enabled && getSettings().channel === 'auto') {
      connect();
      refreshSettingsUI();
    }
  });

  // Clean up on unload (best-effort)
  window.addEventListener('beforeunload', () => disconnect());
})();
