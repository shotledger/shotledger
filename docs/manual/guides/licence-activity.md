# Licence activity

Swedish firearm licence applications ask your club to certify that you have
been active on the range. The app keeps that record from the sessions you are
already logging.

**Settings → Compliance → Sweden (FAP 551-3)** turns it on. Left at **None**,
none of this appears — which is the right state outside Sweden.

## Licence Activity

Once on, the app counts the sessions you logged in the last **six months** and
compares that total with the requirement for your case.

The requirement comes from page 3 of Polismyndigheten's föreningsintyg form,
which sets two levels:

| Your case                                         | Paragraph | Requirement                                    | Over six months |
| ------------------------------------------------- | --------- | ---------------------------------------------- | --------------- |
| You do not yet hold a handgun for target shooting | 5 §       | on average at least **two** activities a month | **12**          |
| You already hold a handgun for target shooting    | 6 §       | on average at least **one** activity a month   | **6**           |

Training and competition count the same, as does representing your club at an
external competition. An activity is one logged session — not one series, and
not one day.

## Choosing your case

**Settings → Compliance → Activity Requirement** is where you say which of the
two applies to you. The app cannot work it out: it does not know what you
already hold a licence for.

New installs start on **First Handgun**, the stricter of the two. If you
already hold a handgun for target shooting, switch it — otherwise
Licence Activity asks twice as much of you as the rule does. The app never
changes this for you, and the case it is using is shown next to the status.

## "On average", precisely

The form says _sammantaget i genomsnitt_ — taken together, on average. The app
reads that as a total across the whole six-month window: twelve activities
somewhere in the six months satisfies 5 §, whether they were spread evenly or
not. It does not require a fixed number in every calendar month.

## What the app does not track

Three rules on the same form are **not** modelled here. If any of them applies
to you, work it out yourself:

- **An additional handgun** (_ytterligare enhandsvapen_): trained or competed
  at least twice in the last six months **with each handgun you already hold**.
  The app does not know which of your firearms you hold a licence for.
- **Renewing a time-limited permit** (_förnyelse av tidsbegränsat tillstånd_):
  trained or competed with the firearm in question at least four times a year
  over the last two years. The app does not record that a permit is
  time-limited.
- **Special reasons** (_särskilda skäl_ — illness, pregnancy, service abroad),
  which can excuse a gap in activity under 6 §. These are decided by the
  police on a separate attachment, not by you or your club, so the app does not
  offer to apply them.

## What counts, and what this is not

Licence Activity counts what you logged. A range visit you did not log is
not in it, and a session logged twice counts twice.

!!! warning "Your club and the police decide, not this app"

    The app counts sessions against a published requirement. It does not issue
    the intyg, and it has no view on whether your club will sign one or whether
    the police will grant the licence. Treat a green status as "the counting
    looks right", not as an approval.

## Getting it out

**Settings → Backup & Data** exports everything. A club-log PDF export also
exists for the summary a förening might ask for.

!!! note

    The PDF layout has not been checked against a real föreningsintyg. It was
    built to the specification rather than against a sample, so confirm it is
    acceptable before relying on it for a submission.

## Source

Polismyndigheten's form **PM 551.24 Föreningsintyg**, page 3 ("Förklaringar och
anvisningar vid utfärdande av föreningsintyg"), which transcribes **PMFS
2016:4 / RPSFS 2009:13, FAP 551-3, 5 kap 5–6 §§**. The form is published at
[polisen.se](https://polisen.se/b9596e33879c4925472a5edb9c451ab1/siteassets/blanketter/polisens-blanketter-551-24.pdf).
