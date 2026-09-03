/**
 * Verification per JieGou Evidence Schema v1.1 SS7 -- the outsider procedure.
 *
 * What this DOES establish (schema SS3): integrity of the sealed sequence, and
 * agreement with an externally anchored head. What it does NOT establish:
 * completeness (nothing here can show that every action produced a record),
 * verdict correctness, or sequence authority -- a withheld record surfaces
 * below as a seq-gap, but a history renumbered and re-sealed wholesale by the
 * operator's own sealer does not, and only an anchor already written bounds
 * that. Signatures are the operator's symmetric HMACs and are
 * deliberately NOT checked here -- an outsider cannot verify them, and
 * pretending to would be theater. The trust root of this tool is keyless
 * recomputation plus the anchor store's write-once property.
 */
import { eventHash, GENESIS, type ExportedEvent } from './canonical.js';

export interface ChainProblem {
  chainSeq: number | undefined;
  eventId: string | undefined;
  kind:
    | 'hash-mismatch'
    | 'prevHash-mismatch'
    | 'seq-gap'
    | 'order-violation'
    | 'missing-chain-fields';
  detail: string;
}

export interface ChainReport {
  accountId: string | undefined;
  sealedEvents: number;
  unsealedEvents: number;
  recomputedHead: string | undefined;
  /**
   * The recomputed head at every sealed seq. An anchor is a statement about the history up
   * to ITS OWN seq, so comparing it against the final head (what this file did until
   * 2026-09-03) reports DIFFERS for every mid-chain anchor against an honest chain -- a
   * false accusation, and the reason "an earlier anchor pins the history before it" had no
   * mechanism under it. Reported from outside by a reader who ran the tool.
   */
  headBySeq: Map<number, string>;
  problems: ChainProblem[];
  ok: boolean;
}

/**
 * Recompute the chain over the SEALED events (those carrying chainSeq) and
 * confirm every stored link. Unsealed events are counted, not verified -- the
 * sealer runs periodically, so a fresh export may carry a sealed prefix and an
 * unsealed tail; reporting the split honestly beats pretending.
 */
export function verifyChain(events: ExportedEvent[]): ChainReport {
  const problems: ChainProblem[] = [];
  const headBySeq = new Map<number, string>();
  const sealed = events
    .filter((e) => typeof e.chainSeq === 'number')
    .sort((a, b) => (a.chainSeq as number) - (b.chainSeq as number));
  const unsealed = events.length - sealed.length;

  let prevHash = GENESIS;
  let prevSeq = 0;
  let prevOrderKey = '';
  for (const e of sealed) {
    const seq = e.chainSeq as number;
    if (typeof e.hash !== 'string' || typeof e.prevHash !== 'string') {
      problems.push({
        chainSeq: seq,
        eventId: e.id,
        kind: 'missing-chain-fields',
        detail: 'sealed event lacks stored hash/prevHash',
      });
      continue;
    }
    if (seq !== prevSeq + 1) {
      problems.push({
        chainSeq: seq,
        eventId: e.id,
        kind: 'seq-gap',
        detail:
          'expected chainSeq ' +
          (prevSeq + 1) +
          ', found ' +
          seq +
          ' -- a gap in the sealed sequence is a deleted or withheld record',
      });
    }
    if (e.prevHash !== prevHash) {
      problems.push({
        chainSeq: seq,
        eventId: e.id,
        kind: 'prevHash-mismatch',
        detail: 'stored prevHash does not match the prior link',
      });
    }
    const recomputed = eventHash(e.prevHash, e);
    if (recomputed !== e.hash) {
      problems.push({
        chainSeq: seq,
        eventId: e.id,
        kind: 'hash-mismatch',
        detail:
          'recomputed ' +
          recomputed.slice(0, 12) +
          '..., stored ' +
          String(e.hash).slice(0, 12) +
          '... -- the event content does not match its seal',
      });
    }
    const orderKey = String(e.timestamp ?? '') + ' ' + String(e.id ?? '');
    if (orderKey < prevOrderKey) {
      problems.push({
        chainSeq: seq,
        eventId: e.id,
        kind: 'order-violation',
        detail: 'sealed order does not follow (timestamp, id) ascending',
      });
    }
    prevOrderKey = orderKey;
    prevHash = e.hash;
    prevSeq = seq;
    headBySeq.set(seq, e.hash);
  }

  return {
    accountId: (events[0]?.accountId as string) ?? undefined,
    sealedEvents: sealed.length,
    unsealedEvents: unsealed,
    recomputedHead: sealed.length ? prevHash : undefined,
    headBySeq,
    problems,
    ok: problems.length === 0,
  };
}

export interface AnchorHead {
  seq?: number;
  headHash?: string;
  sig?: string;
}
export interface AnchorFile {
  anchoredAt?: string;
  accounts?: number;
  heads?: Record<string, AnchorHead>;
  note?: string;
  signature?: string;
}

export interface AnchorReport {
  anchoredAt: string | undefined;
  anchoredHead: string | undefined;
  matches: boolean | undefined;
  detail: string;
}

/**
 * SS7 step 3: compare the recomputed head against an external anchor. The
 * anchor's HMAC signature is NOT verified (symmetric -- see module doc); the
 * caller's trust in the anchor comes from the write-once store it was fetched
 * from, and that provenance is the caller's to establish.
 */
export function checkAnchor(
  report: ChainReport,
  anchor: AnchorFile,
  accountId: string,
): AnchorReport {
  const head = anchor.heads?.[accountId];
  if (!head) {
    return {
      anchoredAt: anchor.anchoredAt,
      anchoredHead: undefined,
      matches: undefined,
      detail: 'anchor contains no head for account ' + accountId,
    };
  }
  if (!report.recomputedHead) {
    return {
      anchoredAt: anchor.anchoredAt,
      anchoredHead: head.headHash,
      matches: undefined,
      detail: 'no sealed events were recomputed; nothing to compare',
    };
  }
  // Compare at the anchor's OWN seq. An anchor at seq 3 says nothing about seq 5, and
  // an honest chain that has simply grown past its last anchor is not a mismatch.
  if (typeof head.seq === 'number') {
    const at = report.headBySeq.get(head.seq);
    if (at === undefined) {
      // The export does not reach the anchored seq. This is a FAILURE, not an
      // inconclusive: dropping a record and re-sealing the remainder produces exactly
      // this shape, and 'export a fuller range' is advice offered to the one party
      // guaranteed not to take it.
      return {
        anchoredAt: anchor.anchoredAt,
        anchoredHead: head.headHash,
        matches: false,
        detail:
          'anchor covers chainSeq ' +
          head.seq +
          ', export reaches only ' +
          report.sealedEvents +
          ' sealed events -- an export that cannot reach its own anchor is NOT anchor-verified',
      };
    }
    const matchesAtSeq = head.headHash === at;
    return {
      anchoredAt: anchor.anchoredAt,
      anchoredHead: head.headHash,
      matches: matchesAtSeq,
      detail: matchesAtSeq
        ? 'recomputed head at chainSeq ' + head.seq + ' equals the anchored head'
        : 'recomputed head at chainSeq ' + head.seq + ' DIFFERS from the anchored head',
    };
  }
  // A seq-less anchor can only be read against the final head.
  const matches = head.headHash === report.recomputedHead;
  return {
    anchoredAt: anchor.anchoredAt,
    anchoredHead: head.headHash,
    matches,
    detail: matches
      ? 'recomputed head equals the anchored head (anchor carries no seq)'
      : 'recomputed head DIFFERS from the anchored head (anchor carries no seq)',
  };
}
