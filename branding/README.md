# Branding

The ShotLedger logo: the app icon's target rings with the name beside or
below it.

| File                              | Use                                      |
| --------------------------------- | ---------------------------------------- |
| `shotledger-horizontal-light.svg` | Name beside the rings, on a light ground |
| `shotledger-horizontal-dark.svg`  | Name beside the rings, on a dark ground  |
| `shotledger-stacked-light.svg`    | Name below the rings, on a light ground  |
| `shotledger-stacked-dark.svg`     | Name below the rings, on a dark ground   |
| `shotledger-mark-light.svg`       | Rings only, on a light ground            |
| `shotledger-mark-dark.svg`        | Rings only, on a dark ground             |
| `shotledger-mark-white.svg`       | Rings only, white, on a coloured ground  |

Each SVG has a transparent PNG export beside it (horizontal 256 px high,
the others 512 px). Prefer the SVG.

- **Rings:** five equal bands, as `app/assets/images/icon.png`.
- **Name:** Inter Display SemiBold (SIL Open Font License), tracking −1 %,
  converted to outlines, so no font is needed to render it. "Shot" is the
  text colour, "Ledger" the primary colour.
- **Colours:** `app/src/theme/colors.ts`. Light ground: rings and "Ledger"
  `#6E30CF`, "Shot" `#1A1325`. Dark ground: rings and "Ledger" `#B98CFF`,
  "Shot" `#F6EEE4`.

Used in: the root `README.md`, `docs/manual/assets/` (the manual's header logo, favicon and
home page) and `Wordmark` in `web/src/shell/icons.tsx` (the web app's menu
pane, coloured from the theme).
