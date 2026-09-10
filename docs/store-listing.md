# Store listing draft (Google Play)

Grounded in `app/PRODUCT.md`'s Positioning section. **Written when v1 had
no camera/photo-based target scoring** — phase 1 of photo scoring has
since shipped (tap-to-mark, assisted not automatic; see
`app/PRODUCT.md`'s Capabilities and Constraints), so the framing below
is stale on that point and this listing wants a copy pass before
submission, not just a citation fix.

**Title tension to resolve (not silently changed here):** the chosen
store title is _"ShotLedger — Target Shooting Log & Scoring"_. The word
"Scoring" reads naturally today because manual score entry ships in
v1 — but it also risks implying the camera-based photo scoring
positioning point, which was v2-only when this was written and is now
partially shipped. VERIFY with the maintainer whether the v1 listing
should keep this title as-is (manual scoring is real and "Scoring" is
accurate for it) or use a v1-scoped variant. Both variants are drafted
below; pick one before submitting.

---

## English

**Title (as decided, see `docs/decisions-log-archive.md`):**
ShotLedger — Target Shooting Log & Scoring

**Title (v1-scoped alternative, VERIFY which to use):**
ShotLedger — Target Shooting Log

**Short description** (max 80 chars):
Free target-shooting logbook: scores, stats, firearms, ammo, no account.

**Full description:**

ShotLedger is a free, offline-first logbook for target shooters. Log
training and competition sessions with a fast per-shot keypad — integer
or decimal scoring, 5/6/10-shot or custom series, running totals as you
shoot.

**Track your gear.** Keep an inventory of firearms and ammo lots,
automatic round counters, maintenance interval reminders, and license
expiry reminders.

**See your progress.** Filter by period, session type, discipline or
tags and get a report generated on the spot — trends over time,
per-firearm and per-ammo comparisons, mean and standard deviation,
best/worst series, and how your last sessions compare to your history.
Nothing is saved as a stale document; it is always computed fresh from
what matches right now.

**Built for Swedish shooters.** A rolling activity barometer tracks your
logged sessions against the FAP 551-3 licensing requirement, and exports
a PDF formatted for license applications and föreningsintyg.

**Your data is yours.** Everything lives on your device in a local
database. CSV export and import are always available — no lock-in, no
required account, no subscription. ShotLedger is free; if you'd like to
support development, there's an optional donation link in Settings that
unlocks nothing (paid features do not exist in this app).

Currently supports SPSF disciplines (precision and militär snabbmatch)
plus free-form training. Android only for now.

---

## Svenska

**Titel (enligt `docs/decisions-log-archive.md`):**
ShotLedger — Skytteloggbok & Poängräkning

**Titel (v1-anpassat alternativ, VERIFIERA vilken som ska användas):**
ShotLedger — Skytteloggbok

**Kort beskrivning** (max 80 tecken):
Gratis skytteloggbok: resultat, statistik, vapen, ammunition, inget konto.

**Fullständig beskrivning:**

ShotLedger är en gratis, offline-first loggbok för målskyttar. Logga
tränings- och tävlingspass med ett snabbt knappsatsgränssnitt per skott —
heltals- eller decimalpoäng, serier om 5/6/10 skott eller valfri längd,
löpande totalsumma medan du skjuter.

**Håll koll på din utrustning.** Registrera vapen och ammunitionspartier,
automatisk skotträknare, påminnelser om underhållsintervall och
påminnelser om licensförnyelse.

**Se din utveckling.** Filtrera på period, passtyp, gren eller taggar
och få en rapport genererad direkt — trender över tid, jämförelser per
vapen och ammunition, medelvärde och standardavvikelse, bästa/sämsta
serie, och hur dina senaste pass står sig mot historiken. Inget sparas
som ett inaktuellt dokument; allt räknas fram på nytt utifrån det som
matchar just nu.

**Byggd för svenska skyttar.** En rullande aktivitetsbarometer följer
dina loggade pass mot FAP 551-3:s aktivitetskrav och exporterar en PDF
formaterad för licensansökningar och föreningsintyg.

**Din data är din.** Allt lagras lokalt på din enhet. CSV-export och
-import finns alltid tillgängligt — ingen inlåsning, inget obligatoriskt
konto, ingen prenumeration. ShotLedger är gratis; vill du stötta
utvecklingen finns en frivillig donationslänk under Inställningar som
inte låser upp något (appen har inga betalfunktioner).

Stödjer för närvarande SPSF-grenar (precision och militär snabbmatch)
samt fri träning. Endast Android tills vidare.

---

## Assets (VERIFY — not produced for this draft)

- App icon: placeholder generated programmatically in this branch
  (`app/assets/images/icon.png`) — Purple Rain concentric-ring motif, not
  store-launch quality; VERIFY before submission.
- Feature graphic (1024×500): not produced.
- Phone screenshots (min. 2, Play Console requirement): not produced —
  capture from a real device/emulator run before submission.
- Privacy policy URL: not produced. VERIFY — required by Play Console
  even for a no-account, fully local-storage app; a short static page
  describing "no data leaves the device" is likely sufficient. The domain
  is no longer the blocker: `shotledger.app` was registered 2026-09-06
  (decisions log), so what remains is writing and hosting the page.
