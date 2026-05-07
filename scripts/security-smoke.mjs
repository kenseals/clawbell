#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const root = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const args = new Set(process.argv.slice(2));
const liveBridge = args.has('--live-bridge');
const bridgeUrl = process.env.CLAWBELL_BRIDGE_URL || 'http://127.0.0.1:4599';
const appUrl = process.env.CLAWBELL_APP_URL || '';
const tokenFile = process.env.SOREN_BRIDGE_TOKEN_FILE || `${root}/data/.soren-bridge-token`;

const results = [];

function pass(name, detail = '') { results.push({ ok: true, name, detail }); }
function fail(name, detail = '') { results.push({ ok: false, name, detail }); }
function info(name, detail = '') { results.push({ ok: null, name, detail }); }

function run(name, fn) {
  try { fn(); }
  catch (error) { fail(name, error?.message || String(error)); }
}

function gitLsFiles() {
  return execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
}

function curlJson(url, options = {}) {
  const headers = ['-sS', '-m', String(options.timeout || 10), '-i'];
  for (const [key, value] of Object.entries(options.headers || {})) headers.push('-H', `${key}: ${value}`);
  if (options.body) headers.push('--data', options.body);
  headers.push(url);
  return execFileSync('curl', headers, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function statusFromCurlOutput(output) {
  const match = output.match(/^HTTP\/\S+\s+(\d+)/m);
  return match ? Number(match[1]) : null;
}

run('tracked-file hygiene', () => {
  const forbidden = [
    /^data\//,
    /^config\.local\.json$/,
    /^\.env$/,
    /^\.wrangler\//,
    /\.jsonl$/,
    /\.log$/,
    /(^|\/)\.soren-bridge-token$/
  ];
  const bad = gitLsFiles().filter((file) => forbidden.some((pattern) => pattern.test(file)));
  if (bad.length) throw new Error(`forbidden tracked files: ${bad.join(', ')}`);
  pass('tracked-file hygiene', 'no tracked runtime data, env, wrangler cache, logs, or token files');
});

run('syntax check', () => {
  execFileSync('npm', ['run', 'check:syntax'], { cwd: root, stdio: 'pipe' });
  pass('syntax check', 'npm run check:syntax passed');
});

run('local bridge health', () => {
  const output = curlJson(`${bridgeUrl}/health`, { timeout: 5 });
  const status = statusFromCurlOutput(output);
  if (status !== 200) throw new Error(`expected 200, got ${status || 'unknown'}`);
  pass('local bridge health', `${bridgeUrl}/health returned 200`);
});

run('local bridge unauthenticated ask is rejected', () => {
  const output = curlJson(`${bridgeUrl}/ask`, {
    timeout: 5,
    headers: { 'content-type': 'application/json' },
    body: '{"prompt":"hello"}'
  });
  const status = statusFromCurlOutput(output);
  if (status !== 401) throw new Error(`expected 401, got ${status || 'unknown'}`);
  pass('local bridge unauthenticated ask is rejected', '/ask returned 401 without token');
});

if (liveBridge) {
  run('local bridge authenticated ask', () => {
    const token = process.env.SOREN_BRIDGE_TOKEN || (existsSync(tokenFile) ? readFileSync(tokenFile, 'utf8').trim() : '');
    if (!token) throw new Error('missing SOREN_BRIDGE_TOKEN or SOREN_BRIDGE_TOKEN_FILE');
    const output = curlJson(`${bridgeUrl}/ask`, {
      timeout: 90,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`
      },
      body: '{"prompt":"Public ClawBell smoke test. Reply with exactly: bridge ok","sessionId":"public-clawbell-session"}'
    });
    const status = statusFromCurlOutput(output);
    if (status !== 200) throw new Error(`expected 200, got ${status || 'unknown'}`);
    pass('local bridge authenticated ask', 'authenticated /ask returned 200');
  });
} else {
  info('local bridge authenticated ask', 'skipped; pass --live-bridge to exercise the live OpenClaw session');
}

if (appUrl) {
  const normalizedAppUrl = appUrl.replace(/\/$/, '');
  run('app public config is display-only', () => {
    const output = curlJson(`${normalizedAppUrl}/api/config`, { timeout: 10 });
    const status = statusFromCurlOutput(output);
    if (status !== 200) throw new Error(`expected 200, got ${status || 'unknown'}`);
    if (/doNotShare|allowedTopics|conversation|guidance|leadWhen/i.test(output)) {
      throw new Error('public /api/config appears to expose policy/admin fields');
    }
    pass('app public config is display-only', '/api/config excludes policy/admin fields');
  });

  run('app unauthenticated admin routes are rejected', () => {
    const routes = ['/admin.html', '/api/admin/config', '/api/conversations', '/api/usage', '/api/bridge-status'];
    const bad = [];
    for (const route of routes) {
      const output = curlJson(`${normalizedAppUrl}${route}`, { timeout: 10 });
      const status = statusFromCurlOutput(output);
      if (status !== 401) bad.push(`${route}=${status || 'unknown'}`);
    }
    if (bad.length) throw new Error(`expected 401 for admin routes: ${bad.join(', ')}`);
    pass('app unauthenticated admin routes are rejected', 'admin/config/conversation/usage/status routes returned 401');
  });

  run('app bridge-status hides secrets', () => {
    const output = curlJson(`${normalizedAppUrl}/api/bridge-status`, { timeout: 10 });
    const status = statusFromCurlOutput(output);
    if (status !== 200 && status !== 401) throw new Error(`expected 200 or auth-gated 401, got ${status || 'unknown'}`);
    if (/Bearer\s+[A-Za-z0-9_+/-]{16,}|SOREN_BRIDGE_TOKEN\s*[:=]\s*[A-Za-z0-9_+/-]{16,}/.test(output)) {
      throw new Error('response appears to expose a secret token');
    }
    pass('app bridge-status hides secrets', `status ${status}; no token-shaped values found`);
  });
} else {
  info('app bridge-status hides secrets', 'skipped; set CLAWBELL_APP_URL to test a running app');
}

const failed = results.filter((item) => item.ok === false);
for (const item of results) {
  const mark = item.ok === true ? 'PASS' : item.ok === false ? 'FAIL' : 'SKIP';
  console.log(`${mark} ${item.name}${item.detail ? ` — ${item.detail}` : ''}`);
}

if (failed.length) process.exit(1);
