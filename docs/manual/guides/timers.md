# Timers

**Tools → Timers.** Three modes, all on one screen.

## Timer

One timer for every kind of drill: a start delay, a shooting time, and as many
repetitions as you want with rest between them. Practising a shot program's
timing and shooting an IPSC-style string are the same machine with different
settings, so they are the same timer.

Time limit, start delay, repetitions and rest are all sliders, with the value
you have dialled in shown above each one. Two of them are worth knowing about:

- **Time Limit** at its lowest reads **No limit**. The series then runs until
  you stop it — the classic shot-timer string, where the clock counts up
  instead of down.
- **Random Start** turns the start delay into a range. The start signal is
  drawn afresh from it for every repetition, so it cannot be anticipated.

Rest appears only when you ask for more than one repetition — there is nothing
to rest between otherwise.

**Cues** is one choice for all the events (Get Ready, GO, Done): beep, vibrate,
or both. There is no "neither" — a timer you cannot perceive is not a timer. To
silence it, use the phone's silent switch (see below). With sound on, **Spoken
Prompts** speaks Get Ready in the app's language instead of beeping it; GO and
the stop tone stay tones, because a spoken word arrives late and blurs the
moment the clock starts.

## Record Shots

**Record Shots** puts the microphone to work on whatever drill you have set up:
it listens for your shots and records the time to each one and the split
between them. A repetition drill records each repetition separately, timed from
its own start signal.

With no time limit, **Stop After Silence** ends the string by itself once the
microphone has heard nothing for that long. Set it to zero and the string waits
for the Stop button instead. A series that does have a time limit ends on that
limit, so nothing is recorded past its stop signal.

**Shot Detection**, collapsed underneath, is where you set how far a sound must
rise above the range's own noise to be counted, with a live meter and a count
of what actually registered while you clap or dry-fire. Low, Medium and High
are starting points.

!!! warning "It cannot tell a shot from another sharp crack"

    A finger snap is brief, abrupt and far above the room — the same shape as a
    shot, and counted as one at any setting. So is a neighbouring shooter. The
    timer is reliable about *when* something happened, not about what it was.

    [How the timer hears a shot](../explanation/shot-detection.md)
    explains what it measures and how to set it for your range.

The **Shot Detection Diagnostics** screen, behind the ⋮ menu beside Record
Shots, records what the microphone actually hears so the detection can be
worked on against real range data rather than guesses.

## Fälttimer

The SPSF field-shooting command sequence, spoken aloud: the standard commands
in order, with their real timings.

**Cues per Command**, collapsed under the settings, lets you choose how each
command reaches you. Every command can be the spoken **Voice** or a **Beep**;
tapping the lit one turns the sound off. **Vibrate** can be added to any of
them, or stand alone. Eld upphör can also be a **Whistle** — the drawn-out
blast the rules allow in place of the spoken command — and its vibration lands
when the time is up, at the end of the call. Parti boundaries have no words, so
they beep or buzz. At least one of sound and vibration always stays on for
every command.

Out of the box, every command is spoken, the partier beep, and the phone buzzes
at Eld, at each parti and when the time is up.

You can scrub the sequence while it is paused and tap a command to jump to it,
which is what makes it usable for practice rather than only for a live string.

## Stopwatch

A plain count-up stopwatch with laps — the same one a session has, but with a
clock of its own, so it never times a session. **Lap** and **Start**, then
**Lap** and **Stop** while it runs, then **Reset** and **Resume** once stopped;
laps are listed under the buttons, newest first. It keeps running while you
switch mode, and starts from zero when the app is closed.

## Silent mode

The timer and the fälttimer play their cues in the phone's ambient
audio session, so the silent switch on an iPhone and the ringer mode on an
Android phone mute them — the beeps, the whistle and the spoken commands alike.
On Android that includes a ringer set to vibrate, which is how the phone itself
treats it. Vibration is never muted by silent mode — that is the point of it.

Recording shots is the exception: while the microphone is listening, sounds
play even on silent. Recording and silent-mode respect cannot share one audio
session on iOS.

## The screen stays awake

Every timer holds the screen on while its screen is open — not only while a
sequence is running. The gaps are when a phone locks on you: while a program is
set up, while the line is called, while shots are read back.
