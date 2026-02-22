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

  try {

  // ── Config from script tag ──
  var scriptTag = document.currentScript;
  var API_KEY = (scriptTag && scriptTag.getAttribute('data-api-key')) || '';
  var AGENT_NAME = (scriptTag && scriptTag.getAttribute('data-agent-name')) || 'AI Assistant';
  var PRIMARY_COLOR = (scriptTag && scriptTag.getAttribute('data-color')) || '#8B7355';
  var POSITION = (scriptTag && scriptTag.getAttribute('data-position')) || 'right';
  var GREETING = (scriptTag && scriptTag.getAttribute('data-greeting')) || ('Hi! I\'m ' + AGENT_NAME + '. Ask me anything.');
  var WORKSPACE_ID = (scriptTag && scriptTag.getAttribute('data-workspace-id')) || '';

  // Derive API base URL from script src
  var scriptSrc = (scriptTag && scriptTag.src) || '';
  var API_BASE = '';
  if (scriptSrc) {
    try { API_BASE = new URL(scriptSrc).origin; } catch(e) { API_BASE = ''; }
  }

  if (!API_KEY) {
    console.error('[Cane Widget] Missing data-api-key attribute');
    return;
  }
  if (!API_BASE) {
    console.error('[Cane Widget] Could not determine API base URL');
    return;
  }

  // ── Color utilities ──
  var rgb = {
    r: parseInt(PRIMARY_COLOR.slice(1, 3), 16) || 139,
    g: parseInt(PRIMARY_COLOR.slice(3, 5), 16) || 115,
    b: parseInt(PRIMARY_COLOR.slice(5, 7), 16) || 85
  };
  var lum = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  var TEXT_ON_PRIMARY = lum > 0.5 ? '#1a1a1a' : '#ffffff';

  // ── Inject styles ──
  var styleEl = document.createElement('style');
  styleEl.textContent = '\
    #cw-bubble {\
      position: fixed;\
      bottom: 24px;\
      ' + POSITION + ': 24px;\
      width: 60px;\
      height: 60px;\
      border-radius: 50%;\
      background: ' + PRIMARY_COLOR + ';\
      color: ' + TEXT_ON_PRIMARY + ';\
      border: none;\
      cursor: pointer;\
      display: flex;\
      align-items: center;\
      justify-content: center;\
      box-shadow: 0 4px 20px rgba(0,0,0,0.15);\
      transition: transform 0.2s ease, box-shadow 0.2s ease;\
      z-index: 2147483646;\
      outline: none;\
      font-family: sans-serif;\
      padding: 0;\
    }\
    #cw-bubble:hover { transform: scale(1.08); box-shadow: 0 6px 28px rgba(0,0,0,0.2); }\
    #cw-bubble:active { transform: scale(0.95); }\
    #cw-bubble svg { width: 26px; height: 26px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }\
    \
    #cw-panel {\
      position: fixed;\
      bottom: 100px;\
      ' + POSITION + ': 24px;\
      width: 400px;\
      max-width: calc(100vw - 32px);\
      height: 560px;\
      max-height: calc(100vh - 140px);\
      background: #ffffff;\
      border-radius: 16px;\
      box-shadow: 0 8px 40px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06);\
      border: 1px solid #e5e7eb;\
      display: none;\
      flex-direction: column;\
      overflow: hidden;\
      z-index: 2147483647;\
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;\
      font-size: 14px;\
      line-height: 1.5;\
      color: #1a1a1a;\
    }\
    #cw-panel.cw-open {\
      display: flex;\
      animation: cwSlideUp 0.25s ease;\
    }\
    @keyframes cwSlideUp {\
      from { opacity: 0; transform: translateY(12px); }\
      to { opacity: 1; transform: translateY(0); }\
    }\
    \
    #cw-header {\
      padding: 16px 20px;\
      background: ' + PRIMARY_COLOR + ';\
      color: ' + TEXT_ON_PRIMARY + ';\
      display: flex;\
      align-items: center;\
      justify-content: space-between;\
      flex-shrink: 0;\
    }\
    #cw-header-title { font-weight: 700; font-size: 15px; }\
    #cw-header-sub { font-size: 11px; opacity: 0.75; margin-top: 2px; }\
    #cw-close {\
      background: none; border: none; color: ' + TEXT_ON_PRIMARY + '; cursor: pointer;\
      padding: 4px; border-radius: 6px; display: flex; align-items: center; opacity: 0.7;\
    }\
    #cw-close:hover { opacity: 1; }\
    #cw-close svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }\
    \
    #cw-messages {\
      flex: 1;\
      overflow-y: auto;\
      padding: 16px;\
      display: flex;\
      flex-direction: column;\
      gap: 10px;\
    }\
    #cw-messages::-webkit-scrollbar { width: 4px; }\
    #cw-messages::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 4px; }\
    \
    .cw-msg {\
      max-width: 85%;\
      padding: 10px 14px;\
      border-radius: 14px;\
      font-size: 13.5px;\
      line-height: 1.55;\
      word-wrap: break-word;\
      animation: cwFade 0.2s ease;\
    }\
    @keyframes cwFade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }\
    .cw-msg.cw-user {\
      align-self: flex-end;\
      background: ' + PRIMARY_COLOR + ';\
      color: ' + TEXT_ON_PRIMARY + ';\
      border-bottom-right-radius: 4px;\
    }\
    .cw-msg.cw-bot {\
      align-self: flex-start;\
      background: rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',0.06);\
      color: #1a1a1a;\
      border: 1px solid rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',0.15);\
      border-bottom-left-radius: 4px;\
    }\
    .cw-msg.cw-bot p { margin: 0 0 8px 0; }\
    .cw-msg.cw-bot p:last-child { margin-bottom: 0; }\
    .cw-msg.cw-bot strong { font-weight: 600; }\
    .cw-msg.cw-bot ul, .cw-msg.cw-bot ol { padding-left: 18px; margin: 6px 0; }\
    .cw-msg.cw-bot li { margin-bottom: 3px; }\
    .cw-msg.cw-bot code { background: rgba(0,0,0,0.06); padding: 1px 5px; border-radius: 4px; font-size: 12.5px; }\
    \
    .cw-typing {\
      align-self: flex-start;\
      padding: 12px 18px;\
      background: rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',0.06);\
      border: 1px solid rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',0.15);\
      border-radius: 14px;\
      border-bottom-left-radius: 4px;\
      display: flex;\
      gap: 5px;\
    }\
    .cw-dot {\
      width: 7px; height: 7px; border-radius: 50%; background: #9ca3af;\
      animation: cwBounce 1.2s infinite;\
    }\
    .cw-dot:nth-child(2) { animation-delay: 0.15s; }\
    .cw-dot:nth-child(3) { animation-delay: 0.3s; }\
    @keyframes cwBounce {\
      0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }\
      30% { transform: translateY(-5px); opacity: 1; }\
    }\
    \
    .cw-sources { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; }\
    .cw-source { font-size: 10.5px; padding: 2px 8px; background: rgba(0,0,0,0.04); border-radius: 8px; color: #6b7280; }\
    \
    #cw-input-area {\
      padding: 12px 16px;\
      border-top: 1px solid #e5e7eb;\
      display: flex;\
      gap: 8px;\
      flex-shrink: 0;\
      background: #fff;\
    }\
    #cw-input {\
      flex: 1;\
      border: 1px solid #e5e7eb;\
      border-radius: 10px;\
      padding: 10px 14px;\
      font-size: 13.5px;\
      font-family: inherit;\
      outline: none;\
      background: #fafafa;\
      color: #1a1a1a;\
    }\
    #cw-input:focus { border-color: ' + PRIMARY_COLOR + '; background: #fff; }\
    #cw-input::placeholder { color: #9ca3af; }\
    #cw-send {\
      width: 40px; height: 40px; border-radius: 10px;\
      background: ' + PRIMARY_COLOR + '; color: ' + TEXT_ON_PRIMARY + ';\
      border: none; cursor: pointer;\
      display: flex; align-items: center; justify-content: center;\
      flex-shrink: 0; transition: opacity 0.15s;\
    }\
    #cw-send:hover { opacity: 0.9; }\
    #cw-send:disabled { opacity: 0.4; cursor: not-allowed; }\
    #cw-send svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }\
    \
    #cw-footer {\
      padding: 8px 16px 10px;\
      text-align: center;\
      font-size: 10px;\
      color: #9ca3af;\
      flex-shrink: 0;\
    }\
    #cw-footer a { color: #9ca3af; text-decoration: none; }\
    #cw-footer a:hover { text-decoration: underline; }\
    \
    @media (max-width: 480px) {\
      #cw-panel { bottom: 0; ' + POSITION + ': 0; width: 100vw; height: 100vh; max-height: 100vh; border-radius: 0; }\
      #cw-bubble { bottom: 16px; ' + POSITION + ': 16px; width: 54px; height: 54px; }\
    }\
  ';
  document.head.appendChild(styleEl);

  // ── HTML ──
  var wrapper = document.createElement('div');
  wrapper.id = 'cane-widget-host';
  wrapper.innerHTML = '\
    <button id="cw-bubble" aria-label="Open chat">\
      <svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>\
    </button>\
    <div id="cw-panel">\
      <div id="cw-header">\
        <div>\
          <div id="cw-header-title">' + AGENT_NAME + '</div>\
          <div id="cw-header-sub">Powered by Cane</div>\
        </div>\
        <button id="cw-close" aria-label="Close">\
          <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>\
        </button>\
      </div>\
      <div id="cw-messages">\
        <div class="cw-msg cw-bot">' + GREETING + '</div>\
      </div>\
      <div id="cw-input-area">\
        <input id="cw-input" placeholder="Type a message..." autocomplete="off" />\
        <button id="cw-send" aria-label="Send">\
          <svg viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>\
        </button>\
      </div>\
      <div id="cw-footer">Powered by <a href="https://cane.dev" target="_blank" rel="noopener">Cane</a></div>\
    </div>\
  ';
  document.body.appendChild(wrapper);

  // ── References ──
  var bubble = document.getElementById('cw-bubble');
  var panel = document.getElementById('cw-panel');
  var closeBtn = document.getElementById('cw-close');
  var messagesEl = document.getElementById('cw-messages');
  var input = document.getElementById('cw-input');
  var sendBtn = document.getElementById('cw-send');
  var isOpen = false;
  var isLoading = false;

  // ── Toggle ──
  function toggle() {
    isOpen = !isOpen;
    if (isOpen) {
      panel.classList.add('cw-open');
      setTimeout(function() { input.focus(); }, 300);
    } else {
      panel.classList.remove('cw-open');
    }
  }

  bubble.addEventListener('click', toggle);
  closeBtn.addEventListener('click', toggle);

  // ── Simple markdown ──
  function renderMarkdown(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>')
      .replace(/^/, '<p>')
      .replace(/$/, '</p>');
  }

  // ── Add message ──
  function addMessage(text, type, sources) {
    var msg = document.createElement('div');
    msg.className = 'cw-msg ' + (type === 'user' ? 'cw-user' : 'cw-bot');

    if (type === 'bot') {
      msg.innerHTML = renderMarkdown(text);
      if (sources && sources.length > 0) {
        var srcDiv = document.createElement('div');
        srcDiv.className = 'cw-sources';
        sources.forEach(function(s) {
          var span = document.createElement('span');
          span.className = 'cw-source';
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
  }

  function showTyping() {
    var el = document.createElement('div');
    el.className = 'cw-typing';
    el.id = 'cw-typing';
    el.innerHTML = '<div class="cw-dot"></div><div class="cw-dot"></div><div class="cw-dot"></div>';
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function removeTyping() {
    var el = document.getElementById('cw-typing');
    if (el) el.remove();
  }

  // ── Send ──
  function send() {
    var query = input.value.trim();
    if (!query || isLoading) return;

    input.value = '';
    addMessage(query, 'user');
    isLoading = true;
    sendBtn.disabled = true;
    showTyping();

    var body = { query: query };
    if (WORKSPACE_ID) body.workspace_id = WORKSPACE_ID;

    fetch(API_BASE + '/v1/ask', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY
      },
      body: JSON.stringify(body)
    })
    .then(function(res) {
      if (!res.ok) {
        return res.json().catch(function() { return {}; }).then(function(err) {
          throw new Error(err.detail || 'Request failed');
        });
      }
      return res.json();
    })
    .then(function(data) {
      removeTyping();
      addMessage(data.answer || 'No response.', 'bot', data.sources);
    })
    .catch(function(err) {
      removeTyping();
      addMessage('Sorry, something went wrong. Please try again.', 'bot');
      console.error('[Cane Widget]', err);
    })
    .finally(function() {
      isLoading = false;
      sendBtn.disabled = false;
      input.focus();
    });
  }

  sendBtn.addEventListener('click', send);
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });

  // Escape to close
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && isOpen) toggle();
  });

  console.log('[Cane Widget] Loaded — Agent: ' + AGENT_NAME + ', API: ' + API_BASE);

  } catch(err) {
    console.error('[Cane Widget] Init error:', err);
  }

})();