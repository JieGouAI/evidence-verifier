#!/usr/bin/env node
/**
 * evidence-verifier -- verify a JieGou audit export against the published
 * Evidence Schema (v1.1) and, optionally, an external WORM anchor.
 *
 *   evidence-verifier --export events.json --account <accountId> [--anchor anchor.json]
 *
 * Exit codes: 0 = verified (and anchor matched, if given); 1 = problems found;
 * 2 = could not compare (e.g. anchor range mismatch); 3 = usage/input error.
 */
import { readFileSync } from 'node:fs';
import { verifyChain, checkAnchor, type AnchorFile } from './verify.js';
import type { ExportedEvent } from './canonical.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const exportPath = arg('export');
const accountId = arg('account');
const anchorPath = arg('anchor');
if (!exportPath || !accountId) {
  console.error(
    'usage: evidence-verifier --export <events.json> --account <accountId> [--anchor <anchor.json>]',
  );
  process.exit(3);
}

let events: ExportedEvent[];
try {
  const raw = JSON.parse(readFileSync(exportPath, 'utf8')) as unknown;
  events = Array.isArray(raw)
    ? (raw as ExportedEvent[])
    : ((raw as { events?: ExportedEvent[] }).events ?? []);
} catch (err) {
  console.error('could not read export:', err instanceof Error ? err.message : String(err));
  process.exit(3);
}

const scoped = events.filter((e) => e.accountId === accountId);
const report = verifyChain(scoped);
console.log('account          :', accountId);
console.log('events in export :', scoped.length, '(' + report.unsealedEvents + ' unsealed)');
console.log('sealed verified  :', report.sealedEvents);
console.log('recomputed head  :', report.recomputedHead ?? '(none)');
for (const p of report.problems) {
  console.log('PROBLEM [' + p.kind + '] seq=' + p.chainSeq + ' id=' + p.eventId + ': ' + p.detail);
}
console.log('chain            :', report.ok ? 'VERIFIED' : report.problems.length + ' problem(s)');

let exit = report.ok ? 0 : 1;
if (anchorPath) {
  let anchor: AnchorFile;
  try {
    anchor = JSON.parse(readFileSync(anchorPath, 'utf8')) as AnchorFile;
  } catch (err) {
    console.error('could not read anchor:', err instanceof Error ? err.message : String(err));
    process.exit(3);
  }
  const a = checkAnchor(report, anchor, accountId);
  console.log('anchor (' + (a.anchoredAt ?? 'unknown time') + '):', a.detail);
  if (a.matches === false) exit = 1;
  else if (a.matches === undefined && exit === 0) exit = 2;
}
console.log(
  'NOTE: this tool establishes integrity and anchor agreement only. It cannot establish',
);
console.log(
  'completeness (that every action produced a record) or verdict correctness -- see the',
);
console.log('Evidence Schema, section 3, for the honest boundary.');
process.exit(exit);
