# Entering series on the web

With sync on, the web app can take a whole session from the keyboard: a
competition you did not log at the range, or a page of an old paper logbook.
Sign in, then open **Enter Series** in the menu on the left.

## Fill in the session

The fields are the phone's new-session form, in its order: type, regulation,
discipline and match format, then date and time, the competition fields and
the firearm. As on the phone, the page starts on the discipline and firearm of
your last session, and after each **Save** on those of the session just saved.
Everything optional — logging, name and location, ammo lot, shots per series,
decimal scoring and tags — is folded under **Details**; click it to open. Date
and time are when you shot, in this computer's time zone; both start at now. A date before 1900 or later than tomorrow is refused,
as a typo rather than a session.

Date and time show in the app's format, from its language and the browser's
region, whatever language the browser itself uses: `2026-09-22` and `18:00` in
Swedish, `09/22/2026` and `6:00 PM` in US English. Type them the same way; any
separator works, a year-first date such as `2026-09-22` is always understood,
and the year takes four digits. A time can also be typed as `1800`, `18` or
`6 pm`. Something that is not a date or a time is marked under the field with
the format to use. The calendar button beside the date opens the browser's own
date picker and fills in the date you pick.

Your class and ISSF event start from the profile you set in **Settings →
Personal** on the phone, which sync carries to the account: your birth year,
class and the women's classes switch. Your own class is preselected and listed
first, and the events you can enter come first, as on the phone. With no
profile set, nothing is preselected. The regulations you enabled and
**Settings → Optional Fields** stay on the phone, so the web offers every
regulation and always asks for the weapon group and class in a competition.
See [Weapon group and class](../reference/weapon-group-and-class.md).

## Rounds only

Under **Details**, set **Logging** to **Rounds Only** to record how many rounds you fired, with
no series. The session fields stay; **Rounds Fired** takes the place of the
match format and the series rows. Leave it empty if you do not know the
count. Anything but a whole number from 0 to 10,000 is refused before anything
is sent; the phone takes the same range.

## Type the series

One row per series. Type the shots with a space between them:

| Type       | Means                       |
| ---------- | --------------------------- |
| `0` – `10` | the ring value              |
| `X`        | an inner ten (X), worth 10  |
| `10.4`     | decimal scoring: 10.4       |
| `X.6`      | decimal scoring: inner 10.6 |

`x` works as well as `X`, and `10,4` as well as `10.4`. With decimal scoring
every shot needs its tenth: type `9.0` for a nine, `0.0` for a miss and
`X.0` for an inner ten on the line; a bare `9` or `X` is refused, and the
message says so.

As you type, each row draws its shots in boxes, as the phone's keypad does: one
box per shot of the series, the next one to fill outlined. Beside the row are
its total and its inner tens, **0 X** included, and **Last Time**, the same
scored series of your previous session in this discipline, as on the phone.
Under the rows, **Session** keeps the running total of the scored series.

A session needs at least one shot or photo: with every row empty, Save says so and
sends nothing.

- **Enter** moves to the next row; in free format, Enter in the last row adds one.
- **Tab** and **Shift+Tab** move between the fields, **Sighter** included.
- **Ctrl+Enter** (**Cmd+Enter** on a Mac) does what the button below the rows does.

With **Full Match** chosen, the rows are laid out as the program's series,
sighters included, as on the phone. In free format, tick **Sighter** on the
one row that is a sighter series. **Add Series** adds a row.

### A final

In precision with **Full Match** chosen, **Start Final** appears once a series
has a shot. It adds a row under **Final**, and every row added after it
belongs to the final, which can have a sighter series of its own. The final is
totalled apart from the qualification, as on the phone. A final with no shot
in it is not saved, so emptying its rows removes it again. A final needs at
least one scored series before it; with none, Save says so and sends nothing.

## Enter a fält session

Choose **Fältskjutning** as the discipline, and the rows become stations, as
on the phone. **Result Mode** sets whether the result reads as hits and
figures (**Field**) or as one sum (**Point field**).

Each station has the phone's station fields: **Hits**, **Figures Hit**,
**Figures** (how many were set out), each a row of numbers to click, **Points** and **Max Points** for a
ringed figure, and **Scratched**. Figures Hit offers only what the hits and
figures allow. The total above the stations counts the stations that will be
saved, leaving out scratched and shoot-off ones, as the phone does. **Add
Station** adds a row.

Once a station has something entered, **Start Shoot-off** makes the next
station a shoot-off station, marked **Shoot-off**. From the first filled-in
shoot-off station on, every station is a shoot-off station. A shoot-off
station with nothing entered is not saved and does not start the shoot-off.

**Hits** starts at **–**. A station with nothing entered is not saved, and
the stations after it move up a number. For a station where every shot
missed, click **0** under Hits: it is saved and counts, as a station with 0
hits.

## Add a target photo

**Add Photo** under a row attaches a photo of that series' target, from a file
on this computer. A row with a photo is saved even when it has no shots, so
you can score it from the photo on the phone later. **Replace Photo** and
**Remove** change it before you save.

The photo is sent as the phone sends one: made smaller (at most 2048 pixels on
the longer side), turned the right way up, and saved as a new JPEG, which
leaves out the camera details and the location the original may carry. The
original file never leaves the computer. A file the browser cannot open as a
picture (HEIC, outside Safari) is refused, and so is a photo that is still
over 1.5 MB after it is made smaller. A fält station takes no photo.

## Tag it

Under **Details**, **Tags** takes a tag name: type it and press **Add** or
Enter. Your account's tags are offered as you type; a name you have not used
before becomes a new tag, as on the phone. Case does not matter: with a tag
`KM`, typing `km` adds `KM`. Click a tag to take it off again. Text left in
the field when you save is not added.

## Save

**Save** sends the whole session at once, its tags included; it is either
saved completely or not at all. Your phone gets it at its next sync, and a
chosen firearm's round count goes up by the shots, sighters and the final
included, or by the rounds fired; for fält, by six for each saved station,
scratched and shoot-off ones included. Photos are sent first, and the session only
once every photo has arrived; the phone downloads them like any synced photo.

If a photo cannot be sent, nothing is saved. When the server is unreachable,
or more than 60 photos were sent in the last hour, **Save** becomes **Retry**,
which sends only the photos that have not arrived, then the session. When your
photo storage is full, remove a photo and save again: photos that already
arrived are not sent again. A photo that arrived before a save failed stays in
your photo storage if you then remove it or close the tab.

A row with a photo is kept when you change the match format, as a row with
shots is.

Saving needs a connection. If the server cannot be reached, or answers in a
way that leaves it unclear whether the session arrived, your series stay on
the page and **Save** becomes **Retry**, which sends exactly the same session
again, so it is not saved twice. Adding an empty row keeps that copy; changing
anything else drops it, and the next **Save** sends the session anew, so if
the first attempt did arrive it is then saved twice.

If you are signed out, sign in again on the page. Signing in to another
account loads that account instead, and what you typed is cleared, so nothing
from one account is saved to the other. Closing the tab drops what you typed;
nothing is kept in the browser.

To change or delete a session afterwards, see
[Editing a session on the web](editing-a-session-on-the-web.md).
