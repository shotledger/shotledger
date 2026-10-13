# Editing a session on the web

With sync on, the web app can change or delete one session: fix a date, a
location or a firearm, or retype a series you got wrong. Sign in, open
**Sessions**, click the session, then **Edit** or **Delete Session**.

## Change the session

**Edit** opens the session's fields as the phone's edit screen has them: date
and time, name, location, notes, the competition fields of a competition,
firearm and ammo lot. An empty name keeps the name the session has; an empty
location or note clears it. A new date before 1900 or later than tomorrow is
refused, as on Enter Series, and the date and time are typed in the same format
as there. The type, discipline, match format and decimal
scoring are set when a session is created and stay as they are.

Below the fields, each series of the qualification is one row of shots, typed
as on [Enter Series](entering-series-on-the-web.md#type-the-series). Change a
row to retype that series; its old shots are replaced, as when you enter a
series again on the phone. **Delete Series** removes a row when you save
(**Undo** takes it back), and **Add Series** adds one after the last series.
In free format, tick **Sighter** on the one row that is a sighter series.

Final series and series saved as a total only (from Webshooter) are listed but
not editable here, and neither are fält stations, the rounds of a
rounds-only session, the match format and tags. Change those on the phone.

A series with a photo is marked **Photo**; click it to show or hide the photo
below the row. A photo not yet uploaded from the phone shows as not uploaded,
as on the session's page. The photo stays with its series when
you retype the shots, but the marks you placed on it no longer show, as when
you retype the series on the phone. A series saved with a photo and no shots
shows as an empty row marked **Photo**; left empty, it stays as it is. This
page does not add or remove photos.

## Save

**Save Changes** (or **Ctrl+Enter**, **Cmd+Enter** on a Mac) sends every
change at once, and your phone gets it at its next sync. Only a part
deleted on another device in the meantime can be refused (see below). The firearm's round count moves by the difference: retyping a
five-shot series as three takes two rounds off, and changing the firearm moves
the session's rounds from the old firearm to the new one. If several series
change in one save and the round count is already lower than the rounds being
taken off, the count stops at 0 once rather than series by series, so it can
end a little lower than the phone would leave it.

Save reads the session again first. If the session's own fields, or a series
you changed, were changed on another device since you opened it, nothing is
sent and the page says so: copy what you want to
keep, then **Reload** to start again from the session as it is now. If it was
deleted on another device, nothing is sent either. A change made on the phone
in the seconds between that check and the save can still be lost, or a series
retyped on both can end up with both sets of shots; the later save wins.

Saving needs a connection. If the server cannot be reached, your changes stay
on the page and the button becomes **Retry**, which sends exactly the same
change again, so nothing is changed twice. Changing anything drops that copy.
If a change was refused because something was deleted on another device in
the meantime, the page says so and names the firearm whose round count to
check with **Adjust Round Count** on the phone.

## Delete

**Delete Session** asks first, naming the session and how many rounds its
firearm's round count goes down by. Deleting removes its series, shots and
fält stations too and cannot be undone. Its photos stay in your account.

Delete reads the session again first. If its fields, a series or a fält
station were changed, added or removed on another device since the page
showed it, or a series was retyped there, nothing is deleted and the page says so:
**Reload** shows the session as it is now, and Delete Session asks again with
the new round count. If it was already deleted on another device, nothing is
sent either.

One save or delete can touch at most 500 rows. A session that large is
changed on the phone.
