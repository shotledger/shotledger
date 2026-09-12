# Vapengrupp and klass

Two independent things, and the app keeps them apart because they answer
different questions.

- **Vapengrupp** describes **the gun**. It changes when you pick up a different
  pistol — an A-gun and a C-gun on the same day are two vapengrupper.
- **Klass** describes **the shooter**. It is a property of you, and the same
  all day whichever gun you are holding.

Written together they look like one thing — "C 2" — but that is a display
convention, not a value. Keeping them separate is what lets you ask "how am I
shooting the C-gun?" and "how am I doing in klass 2?" independently.

## Vapengrupper

| Code                   | What it is                                                                 |
| ---------------------- | -------------------------------------------------------------------------- |
| **A**                  | Standard .22 pistol                                                        |
| **AM**, **AP**, **AG** | Sub-groups of A                                                            |
| **A-opt**              | A with an optical sight                                                    |
| **B**                  | Centrefire                                                                 |
| **C**                  | Centrefire                                                                 |
| **R**                  | Large-calibre revolver — fält and militär snabbmatch only, never precision |
| **airgun**             | Air pistol; used by ISSF events and general practice, not an SPSF group    |

Magnum groups M1–M9 exist in the SPSF rules but are not offered, because
Magnumprecision is not a discipline the app implements yet. They would appear
as options for a session you could not then create.

## Klasser

| Class                           | Who shoots it                             |
| ------------------------------- | ----------------------------------------- |
| **1**                           | Entry class                               |
| **2**                           | Middle class                              |
| **3**                           | Riksmästarklass — the top class           |
| **Jun**                         | Junior                                    |
| **Dam 1**, **Dam 2**, **Dam 3** | Women's classes                           |
| **Vet Y**                       | Veteran yngre — from the year you turn 60 |
| **Vet Ä**                       | Veteran äldre — from the year you turn 70 |

The veteran classes go by the **year** you reach the age, not by your birthday,
which is why the app asks for your birth year.

ISSF events and free training have no klass, and the app shows none rather than
offering a "none" to pick.

## Which groups each discipline allows

| Discipline              | Groups                                |
| ----------------------- | ------------------------------------- |
| SPSF precision          | A, AM, AP, AG, A-opt, B, C            |
| SPSF militär snabbmatch | A, A-opt, B, C, R                     |
| ISSF events             | none — ISSF does not use vapengrupper |
| Practice (rings)        | airgun                                |

## You hold several klasser at once

A klass is not one slot you sit in. The nine SPSF klasser are really two
things at once:

- **Your class** — 1, 2, or 3 (riksmästarklass). Earned, and one class across
  all vapengrupper.
- **Categories** — Jun, Dam 1/2/3, Vet Y, Vet Ä.

So a woman of 62 in class 2, shooting C, may enter **C 2**, **C Dam 2** _and_
**C Vet Y**, and picks one per competition.

The app works out what it can and asks for the rest:

| Eligibility                      | How the app knows                                            |
| -------------------------------- | ------------------------------------------------------------ |
| **Vet Y** (60+), **Vet Ä** (70+) | Your birth year                                              |
| **Jun**                          | Your birth year — the year you turn 20                       |
| **Dam 1/2/3**                    | The "Women's Classes and Events" switch in Settings          |
| **1 / 2 / 3**                    | "Your Class" in Settings — nobody can derive an earned class |

Age categories are decided by the **year**, not your birthday, in both SPSF
and ISSF — which is why a birth year is enough and the app never asks for a
full date of birth.

When you create a session, the classes you are eligible for are listed first
and your own class is preselected. **Every class stays selectable**: a club
evening can put anyone in any class, and the app does not argue with you.

## Which regulation they come from

Vapengrupper are defined by a federation, which is why their ids are
federation-scoped — `spsf:C` rather than a bare `C`. A second federation can
define its own `C` without colliding with this one.

Which of them you are offered depends on the regulations you have enabled; see
[Regulations](../guides/regulations.md). ISSF ships events rather than
vapengrupper, so an ISSF or SvSF session has no vapengrupp to choose.
