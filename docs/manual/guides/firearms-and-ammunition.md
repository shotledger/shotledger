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

A firearm accumulates:

- **Round count**, from the sessions you log against it. Deleting a session
  backs its rounds out again.
- **Maintenance** — cleanings and work done, with the round count at the time.
- **Sight settings**, named, so "indoor 25 m" and "outdoor fält" are two
  recallable positions rather than something you remember.

Sight settings are reachable from the session itself, so a correction between
series does not mean leaving what you are doing.

## Ammunition

An ammunition lot is either factory ammunition or a handload.

For a handload you can record bullet make, model and weight, powder and charge,
primer, brass, cartridge overall length and crimp. Those exist so a load that
shot well is reproducible, and a load that did not is identifiable.

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
