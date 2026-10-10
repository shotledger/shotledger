# Entering series on the web

With sync on, the web app can take a whole session from the keyboard: a
competition you did not log at the range, or a page of an old paper logbook.
Sign in, then open **Enter Series** in the menu on the left.

## Fill in the session

The fields are the phone's new-session form: type, logging, regulation,
discipline, match format, date and time, name and location, then the competition fields,
firearm and ammo lot. Date and time are when you shot, in this computer's time
zone; both start at now.

Your class and ISSF event start from the profile you set in **Settings →
Personal** on the phone, which sync carries to the account: your birth year,
class and the women's classes switch. Your own class is preselected and listed
first, and the events you can enter come first, as on the phone. With no
profile set, nothing is preselected. The regulations you enabled and
**Settings → Optional Fields** stay on the phone, so the web offers every
regulation and always asks for the weapon group and class in a competition.
See [Weapon group and class](../reference/weapon-group-and-class.md).

Fält series are not offered here; enter them on the phone. A fält session
logged as rounds only can be entered here.

## Rounds only

Set **Logging** to **Rounds Only** to record how many rounds you fired, with
no series. The session fields stay; **Rounds Fired** takes the place of the
match format and the series rows. Leave it empty if you do not know the
count. Anything but a whole number is refused before anything is sent.

## Type the series

One row per series. Type the shots with a space between them:

| Type       | Means                       |
| ---------- | --------------------------- |
| `0` – `10` | the ring value              |
| `X`        | an inner ten (X), worth 10  |
| `10.4`     | decimal scoring: 10.4       |
| `X.6`      | decimal scoring: inner 10.6 |

`x` works as well as `X`, and `10,4` as well as `10.4`. Each row shows its
total and its inner tens as you type.

- **Enter** moves to the next row; in free format, Enter in the last row adds one.
- **Tab** and **Shift+Tab** move between the fields.
- **Ctrl+Enter** (**Cmd+Enter** on a Mac) does what the button below the rows does.

With **Full Match** chosen, the rows are laid out as the program's series,
sighters included, as on the phone. In free format, tick **Sighter** on the
one row that is a sighter series. **Add Series** adds a row.

### A final

In precision with **Full Match** chosen, **Start Final** appears once a series
has a shot. It adds a row under **Final**, and every row added after it
belongs to the final, which can have a sighter series of its own. The final is
totalled apart from the qualification, as on the phone. Emptying the final's
rows removes it again.

## Save

**Save** sends the whole session at once; it is either saved completely or not
at all. Your phone gets it at its next sync, and a chosen firearm's round count
goes up by the shots, sighters and the final included, or by the rounds
fired.

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

To change or delete a session afterwards, use the phone.
