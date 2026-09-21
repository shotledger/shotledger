# How the Shot Timer hears a shot

[Using the timers](../guides/timers.md) is the task. This page is what the
microphone is actually doing while the clock runs, and — more usefully — what
it cannot do however you set it.

## Loudness alone was never going to work

The first version of the detector counted a shot whenever the microphone level
crossed a set number of decibels. It could not be made usable indoors. At the
least sensitive setting it had, a finger snap still pinned the meter, and there
was nothing further to turn down.

Two things conspire. A phone microphone is built for speech, so Android applies
automatic gain control to it: quiet sounds are lifted and loud ones squashed,
which is exactly the wrong treatment for a sound whose defining feature is that
it is briefly enormous. And a range is not quiet to begin with — by the time a
threshold is low enough to catch your own shot, the room is above it too.

## Three measurements instead of one

So the timer does not ask "was that loud?". It asks three questions about every
sound, and a shot has to answer all three.

**Did it stand out from the room?** The app keeps track of the background level
and measures each sound against _that_, not against an absolute number. The
setting you choose is a distance above the room, which is why it means the same
thing in a quiet cellar and on a windy range, and why gain control moving
everything up or down together no longer matters.

**Did it arrive abruptly?** A muzzle blast reaches its peak almost instantly. A
door swinging, a voice, a car outside — these swell. A sound that takes its
time getting loud is not counted, however loud it ends up.

**Was it over quickly?** This is the one a loudness threshold has no way of
expressing, and it is what commercial shot timers gate on. A blast is a brief
impulse. A sound that stays up is something else, and is rejected on those
grounds even if it started like a shot.

## What it still cannot do

It cannot tell your shot from another sharp crack. A finger snap is brief,
abrupt and far above the room: by every measurement above it _is_ a shot, and
no setting will change that. The same goes for a neighbouring shooter on the
next stand.

Separating those needs the timer to recognise the sound of a gunshot
specifically, rather than the shape of an impulse — a different kind of problem
from the one solved here. So: the timer is reliable about _when_ something
happened and honest about _what_ it was.

## Setting it for your range

Open **Shot Detection** on the Shot Timer and clap or dry-fire near the phone.

The bar shows the current level, the loudest one so far, a grey mark where the
app thinks the room is, and a red mark where your trigger currently sits above
it. Below it is the count of sounds that actually passed all three tests — that
count, not the bar, is the answer to "will it hear my shot?".

Turn the sensitivity down until the room stops registering, then check that
your own shot still does. **Low**, **Medium** and **High** set both the
distance above the room and how brief the sound has to be, and are a reasonable
place to start before you touch the slider.

The **Shot Detection Diagnostics** screen, behind the ⋮ menu, records what the
microphone actually heard so a stubborn range can be looked at afterwards
rather than guessed at.
