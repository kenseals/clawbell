import http from 'node:http';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const port = Number(process.env.PORT || 4599);
const bridgeToken = process.env.AGENT_BRIDGE_TOKEN || process.env.CLAWBELL_BRIDGE_TOKEN || process.env.SOREN_BRIDGE_TOKEN || '';
const openclawBin = process.env.OPENCLAW_BIN || 'openclaw';
const sessionId = process.env.AGENT_BRIDGE_SESSION_ID || process.env.CLAWBELL_SESSION_ID || process.env.SOREN_SESSION_ID || 'public-clawbell-session';
const promptLimit = Number(process.env.AGENT_BRIDGE_MAX_PROMPT_CHARS || process.env.CLAWBELL_BRIDGE_MAX_PROMPT_CHARS || process.env.SOREN_BRIDGE_MAX_PROMPT_CHARS || 8000);
const bodyLimit = Number(process.env.AGENT_BRIDGE_MAX_BODY_BYTES || process.env.CLAWBELL_BRIDGE_MAX_BODY_BYTES || process.env.SOREN_BRIDGE_MAX_BODY_BYTES || 16384);
const localWindowMs = Number(process.env.AGENT_BRIDGE_LOCAL_WINDOW_MS || process.env.CLAWBELL_BRIDGE_LOCAL_WINDOW_MS || process.env.SOREN_BRIDGE_LOCAL_WINDOW_MS || 60_000);
const localMaxRequests = Number(process.env.AGENT_BRIDGE_LOCAL_MAX_REQUESTS || process.env.CLAWBELL_BRIDGE_LOCAL_MAX_REQUESTS || process.env.SOREN_BRIDGE_LOCAL_MAX_REQUESTS || 10);
const localMaxConcurrent = Number(process.env.AGENT_BRIDGE_LOCAL_MAX_CONCURRENT || process.env.CLAWBELL_BRIDGE_LOCAL_MAX_CONCURRENT || process.env.SOREN_BRIDGE_LOCAL_MAX_CONCURRENT || 1);
const visitorWindowMs = Number(process.env.AGENT_BRIDGE_VISITOR_WINDOW_MS || process.env.CLAWBELL_BRIDGE_VISITOR_WINDOW_MS || process.env.SOREN_BRIDGE_VISITOR_WINDOW_MS || 60 * 60_000);
const visitorMaxRequests = Number(process.env.AGENT_BRIDGE_VISITOR_MAX_REQUESTS || process.env.CLAWBELL_BRIDGE_VISITOR_MAX_REQUESTS || process.env.SOREN_BRIDGE_VISITOR_MAX_REQUESTS || 4);
const usageLogPath = process.env.AGENT_BRIDGE_USAGE_LOG || process.env.CLAWBELL_BRIDGE_USAGE_LOG || process.env.SOREN_BRIDGE_USAGE_LOG || new URL('../data/agent-bridge-usage.jsonl', import.meta.url).pathname;
const expectedMarker = 'public-safe';
let inFlight = 0;
let localBucket = { start: Date.now(), count: 0 };
const visitorBuckets = new Map();

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

async function writeUsage(record) {
  try {
    await mkdir(dirname(usageLogPath), { recursive: true });
    await appendFile(usageLogPath, JSON.stringify({ ts: new Date().toISOString(), ...record }) + '\n');
  } catch (error) {
    console.error('[clawbell-usage]', error?.message || error);
  }
}

function cleanText(value, max = 300) {
  return String(value || '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (Buffer.byteLength(raw, 'utf8') > bodyLimit) {
      const error = new Error('body_too_large');
      error.statusCode = 413;
      throw error;
    }
  }
  return JSON.parse(raw || '{}');
}

function checkLocalBudget() {
  if (localMaxConcurrent > 0 && inFlight >= localMaxConcurrent) {
    return { ok: false, status: 429, error: 'bridge_busy' };
  }
  const now = Date.now();
  if (now - localBucket.start > localWindowMs) localBucket = { start: now, count: 0 };
  localBucket.count += 1;
  if (localMaxRequests > 0 && localBucket.count > localMaxRequests) {
    return { ok: false, status: 429, error: 'local_rate_limited' };
  }
  return { ok: true };
}

function checkBucket(map, key, windowMs, max) {
  if (!max || max < 1) return { ok: true };
  const now = Date.now();
  const bucket = map.get(key) || { start: now, count: 0 };
  if (now - bucket.start > windowMs) {
    bucket.start = now;
    bucket.count = 0;
  }
  bucket.count += 1;
  map.set(key, bucket);
  return { ok: bucket.count <= max, retryAfter: Math.ceil((windowMs - (now - bucket.start)) / 1000) };
}

function checkVisitorBudget(visitorId) {
  const key = cleanText(visitorId, 120) || 'anonymous';
  const result = checkBucket(visitorBuckets, key, visitorWindowMs, visitorMaxRequests);
  return result.ok ? { ok: true, key } : { ok: false, key, status: 429, error: 'visitor_rate_limited', retryAfter: result.retryAfter };
}

async function usageSummary() {
  let rows = [];
  try {
    const text = await readFile(usageLogPath, 'utf8');
    rows = text.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line)).slice(-1000);
  } catch {}
  const since = Date.now() - 24 * 60 * 60_000;
  const recent = rows.filter((row) => Date.parse(row.ts || '') >= since);
  const byOutcome = {};
  const bySource = {};
  let promptChars = 0;
  let replyChars = 0;
  let liveCalls = 0;
  for (const row of recent) {
    byOutcome[row.outcome || row.event || 'unknown'] = (byOutcome[row.outcome || row.event || 'unknown'] || 0) + 1;
    bySource[row.source || 'unknown'] = (bySource[row.source || 'unknown'] || 0) + 1;
    promptChars += Number(row.promptChars || 0);
    replyChars += Number(row.replyChars || 0);
    if (row.outcome === 'ok') liveCalls += 1;
  }
  return {
    windowHours: 24,
    events: recent.length,
    liveCalls,
    promptChars,
    replyChars,
    approxChars: promptChars + replyChars,
    byOutcome,
    bySource,
    recent: recent.slice(-25)
  };
}

function extractOpenClawReply(stdout) {
  const parsed = JSON.parse(stdout);
  const payload = parsed?.result?.payloads?.find((item) => item?.text);
  return String(payload?.text || '').trim();
}

function isExpectedPublicPrompt(prompt) {
  return prompt.includes(expectedMarker)
    && prompt.includes('Public-safe mode only')
    && prompt.includes('Operator identity rule')
    && prompt.includes('Hard privacy rule');
}

const server = http.createServer(async (req, res) => {
  if (req.url === '/health') return json(res, 200, { ok: true });
  if (!bridgeToken || req.headers.authorization !== `Bearer ${bridgeToken}`) {
    return json(res, 401, { error: 'unauthorized' });
  }
  if (req.url === '/usage' && req.method === 'GET') return json(res, 200, await usageSummary());
  if (req.url === '/event' && req.method === 'POST') {
    let body;
    try { body = await readJson(req); } catch (error) { return json(res, error?.statusCode || 400, { error: error?.message === 'body_too_large' ? 'body_too_large' : 'invalid_json' }); }
    await writeUsage({
      event: cleanText(body.event, 80) || 'worker_event',
      source: cleanText(body.source, 80) || 'worker',
      visitorId: cleanText(body.visitorId, 120),
      reason: cleanText(body.reason, 120),
      noteIntent: Boolean(body.noteIntent),
      messagePreview: cleanText(body.message, 300),
      messageChars: Number(body.messageChars || 0)
    });
    return json(res, 200, { ok: true });
  }
  if (req.url !== '/ask' || req.method !== 'POST') return json(res, 404, { error: 'not_found' });
  const budget = checkLocalBudget();
  if (!budget.ok) return json(res, budget.status, { error: budget.error });
  let body;
  try { body = await readJson(req); } catch (error) { return json(res, error?.statusCode || 400, { error: error?.message === 'body_too_large' ? 'body_too_large' : 'invalid_json' }); }
  const prompt = String(body.prompt || '').slice(0, promptLimit);
  if (!prompt) return json(res, 400, { error: 'empty_prompt' });
  if (!isExpectedPublicPrompt(prompt)) {
    return json(res, 400, { error: 'invalid_public_prompt' });
  }
  const meta = body.meta && typeof body.meta === 'object' ? body.meta : {};
  const visitorBudget = checkVisitorBudget(meta.visitorId || body.visitorId);
  if (!visitorBudget.ok) {
    await writeUsage({ event: 'ask', outcome: visitorBudget.error, source: 'local-bridge', visitorId: visitorBudget.key, retryAfter: visitorBudget.retryAfter, messagePreview: cleanText(meta.message, 300), messageChars: Number(meta.messageChars || 0), noteIntent: Boolean(meta.noteIntent) });
    return json(res, visitorBudget.status, { error: visitorBudget.error, retryAfter: visitorBudget.retryAfter });
  }
  inFlight += 1;
  const started = Date.now();
  try {
    const { stdout } = await execFileAsync(openclawBin, [
      'agent',
      '--agent', 'main',
      '--session-id', sessionId.slice(0, 120),
      '--thinking', 'off',
      '--timeout', '60',
      '--json',
      '--message', prompt
    ], { timeout: 70000, maxBuffer: 1024 * 1024 });
    const reply = extractOpenClawReply(stdout);
    if (!reply) throw new Error('empty_openclaw_reply');
    await writeUsage({ event: 'ask', outcome: 'ok', source: 'agent-bridge', visitorId: visitorBudget.key, noteIntent: Boolean(meta.noteIntent), messagePreview: cleanText(meta.message, 300), messageChars: Number(meta.messageChars || 0), promptChars: prompt.length, replyChars: reply.length, durationMs: Date.now() - started });
    return json(res, 200, { reply });
  } catch (error) {
    console.error('[clawbell-bridge]', error?.message || error);
    await writeUsage({ event: 'ask', outcome: 'bridge_failed', source: 'local-bridge', visitorId: visitorBudget.key, error: cleanText(error?.message || error, 160), promptChars: prompt.length, durationMs: Date.now() - started });
    return json(res, 502, { error: 'bridge_failed' });
  } finally {
    inFlight = Math.max(0, inFlight - 1);
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`clawbell local OpenClaw bridge listening on http://127.0.0.1:${port}`);
});
