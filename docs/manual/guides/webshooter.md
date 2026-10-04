# Webshooter

[Webshooter.se](https://webshooter.se/) is SPSF's competition system —
entries, start lists and official results. ShotLedger can read your own data
from it.

**Settings → External Sites → Webshooter.** Turn it on, then connect. It
appears under Tools once it is on, and if you have not signed in yet, that
screen links you back here.

## Connecting

Two ways:

- **Your Webshooter password.** Sent once, straight from your phone to
  webshooter.se, and never stored. Only the token it returns is kept, in the
  phone's secure storage.
- **A personal API token**, pasted in, if you have one.

Nothing goes through any ShotLedger server. There is no ShotLedger server in
this path at all.

Once connected the app resolves your **shooting card number**, which is what
identifies your entries and results among everyone else's.

## My Starts

**Tools → Webshooter → My Starts** lists every upcoming competition you have
entered — including ones where the patrols have not been drawn yet.

Each start shows its squad, lane, weapon class and venue. Tap the competition
to see your club mates' start times; tap the start itself to see your whole
squad, your own line highlighted.

### Adding a start to your calendar

**Add to Calendar** writes the start into the calendar you choose in Settings,
and the confirmation names which one.

The entry follows the competition's own progress:

- **Before the draw** it is an **all-day** entry marked **free** — it shows
  that you are entered without blocking the day for anyone checking your
  availability, because you do not yet know which two hours you are busy.
- **Once start times are published** the same entry becomes a **timed, busy**
  event. It is updated in place rather than added a second time.

Entries already in your calendar are brought up to date whenever you open My
Starts. The app never creates an entry you did not add yourself, and if it
cannot update one it says so on the row rather than leaving it quietly wrong.

!!! note "The squad number is worked out, not given"

    Webshooter's data carries no squad number — only an internal patrol id that
    means nothing to a shooter. The number shown is derived from the order the
    patrols shoot in. It should match the start list; if it ever does not, that
    is why.

## Importing results

**Tools → Webshooter → Import Results** lists past competitions where you have
a result. Signing up is not the same as shooting: a no-show or a DNF leaves an
entry and nothing to import, so those are not offered.

Precision and milsnabb come in as one total per series; Webshooter does not
keep the individual shots. Each series still counts its shots as fired — in
Shots Logged, the ammunition lot and the firearm's round counter. Fältskjutning and poängfält come in **station by
station** — hits, figures hit and any poängmål points, with shoot-off stations
kept but left out of the total — and show as the result mode the competition
used. A fält result whose station numbers could not have happened, such as
seven hits on one station, is shown as not importable rather than corrected.

Checking that costs one request per competition, so the app scans **one year at
a time**, remembers what it found, and does not re-scan on every visit. Each
screen shows when its data was last fetched, and **Refresh** is how you ask for
new data.

That restraint is deliberate. Webshooter is someone else's server, and it
answers some requests with errors already.

## Records

**Settings → Records** shows your personal bests, computed entirely from the
sessions on this device — imported and hand-logged alike. Nothing is fetched to
build it.

There are two sets, because they answer different questions:

- **Official bests** apply the competition rules: a precision result counts
  only with all seven grundomgång series, a milsnabb result only with all
  twelve. A training session, or a competition you logged partly, is not an
  official best however good the score.
- **Your own bests** ignore all of that and look at every session you logged —
  best five series, best ten, best whole session.
- **Fältskjutning bests** are kept per weapon group and **number of stations
  that counted**, because hits out of eight stations and out of ten are not
  the same scale. A ten-station championship with two stations scratched is an
  eight-station result and competes with your kretsfält rounds. Rounds are
  ranked the way SHB places them — hits, then figures — and poängfält rounds
  are kept apart, by their points. Tap a best to open the session.

Bests are grouped by **discipline and weapon group**. Your shooter class is not
part of it: moving from klass 2 to klass 3 does not reset your best with a gun.

!!! note "Every figure says what it was computed from"

    Under each heading is a line like *"Computed from 41 of your 267
    sessions."* Records that qualify are a fraction of what you shoot, and a
    best computed from part of your history is only meaningful if you can see
    how much of it was used.

    Sessions with **no weapon group** recorded are listed under *No weapon
    group* rather than dropped. That is common after importing older history,
    where the source often did not record one.
