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
    metaMode: 'inline',      // 'inline' | 'tooltip' | 'off' - how to display message metadata
    truncation: {
      enabled: true,
      indicator: '…',
      preset: 'standard', // 'short'|'standard'|'verbose'|'full'
      limits: {
        assistant_text: 2500,
        assistant_tool_use: 1200,
        user_text: 2500,
        user_tool_result: 1200,
        error: 2000
      }
    }
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

            <div style="margin-top:10px;padding:8px;border:1px solid var(--SmartThemeBorderColor);border-radius:4px;">
              <label style="font-weight:bold;display:block;margin-bottom:6px;">Truncation</label>
              <label class="checkbox_label">
                <input id="cbus-trunc-enabled" type="checkbox" />
                <span>Enable client-side truncation</span>
              </label>

              <label for="cbus-trunc-preset">Preset:</label>
              <select id="cbus-trunc-preset" class="text_pole">
                <option value="short">Short</option>
                <option value="standard">Standard</option>
                <option value="verbose">Verbose</option>
                <option value="full">Full (no truncation)</option>
              </select>

              <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:6px;">
                <div><label>assistant_text</label><input id="cbus-lim-assistant-text" class="text_pole" type="number" min="0" /></div>
                <div><label>assistant_tool_use</label><input id="cbus-lim-assistant-tool" class="text_pole" type="number" min="0" /></div>
                <div><label>user_text</label><input id="cbus-lim-user-text" class="text_pole" type="number" min="0" /></div>
                <div><label>user_tool_result</label><input id="cbus-lim-user-tool" class="text_pole" type="number" min="0" /></div>
                <div><label>error</label><input id="cbus-lim-error" class="text_pole" type="number" min="0" /></div>
              </div>

              <label class="checkbox_label" style="margin-top:6px;">
                <input id="cbus-trunc-indicator-enabled" type="checkbox" checked />
                <span>Append indicator</span>
              </label>
              <input id="cbus-trunc-indicator" class="text_pole" type="text" style="width:6em" value="…" />
              <small>0 in any field = unlimited for that subtype</small>
            </div>

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

    // Truncation settings handlers
    const applyPreset = (preset) => {
      const T = st.truncation;
      T.preset = preset;
      const map = {
        short:    { assistant_text: 800,  assistant_tool_use: 400, user_text: 800,  user_tool_result: 400, error: 800 },
        standard: { assistant_text: 2500, assistant_tool_use: 1200,user_text: 2500, user_tool_result: 1200,error: 2000 },
        verbose:  { assistant_text: 8000, assistant_tool_use: 4000,user_text: 8000, user_tool_result: 4000,error: 4000 },
        full:     { assistant_text: 0,    assistant_tool_use: 0,   user_text: 0,    user_tool_result: 0,   error: 0 }
      };
      T.limits = { ...T.limits, ...(map[preset] || map.standard) };
      ctx.saveSettingsDebounced();
      refreshSettingsUI();
    };
    
    $('#cbus-trunc-enabled').on('change', function () {
      st.truncation.enabled = this.checked;
      ctx.saveSettingsDebounced();
    });
    $('#cbus-trunc-preset').on('change', function () { applyPreset(this.value); });
    
    const num = (v) => Math.max(0, parseInt(String(v||'0'),10) || 0);
    $('#cbus-lim-assistant-text').on('input', function(){ st.truncation.limits.assistant_text = num(this.value); ctx.saveSettingsDebounced(); });
    $('#cbus-lim-assistant-tool').on('input', function(){ st.truncation.limits.assistant_tool_use = num(this.value); ctx.saveSettingsDebounced(); });
    $('#cbus-lim-user-text').on('input', function(){ st.truncation.limits.user_text = num(this.value); ctx.saveSettingsDebounced(); });
    $('#cbus-lim-user-tool').on('input', function(){ st.truncation.limits.user_tool_result = num(this.value); ctx.saveSettingsDebounced(); });
    $('#cbus-lim-error').on('input', function(){ st.truncation.limits.error = num(this.value); ctx.saveSettingsDebounced(); });
    $('#cbus-trunc-indicator-enabled').on('change', function(){
      st.truncation.appendIndicator = this.checked;
      ctx.saveSettingsDebounced();
    });
    $('#cbus-trunc-indicator').on('input', function(){
      st.truncation.indicator = this.value || '…';
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
    
    // Truncation settings
    $('#cbus-trunc-enabled').prop('checked', !!st.truncation?.enabled);
    $('#cbus-trunc-preset').val(st.truncation?.preset || 'standard');
    $('#cbus-lim-assistant-text').val(st.truncation?.limits?.assistant_text ?? 2500);
    $('#cbus-lim-assistant-tool').val(st.truncation?.limits?.assistant_tool_use ?? 1200);
    $('#cbus-lim-user-text').val(st.truncation?.limits?.user_text ?? 2500);
    $('#cbus-lim-user-tool').val(st.truncation?.limits?.user_tool_result ?? 1200);
    $('#cbus-lim-error').val(st.truncation?.limits?.error ?? 2000);
    $('#cbus-trunc-indicator-enabled').prop('checked', st.truncation?.appendIndicator !== false);
    $('#cbus-trunc-indicator').val(st.truncation?.indicator ?? '…');
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

      // Safe text payload via /pass → pipes into /send(/sendas) without parentheses
      // Escape backslashes, quotes, and pipes (|) for quoted strings.
      const payload = String(text)
        .replace(/\\/g, '\\\\')   // backslashes
        .replace(/"/g, '\\"')     // quotes
        .replace(/\|/g, '\\|');   // pipe is a command separator outside strict mode

      const rawFlag = 'raw=false'; // 1.13.0+: control quote preservation in send cmds
      if (isUserMessage) {
        await run(`/pass "${payload}" | /send ${rawFlag}`, { quiet: true });
      } else {
        const target = String(name || 'Claude');
        await run(`/pass "${payload}" | /sendas name=${JSON.stringify(target)} ${rawFlag}`, { quiet: true });
      }
    } catch (err) {
      console.error(`[${TITLE}] STscript injection failed`, err);
      try { toastr.error('Failed to inject message', TITLE); } catch {}
    }
  }

  // --- Prefix parser: extracts meta + clean text
  function parsePrefix(raw) {
    const s0 = String(raw ?? '');
    let s = s0;
    let i = 0;
    // skip leading whitespace
    while (i < s.length && /\s/.test(s[i])) i++;
    // optional outer parens
    let hasParen = false;
    if (s[i] === '(') {
      hasParen = true;
      i++;
      while (i < s.length && /\s/.test(s[i])) i++;
    }
    // must start with '[' for a meta block
    if (s[i] !== '[') return { text: s0.trim(), meta: null };
    // walk nested brackets to find the matching closing ']'
    const start = i + 1;
    let depth = 1;
    let k = start;
    for (; k < s.length; k++) {
      const ch = s[k];
      if (ch === '[') depth++;
      else if (ch === ']') {
        depth--;
        if (depth === 0) break;
      }
    }
    // unbalanced or no close: give up and return original
    if (depth !== 0) return { text: s0.trim(), meta: null };
    const metaBlock = s.slice(start, k);
    // move to content after ']' and whitespace
    let rest = k + 1;
    while (rest < s.length && /\s/.test(s[rest])) rest++;
    // if we had outer parens, optionally consume a trailing ')'
    if (hasParen && s[rest] === ')') {
      rest++;
      while (rest < s.length && /\s/.test(s[rest])) rest++;
    }
    const text = s.slice(rest).trim();
    return { text, meta: parseMetaBlock(metaBlock) };
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

  // --- Client-side truncation functions ---
  function applyClientTruncation(payload, cleanText) {
    const st = getSettings();
    const T = st.truncation || {};
    if (!T.enabled) return { text: cleanText, truncated: false, full: cleanText };
    const limits = T.limits || {};
    const limit = limits[payload.subtype] ?? 0; // 0 = unlimited
    if (!limit || cleanText.length <= limit) return { text: cleanText, truncated: false, full: cleanText };
    const ind = (T.appendIndicator !== false) ? (T.indicator || '…') : '';
    return { text: cleanText.slice(0, Math.max(0, limit)) + ind + ' [show more]', truncated: true, full: cleanText };
  }

  function postAttachExpandForLastBubble(fullText, metaLabel, payload, isUser) {
    try {
      const $bubbles = $('.mes');
      const $last = $bubbles.last();
      const $txt = $last.find('.mes_text').last();
      if (!$txt.length) return;
      // Only attach if we actually appended [show more]
      const hasMarker = /\[show more\]$/.test($txt.text().trim());
      if (!hasMarker) return;
      // Replace marker with clickable span
      const html = $txt.html().replace(/\[show more\]$/, '<span class="cbus-show-more" style="color:var(--SmartThemeLinkColor);cursor:pointer;">show more</span>');
      $txt.html(html);
      $txt.find('.cbus-show-more').on('click', () => {
        // Expand to full text (preserve meta label if inline)
        const st = getSettings();
        const metaMode = st.metaMode || 'inline';
        let expanded = fullText;
        if (metaMode === 'inline' && metaLabel) expanded = appendInlineMeta(expanded, metaLabel);
        $txt.text(expanded); // simple replace; could fancy-format if needed
        // Add "show less"?
        // (Optional) Attach a 'show less' to collapse back if desired.
      });
    } catch {}
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
          const cleanText = parsed.text;
          const metaLabel = parsed.meta?.label || '';
          const isUserMessage = payload.isUserMessage === true;
          
          // Apply client-side truncation
          const trunc = applyClientTruncation(payload, cleanText);
          let text = trunc.text;
          
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
            if (trunc.truncated) {
              setTimeout(() => postAttachExpandForLastBubble(trunc.full, metaLabel, payload, true), 60);
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
            if (trunc.truncated) {
              setTimeout(() => postAttachExpandForLastBubble(trunc.full, metaLabel, payload, false), 60);
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
