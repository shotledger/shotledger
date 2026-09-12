# Timers

**Tools → Timers.** Three modes, all on one screen.

## Time Limit

A countdown with an optional ready delay, repeated for as many series as you
want, with rest between them. This is the one for practising a shot program's
timing without a match to shoot.

Each event can have its own cue — a sound, a vibration, or both.

## Shot Timer

An IPSC-style timer: a random start delay, a start signal, and the microphone
listening for your shots to record splits.

!!! warning "Shot detection is not reliable yet"

    The microphone picks up far more than gunshots. A finger snap or a keyboard
    reaches full scale on the meter, which means a simple loudness threshold
    cannot separate your shot from a door, a neighbouring shooter, or the
    range's own noise.

    Android also applies automatic gain control to the microphone, which lifts
    quiet sounds and squashes loud ones — exactly the wrong shape for
    recognising an impulse.

    The timer is usable as a timer. Treat the shot detection as experimental.

The **Shot Detection Diagnostics** screen, behind the ⋮ menu on the Shot Timer,
records what the microphone actually hears so the detection can be worked on
against real range data rather than guesses.

## Fälttimer

The SPSF field-shooting command sequence, spoken aloud: the standard commands
in order, with their real timings.

Each command can be a spoken prompt, a whistle, a vibration, or silent. You can
scrub the sequence while it is paused and tap a command to jump to it, which is
what makes it usable for practice rather than only for a live string.

## The screen stays awake

Every timer holds the screen on while its screen is open — not only while a
sequence is running. The gaps are when a phone locks on you: while a program is
set up, while the line is called, while shots are read back.
