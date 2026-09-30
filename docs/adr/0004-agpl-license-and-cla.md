# ADR 0004: AGPL-3.0-or-later license with a contributor CLA

Status: superseded by ADR 0017 (2026-09-30); was accepted 2026-09-02

## Context

ShotLedger has an optional Cloudflare Workers sync backend. Plain GPL's
copyleft triggers only on distributing a binary — a hosted fork of the
backend would owe nothing back to the project. The license needs to
close that gap while staying real open source, and the maintainer needs
a path to dual-license or grant an App Store exception later without
every past contributor's individual sign-off.

## Decision

**AGPL-3.0-or-later**, once the repo goes public (still private, no
urgency), plus a **contributor CLA**.

AGPL §13 extends the copyleft trigger to network use, closing the gap
GPL leaves open. LGPL and a plain "noncommercial" framing were both
considered and rejected: LGPL is for libraries linked into other
programs — the opposite problem, since it exists to let proprietary
software depend on open code, and ShotLedger isn't a library. A literal
"commercial use only by the maintainer" clause exists (PolyForm
Noncommercial/Shield) but is source-available, not OSI open source, and
was rejected in favor of staying real open source.

The CLA — not the license itself — is what keeps the maintainer able to
dual-license or grant an App Store exception later: a copyright holder
is never bound by their own license, but becomes bound once a second
contributor's AGPL-covered patch lands without an assignment.

## Consequences

- No AGPL clause, on its own, can technically stop a third party from
  recompiling the open client and calling the backend directly — see
  ADR 0005, which covers that as a separate, non-license question.
- Contributors sign the CLA before a patch lands; this is a process gate
  on the repository, not a code change.
