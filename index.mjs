// Mimiq preview check: run a Mimiq flow on a preview deploy and report it on the pull request.
// No dependencies: Node 18+ (fetch). Talks to the hosted Mimiq MCP server over JSON-RPC.
import { appendFileSync, readFileSync } from 'node:fs';

const MCP_URL = process.env.MIMIQ_MCP_URL || 'https://mcp.mimiqai.com/mcp';
const MARKER = '<!-- mimiq-preview-check -->';
const env = (k, d = '') => (process.env[k] ?? d).trim();
const clamp = (v, lo, hi, d) => { const n = Number.parseInt(v, 10); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };

export function readEvent(path = process.env.GITHUB_EVENT_PATH) {
  try { return path ? JSON.parse(readFileSync(path, 'utf8')) : {}; } catch { return {}; }
}

// The URL to test: the input, else the deployment's preview URL.
export function previewUrl(input, event) {
  if (input) return input;
  const s = event?.deployment_status || {};
  return s.environment_url || s.target_url || event?.deployment?.payload?.web_url || '';
}

export function withVercelBypass(url, secret) {
  if (!url || !secret) return url;
  const u = new URL(url);
  u.searchParams.set('x-vercel-protection-bypass', secret);
  u.searchParams.set('x-vercel-set-bypass-cookie', 'true');
  return u.toString();
}

// The MCP server answers with an event stream (keep-alive pings, then one message) or plain JSON.
export function parseMcpBody(text) {
  const datas = text.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim());
  const raw = datas.length ? datas[datas.length - 1] : text.trim();
  return JSON.parse(raw);
}

export function resultOf(rpc) {
  if (rpc.error) throw new Error(`Mimiq: ${rpc.error.message || JSON.stringify(rpc.error)}`);
  const r = rpc.result || {};
  if (r.structuredContent) return { data: r.structuredContent, isError: !!r.isError, text: (r.content || []).map((c) => c.text).join('\n') };
  const first = (r.content || [])[0]?.text || '{}';
  let data = {};
  try { data = JSON.parse(first); } catch { /* plain text */ }
  return { data, isError: !!r.isError, text: (r.content || []).map((c) => c.text).join('\n') };
}

export function summarize(data) {
  const c = data.counts || {};
  const finished = c.converted || 0;
  const partway = c.engaged || 0;
  const gaveUp = c.bounced || 0;
  const total = data.sample_size || finished + partway + gaveUp;
  const seen = new Set();
  const issues = [];
  for (const p of data.personas || []) {
    for (const o of p.objections || []) {
      const key = String(o).toLowerCase().slice(0, 80);
      if (seen.has(key)) continue;
      seen.add(key);
      issues.push({ text: String(o), who: [p.name, p.occupation].filter(Boolean).join(', '), outcome: p.action_class || p.action });
    }
  }
  return { finished, partway, gaveUp, total, issues: issues.slice(0, 6), reportUrl: data.report_url || data.results_url || '' };
}

export function commentBody({ s, url, goal, audience, error }) {
  const lines = [MARKER, '### Mimiq preview check', ''];
  if (error) {
    lines.push(`Mimiq could not run this check: ${error}`, '');
  } else {
    lines.push(`**${s.finished} of ${s.total}** simulated people finished "${goal}" on ${url}` +
      (s.partway || s.gaveUp ? ` (${s.partway} got partway, ${s.gaveUp} gave up).` : '.'));
    if (audience) lines.push(`Audience: ${audience}.`);
    lines.push('');
    if (s.issues.length) {
      lines.push('**Where they got stuck or hesitated**', '');
      for (const i of s.issues) lines.push(`- ${i.text}${i.who ? ` _(${i.who})_` : ''}`);
      lines.push('');
    } else {
      lines.push('Nobody reported a problem on this run.', '');
    }
    if (s.reportUrl) lines.push(`[Open the full report](${s.reportUrl}): each person's steps, screenshots and the issues ranked.`, '');
  }
  lines.push('<sub>The people are simulated: a fast usability check before real users, not a conversion forecast. ' +
    'Runs by [Mimiq](https://www.mimiqai.com/mcp) on each preview deploy.</sub>');
  return lines.join('\n');
}

async function gh(token, path, init = {}) {
  const res = await fetch(`${process.env.GITHUB_API_URL || 'https://api.github.com'}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', ...(init.headers || {}) },
  });
  if (!res.ok) throw new Error(`GitHub ${init.method || 'GET'} ${path}: ${res.status}`);
  return res.status === 204 ? null : res.json();
}

async function prNumber(token, repo, event) {
  if (event?.pull_request?.number) return event.pull_request.number;
  const sha = event?.deployment?.sha || process.env.GITHUB_SHA;
  if (!sha) return null;
  const prs = await gh(token, `/repos/${repo}/commits/${sha}/pulls`);
  const open = (prs || []).filter((p) => p.state === 'open');
  return (open[0] || prs?.[0])?.number || null;
}

async function upsertComment(token, repo, number, body) {
  const comments = await gh(token, `/repos/${repo}/issues/${number}/comments?per_page=100`);
  const mine = (comments || []).find((c) => String(c.body || '').includes(MARKER));
  if (mine) return gh(token, `/repos/${repo}/issues/comments/${mine.id}`, { method: 'PATCH', body: JSON.stringify({ body }) });
  return gh(token, `/repos/${repo}/issues/${number}/comments`, { method: 'POST', body: JSON.stringify({ body }) });
}

function setOutput(name, value) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${String(value).replace(/\n/g, ' ')}\n`);
}

export async function runFlow({ apiKey, args, fetchImpl = fetch }) {
  const res = await fetchImpl(MCP_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'mimiq.test_flow', arguments: args } }),
  });
  const text = await res.text();
  if (!res.ok && !text.includes('data:')) throw new Error(`Mimiq answered ${res.status}: ${text.slice(0, 300)}`);
  return resultOf(parseMcpBody(text));
}

async function main() {
  const event = readEvent();
  const state = event?.deployment_status?.state;
  if (state && state !== 'success') { console.log(`Deployment state is ${state}; nothing to check.`); return; }
  const goal = env('MIMIQ_GOAL', 'Sign up and start using it');
  const audience = env('MIMIQ_AUDIENCE');
  const baseUrl = previewUrl(env('MIMIQ_URL'), event);
  if (!baseUrl) throw new Error('No URL to test: set the url input, or run on deployment_status events from your host.');
  const url = withVercelBypass(baseUrl, env('MIMIQ_VERCEL_BYPASS'));
  const args = {
    url, goal,
    count: clamp(env('MIMIQ_PEOPLE'), 1, 10, 3),
    max_steps: clamp(env('MIMIQ_MAX_STEPS'), 10, 60, 25),
    timeout_seconds: clamp(env('MIMIQ_TIMEOUT'), 60, 1800, 1200),
    ...(audience ? { audience } : {}),
  };
  console.log(`Mimiq: ${args.count} simulated people try "${goal}" on ${baseUrl}`);
  let s = null; let error = '';
  try {
    const out = await runFlow({ apiKey: env('MIMIQ_API_KEY'), args });
    if (out.isError) error = out.data?.message || out.text.slice(0, 400);
    else if (out.data?.status === 'audience_review') error = 'the recruited crowd did not match the audience; set the audience input more precisely.';
    else s = summarize(out.data);
    console.log(out.text);
  } catch (e) { error = e.message; }

  const body = commentBody({ s, url: baseUrl, goal, audience, error });
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, body.replace(MARKER, '') + '\n');
  if (s) {
    setOutput('report-url', s.reportUrl); setOutput('finished', s.finished); setOutput('partway', s.partway); setOutput('gave-up', s.gaveUp);
  }
  const token = env('GITHUB_TOKEN_INPUT');
  const repo = process.env.GITHUB_REPOSITORY;
  if (env('MIMIQ_COMMENT', 'true') !== 'false' && token && repo) {
    try {
      const number = await prNumber(token, repo, event);
      if (number) { await upsertComment(token, repo, number, body); console.log(`Commented on #${number}.`); }
      else console.log('No pull request found for this commit; the result is in the job summary.');
    } catch (e) { console.log(`Could not comment: ${e.message} (give the job pull-requests: write).`); }
  }
  const failOn = env('MIMIQ_FAIL_ON', 'never');
  if (error) { console.log(`::warning::Mimiq preview check did not run: ${error}`); return; }
  if (failOn === 'gave-up' && s.gaveUp > 0) { console.log(`::error::${s.gaveUp} simulated people gave up.`); process.exitCode = 1; }
  if (failOn === 'stuck' && s.finished < s.total) { console.log(`::error::${s.total - s.finished} of ${s.total} simulated people did not finish.`); process.exitCode = 1; }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.log(`::error::${e.message}`); process.exitCode = 1; });
}
