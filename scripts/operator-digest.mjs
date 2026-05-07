#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dataDir = process.env.DATA_DIR ? join(root, process.env.DATA_DIR) : join(root, 'data');
const hours = Number(process.env.DIGEST_HOURS || process.argv.find((arg) => arg.startsWith('--hours='))?.split('=')[1] || 24);
const since = Date.now() - hours * 60 * 60 * 1000;

function parseJsonl(text) {
  return text.split('\n').filter(Boolean).flatMap((line) => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
}

async function readJsonl(name) {
  try { return parseJsonl(await readFile(join(dataDir, name), 'utf8')); }
  catch { return []; }
}

function withinWindow(record) {
  const time = Date.parse(record.ts || '');
  return Number.isFinite(time) && time >= since;
}

function clean(text, max = 180) {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function isLikelyImportant(record) {
  const text = `${record.message || ''} ${record.reply || ''}`.toLowerCase();
  return Boolean(record.noteIntent)
    || /customer|partnership|partner|investor|press|bug|broken|unsafe|privacy|security|payment|address|phone|email|urgent|hire|consult|client|demo|lettuce|clawbell/.test(text)
    || record.source === 'fallback'
    || record.source === 'safety-filter'
    || record.degraded;
}

const conversations = (await readJsonl('conversations.jsonl')).filter(withinWindow);
const handoffs = (await readJsonl('handoffs.jsonl')).filter(withinWindow);
const bridgeErrors = (await readJsonl('soren-bridge-errors.jsonl')).filter(withinWindow);
const throttled = (await readJsonl('bridge-throttled.jsonl')).filter(withinWindow);

const bySource = conversations.reduce((acc, item) => {
  const key = item.source || 'unknown';
  acc[key] = (acc[key] || 0) + 1;
  return acc;
}, {});

const uniqueVisitors = new Set(conversations.map((item) => item.visitorId || 'anonymous'));
const important = conversations.filter(isLikelyImportant).slice(-8);
const degraded = conversations.filter((item) => item.degraded || item.source === 'fallback' || item.source === 'safety-filter').slice(-8);

const lines = [];
lines.push(`# ClawBell operator digest`);
lines.push('');
lines.push(`Window: last ${hours}h`);
lines.push(`Generated: ${new Date().toISOString()}`);
lines.push('');
lines.push(`- Conversations: ${conversations.length}`);
lines.push(`- Unique visitors: ${uniqueVisitors.size}`);
lines.push(`- Handoffs: ${handoffs.length}`);
lines.push(`- Bridge errors: ${bridgeErrors.length}`);
lines.push(`- Bridge throttles: ${throttled.length}`);
lines.push(`- Sources: ${Object.entries(bySource).map(([key, value]) => `${key}=${value}`).join(', ') || 'none'}`);
lines.push('');

if (important.length) {
  lines.push(`## Needs operator attention / useful signal`);
  for (const item of important) {
    lines.push(`- ${item.ts || 'unknown time'} · ${item.source || 'unknown'} · ${clean(item.message)}${item.noteIntent ? ' · note/contact intent' : ''}`);
  }
  lines.push('');
}

if (degraded.length) {
  lines.push(`## Degraded, fallback, or safety-filtered chats`);
  for (const item of degraded) {
    lines.push(`- ${item.ts || 'unknown time'} · ${item.source || 'unknown'}${item.degraded ? ' · degraded' : ''} · ${clean(item.message)}`);
  }
  lines.push('');
}

if (!important.length && !degraded.length) {
  lines.push('No notable chats or degraded events in this window.');
  lines.push('');
}

console.log(lines.join('\n'));
