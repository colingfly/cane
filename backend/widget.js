/**
 * Cane Chat Widget — Embeddable agent chat for any website.
 *
 * Usage:
 *   <script
 *     src="https://YOUR_CANE_URL/widget.js"
 *     data-api-key="cane_xxxxxxxxxxxx"
 *     data-agent-name="My Agent"
 *     data-color="#8B7355"
 *     data-position="right"
 *     data-greeting="Hi! Ask me anything about our policies."
 *   ></script>
 */
(function () {
  'use strict';

  // ── Config from script tag ──
  const scriptTag = document.currentScript;
  const API_KEY = scriptTag?.getAttribute('data-api-key') || '';
  const AGENT_NAME = scriptTag?.getAttribute('data-agent-name') || 'AI Assistant';
  const PRIMARY_COLOR = scriptTag?.getAttribute('data-color') || '#8B7355';
  const POSITION = scriptTag?.getAttribute('data-position') || 'right';
  const GREETING = scriptTag?.getAttribute('data-greeting') || `Hi! I'm ${AGENT_NAME}. Ask me anything.`;
  const WORKSPACE_ID = scriptTag?.getAttribute('data-workspace-id') || '';

  // Derive API base URL from script src
  const scriptSrc = scriptTag?.src || '';
  const API_BASE = scriptSrc ? new URL(scriptSrc).origin : '';

  if (!API_KEY) {
    console.error('[Cane Widget] Missing data-api-key attribute');
    return;
  }
  if (!API_BASE) {
    console.error('[Cane Widget] Could not determine API base URL');
    return;
  }

  // ── Color utilities ──
  function hexToRgb(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return { r, g, b };
  }

  function luminance(hex) {
    const { r, g, b } = hexToRgb(hex);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  }

  const TEXT_ON_PRIMARY = luminance(PRIMARY_COLOR) > 0.5 ? '#1a1a1a' : '#ffffff';
  const rgb = hexToRgb(PRIMARY_COLOR);
  const LIGHT_BG = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.06)`;
  const LIGHT_BORDER = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.15)`;

  // ── Load font ──
  if (!document.querySelector('link[href*="DM+Sans"]')) {
    const fontLink = document.createElement('link');
    fontLink.rel = 'stylesheet';
    fontLink.href = 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap';
    document.head.appendChild(fontLink);
  }

  // ── Create widget container with Shadow DOM ──
  const host = document.createElement('div');
  host.id = 'cane-widget-host';
  document.body.appendChild(host);
  const shadow = host.attachShadow({ mode: 'closed' });

  // ── Styles ──
  const styles = document.createElement('style');
  styles.textContent = `
    * { box-sizing: border-box; margin: 0; padding: 0; }

    :host {
      --primary: ${PRIMARY_COLOR};
      --primary-text: ${TEXT_ON_PRIMARY};
      --light-bg: ${LIGHT_BG};
      --light-border: ${LIGHT_BORDER};
      --bg: #ffffff;
      --text: #1a1a1a;
      --text-muted: #6b7280;
      --border: #e5e7eb;
      --shadow: 0 8px 40px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06);
      --radius: 16px;
      --font: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-family: var(--font);
    }

    .cane-bubble {
      position: fixed;
      bottom: 24px;
      ${POSITION}: 24px;
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: var(--primary);
      color: var(--primary-text);
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 20px rgba(0,0,0,0.15), 0 0 0 0 var(--primary);
      transition: transform 0.2s ease, box-shadow 0.2s ease;
      z-index: 99998;
      outline: none;
    }
    .cane-bubble:hover {
      transform: scale(1.08);
      box-shadow: 0 6px 28px rgba(0,0,0,0.2);
    }
    .cane-bubble:active { transform: scale(0.95); }
    .cane-bubble svg { width: 26px; height: 26px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }

    .cane-panel {
      position: fixed;
      bottom: 100px;
      ${POSITION}: 24px;
      width: 400px;
      max-width: calc(100vw - 32px);
      height: 560px;
      max-height: calc(100vh - 140px);
      background: var(--bg);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      border: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      z-index: 99999;
      opacity: 0;
      transform: translateY(16px) scale(0.96);
      pointer-events: none;
      transition: opacity 0.25s ease, transform 0.25s ease;
      font-family: var(--font);
    }
    .cane-panel.open {
      opacity: 1;
      transform: translateY(0) scale(1);
      pointer-events: all;
    }

    /* Header */
    .cane-header {
      padding: 18px 20px;
      background: var(--primary);
      color: var(--primary-text);
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
    }
    .cane-header-title {
      font-weight: 700;
      font-size: 15px;
      letter-spacing: -0.01em;
    }
    .cane-header-sub {
      font-size: 11.5px;
      opacity: 0.8;
      margin-top: 2px;
    }
    .cane-close {
      background: none;
      border: none;
      color: var(--primary-text);
      cursor: pointer;
      padding: 4px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0.7;
      transition: opacity 0.15s;
    }
    .cane-close:hover { opacity: 1; }
    .cane-close svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }

    /* Messages area */
    .cane-messages {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .cane-messages::-webkit-scrollbar { width: 4px; }
    .cane-messages::-webkit-scrollbar-track { background: transparent; }
    .cane-messages::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }

    .cane-msg {
      max-width: 85%;
      padding: 10px 14px;
      border-radius: 14px;
      font-size: 13.5px;
      line-height: 1.55;
      word-wrap: break-word;
      animation: cane-fade 0.2s ease;
    }
    @keyframes cane-fade {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .cane-msg.user {
      align-self: flex-end;
      background: var(--primary);
      color: var(--primary-text);
      border-bottom-right-radius: 4px;
    }
    .cane-msg.bot {
      align-self: flex-start;
      background: var(--light-bg);
      color: var(--text);
      border: 1px solid var(--light-border);
      border-bottom-left-radius: 4px;
    }
    .cane-msg.bot p { margin-bottom: 8px; }
    .cane-msg.bot p:last-child { margin-bottom: 0; }
    .cane-msg.bot strong { font-weight: 600; }
    .cane-msg.bot ul, .cane-msg.bot ol { padding-left: 18px; margin: 6px 0; }
    .cane-msg.bot li { margin-bottom: 3px; }
    .cane-msg.bot code {
      background: rgba(0,0,0,0.06);
      padding: 1px 5px;
      border-radius: 4px;
      font-size: 12.5px;
      font-family: 'SF Mono', Consolas, monospace;
    }

    .cane-msg.greeting {
      align-self: flex-start;
      background: var(--light-bg);
      color: var(--text);
      border: 1px solid var(--light-border);
      border-bottom-left-radius: 4px;
    }

    /* Typing indicator */
    .cane-typing {
      align-self: flex-start;
      padding: 12px 18px;
      background: var(--light-bg);
      border: 1px solid var(--light-border);
      border-radius: 14px;
      border-bottom-left-radius: 4px;
      display: flex;
      gap: 5px;
      align-items: center;
    }
    .cane-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--text-muted);
      animation: cane-bounce 1.2s infinite;
    }
    .cane-dot:nth-child(2) { animation-delay: 0.15s; }
    .cane-dot:nth-child(3) { animation-delay: 0.3s; }
    @keyframes cane-bounce {
      0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
      30% { transform: translateY(-5px); opacity: 1; }
    }

    /* Sources */
    .cane-sources {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-top: 8px;
    }
    .cane-source {
      font-size: 10.5px;
      padding: 2px 8px;
      background: rgba(0,0,0,0.04);
      border-radius: 8px;
      color: var(--text-muted);
      white-space: nowrap;
    }

    /* Input area */
    .cane-input-area {
      padding: 12px 16px;
      border-top: 1px solid var(--border);
      display: flex;
      gap: 8px;
      flex-shrink: 0;
      background: var(--bg);
    }
    .cane-input {
      flex: 1;
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 10px 14px;
      font-size: 13.5px;
      font-family: var(--font);
      outline: none;
      background: #fafafa;
      color: var(--text);
      transition: border-color 0.15s;
    }
    .cane-input:focus {
      border-color: var(--primary);
      background: var(--bg);
    }
    .cane-input::placeholder { color: var(--text-muted); }
    .cane-send {
      width: 40px;
      height: 40px;
      border-radius: 10px;
      background: var(--primary);
      color: var(--primary-text);
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: opacity 0.15s, transform 0.15s;
    }
    .cane-send:hover { opacity: 0.9; }
    .cane-send:active { transform: scale(0.92); }
    .cane-send:disabled { opacity: 0.4; cursor: not-allowed; }
    .cane-send svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }

    /* Footer */
    .cane-footer {
      padding: 8px 16px 10px;
      text-align: center;
      font-size: 10px;
      color: var(--text-muted);
      opacity: 0.6;
      flex-shrink: 0;
    }
    .cane-footer a {
      color: var(--text-muted);
      text-decoration: none;
    }
    .cane-footer a:hover { text-decoration: underline; }

    /* Mobile */
    @media (max-width: 480px) {
      .cane-panel {
        bottom: 0;
        ${POSITION}: 0;
        width: 100vw;
        height: 100vh;
        max-height: 100vh;
        border-radius: 0;
      }
      .cane-bubble {
        bottom: 16px;
        ${POSITION}: 16px;
        width: 54px;
        height: 54px;
      }
    }
  `;
  shadow.appendChild(styles);

  // ── HTML ──
  const container = document.createElement('div');
  container.innerHTML = `
    <button class="cane-bubble" aria-label="Open chat">
      <svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
    </button>

    <div class="cane-panel">
      <div class="cane-header">
        <div>
          <div class="cane-header-title">${AGENT_NAME}</div>
          <div class="cane-header-sub">Powered by Cane</div>
        </div>
        <button class="cane-close" aria-label="Close chat">
          <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <div class="cane-messages">
        <div class="cane-msg greeting">${GREETING}</div>
      </div>

      <div class="cane-input-area">
        <input class="cane-input" placeholder="Type a message..." autocomplete="off" />
        <button class="cane-send" aria-label="Send">
          <svg viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </div>

      <div class="cane-footer">
        Powered by <a href="https://cane.dev" target="_blank" rel="noopener">Cane</a>
      </div>
    </div>
  `;
  shadow.appendChild(container);

  // ── References ──
  const bubble = shadow.querySelector('.cane-bubble');
  const panel = shadow.querySelector('.cane-panel');
  const closeBtn = shadow.querySelector('.cane-close');
  const messagesEl = shadow.querySelector('.cane-messages');
  const input = shadow.querySelector('.cane-input');
  const sendBtn = shadow.querySelector('.cane-send');

  let isOpen = false;
  let isLoading = false;

  // ── Toggle ──
  function toggle() {
    isOpen = !isOpen;
    panel.classList.toggle('open', isOpen);
    if (isOpen) {
      setTimeout(() => input.focus(), 300);
    }
  }

  bubble.addEventListener('click', toggle);
  closeBtn.addEventListener('click', toggle);

  // ── Markdown-light parser ──
  function renderMarkdown(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n- /g, '</p><ul><li>')
      .replace(/\n\d+\. /g, '</p><ol><li>')
      .replace(/\n/g, '<br>')
      .replace(/^/, '<p>')
      .replace(/$/, '</p>');
  }

  // ── Add message ──
  function addMessage(text, type, sources) {
    const msg = document.createElement('div');
    msg.className = `cane-msg ${type}`;

    if (type === 'bot') {
      msg.innerHTML = renderMarkdown(text);
      if (sources && sources.length > 0) {
        const srcDiv = document.createElement('div');
        srcDiv.className = 'cane-sources';
        sources.forEach(s => {
          const span = document.createElement('span');
          span.className = 'cane-source';
          span.textContent = s;
          srcDiv.appendChild(span);
        });
        msg.appendChild(srcDiv);
      }
    } else {
      msg.textContent = text;
    }

    messagesEl.appendChild(msg);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return msg;
  }

  function showTyping() {
    const el = document.createElement('div');
    el.className = 'cane-typing';
    el.id = 'cane-typing';
    el.innerHTML = '<div class="cane-dot"></div><div class="cane-dot"></div><div class="cane-dot"></div>';
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return el;
  }

  function removeTyping() {
    const el = shadow.querySelector('#cane-typing');
    if (el) el.remove();
  }

  // ── Send message ──
  async function send() {
    const query = input.value.trim();
    if (!query || isLoading) return;

    input.value = '';
    addMessage(query, 'user');
    isLoading = true;
    sendBtn.disabled = true;
    showTyping();

    try {
      const body = { query };
      if (WORKSPACE_ID) body.workspace_id = WORKSPACE_ID;

      const res = await fetch(`${API_BASE}/v1/ask`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': API_KEY,
        },
        body: JSON.stringify(body),
      });

      removeTyping();

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        addMessage(err.detail || 'Something went wrong. Please try again.', 'bot');
        return;
      }

      const data = await res.json();
      addMessage(data.answer || 'No response.', 'bot', data.sources);

    } catch (err) {
      removeTyping();
      addMessage('Network error. Please check your connection.', 'bot');
    } finally {
      isLoading = false;
      sendBtn.disabled = false;
      input.focus();
    }
  }

  sendBtn.addEventListener('click', send);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });

  // ── Escape to close ──
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen) toggle();
  });

  console.log(`[Cane Widget] Loaded — Agent: ${AGENT_NAME}, API: ${API_BASE}`);
})();