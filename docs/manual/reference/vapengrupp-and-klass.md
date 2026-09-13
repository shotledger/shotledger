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

| Code                   | What it is                                                                    |
| ---------------------- | ----------------------------------------------------------------------------- |
| **A**                  | Centrefire, 7.6–11.4 mm, 420–600 J                                            |
| **AM**, **AP**, **AG** | Sub-groups of A — pre-1945 military, Walther PP/PPK 7.65, Glock fixed sights  |
| **A-opt**              | A with an optical sight                                                       |
| **B**                  | Centrefire pistol or revolver, up to 600 J                                    |
| **C**                  | .22 LR only                                                                   |
| **R**                  | Large-calibre revolver — fält and militär snabbmatch only, never precision    |
| **airgun**             | Air pistol. Not an SPSF group — you set it on the firearm, never on a session |

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

Free training has no klass, and the app shows none rather than offering a
"none" to pick. ISSF has no klass either — it uses **events** instead, which
the next section explains.

## ISSF: events instead of klasser

The two federations answer the same question in different places.

- **SPSF** has one discipline with many klasser. Precision is precision; C 2,
  C Dam 2 and C Vet Y are entries inside it. The category rides on **you**.
- **ISSF** has many events, each fixed to one category. 10 m Air Pistol runs
  as four separate events — men, men junior, women, women junior — and 25 m
  Rapid Fire Pistol has only the two men's ones, because no women's version
  exists. The category rides on **the event**.

So an ISSF or SvSF session asks you which **Event** it was, in the same place
an SPSF session asks for your klass. It is one picker or the other, never
both.

| Discipline           | Events                               |
| -------------------- | ------------------------------------ |
| 10 m Air Pistol      | Men, Men Junior, Women, Women Junior |
| 25 m Rapid Fire      | Men, Men Junior                      |
| 25 m Standard Pistol | Men, Men Junior, Women, Women Junior |
| 25 m Sport Pistol    | Men Junior, Women, Women Junior      |
| 50 m Pistol          | Men, Men Junior, Women, Women Junior |

**25 m Sport Pistol has no senior men's event.** That is not an omission: the
ISSF recognizes it for women, women juniors and men juniors only.

A **junior** to the ISSF is anyone up to and including the year they turn 21
— a year later than SPSF's juniorklass, which stops at the year you turn 20.
The app uses whichever applies to the discipline you picked.

Juniors are not confined to junior events. Entering the senior event is normal
and expected, and the Swedish federation says so outright: at SM for herrar, a
herrjunior may take part. So the app lists **every** event for the discipline,
puts the ones matching you first, and preselects the first of those — the same
rank-don't-gate rule as for klasser.

## Which groups each discipline allows

| Discipline              | Groups                                |
| ----------------------- | ------------------------------------- |
| SPSF precision          | A, AM, AP, AG, A-opt, B, C            |
| SPSF militär snabbmatch | A, A-opt, B, C, R                     |
| ISSF events             | none — ISSF does not use vapengrupper |
| Practice (Ring Target)  | none — see below                      |

**Practice has no vapengrupp.** A vapengrupp is how SPSF sorts guns into
competition classes, so it means nothing on a practice session that belongs to
no federation. The app asks you for the gun instead, and the gun carries its own
group — which is why _airgun_ is still there to choose when you add an air
pistol to your firearms.

## You hold several klasser at once

A klass is not one slot you sit in. The nine SPSF klasser are really two
things at once:

- **Your class** — 1, 2, or 3 (riksmästarklass). Earned, and one class across
  all vapengrupper.
- **Categories** — Jun, Dam 1/2/3, Vet Y, Vet Ä.

So a woman of 62 in class 2, shooting C, may enter **C 2**, **C Dam 2** _and_
**C Vet Y**, and picks one per competition.

Two rules shape that (SHB F.2.1 and F.2.2, p. 163):

- **The open classes really are open.** A shooter in dam-, junior- or
  veteranklass may instead enter klass 1, 2 or 3 according to their
  competence, in vapengrupp A, B or C. Entering your category class is
  explicitly voluntary.
- **Jun, Dam and Vet exist only in vapengrupp C.** Klass 1/2/3 run in A, B and
  C, but there is no "A Dam 2" — so choosing an A-gun leaves you the open
  classes only. The app narrows the list by the gun you pick.

One more, worth knowing before you enter two: within **vapengrupp C in
precision the general rule is one class per competition** — Vet Y _and_
klass 3 C together is not normally allowed.

**Championships are the exception.** At SM, landsdels- or kretsmästerskap an
organiser may permit a start in the open class as well as your own, and
shooters do compete in C and another class there. It is the organiser's call,
so the app never stops you logging either start.

Your class is the same whichever gun you shoot: _"Skytt hänförs till viss
klass oavsett i vilken vapengrupp kompetensfordringarna uppfyllts"_ (F.2.2).
Only klass 3 is qualified for in precision specifically.

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
