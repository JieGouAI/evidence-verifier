import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalizeEvent, eventHash, GENESIS } from '../src/canonical.js';
import { verifyChain, checkAnchor } from '../src/verify.js';
import type { ExportedEvent } from '../src/canonical.js';

// ── The golden vector from EVIDENCE-SCHEMA v1.1 SS6.4 ────────────────────────
// Reproducing this hash from the published input IS the conformance claim.
const GOLDEN_EVENT: ExportedEvent = {
  accountId: 'acct-schema-fixture',
  actorId: 'user-1',
  actorEmail: 'approver@example.com',
  action: 'approval.granted',
  resourceType: 'workflow_run',
  resourceId: 'run-42',
  metadata: { note: 'schema fixture', zeta: 1, alpha: [2, 'b', null] },
  timestamp: '2026-01-02T03:04:05.678Z',
};
const GOLDEN_CANONICAL =
  '{"accountId":"acct-schema-fixture","action":"approval.granted","actorEmail":"approver@example.com","actorId":"user-1","after":null,"agentContext":null,"before":null,"metadata":{"alpha":[2,"b",null],"note":"schema fixture","zeta":1},"resourceId":"run-42","resourceName":null,"resourceType":"workflow_run","timestamp":"2026-01-02T03:04:05.678Z"}';
const GOLDEN_HASH = '2241d1b09861bb08aecb0d5f9727cc2ca02433fffc9506684f03d501df2f7598';

test('golden vector: canonical form matches the schema byte-for-byte', () => {
  assert.equal(canonicalizeEvent(GOLDEN_EVENT), GOLDEN_CANONICAL);
});

test('golden vector: eventHash(GENESIS, event) reproduces the published hash', () => {
  assert.equal(eventHash(GENESIS, GOLDEN_EVENT), GOLDEN_HASH);
});

function seal(events: ExportedEvent[]): ExportedEvent[] {
  let prev = GENESIS;
  return events.map((e, i) => {
    const h = eventHash(prev, e);
    const sealed = { ...e, chainSeq: i + 1, prevHash: prev, hash: h };
    prev = h;
    return sealed;
  });
}

const raw: ExportedEvent[] = [1, 2, 3, 4, 5].map((n) => ({
  id: 'ev-' + n,
  accountId: 'acct-1',
  actorId: 'u',
  actorEmail: 'u@example.com',
  action: 'document.created',
  resourceType: 'document',
  resourceId: 'doc-' + n,
  timestamp: '2026-01-0' + n + 'T00:00:00.000Z',
}));

test('a well-sealed chain verifies clean', () => {
  const r = verifyChain(seal(raw));
  assert.equal(r.ok, true);
  assert.equal(r.sealedEvents, 5);
  assert.equal(r.problems.length, 0);
});

test('content tampering is detected (hash-mismatch)', () => {
  const chain = seal(raw);
  (chain[2] as { resourceId?: string }).resourceId = 'doc-TAMPERED';
  const r = verifyChain(chain);
  assert.equal(r.ok, false);
  assert.ok(r.problems.some((p) => p.kind === 'hash-mismatch' && p.chainSeq === 3));
});

test('deletion is detected (seq-gap + prevHash-mismatch)', () => {
  const chain = seal(raw).filter((e) => e.chainSeq !== 3);
  const r = verifyChain(chain);
  assert.equal(r.ok, false);
  assert.ok(r.problems.some((p) => p.kind === 'seq-gap'));
  assert.ok(r.problems.some((p) => p.kind === 'prevHash-mismatch'));
});

test('reordering is detected', () => {
  const chain = seal(raw);
  const tmp = chain[1].timestamp;
  chain[1] = { ...chain[1], timestamp: chain[3].timestamp };
  chain[3] = { ...chain[3], timestamp: tmp };
  const r = verifyChain(chain);
  assert.equal(r.ok, false);
});

test('unsealed tail is counted, not verified', () => {
  const chain = [...seal(raw), { id: 'ev-6', accountId: 'acct-1', timestamp: '2026-01-06T00:00:00.000Z' }];
  const r = verifyChain(chain);
  assert.equal(r.ok, true);
  assert.equal(r.unsealedEvents, 1);
});

test('anchor agreement and disagreement', () => {
  const chain = seal(raw);
  const r = verifyChain(chain);
  const good = checkAnchor(r, { heads: { 'acct-1': { seq: 5, headHash: r.recomputedHead } } }, 'acct-1');
  assert.equal(good.matches, true);
  const bad = checkAnchor(r, { heads: { 'acct-1': { seq: 5, headHash: 'f'.repeat(64) } } }, 'acct-1');
  assert.equal(bad.matches, false);
  // CORRECTED 2026-09-03. This used to assert `undefined` -- an export that cannot reach
  // its own anchor was reported as inconclusive, with a suggestion to export more. That is
  // the exact shape a drop-one-and-re-seal produces, so the tool was offering advice to the
  // one party guaranteed not to take it. Unreachable anchor is now a FAILURE.
  const range = checkAnchor(r, { heads: { 'acct-1': { seq: 9, headHash: 'a'.repeat(64) } } }, 'acct-1');
  assert.equal(range.matches, false);
  assert.match(range.detail, /NOT anchor-verified/);
});

// ── Reported from outside, 2026-09-03, by a reader who ran the tool rather than reading it.
// Both cases below failed before that report: the first accused an honest chain, the second
// waved a forged one through.
test('an anchor written MID-CHAIN verifies against a longer honest export', () => {
  const chain = seal(raw);
  const r = verifyChain(chain);
  const headAt3 = r.headBySeq.get(3);
  const mid = checkAnchor(r, { heads: { 'acct-1': { seq: 3, headHash: headAt3 } } }, 'acct-1');
  // Was: matches === false ("DIFFERS"), because the anchored head was compared against the
  // FINAL recomputed head. A false accusation against an honest operator, and the reason
  // schema section 3's "an earlier anchor pins the history before it" had no mechanism.
  assert.equal(mid.matches, true);
  assert.match(mid.detail, /chainSeq 3/);
});

test('drop one sealed event, re-seal the remainder: an earlier anchor catches it', () => {
  const honest = verifyChain(seal(raw));
  const anchoredHead = honest.recomputedHead; // written before the forgery, at seq 5
  // The forgery: remove one record and re-seal from GENESIS so the result is internally
  // perfect -- every hash, every link, every sequence number consistent.
  const forged = verifyChain(seal(raw.filter((e) => e.id !== 'ev-3')));
  assert.equal(forged.ok, true, 'the forged chain is internally consistent, as expected');
  assert.equal(forged.sealedEvents, 4);
  const a = checkAnchor(forged, { heads: { 'acct-1': { seq: 5, headHash: anchoredHead } } }, 'acct-1');
  assert.equal(a.matches, false);
});
