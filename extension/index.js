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
    enabled: true,
    serverUrl: 'http://127.0.0.1:5055',
    bridgeUrl: 'http://127.0.0.1:5056',  // Claude Commentary Bridge API
    channel: 'default',      // or "auto"
    speaker: 'Commentator',
    logHeartbeats: false,
    sessionDir: ''           // current session folder being monitored (project path)
  });

  /** @type {ReturnType<typeof SillyTavern.getContext>} */
  const ctx = SillyTavern.getContext();
  const { eventSource, event_types } = ctx;

  // --- State ---
  let es = null;           // EventSource handle
  let lastUrl = '';        // last connected URL (for logs)
  let mounted = false;     // settings drawer mounted?

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

            <label for="cbus-server">Commentary Bus URL:</label>
            <input id="cbus-server" class="text_pole" type="text" placeholder="http://127.0.0.1:5055" />

            <label for="cbus-bridge">Bridge URL:</label>
            <input id="cbus-bridge" class="text_pole" type="text" placeholder="http://127.0.0.1:5056" />

            <label for="cbus-channel">Channel:</label>
            <input id="cbus-channel" class="text_pole" type="text" placeholder="default or auto" />
            <small>Use <code>auto</code> to bind to the current group/character.</small>

            <label for="cbus-speaker">Speaker name (/sendas):</label>
            <input id="cbus-speaker" class="text_pole" type="text" placeholder="Commentator" />

            <label class="checkbox_label" title="Log heartbeat events to console">
              <input id="cbus-log-heartbeats" type="checkbox" />
              <span>Log heartbeats</span>
            </label>

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

    $('#cbus-server').on('input', function () {
      st.serverUrl = this.value.trim();
      ctx.saveSettingsDebounced();
    });

    $('#cbus-bridge').on('input', function () {
      st.bridgeUrl = this.value.trim();
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

    $('#cbus-test').on('click', async () => {
      try {
        const res = await fetch(st.serverUrl.replace(/\/$/, '') + '/status');
        const data = await res.json();
        toastr.success(`Bus OK · clients: ${data.clientsTotal ?? data.clients ?? 'n/a'}`, TITLE);
      } catch (e) {
        console.error(e);
        toastr.error('Failed to reach Commentary Bus', TITLE);
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
        try {
          // Send project path to bridge for monitoring
          const response = await fetch(`${st.bridgeUrl}/config/session-dir`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionDir: projectPath })
          });
          
          if (response.ok) {
            const result = await response.json();
            toastr.success(`Now monitoring: ${projectPath.split('/').pop()}`, TITLE);
            console.log(`[${TITLE}] Bridge switched to:`, result);
          } else {
            const error = await response.json();
            toastr.error(`Bridge error: ${error.error}`, TITLE);
            console.error(`[${TITLE}] Bridge error:`, error);
          }
        } catch (err) {
          toastr.warning(`Project path saved, but bridge communication failed`, TITLE);
          console.error(`[${TITLE}] Bridge communication error:`, err);
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
    $('#cbus-server').val(st.serverUrl);
    $('#cbus-bridge').val(st.bridgeUrl);
    $('#cbus-channel').val(st.channel);
    $('#cbus-speaker').val(st.speaker);
    $('#cbus-log-heartbeats').prop('checked', !!st.logHeartbeats);
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

  async function sendAs(name, text) {
    // Prefer the modern helper if present
    try {
      const mod = await import('/scripts/slash-commands.js');
      const run = mod.executeSlashCommandsWithOptions || mod.executeSlashCommands;
      // preserve quotes reliably with raw=true (supported in recent STscript updates)
      const cmd = `/sendas name="${name}" raw=true ${text}`;
      await run(cmd);
    } catch (err) {
      console.error(`[${TITLE}] /sendas failed`, err);
      toastr.error('Failed to inject message', TITLE);
    }
  }

  function connect() {
    const st = getSettings();
    if (!st.enabled) return;

    disconnect();

    const channel = computeChannel();
    const url = `${st.serverUrl.replace(/\/$/, '')}/events?channel=${encodeURIComponent(channel)}`;
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
          console.error(`[${TITLE}] CANARY TEST - About to parse heartbeat data:`, e.data);
          const data = JSON.parse(e.data);
          console.error(`[${TITLE}] CANARY TEST - Parsed data:`, data);
          data.foo = "bar"; // Canary to verify this extension is running
          console.error(`[${TITLE}] CANARY TEST - Added canary:`, data);
          console.debug(`[${TITLE}] heartbeat`, data);
          console.debug("canary says foobar");
        }
      });

      es.addEventListener('chat', async (e) => {
        try {
          const payload = JSON.parse(e.data ?? '{}');
          const name = String(payload.name || st.speaker || 'Commentator');
          const text = String(payload.text ?? '').trim();
          if (!text) return;
          await sendAs(name, text);
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
  eventSource.on(event_types.APP_READY, () => {
    mountSettings();
    if (getSettings().enabled) connect();
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
