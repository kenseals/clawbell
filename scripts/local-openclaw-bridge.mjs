import http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const port = Number(process.env.PORT || 4599);
const bridgeToken = process.env.SOREN_BRIDGE_TOKEN || '';
const openclawBin = process.env.OPENCLAW_BIN || 'openclaw';
const sessionId = process.env.SOREN_SESSION_ID || 'public-clawbell-session';
const promptLimit = Number(process.env.SOREN_BRIDGE_MAX_PROMPT_CHARS || 8000);
const bodyLimit = Number(process.env.SOREN_BRIDGE_MAX_BODY_BYTES || 16384);
const localWindowMs = Number(process.env.SOREN_BRIDGE_LOCAL_WINDOW_MS || 60_000);
const localMaxRequests = Number(process.env.SOREN_BRIDGE_LOCAL_MAX_REQUESTS || 10);
const localMaxConcurrent = Number(process.env.SOREN_BRIDGE_LOCAL_MAX_CONCURRENT || 1);
const expectedMarker = 'public-safe version of Ken Seals';
let inFlight = 0;
let localBucket = { start: Date.now(), count: 0 };

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
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
  if (req.url !== '/ask' || req.method !== 'POST') return json(res, 404, { error: 'not_found' });
  if (!bridgeToken || req.headers.authorization !== `Bearer ${bridgeToken}`) {
    return json(res, 401, { error: 'unauthorized' });
  }
  const budget = checkLocalBudget();
  if (!budget.ok) return json(res, budget.status, { error: budget.error });
  let body;
  try { body = await readJson(req); } catch (error) { return json(res, error?.statusCode || 400, { error: error?.message === 'body_too_large' ? 'body_too_large' : 'invalid_json' }); }
  const prompt = String(body.prompt || '').slice(0, promptLimit);
  if (!prompt) return json(res, 400, { error: 'empty_prompt' });
  if (!isExpectedPublicPrompt(prompt)) {
    return json(res, 400, { error: 'invalid_public_prompt' });
  }
  inFlight += 1;
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
    return json(res, 200, { reply });
  } catch (error) {
    console.error('[clawbell-bridge]', error?.message || error);
    return json(res, 502, { error: 'bridge_failed' });
  } finally {
    inFlight = Math.max(0, inFlight - 1);
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`clawbell local OpenClaw bridge listening on http://127.0.0.1:${port}`);
});
