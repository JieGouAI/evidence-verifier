# Audit Coverage Census — public summary

JieGou publishes not only what its audit layer covers, but a census of what it does **not**
yet cover — because a coverage claim with no stated remainder is unfalsifiable.

## Method

Static source analysis over one source graph. A route is *audited-direct* when its handler
calls the audit logger; *audited-via-module* when it imports a server module whose transitive
import closure calls it; *none-visible* otherwise. **None-visible means not visible to this
scan — not proven-unaudited.** Dynamic imports and aliased calls are invisible to it.

## Summary (as of 2026-08-24)

| Measure | Count |
|---|---|
| Server modules scanned | 935 |
| Modules in the audited closure | 330 |
| API route handlers | 1005 |
| audited-direct | 206 |
| audited-via-module | 725 |
| none-visible | 74 |
| Mutation routes (POST/PUT/DELETE/PATCH) | 688 |
| **Mutation routes with no visible audit path (the ratchet)** | **52** |

## The ratchet

The 52-route list is DEBT, tracked internally route-by-route: each entry either genuinely
lacks auditing (gets fixed) or audits through a path the scan cannot see (the scan gets
taught, or a direct call is added). **A CI test fails the build if the list grows** — new
mutation routes must arrive audited. The number is only allowed to shrink, and this file is
regenerated when it does.

The per-route list is not published: enumerating exactly which mutation endpoints lack a
visible audit path would be a finding-shaped disclosure, and this census exists to bound a
claim, not to map an attack surface. The number, the method, and the shrink-only rule are
the auditable parts; a customer's auditor can request the list under NDA.

## What this bounds — and what it doesn't

Together with the [Evidence Schema](EVIDENCE-SCHEMA-v1.md) and this verifier, the census
addresses **completeness** by publishing the known remainder. It does not address
**re-execution** (independently re-running the operation to check the recorded outcome) —
per the schema's own "what these records do and do not prove" section, the verifier signs
only that *the operator's records are internally consistent with the claim*.
