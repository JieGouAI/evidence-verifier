/**
 * Canonicalization and chain hashing, implemented INDEPENDENTLY from the
 * published specification -- JieGou Evidence Schema v1.1, SS6.1-6.3 -- not from
 * the operator's source code. That independence is the point: this package
 * verifying the operator's exports is only meaningful if it does not share the
 * operator's implementation. Conformance is demonstrated by reproducing the
 * schema's golden test vector (SS6.4); a cross-implementation agreement test in
 * the operator's own CI holds the two implementations equal over many events.
 */
import { createHash } from 'node:crypto';

/** SS6.3: the first event's prevHash -- 64 ASCII zeros. */
export const GENESIS = '0'.repeat(64);

/**
 * SS6.1 -- deterministic JSON:
 * - null and non-objects: JSON.stringify(value ?? null)
 * - arrays: members recursively, joined by ",", wrapped in []
 * - objects: keys sorted lexicographically; key:value pairs joined by ",",
 *   wrapped in {} -- no whitespace anywhere.
 */
export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
    .join(',')}}`;
}

/** The SS6.2 base fields. Ordering is normalized by SS6.1 regardless. */
const BASE_FIELDS = [
  'accountId',
  'actorId',
  'actorEmail',
  'action',
  'resourceType',
  'resourceId',
  'resourceName',
  'before',
  'after',
  'metadata',
  'agentContext',
  'timestamp',
] as const;

/** Minimal structural type for an exported audit event. Unknown fields are tolerated. */
export interface ExportedEvent {
  [k: string]: unknown;
  id?: string;
  accountId?: string;
  timestamp?: string;
  chainSeq?: number;
  prevHash?: string;
  hash?: string;
  model?: unknown;
  onBehalf?: unknown;
}

/**
 * SS6.2 -- canonical event: the 12-field base with absent -> null, plus model
 * and onBehalf included only when present; the whole object stable-stringified.
 * id, signature, sigVersion, canonicalVersion, impersonated, chainSeq,
 * prevHash and hash are NOT part of the canonical form.
 */
export function canonicalizeEvent(e: ExportedEvent): string {
  const base: Record<string, unknown> = {};
  for (const f of BASE_FIELDS) base[f] = e[f] ?? null;
  if (e.model != null) base.model = e.model;
  if (e.onBehalf != null) base.onBehalf = e.onBehalf;
  return stableStringify(base);
}

/** SS6.3 -- lowercase-hex SHA-256 over UTF-8 of prevHash + "\n" + canonical(event). */
export function eventHash(prevHash: string, e: ExportedEvent): string {
  return createHash('sha256').update(`${prevHash}\n${canonicalizeEvent(e)}`, 'utf8').digest('hex');
}
