import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseMcpBody, resultOf, summarize, commentBody, previewUrl, accessFrom, runFlow, OUT_OF_CREDITS } from '../index.mjs';

const sse = readFileSync(new URL('./fixtures/flow.sse', import.meta.url), 'utf8');

test('reads the streamed MCP answer (pings, then one message)', () => {
  const out = resultOf(parseMcpBody(sse));
  assert.equal(out.isError, false);
  assert.equal(out.data.tool, 'mimiq.test_flow');
});

test('summarizes counts and objections without repeats', () => {
  const s = summarize(resultOf(parseMcpBody(sse)).data);
  assert.equal(s.total, 1);
  assert.equal(s.finished, 1);
  assert.ok(s.issues.length >= 1);
  assert.match(s.issues[0].text, /URL/);
});

test('the comment says simulated, shows the counts and keeps one marker for updates', () => {
  const s = summarize(resultOf(parseMcpBody(sse)).data);
  const body = commentBody({ s, url: 'https://preview.example.com', goal: 'Sign up', audience: '' });
  assert.match(body, /<!-- mimiq-preview-check -->/);
  assert.match(body, /\*\*1 of 1\*\* simulated people finished "Sign up"/);
  assert.match(body, /not a conversion forecast/);
  assert.doesNotMatch(body, /[—–]/);
});

test('an error still produces a comment that says what happened', () => {
  const body = commentBody({ s: null, url: 'x', goal: 'g', audience: '', error: 'no credits left' });
  assert.match(body, /could not run this check: no credits left/);
});

test('the preview URL comes from deployment_status when no url is given', () => {
  assert.equal(previewUrl('', { deployment_status: { state: 'success', environment_url: 'https://app-git-x.vercel.app' } }), 'https://app-git-x.vercel.app');
  assert.equal(previewUrl('', { deployment_status: { target_url: 'https://deploy-preview-3--site.netlify.app' } }), 'https://deploy-preview-3--site.netlify.app');
  assert.equal(previewUrl('https://given.example', {}), 'https://given.example');
});

test('access goes in the access block, never in the URL', () => {
  const env = { MIMIQ_VERCEL_BYPASS: 's3cret', MIMIQ_LOGIN_EMAIL: 'qa@acme.dev', MIMIQ_LOGIN_PASSWORD: 'pw', MIMIQ_LOGIN_NOTE: '' };
  const access = accessFrom((k) => env[k] || '');
  assert.deepEqual(access, { vercel_bypass: 's3cret', login: { email: 'qa@acme.dev', password: 'pw' } });
  assert.equal(accessFrom(() => ''), null);
});

test('sends test_flow with the key as a bearer token, and none without a key', async () => {
  const seen = [];
  const fetchImpl = async (url, init) => { seen.push(init); return { ok: true, status: 200, text: async () => sse }; };
  await runFlow({ apiKey: 'mq_sk_test', args: { url: 'https://x', goal: 'g', count: 1 }, fetchImpl });
  await runFlow({ apiKey: '', args: { url: 'https://x', goal: 'g', count: 1 }, fetchImpl });
  assert.equal(seen[0].headers.authorization, 'Bearer mq_sk_test');
  assert.equal(seen[1].headers.authorization, undefined);
  assert.equal(JSON.parse(seen[0].body).params.name, 'mimiq.test_flow');
});


test('out of credits: the comment says so plainly and links the top-up', () => {
  const body = commentBody({ s: null, url: 'https://p.vercel.app', goal: 'Sign up', error: OUT_OF_CREDITS });
  assert.match(body, /out of credits, so this preview was not checked/);
  assert.match(body, /https:\/\/www\.mimiqai\.com\/app\/usage/);
  assert.doesNotMatch(body, /could not run this check/);
});
