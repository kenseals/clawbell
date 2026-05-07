const fields = {
  ownerName: document.querySelector('#ownerName'),
  sitePurpose: document.querySelector('#sitePurpose'),
  agentName: document.querySelector('#agentName'),
  agentSubtitle: document.querySelector('#agentSubtitle'),
  welcomeMessage: document.querySelector('#welcomeMessage'),
  starterPrompts: document.querySelector('#starterPrompts'),
  allowedTopics: document.querySelector('#allowedTopics'),
  shareFacts: document.querySelector('#shareFacts'),
  doNotShare: document.querySelector('#doNotShare')
};
const form = document.querySelector('#configForm');
const statusEl = document.querySelector('#saveStatus');
const list = document.querySelector('#conversationList');
const refresh = document.querySelector('#refresh');
const adminToken = new URLSearchParams(window.location.search).get('token') || '';

function lines(value) { return value.split('\n').map(v => v.trim()).filter(Boolean); }
function lineText(value) { return (value || []).join('\n'); }
function adminHeaders(extra = {}) {
  return adminToken ? { ...extra, 'x-admin-token': adminToken } : extra;
}

function fill(config) {
  fields.ownerName.value = config.owner?.name || '';
  fields.sitePurpose.value = config.owner?.sitePurpose || '';
  fields.agentName.value = config.owner?.agentName || '';
  fields.agentSubtitle.value = config.owner?.agentSubtitle || '';
  fields.welcomeMessage.value = config.starter?.message || '';
  fields.starterPrompts.value = lineText(config.starter?.prompts);
  fields.allowedTopics.value = lineText(config.publicContext?.allowedTopics);
  fields.shareFacts.value = lineText(config.publicContext?.share);
  fields.doNotShare.value = lineText(config.publicContext?.doNotShare);
}

function readConfig() {
  return {
    owner: {
      name: fields.ownerName.value.trim(),
      sitePurpose: fields.sitePurpose.value.trim(),
      agentName: fields.agentName.value.trim(),
      agentSubtitle: fields.agentSubtitle.value.trim()
    },
    publicContext: {
      allowedTopics: lines(fields.allowedTopics.value),
      share: lines(fields.shareFacts.value),
      doNotShare: lines(fields.doNotShare.value)
    },
    starter: {
      message: fields.welcomeMessage.value.trim(),
      prompts: lines(fields.starterPrompts.value)
    },
    escalation: { notifyOn: [], summaryEveryConversation: true }
  };
}

async function loadConfig() {
  const res = await fetch('/api/config', { headers: adminHeaders() });
  fill(await res.json());
}

async function saveConfig(event) {
  event.preventDefault();
  statusEl.textContent = 'Saving…';
  const res = await fetch('/api/config', {
    method: 'POST',
    headers: adminHeaders({ 'content-type': 'application/json' }),
    body: JSON.stringify(readConfig())
  });
  if (!res.ok) {
    statusEl.textContent = 'Save failed.';
    return;
  }
  statusEl.textContent = 'Saved. Refresh the chat page to see changes.';
}

function renderConversations(conversations) {
  if (!conversations.length) {
    list.innerHTML = '<p>No conversations yet.</p>';
    return;
  }
  list.innerHTML = conversations.slice().reverse().map(c => `
    <article class="event">
      <time>${new Date(c.ts).toLocaleString()}</time>
      <strong>${escapeHtml(c.summary?.asked || c.message || 'Visitor message')}</strong>
      <p>${escapeHtml(c.summary?.replyPreview || c.reply || '')}</p>
      <span class="badge ${c.handoffSuggested ? 'warn' : ''}">${c.handoffSuggested ? 'needs attention' : c.source || 'logged'}</span>
    </article>
  `).join('');
}

async function loadConversations() {
  const res = await fetch('/api/conversations', { headers: adminHeaders() });
  const data = await res.json();
  renderConversations(data.conversations || []);
}

function escapeHtml(text) {
  return String(text).replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c]));
}

form.addEventListener('submit', saveConfig);
refresh.addEventListener('click', loadConversations);
loadConfig();
loadConversations();
