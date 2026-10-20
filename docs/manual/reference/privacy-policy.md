# Privacy policy

Effective: VERIFY (the date this page is published).

This policy covers the ShotLedger app for Android and iOS, the optional sync
service at `api.shotledger.app` and the web app served from it. A shorter,
feature-by-feature overview is in [Your data and privacy](privacy.md).

## The short version

- Your logbook lives on your phone. You need no account to use the app.
- Nothing is uploaded unless you turn on a feature that sends it, such as sync.
- There are no ads, no analytics, no tracking, and no data is ever sold or
  shared for marketing.
- If you create an account, you can delete it and everything stored with it
  from the app or the web app.

## Who is responsible

The controller for the personal data the sync service stores is Jimisola
Laursen, Sweden, who develops and runs ShotLedger.

Contact: VERIFY (contact email for privacy requests).

## What stays on your phone

Everything you enter is kept in a database on your phone: sessions, scores,
target photos, firearms (including serial numbers and register ids if you enter
them), licences and licence numbers, ammunition, maintenance, notes, and your
settings such as birth year and class. ShotLedger, the developer, has no access
to it.

A photo of a licence card is read on the phone and deleted straight after; it
is never stored or sent.

The app asks for these permissions, each only when you use the feature that
needs it:

| Permission     | Used for                                                                                                    |
| -------------- | ----------------------------------------------------------------------------------------------------------- |
| Camera, photos | Photographing a target or a licence card.                                                                   |
| Microphone     | Detecting shots for the timer. The sound is analyzed live and never recorded.                               |
| Location       | "Use my location" on a session, once per tap, while the app is open. Your coordinates are not stored.       |
| Calendar       | Adding the competition starts you choose from Webshooter to your calendar.                                  |
| Notifications  | Reminders about maintenance and licence expiry. They are created on the phone; no push service is involved. |

## What leaves your phone, and where it goes

### Sync and the web app (optional, needs an account)

If you create an account, the sync service stores:

- **Account:** your email address and a hash of your password. The password
  itself is never stored.
- **Your logbook:** the sessions, series, shots, photos, firearms, licences,
  ammunition, tags and other records the app syncs, and the settings birth year,
  class, women's classes choice, compliance profile and which features you have
  hidden. Target photos are resized and re-saved before upload, which drops
  their location metadata; the original stays on your phone.
- **Sign-ins:** for each signed-in device or browser, the IP address and
  browser or app identifier it signed in from, so you can see and revoke your
  devices.
- **Abuse protection:** the IP address of sign-in attempts, for up to 15
  minutes, to limit password guessing.

The web app shows and edits the same data. It keeps your sign-in in the browser
tab only, uses no cookies, and loads nothing from third parties.

**Why (legal basis):** to provide the sync service you signed up for (GDPR
Article 6(1)(b)), and to keep it secure (Article 6(1)(f), legitimate
interest).

### Features that talk to other services directly

These send data from your phone straight to another service. ShotLedger's
servers are not involved, and that service's own privacy policy applies.

| Feature                                      | What is sent                                                        | To                                              |
| -------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------- |
| Webshooter (optional)                        | Your Webshooter login, then a token, and requests for your results. | webshooter.se                                   |
| Range suggestions (optional, off by default) | What you type in a session's Location field.                        | Photon geocoder, photon.komoot.io (komoot GmbH) |
| "Use my location" (optional, off by default) | Your coordinates at that moment.                                    | OpenStreetMap Overpass API, overpass-api.de     |

### Licence-card scanning (Google ML Kit)

The text on a licence card is read on the phone by Google ML Kit. The image and
the text never leave the phone. ML Kit itself sends Google metrics about how
well the text recognition performs and how often it is used, and may download
model updates; Google processes that under its own terms.

### App updates

The app may check Expo's update service (expo.dev) when it starts, so that bug
fixes can arrive without a store update. The check sends the app's version,
platform and update channel, and a random id for the installation. It sends
nothing from your logbook.

### Backups and exports

A backup or an export goes wherever you send it. ShotLedger never sees it.

### Google Play and the App Store

Downloading the app through a store is covered by that store's own privacy
policy.

## Who processes the data for us

The sync service and the web app run on Cloudflare (Cloudflare, Inc.), which
stores and processes the data on ShotLedger's behalf under its data processing
addendum. Cloudflare may process data outside the EU/EEA; such transfers rely on
the EU–US Data Privacy Framework and the EU standard contractual clauses.

No one else receives the data the sync service stores.

## How long data is kept

- **Account data and your synced logbook:** until you delete your account.
  Deleting a record in the app removes its contents from the server; a marker
  that it was deleted remains so your other devices learn about it.
- **Sign-ins (IP address and app or browser identifier):** until you sign out
  or revoke the device, or until the sign-in expires: 7 days after the app was
  last used, 12 hours on the web. An expired sign-in is deleted within 15
  minutes.
- **Sign-in attempt records (IP address):** up to 15 minutes.
- **Error logs:** Cloudflare keeps the service's logs for at most 7 days.

## Deleting your account

In the app: **Settings → Account & Sync → Delete Account**. On the web: your
account page. This deletes, straight away and for good, your account, every
synced record, every uploaded photo and every sign-in. What is on your phone
stays there until you delete the app or its data.

## Your rights

Under the GDPR you can ask for a copy of your data, have it corrected or
deleted, take it with you, and object to its processing. Most of this you can
do yourself: the app exports your logbook as CSV, JSON or PDF, and deleting your
account removes everything the server has. For anything else, contact us at
the address above.

You can also complain to the Swedish Authority for Privacy Protection
(Integritetsskyddsmyndigheten, [imy.se](https://www.imy.se)) or the data
protection authority where you live.

## Children

The sync service is not intended for children under 13. A younger shooter can
use the app without an account.

## Changes to this policy

The policy's history is public in the
[ShotLedger repository](https://github.com/shotledger/shotledger/commits/main/docs/manual/reference/privacy-policy.md).
A change that affects what is collected or why is announced in the app's
release notes before it takes effect.
