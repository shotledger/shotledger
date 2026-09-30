# ADR 0005: No perfect client-authenticity control once the client is open source

Status: accepted (2026-09-02)

## Context

ADR 0004 chose AGPL specifically so a hosted fork of the sync backend
owes its changes back (ADR 0017 has since put the backend under the
Elastic License 2.0 and kept the app under AGPL). That is a license
question. It does not answer a
different, purely technical one: can the backend actually tell whether a
request came from the real ShotLedger app or from someone else's client
calling the same API? This record exists so the AGPL decision is never
misread as "nobody else can ever call the backend."

## Decision

**No perfect technical control exists once the client is open source.**
Any secret embedded in an AGPL client is readable by definition — there
is no way to ship a client-side check that a determined attacker cannot
extract or bypass.

Two real levers exist, neither of which is a license question:

1. **Play Integrity API / App Attest** to reject requests from a
   re-signed or rooted/emulated client — real, but store-distribution-only
   and not airtight against a determined attacker. Both are proprietary
   platform libraries; linking them into the AGPL app is covered by the
   platform-libraries permission in
   `LICENSES/LicenseRef-ShotLedger-AGPL-Permissions.txt` (ADR 0017).
2. **Per-account auth plus Workers rate limits/quotas** (`better-auth`,
   already planned) to bound cost and abuse regardless of which client
   calls in.

No implementation changed as a result of this decision — it is a
boundary statement, not a feature.

## Consequences

- Backend design bounds cost and abuse via auth and rate limits rather
  than trying to authenticate the client binary itself.
- Attestation (lever 1) is a future hardening option, not a dependency
  of shipping sync at all.
