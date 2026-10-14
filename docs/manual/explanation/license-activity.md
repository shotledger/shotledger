# How license activity is counted

[Turning it on, choosing your case and getting the log
out](../guides/license-activity.md) are the steps. This page is the model
behind them: what the requirement is, how the app reads it, and what it
deliberately leaves alone.

## The requirement

Once the Swedish profile is on, the app counts the sessions you logged in the
last **six months** and compares that total with the requirement for your case.

The requirement comes from page 3 of Polismyndigheten's föreningsintyg form,
which sets two levels (the same page's two per-firearm boxes are
[further down](#the-two-criteria-that-are-about-one-firearm)):

| Your case                                         | Paragraph | Requirement                                    | Over six months |
| ------------------------------------------------- | --------- | ---------------------------------------------- | --------------- |
| You do not yet hold a handgun for target shooting | 5 §       | on average at least **two** activities a month | **12**          |
| You already hold a handgun for target shooting    | 6 §       | on average at least **one** activity a month   | **6**           |

Training and competition count the same, as does representing your club at an
external competition. An activity is one logged session — not one series, and
not one day.

## How the six months are counted

The form says "the last six months" but not how to count them to the day, so
the app counts the way Swedish law counts periods of months (Lag 1930:173):

- **Whole days, in your phone's time zone.** A session belongs to the day you
  shot it. The time of day never matters.
- **The first day counts.** On 1 April the period starts on 1 October, and a
  session from 1 October still counts. On 2 April it no longer does.
- **Month ends.** When the same date does not exist six months back, the period
  starts on the last day of that month instead: on 31 March it starts on
  30 September.

The renewal box's two years are counted the same way, and they never share a
day: the recent year starts twelve months back, and the older year ends the day
before.

## Your case, and where it comes from

The app proposes one of the two from your firearms: if any firearm is a
**pistol or revolver** you have marked as **My Own**, it applies 6 §.
Otherwise it applies 5 §, the stricter case.

That is a proposal, not a judgement about your licenses. It reads two things
you told it — the weapon type and the
[ownership](../guides/firearms-and-ammunition.md) — and nothing else:

- A rifle you own is not an enhandsvapen, so it changes nothing.
- An air pistol does not count either. The app files air pistols and air
  rifles under one weapon type and cannot tell a licensed one from the rest,
  so it leaves you on the stricter case.
- Ownership starts at **My Own** on every firearm, including the ones you
  recorded before the field existed. So the app assumes you own your handguns
  unless you say otherwise, and the case it proposes for a handgun owner is
  therefore 6 §, the lighter of the two. Set a firearm to **Borrowed** and it
  stops counting.

The screen also says **why** it chose what it chose — "because no firearm on
file is a pistol or revolver you own", say. That matters after an import: a
firearm created by importing sessions arrives with no weapon type and no
licence, so the app can see five handguns and still have nothing on file
saying they _are_ handguns. The proposal is then right about the data and
wrong about you, and the reason line is what makes that visible instead of
mysterious.

## "On average", precisely

The form says _sammantaget i genomsnitt_ — taken together, on average. The app
reads that as a total across the whole six-month window: twelve activities
somewhere in the six months satisfies 5 §, whether they were spread evenly or
not. It does not require a fixed number in every calendar month.

## The next-session date

The period always ends today, so every day the oldest sessions in it move closer
to falling out. If you log nothing more, a met requirement stays met until enough
sessions have fallen out that the count drops below what is needed. The date the
app shows is the last day before that happens.

Only the sessions that requirement counts matter: for a firearm's criterion,
sessions logged with that firearm. For the renewal criterion both years must stay
at four, so the date can come from either year.

The date is counted in whole days, the same way as the period itself (see
[How the six months are counted](#how-the-six-months-are-counted)).

## A year that has already ended

The renewal box asks for four activities in each of the last two years. The
older of those two years ended a year ago, so a session you log today lands in
the recent year and can never count towards the older one.

What does change the older year is time. As the days pass, both years move
forward together: sessions from the start of your recent year cross into the
older one, and the oldest sessions drop out of it. So an older year that is
short now can fill up later, either from sessions you have already logged or
from sessions you log from now on once they are a year old. The date the app
gives is the first day on which every year can be at four, provided you keep
logging sessions with that firearm. It is the earliest the box can be ticked,
not a promise that it will be.

## What counts, and what this is not

**Every session counts, whatever you shot.** 5 § and 6 § are requirements on
_you_, not on a particular firearm or weapon group — the form asks whether you
took part in the club's shooting, and names no vapengrupp. So a session counts
towards License Activity even if you never recorded a weapon group for it, and
even if the firearm it was shot with is not in the app. That matters most
right after importing older history, which is usually where weapon groups are
thinnest.

The same figure therefore appears on every firearm: it is your activity level,
shown next to each gun for convenience, not that gun's own tally. The screen
says so under the number.

License Activity counts what you logged. A range visit you did not log is not
in it, and a session logged twice counts twice.

!!! warning "Your club and the police decide, not this app"

    The app counts sessions against a published requirement. It does not issue
    the intyg, and it has no view on whether your club will sign one or whether
    the police will grant the license. Treat a green status as "the counting
    looks right", not as an approval.

## The two criteria that are about one firearm

5 § and 6 § are the form's general question. The same page carries two more
boxes, under _Intyget avser_, and both ask about a **particular gun** rather
than about you:

| The box                                                                     | What it asks                                                                              |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **An additional handgun** (_ytterligare enhandsvapen_)                      | at least **two** activities in the last **six months** with each handgun you already hold |
| **Renewing a time-limited permit** (_förnyelse av tidsbegränsat tillstånd_) | at least **four** activities **in each of the last two years** with the gun applied for   |

Both appear on a firearm's own page, under _Föreningsintyg criteria_, and both
count **only the sessions you logged with that firearm**. A session logged with
a different gun counts towards that one instead, and a session with no firearm
recorded counts towards neither. The app prints both figures under the
criterion rather than quietly leaving them out — so "0 of 2 activities with
this firearm" sits next to "54 sessions in the period were logged with a
different firearm", and the number is readable instead of alarming.

**Four a year for two years is not eight over two years.** The app checks each
twelve-month window separately, so eight activities last year and none the year
before does not satisfy the renewal criterion — which is what the form says,
and the difference a single running total would hide.

### Which firearms each one is shown for

The app has no access to your licenses, so it works from what you told it:

- **An additional handgun** is shown for any firearm whose weapon type is
  **pistol or revolver** and which you marked as **My Own** — the same reading
  of "handgun you hold" the 5 §/6 § proposal uses.
- **Renewing a time-limited permit** is shown for any firearm whose most recent
  licence has an **end date**. A licence with no end date is _tills vidare_ and
  is not a time-limited permit. Weapon type is not part of it: the form's
  renewal box names none.

If a criterion is missing from a firearm you expected it on, that is the place
to look — usually a missing weapon type or a licence recorded without its
_giltighetstid_.

!!! warning "Counted is not attested"

    On a club log a row becomes evidence when someone signs the _Uppg. styrkta
    av_ column. The app has no equivalent and does not invent one. "6 of 4
    activities with this firearm" means the app counted six sessions you
    logged — not that anyone has attested them.

## What the app does not track

One rule on the same form is **not** modeled here: **special reasons**
(_särskilda skäl_ — illness, pregnancy, service abroad), which can excuse a gap
in activity under 6 §. These are decided by the police on a separate
attachment, not by you or your club, so the app does not offer to apply them.

## Source

Polismyndigheten's form **PM 551.24 Föreningsintyg**, page 3 ("Förklaringar och
anvisningar vid utfärdande av föreningsintyg"), which transcribes **PMFS
2016:4 / RPSFS 2009:13, FAP 551-3, 5 kap 5–6 §§**, and carries the two
per-firearm boxes under _Intyget avser_. The form is published at
[polisen.se](https://polisen.se/b9596e33879c4925472a5edb9c451ab1/siteassets/blanketter/polisens-blanketter-551-24.pdf).
