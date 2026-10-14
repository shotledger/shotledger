# Firearms and ammunition

## Firearms

**Firearms → add.** Make and model identify it; the **weapon group** (sv
_vapengrupp_) is what connects it to the rest of the app — see
[Weapon group and class](../reference/weapon-group-and-class.md).

**Ownership** says whether the firearm is your own or borrowed — a club
firearm and anyone else's both count as borrowed. It starts at **My Own**, for
a firearm you add and for anything you recorded before the field existed, so
set it to **Borrowed** on the ones that are not yours. It is the only thing on
this screen that changes what the app asks of you elsewhere: owning a handgun
is what decides which [license activity](license-activity.md) requirement you
are measured against.

The form asks for make and model, with caliber, weapon type and ownership
beside them. Everything else is optional and folded under **Details**: serial
number, national register ID, load system, the maintenance intervals and notes.
Tap **Details** to open it; an empty optional field says **Optional**. **Edit**,
at the top right of the firearm's page, opens the same form.

On the Firearms list and the firearm's page, a status is a word with a
coloured dot: green for **Valid** or **OK**, amber for **Expiring Soon** or
**Due Soon**, red for **Expired** or **Maintenance Due**.

### Incomplete

A firearm shows **Incomplete** while something the app needs is missing: the
weapon type, the chambering, or a licence. Imported firearms usually arrive
that way, because an import carries little more than a make and a model.

An **air weapon is never asked for a licence**. One that is _effektbegränsat_
needs none in Sweden, and a 10 m match air pistol is well inside that — so it
counts as complete without one. The app goes by the weapon type, which it does
know, rather than by muzzle energy, which it does not: if you own an air rifle
powerful enough to need a licence, the app will not remind you about it.

A borrowed firearm is not asked for a licence either. That paperwork is not
yours to hold.

### Chambering, and what else it shoots

A firearm has one **chambering** — what it is built for, and what your licence
names. Under it you can list any other cartridge you actually put through it.

A .357 Magnum revolver fed .38 Special is the ordinary case in precision
shooting, not an exotic one, and a Swedish föreningsintyg may name both on the
same line. Before this the app had a single caliber field, which forced a
choice between recording the chambering and recording what you shoot — and
either answer was half wrong.

Listing a cartridge does not restrict anything. When you pick an ammunition lot
for a session the app will not stop you choosing one the firearm does not list:
you may have a good reason, and the app does not know it.

A firearm accumulates:

- **Round count**, from the sessions you log against it — every shot fired,
  counted [the same way everywhere](../explanation/how-shots-are-counted.md).
  Deleting a session backs its rounds out again. **Adjust Round Count** on the
  firearm corrects a counter that is off: a whole number of rounds, with a
  minus sign to take rounds away, and a reason.
- **Maintenance** — cleanings and work done, with the round count at the time.
  Each entry shows its date and the note you wrote; a round-count adjustment
  shows the amount it moved the counter by and its reason ("+10 · Club rental
  rounds").
  **Rounds Since Maintenance** counts from the entry with the latest date. An
  entry you log afterwards with an earlier date is kept in the log but does
  not reset the count. An adjustment moves both counts by its amount.
  Set a **Maintenance Interval (rounds)**, a whole number of rounds, and the
  phone notifies you once when
  **Rounds Since Maintenance** reaches it, whatever brought the rounds in: a
  saved series, a rounds-only session, an import or **Adjust Round Count**. It
  stays quiet after that until you log maintenance and the count reaches the
  interval again. Rounds that arrive by sync, entered on the web or another
  device, do not notify.
  Set a **Maintenance Interval (months)** as well, or instead, for a firearm
  that also needs care when it is not being shot, say one put away for the
  winter. The months count from the last maintenance you logged, or from when
  you added the firearm if you have logged none; a round-count adjustment does
  not restart them. The phone notifies you on the morning of the day they run
  out, and the firearm shows **Next maintenance by** with that date until
  then.
  The firearm is due when **either** interval is reached, and it says which:
  "Due: 6 months since the last maintenance" or "Due: 500 rounds since the
  last maintenance". The app suggests no intervals; you choose both, and
  leaving a field empty turns that reminder off. On Android these
  notifications have their own **Maintenance** category, which you can
  silence without silencing the rest.
- **Sight settings**, named, so "indoor 25 m" and "outdoor fält" are two
  recallable positions rather than something you remember.

Sight settings are reachable from the session itself, so a correction between
series does not mean leaving what you are doing.

### License expiry reminders

When a firearm's latest license has an end date, the phone reminds you ahead
of it. The reminders follow what is stored, however it got there: a license you
added, one from an import, demo data, or another device by sync. A renewed
license replaces the old one's reminders. The phone asks for permission to
notify you when you save a license; until you allow it, there are none.

### Archiving a firearm you no longer have

When you sell, return or retire a firearm, open it and tap **Archive Firearm**
at the bottom of the page. Archiving keeps everything the firearm has; it only
moves it out of the way.

An archived firearm:

- leaves the Firearms list. **Show Archived** under the list shows it again,
  and you can open it from there.
- is no longer offered when you start a session, on the phone or on the web. A
  session you already logged with it keeps it, and you can still choose it when
  you edit that session.
- keeps its sessions, statistics, licenses, maintenance and sight settings. The
  session list can still filter by it.
- sends no more license reminders or maintenance notifications.
- no longer counts as a firearm you own when the app proposes your
  [license activity](../explanation/license-activity.md) case, and shows no
  license activity of its own. The sessions you shot with it still count.

**Restore Firearm** on an archived firearm brings it back as it was, and its
license and maintenance reminders start again.

### On the web

With sync on, **Firearms** in the web app shows the same list and the same
firearm pages, to read: see
[Your account on the web](your-account-on-the-web.md#firearms).

## Ammunition

An ammunition lot is either factory ammunition or a handload.

The form leads with the label, caliber and quantity. Purchase date, the
handload switch, brand and lot number or the recipe, the bullet and its
velocity, and notes are under **Details**.

For a handload you can record bullet make, model and weight, powder and charge,
primer, brass, cartridge overall length and crimp. Those exist so a load that
shot well is reproducible, and a load that did not is identifiable.

If you never handload, switch off **Settings → Optional Fields → Handloads** and
the handload switch and recipe leave the ammunition form's Details. A lot that is already
a handload keeps them.

### Merging two lots that are the same

When one lot was entered twice, open the copy you do not want and tap
**Merge Into Another Lot** at the bottom, then the lot to keep. The app asks
first, naming how many sessions move. Every session on the copy moves to the
lot you keep, and the copy is deleted. A deleted session keeps its old lot.

The lot you keep stays as it is: the copy's quantity and notes are not added
to it, so correct the quantity by hand if it should change. A merge cannot be
undone.

With sync on, other devices get the merge at their next sync. A session saved
on the copy on a device that had not synced yet still names the deleted copy
and shows no ammunition lot; edit it and pick the lot you kept. An edit to
the copy itself made on such a device is dropped. The web app can make the
same merge: see [Editing many sessions on the web](editing-many-sessions-on-the-web.md#merge-ammo-lots).

### Power factor and muzzle energy

Enter a bullet weight and a muzzle velocity and the app shows both:

- **Power factor**, in the conventional grain·fps/1000, truncated to a whole
  number because IPSC disregards the fraction — a load computing to 124.9 makes
  Minor, not the 125 floor.
- **Muzzle energy**, in joules, to one decimal. The decimal matters at the
  bottom of the range: air pistol energies are single digits, where whole-joule
  rounding would erase the difference between 7.4 and 7.5.

!!! note "No limits are built in"

    The app computes the figures. It does not judge them against any legal or
    federation limit, because those are regulatory values that differ by
    jurisdiction and change. Checking a limit is yours to do.
