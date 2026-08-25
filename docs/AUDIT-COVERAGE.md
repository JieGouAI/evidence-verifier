# Audit Coverage Census — public summary

JieGou publishes not only what its audit layer covers, but a census of what it does **not**
yet cover — because a coverage claim with no stated remainder is unfalsifiable.

## Method

Static source analysis over one source graph. A route is *audited-direct* when its handler
calls the audit logger; *audited-via-module* when it imports a server module whose transitive
import closure calls it; *none-visible* otherwise. **None-visible means not visible to this
scan — not proven-unaudited.** Dynamic imports and aliased calls are invisible to it.

## Summary (as of 2026-08-25)

| Measure | Count |
|---|---|
| Server modules scanned | 935 |
| API route handlers | 1005 |
| Mutation routes (POST/PUT/DELETE/PATCH) | 688 |
| **Mutation routes with no visible audit path (the ratchet)** | **0** |
| Declared exemptions (each with a stated public reason) | 19 |

**2026-08-25:** the census published at 52 on 08-24; the ratchet reached **zero** the next
day — every entry either gained a real audit call at its mutation, was covered by teaching
the scan to follow lazy imports (a source-visible edge it wrongly ignored), or was moved to
a *declared exemption* with a stated reason (pre-account auth utilities, telemetry beats,
audit transport, derived-cache regeneration, deprecated tombstones). Exemptions are
reviewed in the PR that adds them, rendered in the full census, and a CI test fails on any
exemption that stops matching reality — the list cannot silently rot into an escape hatch.

## The ratchet

The ratchet list is DEBT, tracked internally route-by-route: each entry either genuinely
lacks auditing (gets fixed) or audits through a path the scan cannot see (the scan gets
taught, or a direct call is added). **A CI test fails the build if the list grows** — new
mutation routes must arrive audited. The number is only allowed to shrink, and this file is
regenerated when it does. It is currently zero, which is a statement about *visible audit
paths*, not a proof of perfect coverage — the method section above says exactly what the
scan can and cannot see.

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
