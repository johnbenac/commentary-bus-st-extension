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
    channel: 'default',      // or "auto"
    speaker: 'Commentator',
    logHeartbeats: false,
    projectPath: '',         // project folder path
    sessionFile: ''          // current session file being monitored
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

            <label for="cbus-server">Server URL:</label>
            <input id="cbus-server" class="text_pole" type="text" placeholder="http://127.0.0.1:5055" />

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
              <label style="font-weight: bold; margin-bottom: 5px; display: block;">Project Folder:</label>
              <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 8px;">
                <button id="cbus-choose-folder" class="menu_button" title="Choose project folder like VS Code">📁 Choose Folder</button>
                <input id="cbus-project-path" class="text_pole" type="text" placeholder="/var/workstation/project-name" style="flex: 1;" readonly />
              </div>
              <div id="cbus-project-status" class="monospace" style="color:var(--SmartThemeBodyColor45); font-size: 0.9em;">
                <div>Project: <span id="cbus-current-project">Not selected</span></div>
                <div>Session: <span id="cbus-current-session">-</span></div>
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

    $('#cbus-choose-folder').on('click', async () => {
      try {
        // Try modern File System Access API first
        if ('showDirectoryPicker' in window) {
          const dirHandle = await window.showDirectoryPicker();
          const projectPath = dirHandle.name; // This gets just the folder name
          // We'll need to reconstruct the full path or get it from user
          $('#cbus-project-path').val(projectPath);
          st.projectPath = projectPath;
          ctx.saveSettingsDebounced();
          await discoverAndMonitorProject(projectPath);
        } else {
          // Fallback: prompt for manual path entry
          const path = prompt('Enter project folder path (e.g., /var/workstation/assistants/commentator):');
          if (path) {
            $('#cbus-project-path').val(path);
            st.projectPath = path;
            ctx.saveSettingsDebounced();
            await discoverAndMonitorProject(path);
          }
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error('Folder picker error:', err);
          toastr.error('Failed to select folder', TITLE);
        }
      }
    });

    $('#cbus-project-path').on('input', function () {
      st.projectPath = this.value.trim();
      ctx.saveSettingsDebounced();
    });
  }

  // Project discovery and monitoring
  async function discoverAndMonitorProject(projectPath) {
    if (!projectPath) return;
    
    try {
      const st = getSettings();
      const response = await fetch(`${st.serverUrl.replace(/\/$/, '')}/monitor-project`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath })
      });
      
      if (response.ok) {
        const result = await response.json();
        st.sessionFile = result.sessionFile || '';
        ctx.saveSettingsDebounced();
        updateProjectStatus(projectPath, result.sessionFile);
        toastr.success(`Now monitoring: ${result.projectName || projectPath}`, TITLE);
      } else {
        toastr.error('Failed to start project monitoring', TITLE);
      }
    } catch (err) {
      console.error('Project monitoring error:', err);
      toastr.error('Error connecting to Bridge for project monitoring', TITLE);
    }
  }

  function updateProjectStatus(projectPath, sessionFile) {
    const projectName = projectPath ? projectPath.split('/').pop() : 'Not selected';
    const sessionName = sessionFile ? sessionFile.split('/').pop().substring(0, 8) + '...' : '-';
    
    $('#cbus-current-project').text(projectName);
    $('#cbus-current-session').text(sessionName);
  }

  function refreshSettingsUI() {
    const st = getSettings();
    $('#cbus-enabled').prop('checked', !!st.enabled);
    $('#cbus-server').val(st.serverUrl);
    $('#cbus-channel').val(st.channel);
    $('#cbus-speaker').val(st.speaker);
    $('#cbus-log-heartbeats').prop('checked', !!st.logHeartbeats);
    $('#cbus-project-path').val(st.projectPath || '');
    updateProjectStatus(st.projectPath, st.sessionFile);
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
          try { console.debug(`[${TITLE}] heartbeat`, JSON.parse(e.data)); }
          catch { console.debug(`[${TITLE}] heartbeat`, e.data); }
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
