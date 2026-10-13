# WebShooter without webshooter.se

The app can serve WebShooter from canned data instead of the live site:
`app/src/features/webshooter/dev-mock.ts`, swapped in under the real client
so the endpoint, cache and schema code all run. Use it for any import, My
Starts or records check. Never point a check at the live site for a
screenshot: its results carry other shooters' names and card numbers.

## Turn it on

1. Open `/dev` and switch **Webshooter Dev Mock** on (the `webshooterMock`
   flag; needs dev tools, so any dev build or the web preview).
2. **Settings → External Sites**: switch **Webshooter** on, type anything in
   the API token field and press **Connect with Token**. It should read
   "Connected — card number 99999". Nothing leaves the machine.
3. Load demo data from `/dev` if the check needs firearms.

The token is stored and the card number is saved as the `webshooterCardNumber`
setting, as with a real sign-in. Disconnect from the same screen to clear it.

## What it serves

| Competition                    | Type                  | Results                                                                                              |
| ------------------------------ | --------------------- | ---------------------------------------------------------------------------------------------------- |
| 9001 Klubbmästerskap Precision | precision             | one own start, C2, with a särskjutning series                                                       |
| 9002 Distriktsmästerskap Fält  | field                 | own C2 (with a shoot-off) and A3, plus another shooter's row (card 88888) that must never be offered |
| 9003 Framtida match            | precision, dated 2099 | a signup and patrol for My Starts; never offered for import                                          |

Jump straight to a review with `/webshooter/import/<id>`.

## Gotchas

- Every path the client requests must be matched literally in
  `requestJson`, leading slash included, and return the **response** schema's
  shape (e.g. `{ user: {...} }` for `/authenticate/user`). An unmatched path
  throws, and the connect screen only says "Could not connect".
- Mock data is invented. Mirror the wire shape of a real response, never its
  values; add a row here when a bug needs a shape the mock lacks (the
  other-shooter row exists because the review once listed everyone).
- `expo start` writes `app/.expo/types` and `app/expo-env.d.ts`. Delete them
  before `pnpm check`, or typed routes fail `tsc` on files you did not touch.
