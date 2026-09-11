# ADR 0010: External sites are providers, not one hardcoded integration

Status: accepted (2026-09-11)

## Context

Webshooter was built as _the_ external integration: `shared/integrations/webshooter/`,
a Webshooter section on Tools, Webshooter routes, and a connection flow
that knows it is talking to webshooter.se. `docs/specs/webshooter-integration-spec.md`
is written the same way.

Webshooter is not the only site Swedish shooters use. pistol.nu is the
obvious next one, and the maintainer expects more. Each exposes a
different subset — one may offer results and start lists, another only
results, another statistics we do not compute ourselves — and each has
its own auth. Adding the second one to the current shape means either a
second parallel stack or a pile of `if (site === …)`.

The maintainer also asked for the split between **connecting** to a site
and **using** it: connection belongs in Settings, use belongs in Tools,
and Tools should stay clean when a site is not enabled.

## Decision

**An external site is a provider: a descriptor declaring what it can do,
plus an implementation of the capabilities it declares.**

- `shared/src/integrations/providers/` holds the registry and the
  provider-facing types. `webshooter/` becomes provider #1 and is
  otherwise unchanged.
- A provider declares **capabilities** (`importResults`, `myStarts`,
  `stats`, …). The UI renders from that declaration. A site that cannot
  do start lists shows no start-list row — it does not show a row that
  fails.
- **Enablement and connection are separate.** A provider is enabled
  (the shooter wants it) and then connected (credentials accepted). Both
  live in Settings, per provider. Tools shows a provider only when it is
  enabled, which is what keeps Tools clean.
- Credentials stay **per provider** in `expo-secure-store`, never in the
  database, never synced, and never shared between providers.

### Why capabilities rather than one interface with optional methods

An optional method is discovered at call time; a declared capability is
discovered at render time. The difference is whether an unsupported
feature is a disabled button or an error message. It also keeps the
"functionality will of course differ depending on the external site"
requirement in data, where it can be read, rather than spread across
screens.

### Why not a plugin system

Providers are compiled in. There is no download path, no third-party
code, and no dynamic loading — the security and review story of a
plugin system buys nothing here, since every provider ships in the APK
and is reviewed like any other code.

## Consequences

- `docs/specs/webshooter-integration-spec.md` and `-app-spec.md` remain
  correct about Webshooter's API and semantics; their framing of
  Webshooter as _the_ integration is superseded by this ADR.
- The second provider is an implementation plus a descriptor, not a
  refactor. That is the whole point, and it is the claim to check when
  pistol.nu lands.
- pistol.nu is **not** implemented here. Nothing is known yet about
  whether it has an API at all, and guessing its shape would bake a
  wrong assumption into the abstraction.
