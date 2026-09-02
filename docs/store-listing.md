# Store listing draft (Google Play)

Grounded in `plan.md`'s Positioning section. **v1 has no camera/photo-based
target scoring** — that is a v2 feature (`plan.md` roadmap, "v2 — the
camera + sync"). None of the copy below describes photo scoring; it
describes what v1 actually ships: fast score logging, statistics,
firearms/ammo tracking, the Swedish FAP 551-3 activity barometer, and CSV
export/import.

**Title tension to resolve (not silently changed here):** `plan.md`'s
chosen store title is *"ShotLedger — Target Shooting Log & Scoring"*. The
word "Scoring" reads naturally today because manual score entry ships in
v1 — but it also risks implying the camera-based photo scoring positioning
point (`plan.md` Positioning §2), which is v2-only. VERIFY with the
maintainer whether the v1 listing should keep this title as-is (manual
scoring is real and "Scoring" is accurate for it) or use a v1-scoped
variant until photo scoring ships. Both variants are drafted below; pick
one before submitting.

---

## English

**Title (as decided in plan.md):**
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

**See your progress.** Always-visible statistics — trends over time,
per-firearm and per-ammo comparisons, mean and standard deviation,
best/worst series, and how your last sessions compare to your history.
No "generate report" step: the numbers are just there.

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

**Titel (enligt plan.md):**
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

**Se din utveckling.** Alltid synlig statistik — trender över tid,
jämförelser per vapen och ammunition, medelvärde och standardavvikelse,
bästa/sämsta serie, och hur dina senaste pass står sig mot historiken.
Inget "generera rapport"-steg — siffrorna finns bara där.

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
  describing "no data leaves the device" is likely sufficient once the
  domain (`shotledger.app`, `plan.md` Open section) is registered.
