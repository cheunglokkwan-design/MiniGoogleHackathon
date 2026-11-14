import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runRuleEngine, classifyHost, extractUrls, computeConsensus } from '../lib/heuristics.js';
import { EXAMPLES } from '../examples.js';

const ids = (r) => r.hits.map(h => h.id);

test('official domains pass', () => {
  for (const h of ['deriv.com', 'app.deriv.com', 'smarttrader.deriv.com']) assert.equal(classifyHost(h).status, 'official');
});

test('look-alike domains caught', () => {
  for (const h of ['deriv-verify-secure.net', 'derlv.com', 'd3riv.com', 'deriiv.com', 'deriv.com.security-check.xyz', 'my-deriv.support', 'xn--driv-7ra.com'])
    assert.equal(classifyHost(h).status, 'lookalike', h);
});

test('unrelated domains not called look-alikes', () => {
  for (const h of ['google.com', 'derivative.org', 'river.com', 'drive.google.com']) assert.notEqual(classifyHost(h).status, 'lookalike', h);
});

test('URL extraction ignores email domains', () => {
  const u = extractUrls('Email support@deriv.com or visit http://bit.ly/abc and www.derlv.net.');
  assert.deepEqual(u.map(x => x.host), ['bit.ly', 'derlv.net']);
});

test('classic phishing → critical', () => {
  const r = runRuleEngine("Dear Deriv customer, your account has been flagged. Verify within 24 hours or it will be suspended. Click: http://deriv-verify-secure.net and send us the OTP you receive.");
  for (const id of ['lookalike_domain', 'credential_request', 'urgency', 'account_threat']) assert.ok(ids(r).includes(id), id);
  assert.ok(r.floor >= 80);
});

test('warning NOT to share OTP does not fire credential rule', () => {
  const r = runRuleEngine('Reminder: never share your OTP or password with anyone. Log in at https://app.deriv.com');
  assert.ok(!ids(r).includes('credential_request'));
  assert.equal(r.floor, 0);
});

test('Malay fee scam', () => {
  const r = runRuleEngine('Akaun anda dibekukan. Sila bayar yuran pengeluaran RM350 segera melalui WhatsApp +60 12-345 6789');
  for (const id of ['fee_to_withdraw', 'off_platform_contact', 'account_threat', 'urgency']) assert.ok(ids(r).includes(id), id);
});

test('consensus: one alarmed agent is not averaged away', () => {
  const c = computeConsensus([10, 10, 10, 95], { score: 0, floor: 0 });
  assert.ok(c.final_score > 30, String(c.final_score));
});

test('consensus: critical rule sets floor even if AI fooled', () => {
  const c = computeConsensus([5, 5, 5, 5], { score: 90, floor: 80 });
  assert.equal(c.verdict, 'DANGEROUS');
});

test('consensus: no agents → rule score only', () => {
  const c = computeConsensus([null, null, null, null], { score: 20, floor: 0 });
  assert.equal(c.final_score, 20);
  assert.equal(c.ai_score, null);
});

test('demo examples land in the expected bands', () => {
  for (const ex of EXAMPLES) {
    const r = runRuleEngine(ex.text);
    if (ex.expect === 'safe') assert.equal(r.floor, 0, ex.label);
    else assert.ok(r.floor >= 55, `${ex.label}: ${ids(r)}`);
  }
});
