# Timers

**Tools → Timers.** Three modes, all on one screen.

## Time Limit

A countdown with an optional ready delay, repeated for as many series as you
want, with rest between them. This is the one for practising a shot program's
timing without a match to shoot.

Time limit, ready delay, repetitions and rest are all sliders, with the value
you have dialled in shown above each one. Rest appears only when you ask for
more than one repetition — there is nothing to rest between otherwise.

**Cues** is one choice for all three events (Get Ready, GO, Done): beep,
vibrate, or both. There is no "neither" — a timer you cannot perceive is not
a timer. To silence it, use the phone's silent switch (see below).

## Shot Timer

An IPSC-style timer: a random start delay, a start signal, and the microphone
listening for your shots to record splits.

**Shot Detection**, collapsed under the settings, is where you set how far a
sound must rise above the range's own noise to be counted, with a live meter
and a count of what actually registered while you clap or dry-fire. Low, Medium
and High are starting points.

!!! warning "It cannot tell a shot from another sharp crack"

    A finger snap is brief, abrupt and far above the room — the same shape as a
    shot, and counted as one at any setting. So is a neighbouring shooter. The
    timer is reliable about *when* something happened, not about what it was.

    [How the Shot Timer hears a shot](../explanation/shot-detection.md)
    explains what it measures and how to set it for your range.

The same **Cues** choice as the Time Limit timer — beep, vibrate, or both —
applies to all four of its events: Are You Ready?, Standby, the start beep and
the stop tone. With sound on, **Spoken Prompts** speaks the first two in the
app's language instead of beeping them; the start and stop stay tones, because
a spoken word arrives late and blurs the moment the clock starts.

The **Shot Detection Diagnostics** screen, behind the ⋮ menu on the Shot Timer,
records what the microphone actually hears so the detection can be worked on
against real range data rather than guesses.

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

## Silent mode

The Time Limit timer and the fälttimer play their cues in the phone's ambient
audio session, so the silent switch on an iPhone and the ringer mode on an
Android phone mute them — the beeps, the whistle and the spoken commands alike.
On Android that includes a ringer set to vibrate, which is how the phone itself
treats it. Vibration is never muted by silent mode — that is the point of it.

The Shot Timer is the exception: while the microphone is listening, sounds
play even on silent. Recording and silent-mode respect cannot share one audio
session on iOS.

## The screen stays awake

Every timer holds the screen on while its screen is open — not only while a
sequence is running. The gaps are when a phone locks on you: while a program is
set up, while the line is called, while shots are read back.
