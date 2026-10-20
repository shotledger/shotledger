<h1>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="branding/shotledger-horizontal-dark.svg">
    <img src="branding/shotledger-horizontal-light.svg" alt="ShotLedger" width="360">
  </picture>
</h1>

Target Shooting Log & Scoring — a donation-funded app for target
shooters: training and competition logging, camera-based target scoring,
and Swedish license compliance (FAP 551-3). Works offline; no account
required. Android first.

**The manual** (English and Swedish) is at
<https://shotledger.github.io/shotledger/>.

## Features

- **Session logging, shot by shot** — training and competition under SPSF,
  ISSF and SvSF programs, full match or free format, with sighters, finals
  and tags. Fältskjutning and poängfält are logged station by station, with
  shoot-offs. A session can instead record only the rounds fired.
- **Photo scoring** — photograph a paper target; the app solves the target
  face's geometry, suggests the holes, and you confirm or correct them.
  Group figures per series.
- **Firearms and ammunition** — round counters, maintenance intervals and
  notifications, handloads and ammunition lots, and a lot-versus-lot
  comparison.
- **License compliance** — the range activity Swedish firearm licensing asks
  for (FAP 551-3), per firearm, with licenses and license-card scanning.
- **Timers** — a shooting timer that sets a time limit, a start delay and
  repeats with rest between them, and can listen through the microphone to
  record when each shot was fired; the SPSF fälttimer, which calls the
  field-shooting commands with their real timings; and a stopwatch.
- **Statistics** — filtered reports with charts, personal records, a PDF
  session report and a shareable session card; every target photo in one
  searchable list.
- **External sites** — WebShooter: your starts, adding a start to the
  calendar, and importing your competition results.
- **Your data** — backup and restore, and session export and import as
  open JSON with a published schema.
- **Optional sync and web app** — an account syncs sessions, settings and
  target photos between devices. In the web app you can read your sessions
  and enter, edit, delete and bulk-edit them, with the same rules as on the
  phone.

English and Swedish throughout.

## Status

Not released yet. ShotLedger is not in Google Play.

## Privacy

Your logbook lives on your phone. No account is needed, and nothing leaves
the phone unless you turn on a feature that sends it, such as sync. The
manual's [Your data and privacy](https://shotledger.github.io/shotledger/reference/privacy/)
lists each one. The app is free; donations unlock nothing.

## License

The app is free software under the AGPL-3.0-or-later with additional
permissions; the sync server is under the Elastic License 2.0. See
[`LICENSE`](LICENSE).

The copyright holder also offers ShotLedger under separate commercial
licenses, for use without the public licenses' obligations. To ask about
one, open an issue or contact the maintainer.

## Contributing

Building, testing and the repository's rules are in
[`CONTRIBUTING.md`](CONTRIBUTING.md).
