# Contributing to ShotLedger

Thanks for helping. The working rules — branch per change, Conventional
Commits, the checks CI runs, the agentic loop — are in [`CLAUDE.md`](CLAUDE.md)
and apply to human contributors just as much. This file covers the part
`CLAUDE.md` does not: the terms your contribution arrives under.

Nothing in this file is legal advice.

## Which license your contribution is under

The repository holds works under more than one license; the root
[`LICENSE`](LICENSE) is the map and `REUSE.toml` is the per-file source of
truth. A contribution is licensed under the terms of the directory it lands in:

| Directory                          | Inbound terms                                                                                                                                                        |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backend/`                         | Elastic License 2.0 (`LICENSES/Elastic-2.0.txt`)                                                                                                                     |
| `app/`, `shared/`, everything else | AGPL-3.0-or-later (`LICENSES/AGPL-3.0-or-later.txt`) **together with** the section 7 additional permissions in `LICENSES/LicenseRef-ShotLedger-AGPL-Permissions.txt` |

"Together with" matters: a contribution to `app/` or `shared/` carries the
same app-store and platform-library permissions as the rest of the code, so
the project can keep shipping through the stores and keep linking Google ML
Kit without asking every contributor again.

Third-party code keeps its own license and is listed in
`app/src/constants/licenses.json` (bundled JavaScript) or
`app/src/constants/native-licenses.ts` (native artifacts). Adding a dependency
is a maintainer decision — see hard rule 2 in `CLAUDE.md`.

## Two things every contributor does

### 1. Sign off every commit (DCO)

Every commit carries a Developer Certificate of Origin sign-off:

```bash
git commit -s
```

The sign-off certifies what <https://developercertificate.org/> says: that you
wrote the change or have the right to submit it under the license of the files
you touched. Use your real name and a working email address. Commits without
a sign-off are not merged.

### 2. Sign the CLA once

Before your first pull request is merged you will be asked to agree to
[`CLA.md`](CLA.md). It is the Harmony Individual Contributor License Agreement
with outbound Option Five, which means:

- **You keep your copyright.** The CLA is a license to the maintainer, not an
  assignment.
- **The maintainer may license your contribution under other terms as well**
  — for example under the Elastic License 2.0 when `shared/` code is compiled
  into the backend, or under a future version of the additional permissions
  for a new store — and must always also offer it under the license the
  project used the day you submitted it.
- **Governing law is Sweden.**

What the CLA cannot do: withdraw a version already released. Every release
under the AGPL stays under the AGPL (section 2 of that license), and anyone
may keep using and forking it.

**Signing the CLA.** The signing mechanism (a CLA-assistant check on the pull
request, or a signatures file in the repository) is set up as part of the
go-public checklist, issue #100. Until it is live, agreeing in a pull-request
comment — "I have read CLA.md and agree to it" — under the name and email of
your sign-offs is what the maintainer will ask for.

## Code you did not write

If a contribution contains code, text, images or data that you did not author
yourself — copied from another project, generated with a tool from someone
else's material, or written by a colleague — say so in the pull request: what
it is, where it came from and under which license. It can only be accepted if
that license is compatible with the directory it lands in, and it must keep
its original notices. This is what the DCO's clause (b) and the CLA's
section 3(d) refer to.

Never contribute personal data of any kind — hard rule 7 in `CLAUDE.md` lists
what that covers.
