const messages = document.querySelector('#messages');
const composer = document.querySelector('#composer');
const prompt = document.querySelector('#prompt');
const send = document.querySelector('#send');
const agentName = document.querySelector('#agentName');
const agentSubtitle = document.querySelector('#agentSubtitle');
const welcomeTitle = document.querySelector('#welcomeTitle');
const welcomeMessage = document.querySelector('#welcomeMessage');
const starterPrompts = document.querySelector('#starterPrompts');
const chatRoot = document.querySelector('#chatRoot');
const widgetLauncher = document.querySelector('#widgetLauncher');
const siteIntro = document.querySelector('#siteIntro');
const siteTop = document.querySelector('.site-top');
const visitorId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
const history = [];

const params = new URLSearchParams(window.location.search);
const widgetMode = params.get('mode') === 'widget' || window.self !== window.top;

if (widgetMode) {
  document.body.classList.add('widget-mode', 'widget-closed');
  siteIntro?.remove();
  siteTop?.remove();
  chatRoot.hidden = true;
} else {
  document.body.classList.add('personal-mode');
  widgetLauncher.hidden = true;
}

widgetLauncher.addEventListener('click', () => {
  const closed = document.body.classList.toggle('widget-closed');
  chatRoot.hidden = closed;
  widgetLauncher.setAttribute('aria-expanded', String(!closed));
  if (!closed) prompt.focus();
});


async function loadConfig() {
  try {
    const res = await fetch('/api/config');
    const config = await res.json();
    const owner = config.owner || {};
    const starter = config.starter || {};
    agentName.textContent = owner.agentName || 'ClawBell';
    agentSubtitle.textContent = owner.agentSubtitle || `${owner.name || 'Owner'}'s public agent`;
    welcomeTitle.textContent = starter.title || welcomeTitle.textContent;
    welcomeMessage.textContent = starter.message || welcomeMessage.textContent;
    starterPrompts.innerHTML = '';
    (starter.prompts || ['What can you help with?', 'Leave a note', 'Request time']).forEach((label) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.prompt = label;
      button.textContent = label;
      button.addEventListener('click', () => sendMessage(label));
      starterPrompts.append(button);
    });
  } catch {
    ['What can you help with?', 'Leave a note', 'Request time'].forEach((label) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.prompt = label;
      button.textContent = label;
      button.addEventListener('click', () => sendMessage(label));
      starterPrompts.append(button);
    });
  }
}

function escapeHtml(text) {
  return String(text).replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c]));
}

function addBubble(role, html) {
  const bubble = document.createElement('article');
  bubble.className = `bubble ${role}`;
  bubble.innerHTML = html;
  messages.append(bubble);
  messages.scrollTop = messages.scrollHeight;
  return bubble;
}

async function sendMessage(text) {
  const value = String(text || '').trim();
  if (!value) return;
  prompt.value = '';
  addBubble('user', escapeHtml(value));
  history.push({ role: 'user', text: value });
  const typing = addBubble('bot typing', '<span>Thinking in public-safe context</span><span class="typing-dots" aria-hidden="true"><i></i><i></i><i></i></span>');
  send.disabled = true;
  prompt.disabled = true;
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: value, visitorId, history })
    });
    const data = await res.json();
    typing.remove();
    const reply = data.reply || 'I can help with public questions or save a handoff for the operator.';
    const meta = data.source === 'agent-bridge' || data.source === 'soren-bridge'
      ? '<small class="bubble-meta">Connected to public agent</small>'
      : data.degraded || data.source === 'fallback'
        ? '<small class="bubble-meta">Limited mode</small>'
        : '';
    addBubble('bot', `${escapeHtml(reply)}${meta}`);
    history.push({ role: 'assistant', text: reply });
  } catch {
    typing.remove();
    addBubble('system', 'Chat failed. Try again in a moment.');
  } finally {
    send.disabled = false;
    prompt.disabled = false;
    prompt.focus();
  }
}

composer.addEventListener('submit', event => {
  event.preventDefault();
  sendMessage(prompt.value);
});

loadConfig();
