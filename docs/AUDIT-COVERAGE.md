<!-- GENERATED from the monorepo's audit-coverage scan (the same source that
     generates the internal census) -- do not edit by hand. Drift between this file
     and the internal census fails the monorepo's build. -->

# Audit Coverage Census — public summary

JieGou publishes not only what its audit layer covers, but a census of what it does **not**
yet cover — because a coverage claim with no stated remainder is unfalsifiable.

## Method

Static source analysis over one source graph. A route is *audited-direct* when its handler
calls the audit logger; *audited-via-module* when it imports a server module whose transitive
import closure calls it; *none-visible* otherwise. **None-visible means not visible to this
scan — not proven-unaudited.** Dynamic imports and aliased calls are invisible to it.

## Summary

| Measure | Count |
|---|---|
| Server modules scanned | 939 |
| Modules in the audited closure | 365 |
| API route handlers | 1009 |
| audited-direct | 212 |
| audited-via-module | 756 |
| none-visible | 41 |
| Mutation routes (POST/PUT/DELETE/PATCH) | 692 |
| **Mutation routes with no visible audit path (the ratchet)** | **0** |
| Declared exemptions (reviewed, reasons published below) | 19 |

## The ratchet

The uncovered-mutation list is DEBT, tracked internally route-by-route: each entry either
genuinely lacks auditing (gets fixed) or audits through a path the scan cannot see (the scan
gets taught, or a direct call is added). **A CI test fails the build if the list grows** — new
mutation routes must arrive audited. The number is only allowed to shrink, and this file is
regenerated when it does.

**The list is currently empty.** Every mutation route is audited, audits through a scanned
path, or carries a declared exemption with a reviewed reason (below).

The per-route list is not published when non-empty: enumerating exactly which mutation
endpoints lack a visible audit path would be a finding-shaped disclosure, and this census
exists to bound a claim, not to map an attack surface. The number, the method, and the
shrink-only rule are the auditable parts; a customer's auditor can request the list under NDA.

## Declared exemptions (19)

Mutation-method routes that deliberately carry no audit call, each with a reviewed reason —
the honest form of "covered." An exemption without a defensible reason is debt, not coverage;
the reasons are published so the reader can judge them.

- `/api/auth/extension-oauth` — pre-account OAuth code-for-token proxy (extension can't hold client secrets); exchanges with the provider, persists no tenant state — an audit event would have to fabricate account context
- `/api/auth/extension-sso` — pre-account SSO redirect initiator; pure navigation, no state written
- `/api/auth/send-verification` — pre-account branded verification email; Firebase owns the auth record, we persist nothing
- `/api/governance-assessment/public` — stateless public scoring (rate-limited lead magnet); computes and returns, writes nothing
- `/api/hybrid-agents/[id]/heartbeat` — operational telemetry at ~30-60s cadence; auditing each beat is noise that buries signal — agent lifecycle changes (register/rotate/revoke/disable) are audited at their mutations
- `/api/hybrid-agents/[id]/manifest` — seat skill-inventory telemetry, refreshed on every substrate pull; same noise class as heartbeat
- `/api/mcp/audit-flush` — audit TRANSPORT: batch-persists pre-formed MCP audit events — its writes ARE audit records; wrapping the audit pipe in logAuditEvent would be recursion, not coverage
- `/api/mcp/validate-key` — internal key-validity check for the MCP server (shared-secret auth); read-only despite POST
- `/api/ollama/models` — proxy to the customer's own Ollama endpoint (BYO infra); no JieGou tenant state touched
- `/api/ollama/pull` — proxy to the customer's own Ollama endpoint (BYO infra); no JieGou tenant state touched
- `/api/video/analyze` — deprecated tombstone — returns 410 Gone unconditionally
- `/api/video/split` — deprecated tombstone — returns 410 Gone unconditionally
- `/api/schedules/warmup-pskin` — Redis cache pre-warm for the PSkin schedule viewer — regenerates a derived cache from Google Sheets; no source-of-truth state changes
- `/api/internal/msp-tenant/health-check` — health-check sweep — dispatches connection-test jobs and records status telemetry; the connection CHANGES it may reveal are audited where they are acted on
- `/api/managed-agent-conversations/expire-stale` — TTL housekeeping — archives idle Anthropic sessions and clears stale pointers; no customer-visible decision or content is created or destroyed
- `/api/insights/compute-daily` — derived-analytics cache regeneration (daily rollup of existing audited events); auditing recomputation of derived data is noise, not coverage
- `/api/portal/intelligence/aggregate` — derived cross-client aggregation cache (hourly); same derived-data class as insights/compute-daily
- `/api/managed-agent-costs/rollup-daily` — derived cost rollup — aggregates already-recorded session costs into one doc/account/day; the spend itself is recorded at usage time
- `/api/webhooks/email/ses` — inbound email delivery/engagement telemetry (SES via EventBridge) — appends provider delivery/open/click events to an analytics collection; the SENDS being tracked are audited where they are made

## What this bounds — and what it doesn't

Together with the [Evidence Schema](EVIDENCE-SCHEMA-v1.md) and this verifier, the census
addresses **completeness** by publishing the known remainder. It does not address
**re-execution** (independently re-running the operation to check the recorded outcome) —
per the schema's own "what these records do and do not prove" section, the verifier signs
only that *the operator's records are internally consistent with the claim*.
