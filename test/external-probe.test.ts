/**
 * External probe — contributed by Andrey Lazarev (TactiQ AI), 2026-09-03.
 * Source: https://gist.github.com/revenue7-eng/64b138c1477c4a3ee6fa52eae6f6ebb1
 * Used with his permission; adopted here as a standing regression suite.
 *
 * WHY IT IS KEPT SEPARATE FROM verifier.test.ts
 * He wrote these six expectations against the PUBLISHED SPEC — §3 "Sequence authority" and
 * §7's outsider procedure — and not against our implementation, deliberately, so that it
 * could disagree with us. It did: run against the verifier as published on 2026-09-03 it
 * failed two of six (mid-chain anchor vs honest returned false; unreachable anchor vs forged
 * returned undefined), which is exactly how the anchor defects were reported. Against the
 * fixed verifier it passes six of six.
 *
 * That property is worth preserving. This file must keep testing what the SPEC says, so that
 * a future change which satisfies our own tests and breaks the published contract still has
 * something in CI that objects. If a spec change makes an expectation here wrong, change the
 * spec text and this file together, and say so in the commit.
 *
 * His case at line "mid-chain anchor vs forged" is not covered by verifier.test.ts: ours
 * cover honest-vs-mid and forged-vs-final, his closes the matrix with forged-vs-mid.
 * Restructured only to run under node:test; the expectations and their reasons are his.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { eventHash, GENESIS, type ExportedEvent } from '../src/canonical.js';
import { verifyChain, checkAnchor } from '../src/verify.js';

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
  action: n === 3 ? 'account.data_exported' : 'document.created',
  resourceType: 'document',
  resourceId: 'doc-' + n,
  timestamp: '2026-01-0' + n + 'T00:00:00.000Z',
}));

const honest = seal(raw);
const forged = seal(raw.filter((e) => e.id !== 'ev-3'));
const H = verifyChain(honest);
const F = verifyChain(forged);
const anchor = (headHash: string, seq: number) =>
  ({ anchoredAt: '2026-01-02T12:00:00.000Z', heads: { 'acct-1': { headHash, seq } } });
const headAt = (n: number) => honest[n - 1].hash as string;

test('forged chain is internally consistent', () => {
  // every hash, link and seq agrees; §3 sequence authority is exactly this
  assert.equal(F.ok, true);
});

test('forged chain lost one event', () => {
  assert.equal(F.sealedEvents, 4);
});

test('mid-chain anchor (seq 3) vs honest', () => {
  // an anchor at seq 3 is a statement about the history through 3, not about seq 5
  assert.equal(checkAnchor(H, anchor(headAt(3), 3), 'acct-1').matches, true);
});

test('mid-chain anchor (seq 3) vs forged', () => {
  // the dropped record sat at seq 3, so the head there cannot agree
  assert.equal(checkAnchor(F, anchor(headAt(3), 3), 'acct-1').matches, false);
});

test('unreachable anchor (seq 5) vs forged', () => {
  // drop-and-re-seal produces exactly this shape; advice to export more goes to the wrong party
  assert.equal(checkAnchor(F, anchor(headAt(5), 5), 'acct-1').matches, false);
});

test('final anchor (seq 5) vs honest', () => {
  // baseline: the honest case must not become a false positive
  assert.equal(checkAnchor(H, anchor(headAt(5), 5), 'acct-1').matches, true);
});
