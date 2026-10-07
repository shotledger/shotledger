# Entering series on the web

With sync on, the web app can take a whole session from the keyboard: a
competition you did not log at the range, or a page of an old paper logbook.
Sign in, then open **Enter Series** in the menu on the left.

## Fill in the session

The fields are the phone's new-session form: type, regulation, discipline,
match format, date and time, name and location, then the competition fields,
firearm and ammo lot. Date and time are when you shot, in this computer's time
zone; both start at now.

Fält is not offered here; enter it on the phone.

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

## Save

**Save** sends the whole session at once; it is either saved completely or not
at all. Your phone gets it at its next sync, and a chosen firearm's round count
goes up by the shots, sighters included.

Saving needs a connection. If the server cannot be reached, your series stay
on the page and **Save** becomes **Retry**, which sends exactly the same
session again, so it is not saved twice. Changing anything first drops that
copy: the next **Save** sends the session anew, and if the first attempt did
arrive, it is then saved twice. Signing in to another account in between drops
it too, so it is never sent to the wrong account. Closing the tab drops what
you typed; nothing is kept in the browser.

To change or delete a session afterwards, use the phone.
