# Your data and privacy

## Where it lives

On your phone. You need no account, and nothing is uploaded unless you
deliberately turn something on.

That is the default and the intended way to use the app. The formal
[privacy policy](privacy-policy.md) and the [terms of service](terms.md) for
the optional sync service say the same in full.

## What leaves the phone, and only if you ask

| Feature                          | What is sent, and where                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Sync** (optional)              | Your logbook, its tags, and your birth year, class, women's classes choice and compliance profile, to the sync backend, so a second device can share them. Other settings stay on the device. Off unless you create an account.                                                                                                                                                                                                                       |
| **Web app** (optional)           | Nothing new: it reads what sync already stores, into the browser tab you sign in from, and keeps nothing after the tab closes: no cookie, and the server ends the sign-in after 12 hours. A session you enter or a setting you change there is stored as sync stores one from the phone; a target photo you add there is resized and re-saved first, without its location data, as the phone does. A download goes wherever your browser saves files. |
| **Webshooter**                   | Your Webshooter password once, then a token, direct from your phone to webshooter.se. Never through any ShotLedger server.                                                                                                                                                                                                                                                                                                                            |
| **Range suggestions** (optional) | What you type in a session's Location field goes to a geocoding service; "Use my location" sends your coordinates to a map service. Off by default.                                                                                                                                                                                                                                                                                                   |
| **App updates**                  | The app version, platform and a random install id, to Expo's update service when the app starts, so fixes can arrive without a store update. Nothing from your logbook.                                                                                                                                                                                                                                                                               |
| **Backups**                      | Wherever you send the file. That is your choice entirely.                                                                                                                                                                                                                                                                                                                                                                                             |

## What never leaves

- **Target photographs**, unless you include them in a backup you move
  yourself, or turn on sync.
- **Photographs of a licence card.** Scanning one fills in the licence fields
  and the photo is then deleted — the app has nowhere to keep it. The text is
  read on the phone by Google ML Kit, which sends Google usage and performance
  metrics, never the image or the text.
- **Training marks**, if you opt in to keeping them. They stay on the device to
  train a future hole detector, and you can delete them.
