import http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const port = Number(process.env.PORT || 4599);
const bridgeToken = process.env.SOREN_BRIDGE_TOKEN || '';
const openclawBin = process.env.OPENCLAW_BIN || 'openclaw';
const sessionId = process.env.SOREN_SESSION_ID || 'public-clawbell-session';

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return JSON.parse(raw || '{}');
}

function extractOpenClawReply(stdout) {
  const parsed = JSON.parse(stdout);
  const payload = parsed?.result?.payloads?.find((item) => item?.text);
  return String(payload?.text || '').trim();
}

const server = http.createServer(async (req, res) => {
  if (req.url === '/health') return json(res, 200, { ok: true });
  if (req.url !== '/ask' || req.method !== 'POST') return json(res, 404, { error: 'not_found' });
  if (!bridgeToken || req.headers.authorization !== `Bearer ${bridgeToken}`) {
    return json(res, 401, { error: 'unauthorized' });
  }
  let body;
  try { body = await readJson(req); } catch { return json(res, 400, { error: 'invalid_json' }); }
  const prompt = String(body.prompt || '').slice(0, 12000);
  if (!prompt) return json(res, 400, { error: 'empty_prompt' });
  try {
    const { stdout } = await execFileAsync(openclawBin, [
      'agent',
      '--agent', 'main',
      '--session-id', String(body.sessionId || sessionId).slice(0, 120),
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
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`clawbell local OpenClaw bridge listening on http://127.0.0.1:${port}`);
});
