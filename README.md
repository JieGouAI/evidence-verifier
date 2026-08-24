# evidence-verifier

Independent verifier for JieGou audit-evidence exports. It recomputes the
tamper-evident hash chain from the raw events and compares the result against
externally anchored chain heads -- implementing the **outsider verification
procedure** of the published [JieGou Evidence Schema](docs/EVIDENCE-SCHEMA-v1.md) (v1.1, SS6-7).

**Zero runtime dependencies, zero JieGou code.** The canonicalization and hash
logic in `src/canonical.ts` is implemented from the schema's published text,
not from the operator's source -- and conformance is demonstrated by
reproducing the schema's golden test vector (SS6.4). If you do not trust the
operator, you should not have to trust the operator's verifier either; this
package is small enough to read in one sitting, and that is deliberate.

## Usage

```
evidence-verifier --export events.json --account <accountId> [--anchor anchor.json]
```

- `--export` -- a JSON export of audit events (an array, or `{ "events": [...] }`)
- `--account` -- the account whose chain to verify
- `--anchor` -- optionally, an anchor object fetched from the write-once store
  (`anchors/<timestamp>.json` or `heads-latest.json`)

Exit codes: `0` verified (and anchor matched, if given) - `1` problems found -
`2` could not compare (e.g. anchor covers a longer range than the export) -
`3` usage/input error.

## What a clean run establishes -- and what it does not

A clean run establishes, without any trust in the operator's tooling:

- **Integrity:** no sealed event was altered, deleted, or reordered after
  sealing (the chain recomputes, link by link, from a 64-zero genesis).
- **Anchor agreement:** the recomputed head equals a head the operator anchored
  to a write-once store at a known time -- so the history you verified is the
  history that existed then, unalterable since even by the operator.

It does **not** establish:

- **Completeness.** The chain proves the records that exist are intact. It
  cannot prove every action produced a record.
- **Verdict correctness.** A recorded policy check asserts it ran; its inputs
  are not yet sealed alongside it, so it cannot be re-executed here.
- **Signature validity.** All signatures in the format are symmetric HMACs;
  an outsider cannot verify them and this tool honestly does not try. Your
  trust in the anchor comes from the write-once property of the store you
  fetched it from.

This mirrors section 3 of the schema. If a verifier ever claims more than
this, distrust the claim first.

## Provenance

Developed in the JieGou monorepo and mirrored here; the schema copy in `docs/` is the
published version the monorepo drift-gates against its canonical source. Issues and PRs
are welcome on this repository.

## License

Apache-2.0. See [LICENSE](LICENSE).
