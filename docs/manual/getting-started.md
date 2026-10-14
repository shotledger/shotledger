# Getting started

## The short version

You can log a session the minute you install the app. Nothing has to be set up
first.

1. **Home → Start.** The button names the discipline you shot last, and the
   form opens on that discipline and that session's firearm; change them if
   today is different. The very first time, Home offers **Log Your First
   Session** instead. Everything else on the form has a sensible default.
2. **Tap the shots, then Next Series.** The keypad moves to the next shot on
   its own, so a five-shot series is five taps; **Next Series** saves it and
   opens the next.
3. That is it. It is saved as you go.

Then, when you have five quiet minutes, do the rest below — it is what turns a
list of scores into a logbook that knows which class (sv _klass_) you shot in.

And whenever you get round to it, make a backup. Everything lives on your phone
by default: no account, no server, nothing to leak — and a lost phone is a lost
logbook unless you have a copy. **Settings → Backup & Data → Back Up**, and keep the file
somewhere that is not the phone. See
[Backup and restore](guides/backup-and-restore.md).

## The full setup

This is the order you would do things at the range, on your first visit.

### 1. Add the firearm you are shooting

**Firearms → add.** At minimum it needs a make and model.

A session does not require a firearm — leave it as **None** and the session
still logs, scores and counts normally. What naming the firearm buys you is its
**weapon group** (sv _vapengrupp_) — whether this is your A-gun, your C-gun,
and so on — which is what lets the app offer the right classes, apply the
right märke thresholds,
and keep a round count per gun.

If you handload, you can add ammunition later; nothing here blocks you from
shooting.

### 2. Tell it about you

**Settings → Personal** wants three things, and then stops asking:

- **Birth year** — both SPSF and ISSF go by the **year** you reach an age, not
  your birthday, so the year is enough. You can correct it whenever you like;
  the app asks you to confirm first, because the veteran class and the märke
  thresholds are worked out from it and will change for sessions you have
  already logged as well as new ones.
- **Your class** — 1, 2 or 3. Nobody can derive an earned class.
- **Women's classes and events** — if you compete in them.

From those three the app works out every class you are eligible for, preselects
your own, and stops asking you every session. You can always override it.

### 3. Start a session

On **Home**, tap **Start**. The button names the discipline of your last
session ("Start Precision"), and the form opens with that discipline and that
session's firearm already chosen, so a usual evening needs nothing more than
**Create Session**; **Change**, beside the firearm, opens the same form for
anything else. The very first time, Home offers **Log Your First Session**
instead. On the form you choose:

- **Regulation** — only if you have more than one turned on. It decides which
  disciplines the next row offers, so you are choosing between SPSF's and
  SvSF's worlds rather than scrolling one list that mixes them. With a single
  regulation on there is nothing to choose and the row is not shown.
- **Discipline** — for example SPSF precision or militär snabbmatch.
- **Match Format** — whether the session arrives laid out as the full match, or
  empty for you to fill in. **Full Match** lays the series out for you: militär
  snabbmatch arrives with a sighter series and twelve scoring series at 10, 8
  and 6 seconds, and on precision it is the final that the full match adds. The
  line under the chips says what this format lays out. **Free Format** adds
  nothing: you add the series as you go, at the length the next row sets. A
  competition starts on Full Match and training on Free Format; both are yours
  to change, here or later on Edit Session until the first shot. A discipline with no fixed format of its own — Practice
  (Ring Target) — shows no Match Format row at all.
- **Firearm** — optional.

Everything else is folded under **Details**, closed until you open it:

- **Logging** — scored series, or rounds only.
- The session's **name** and **location**.
- The **ammunition** you are using, if you are tracking it.
- **Shots per Series** — any whole number up to 10, starting at the
  discipline's own length; anything else falls back to that length.
  Series entry shows one box per shot, so shooting fives on a ten-shot
  discipline no longer leaves five empty boxes. Only asked on Free Format: a
  full match already sets it. It cannot be changed afterwards.
- **Decimal Scoring**, where the discipline allows it, and **tags**.

For a **competition** you are also asked for your **weapon group** and
**class**, because that is what you are entered under. Training does not ask:
the app takes the weapon group from the gun you picked, so your
pistolskyttemärke still counts practice series, and it records no class at all.
If you never compete in weapon groups or classes, **Settings → Optional Fields**
stops competitions asking too.

A session created as the full match arrives with its series already laid out,
so you are not building the scaffolding while the line is waiting. The format
cannot be changed afterwards, so the session's own screen names it under the
title.

### 4. Enter shots as you shoot

Tap the shots. The keypad moves to the next one on its own, so a five-shot
series is five taps. It never moves past the last shot by itself: tap a box to
correct it first if you need to. Above the boxes you see the series total, the
session total and, once you have shot the discipline before, **Last Time** for
the same series, each with its inner tens.

**Next Series** saves the series and opens the next one; **Save Series** saves
it and takes you back to the session. You can leave a series half-entered, walk
to the target, and come back to it — but tap one of the two before you leave
the screen, or what you typed in it is not kept.

### 5. Look at it afterwards

**Statistics** shows how you are trending, and the totals: shots fired,
sessions, competitions. **Home** is about today. From the top:

- your **license activity** in words, when the compliance profile is on, with
  the date of the next session you need;
- **Start**, on the discipline and firearm you used last;
- your **last session**, with its result;
- **Recent** sessions, and **All Sessions** for the full logbook.

Each row gives the date, then the result: the total on the right, the average
per series and the inner tens under the name, "0X" included. A field shooting
session reads as hits and figures, a round count as its rounds. The session
type (Training, Competition) is left off a row whose tag already says it, such
as _Träning_.

If your license renewal needs documented range activity, turn on the Swedish
compliance profile in Settings and see [License activity](guides/license-activity.md).
