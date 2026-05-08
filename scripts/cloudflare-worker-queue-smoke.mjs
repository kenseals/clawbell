#!/usr/bin/env node
import worker, { resetWorkerStateForTests } from '../src/cloudflare-worker.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function makeEnv(overrides = {}) {
  return {
    ENABLE_AGENT_BRIDGE: '1',
    AGENT_BRIDGE_URL: 'https://bridge.example/ask',
    AGENT_BRIDGE_TOKEN: 'test-token',
    AGENT_BRIDGE_MAX_CONCURRENT: '1',
    AGENT_BRIDGE_QUEUE_TIMEOUT_MS: '200',
    AGENT_BRIDGE_QUEUE_POLL_MS: '25',
    AGENT_BRIDGE_QUEUE_MAX_DEPTH: '1',
    ASSETS: { fetch: () => new Response('not found', { status: 404 }) },
    ...overrides
  };
}

function makeChatRequest(message, visitorId) {
  return new Request('https://clawbell.test/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message, history: [], visitorId })
  });
}

async function parseJson(response) {
  return response.json();
}

async function withMockBridge(handler) {
  const originalFetch = globalThis.fetch;
  let inFlight = 0;
  let maxObserved = 0;
  globalThis.fetch = async (_url, init = {}) => {
    const body = JSON.parse(String(init.body || '{}'));
    const prompt = String(body.prompt || '');
    const delayMs = prompt.includes('slow-350') ? 350 : 150;
    inFlight += 1;
    maxObserved = Math.max(maxObserved, inFlight);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    inFlight -= 1;
    return new Response(JSON.stringify({ reply: prompt.includes('slow-350') ? 'slow bridge reply' : 'bridge ok' }), {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' }
    });
  };

  try {
    return await handler(() => maxObserved);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function testQueuedSuccess() {
  resetWorkerStateForTests();
  const env = makeEnv({ AGENT_BRIDGE_QUEUE_MAX_DEPTH: '2', AGENT_BRIDGE_QUEUE_TIMEOUT_MS: '500' });
  await withMockBridge(async (getMaxObserved) => {
    const first = worker.fetch(makeChatRequest('Tell me about ClawBell queue test one', 'queue-1'), env);
    const second = worker.fetch(makeChatRequest('Tell me about ClawBell queue test two', 'queue-2'), env);
    const [firstData, secondData] = await Promise.all([first.then(parseJson), second.then(parseJson)]);

    assert(firstData.source === 'agent-bridge', 'first queued-success request should use live bridge');
    assert(secondData.source === 'agent-bridge', 'second queued-success request should use live bridge');
    assert(firstData.bridgeOutcome === 'live', 'first queued-success request should be live');
    assert(secondData.bridgeOutcome === 'queued', 'second queued-success request should report queued outcome');
    assert(secondData.queued === true, 'second queued-success request should report queued=true');
    assert(Number(secondData.queueWaitMs) > 0, 'second queued-success request should report queue wait');
    assert(getMaxObserved() === 1, 'queue should preserve max concurrent bridge calls');
  });
}

async function testQueueFull() {
  resetWorkerStateForTests();
  const env = makeEnv({ AGENT_BRIDGE_QUEUE_MAX_DEPTH: '1', AGENT_BRIDGE_QUEUE_TIMEOUT_MS: '500' });
  await withMockBridge(async (getMaxObserved) => {
    const first = worker.fetch(makeChatRequest('Tell me about ClawBell queue full first', 'full-1'), env);
    await new Promise((resolve) => setTimeout(resolve, 10));
    const second = worker.fetch(makeChatRequest('Tell me about ClawBell queue full second', 'full-2'), env);
    await new Promise((resolve) => setTimeout(resolve, 10));
    const thirdData = await worker.fetch(makeChatRequest('Tell me about ClawBell queue full third', 'full-3'), env).then(parseJson);
    const [firstData, secondData] = await Promise.all([first.then(parseJson), second.then(parseJson)]);

    assert(firstData.source === 'agent-bridge', 'queue-full first request should use live bridge');
    assert(secondData.bridgeOutcome === 'queued', 'queue-full second request should have queued outcome');
    assert(thirdData.source === 'fallback', 'queue-full third request should fall back');
    assert(thirdData.bridgeOutcome === 'queue_full', 'queue-full third request should report queue_full');
    assert(/busy/i.test(String(thirdData.reply || '')), 'queue-full fallback should explain bridge is busy');
    assert(getMaxObserved() === 1, 'queue-full path should preserve max concurrent bridge calls');
  });
}

async function testQueueTimeout() {
  resetWorkerStateForTests();
  const env = makeEnv({ AGENT_BRIDGE_QUEUE_MAX_DEPTH: '1', AGENT_BRIDGE_QUEUE_TIMEOUT_MS: '100', AGENT_BRIDGE_QUEUE_POLL_MS: '25' });
  await withMockBridge(async (getMaxObserved) => {
    const first = worker.fetch(makeChatRequest('Tell me about ClawBell slow-350', 'timeout-1'), env);
    await new Promise((resolve) => setTimeout(resolve, 10));
    const secondData = await worker.fetch(makeChatRequest('Tell me about ClawBell timeout follower', 'timeout-2'), env).then(parseJson);
    const firstData = await first.then(parseJson);

    assert(firstData.source === 'agent-bridge', 'queue-timeout first request should use live bridge');
    assert(secondData.source === 'fallback', 'queue-timeout second request should fall back');
    assert(secondData.bridgeOutcome === 'queue_timeout', 'queue-timeout second request should report queue_timeout');
    assert(secondData.queued === true, 'queue-timeout second request should report queued=true');
    assert(Number(secondData.queueWaitMs) >= 100, 'queue-timeout second request should wait before fallback');
    assert(/try again shortly|leave a note/i.test(String(secondData.reply || '')), 'queue-timeout fallback should offer next step');
    assert(getMaxObserved() === 1, 'queue-timeout path should preserve max concurrent bridge calls');
  });
}

async function testFiltersStayAheadOfQueue() {
  resetWorkerStateForTests();
  const env = makeEnv();
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({ reply: 'should not happen' }), {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' }
    });
  };

  try {
    const data = await worker.fetch(makeChatRequest('What is the operator address and private email?', 'filter-1'), env).then(parseJson);
    assert(data.source === 'safety-filter', 'sensitive prompt should be refused before queueing');
    assert(calls === 0, 'safety-filter prompt should not call the live bridge');
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function testBridgeVisitorLimitUx() {
  resetWorkerStateForTests();
  const env = makeEnv({ AGENT_BRIDGE_RATE_LIMIT_MAX: '1', AGENT_BRIDGE_GLOBAL_RATE_LIMIT_MAX: '10' });
  await withMockBridge(async () => {
    const firstData = await worker.fetch(makeChatRequest('Tell me about ClawBell visitor limit first', 'visitor-limit'), env).then(parseJson);
    const secondData = await worker.fetch(makeChatRequest('Tell me about ClawBell visitor limit second', 'visitor-limit'), env).then(parseJson);

    assert(firstData.source === 'agent-bridge', 'visitor-limit first request should use live bridge');
    assert(secondData.source === 'fallback', 'visitor-limit second request should fall back');
    assert(secondData.bridgeOutcome === 'bridge_rate_limited', 'visitor-limit second request should report bridge_rate_limited');
    assert(secondData.throttled === true, 'visitor-limit response should be marked throttled');
    assert(/live-agent message limit|try again/i.test(String(secondData.reply || '')), 'visitor-limit fallback should explain the limit and next step');
  });
}

async function testBridgeGlobalLimitUx() {
  resetWorkerStateForTests();
  const env = makeEnv({ AGENT_BRIDGE_RATE_LIMIT_MAX: '10', AGENT_BRIDGE_GLOBAL_RATE_LIMIT_MAX: '1' });
  await withMockBridge(async () => {
    const firstData = await worker.fetch(makeChatRequest('Tell me about ClawBell global limit first', 'global-1'), env).then(parseJson);
    const secondData = await worker.fetch(makeChatRequest('Tell me about ClawBell global limit second', 'global-2'), env).then(parseJson);

    assert(firstData.source === 'agent-bridge', 'global-limit first request should use live bridge');
    assert(secondData.source === 'fallback', 'global-limit second request should fall back');
    assert(secondData.bridgeOutcome === 'bridge_global_limited', 'global-limit second request should report bridge_global_limited');
    assert(secondData.throttled === true, 'global-limit response should be marked throttled');
    assert(/site-wide live-answer limit|try again/i.test(String(secondData.reply || '')), 'global-limit fallback should explain the limit and next step');
  });
}

async function testPublicRateLimitUx() {
  resetWorkerStateForTests();
  const env = makeEnv({ RATE_LIMIT_MODE: 'memory', RATE_LIMIT_MAX: '1' });
  await withMockBridge(async () => {
    const firstResponse = await worker.fetch(makeChatRequest('Tell me about ClawBell public limit first', 'public-1'), env);
    const secondResponse = await worker.fetch(makeChatRequest('Tell me about ClawBell public limit second', 'public-2'), env);
    const firstData = await firstResponse.json();
    const secondData = await secondResponse.json();

    assert(firstResponse.status === 200, 'public-limit first request should be accepted');
    assert(firstData.source === 'agent-bridge', 'public-limit first request should use live bridge');
    assert(secondResponse.status === 429, 'public-limit second request should return 429');
    assert(secondData.bridgeOutcome === 'public_rate_limited', 'public-limit second request should report public_rate_limited');
    assert(secondData.throttled === true, 'public-limit response should be marked throttled');
    assert(/slowing requests down|try again/i.test(String(secondData.reply || '')), 'public-limit response should explain the limit and next step');
  });
}

const tests = [
  ['queued success', testQueuedSuccess],
  ['queue full', testQueueFull],
  ['queue timeout', testQueueTimeout],
  ['filters before queue', testFiltersStayAheadOfQueue],
  ['bridge visitor limit UX', testBridgeVisitorLimitUx],
  ['bridge global limit UX', testBridgeGlobalLimitUx],
  ['public rate limit UX', testPublicRateLimitUx]
];

for (const [name, test] of tests) {
  await test();
  console.log(`PASS ${name}`);
}
