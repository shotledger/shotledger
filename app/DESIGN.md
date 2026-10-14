---
name: ShotLedger
description: A target-shooting logbook built to instrument tolerances — dark, quiet, and legible in sunlight.
colors:
  signal-lavender: '#B98CFF'
  on-lavender: '#1A1226'
  ink-purple: '#16101F'
  surface-purple: '#221934'
  surface-purple-raised: '#2E2246'
  bone-white: '#F6EEE4'
  muted-lilac: '#C9B9DC'
  border-violet: '#7360B0'
  selected-violet: '#3B2A5E'
  alert-coral: '#FF7A85'
  confirm-mint: '#4FD68C'
  caution-amber: '#F2C062'
  light-signal-lavender: '#6E30CF'
  light-paper: '#FCFBFE'
  light-surface: '#F4F1F8'
  light-surface-raised: '#E7E1EF'
  light-ink: '#1A1325'
  light-muted: '#635874'
  light-card-white: '#FFFFFF'
  light-selected: '#EADDFF'
  light-border: '#857A9B'
  light-caution-amber: '#9A5B00'
typography:
  display:
    fontFamily: 'system-ui'
    fontSize: '48px'
    fontWeight: 600
    lineHeight: '52px'
  headline:
    fontFamily: 'system-ui'
    fontSize: '32px'
    fontWeight: 600
    lineHeight: '44px'
  body:
    fontFamily: 'system-ui'
    fontSize: '16px'
    fontWeight: 500
    lineHeight: '24px'
  label:
    fontFamily: 'system-ui'
    fontSize: '14px'
    fontWeight: 500
    lineHeight: '20px'
  label-strong:
    fontFamily: 'system-ui'
    fontSize: '14px'
    fontWeight: 700
    lineHeight: '20px'
  code:
    fontFamily: 'ui-monospace, monospace'
    fontSize: '12px'
    fontWeight: 500
rounded:
  small: '8px'
  medium: '12px'
  large: '20px'
  pill: '999px'
spacing:
  half: '2px'
  one: '4px'
  two: '8px'
  three: '16px'
  four: '24px'
  five: '32px'
  six: '64px'
components:
  button-primary:
    backgroundColor: '{colors.signal-lavender}'
    textColor: '{colors.on-lavender}'
    typography: '{typography.label-strong}'
    rounded: '{rounded.medium}'
    padding: '16px 24px'
  card:
    backgroundColor: '{colors.surface-purple}'
    borderColor: 'none (light theme: {colors.light-border})'
    textColor: '{colors.bone-white}'
    rounded: '{rounded.medium}'
    padding: '16px'
  chip-neutral:
    backgroundColor: '{colors.surface-purple-raised}'
    textColor: '{colors.bone-white}'
    typography: '{typography.label}'
    rounded: '{rounded.pill}'
    padding: '2px 8px'
  chip-primary:
    backgroundColor: '{colors.signal-lavender}'
    textColor: '{colors.on-lavender}'
    typography: '{typography.label}'
    rounded: '{rounded.pill}'
    padding: '2px 8px'
  fab:
    backgroundColor: '{colors.signal-lavender}'
    textColor: '{colors.on-lavender}'
    typography: '{typography.label-strong}'
    rounded: '{rounded.pill}'
    padding: '16px 24px'
  segmented-track:
    backgroundColor: '{colors.surface-purple}'
    rounded: '{rounded.medium}'
    padding: '2px'
  segmented-segment-selected:
    backgroundColor: '{colors.selected-violet}'
    borderColor: '{colors.signal-lavender}'
    textColor: '{colors.bone-white}'
    typography: '{typography.label}'
    rounded: '{rounded.small}'
    padding: '8px'
  stat-tile:
    backgroundColor: '{colors.surface-purple}'
    textColor: '{colors.bone-white}'
    rounded: '{rounded.medium}'
    padding: '16px'
---

# Design System: ShotLedger

## Overview

**Creative North Star: "The Precision Logbook"**

ShotLedger is the notebook a shooter keeps at the range, built to the tolerances
of a measuring instrument. A paper logbook is unadorned because its job is to
hold numbers accurately and be readable in whatever light the range has; a
scoring gauge is exact because a tenth of a millimeter decides a ring. This
system answers to both. Every surface exists to report a value, and anything
that does not help a number read is removed.

The app is dark by default and near-monochrome by discipline. The ground is a
deep ink purple (`#16101F`), not black, and every neutral above it is
purple-tinted rather than gray — the theme's own source comment makes that a
rule, not a preference. Depth comes from tone, not from shadow: surfaces
separate by getting lighter, and the only shadow in the entire application
belongs to the floating action button. A single lavender accent carries every
interactive affordance, and its scarcity is what makes it readable at a glance
between series.

Restraint here is functional, not stylistic. The app is used outdoors in bright
sunlight, where glare eats low-contrast detail, and it is used in the seconds
between shooting one series and starting the next. Contrast is asserted in
tests, not eyeballed. Ornament would cost legibility and buy nothing.

**Key Characteristics:**

- Dark ground, purple-tinted neutrals, never gray
- Depth by tonal layering; exactly one shadow in the system
- One accent, used sparingly, carrying all interaction
- A four-step radius scale and a seven-step spacing scale — no ad-hoc values
- Contrast treated as a tested invariant, because the range is sunlit
- Precise and restrained: tight spacing, sharp hierarchy, no decoration

## Colors

A near-monochrome purple system: one bright accent doing all the signalling,
against a graded stack of purple surfaces, with three semantic colors reserved
for outcome and a separate set for charts.

**Where they live.** Every value on this page — colours, chart colours,
spacing, radius and the type scale — is defined once in
`shared/src/design-tokens/` (no React Native import) and exported from
`@shotledger/shared`. The app re-exports them from `app/src/theme/tokens.ts`;
the web turns them into CSS custom properties in `web/src/theme.ts`
(`--selected-outline`, `--data-viz-categorical-1`, `--space-three`). A colour
is never restated by hand in either.

### Primary

- **Signal Lavender** (`#B98CFF`): every interactive affordance — the one
  primary action per screen, the active tab, the outline of the selected
  segment or option, primary chips. Named for its job rather than its mood:
  it appears rarely, so where it
  appears is the answer to "what do I press?". Passes WCAG AA against both the
  ground and raised surfaces (3:1 UI minimum) and against its own foreground
  (4.5:1 text minimum); the contrast table is asserted in
  `shared/src/design-tokens/tokens.test.ts`.
- **Deep Aubergine** (`#1A1226`): the foreground laid on Signal Lavender —
  button labels, active-tab text. Never used as a surface.

### Secondary

- **Light Signal Lavender** (`#6E30CF`): the light theme's accent — Signal
  Lavender held at the same hue (263.5°) and taken down in lightness until white
  text clears AA on it. The light theme is a complete, supported theme, not a
  fallback; it is Purple Rain in a higher key, not a second palette. The stock
  blue it replaced (`#208AEF`) was unrelated to the dark accent and carried only
  3.53:1 against its own white label.

### Neutral

- **Ink Purple** (`#16101F`): the app ground. Deep enough to read as near-black
  in sunlight, purple enough to never read as a default dark mode.
- **Surface Purple** (`#221934`): cards, tiles, list groups, segmented-control
  tracks — the standard raised surface.
- **Raised Surface Purple** (`#2E2246`, `backgroundSelected`): the pressed or
  emphasized state of a surface — a pressed row, a neutral chip. It is **not**
  the selection mechanism: at 1.14:1 against Surface Purple it fails WCAG
  1.4.11, so a chosen option uses Selected Violet with an outline instead.
- **Selected Violet** (`#3B2A5E`, `selected`; light `#EADDFF`): the fill of
  the chosen segment, option pill, tag or shot chip. Always drawn together
  with **`selectedOutline`** — Signal Lavender in dark (`#B98CFF`), Light
  Signal Lavender in light (`#6E30CF`) — so the choice is a 3:1 edge plus a
  fill, never text colour alone.
- **Bone White** (`#F6EEE4`): primary text. Warm rather than pure white, which
  keeps it from vibrating against the purple ground.
- **Muted Lilac** (`#C9B9DC`): secondary text — subtitles, hints, metadata,
  units. Still purple, never gray.
- **Border Violet** (`#7360B0`; light `#857A9B`): borders and dividers, used
  sparingly since most separation is tonal. Both clear 3:1 against the ground
  and the card surface. The light border was `#D4CDDF` until #822, at 1.50:1
  — fields and cards had no visible edge.
- **Surface** (`surface`): what a card is drawn in. Dark: Surface Purple, the
  same value as `backgroundElement`. Light: white (`#FFFFFF`) on the
  off-white ground, which alone does not separate, so light cards also carry
  a 1px `border`.

### Semantic

- **Alert Coral** (`#FF7A85`): destructive actions and error states — delete
  confirmations, failed restores.
- **Confirm Mint** (`#4FD68C`): success and completion only.
- **Caution Amber** (`#F2C062`; light `#9A5B00`, `warning`): a state that
  needs attention soon — a licence due for renewal. Semantic only, always
  with words beside it; the "no yellow buttons" ruling stands, so it is never
  an interactive token.

### Data visualization

Chart colours are their own tokens (`DataViz.<theme>`), separate from the
accent, so a chart never borrows the colour that means "press here". Each
value clears **3:1** against the ground, `backgroundElement` and the card
surface of its own theme, asserted in `tokens.test.ts`.

- **Categorical** (`DataViz.<theme>.categorical`) — identity, one series per
  discipline, assigned in this fixed order and never cycled:

  | Slot | Dark              | Light     |
  | ---- | ----------------- | --------- |
  | 1    | `#8C5EE8` violet  | `#7E4ED7` |
  | 2    | `#00A6BA` teal    | `#0087AB` |
  | 3    | `#C8800D` amber   | `#B66C00` |
  | 4    | `#DE4181` magenta | `#B10B69` |

  Validated with the `dataviz` skill's checker: every pair (not only
  neighbours) stays apart under protan and deutan simulation (OKLab ΔE ≥ 8)
  and for normal vision (≥ 15). Four is the limit: a chart with more
  disciplines draws the four with the most sessions and says how many it left
  out, rather than repeating a colour. The legend names every line in text
  ink, so identity never rests on colour alone.

- **Rings** (`DataViz.<theme>.rings`) — a five-step single-hue (orchid)
  ramp for ring values, weakest first: dark `#AA50B1` → `#F7CFF8`, light
  `#B75CBD` → `#5B0861`. Its hue is kept off the accent's, so a ring value
  never reads as a button.

### Named Rules

**The Purple-Tinted Neutral Rule.** There is no gray in either theme. Text,
secondary text, borders, and every surface carry the accent hue. A neutral gray
introduced anywhere reads instantly as foreign and is a defect, not a variation.
`tokens.test.ts` asserts the hue on both palettes, so a gray cannot re-enter
unnoticed. Bone White is the one deliberate exception: dark's primary text is
warm on purpose, to keep it from vibrating against the cool ground.

**The Scarce Accent Rule.** Signal Lavender marks interaction and nothing else.
Chart series take the data-viz tokens, not the accent.
It is never decorative, never a heading color, never a background for content.
If two lavender elements compete on one screen, one of them is wrong.

**The Rejected Gold Rule.** A gold accent (`#E8B84B`) was designed, passed
contrast, and was rejected by the maintainer for interactive use ("do not use
yellow for buttons", 2026-09-01). It survives in `tokens.ts` as
`PURPLE_RAIN_GOLD_ACCENT_REJECTED` so the contrast work is not lost. Never
assign it to `primary` or any other interactive token. Semantic colors are
unaffected by that ruling.

## Typography

**Font:** the platform system font throughout — `system-ui` on iOS, the platform
default on Android, `ui-monospace` / `monospace` for code. No custom typeface is
loaded, and none should be: system fonts render at every size and weight the
platform supports, ship no bytes, and match the native text rendering a shooter
already reads everywhere else on the device.

**Character:** neutral by intent. The type does no expressive work; hierarchy is
carried by size and weight alone, across a deliberately short scale. Numbers are
the content, so the system gets out of their way.

### Hierarchy

- **Display** (600, 48px/52px): screen titles — "Home", "Session". One per
  screen, at the top, never repeated.
- **Headline** (600, 32px/44px): the number that is the point of a card — a
  session total, a stat tile's value. This is where scores live.
- **Body** (500, 16px/24px): list-row titles, form values, primary reading text.
- **Label** (500, 14px/20px): secondary text, subtitles, chips, segment labels,
  metadata lines.
- **Label Strong** (700, 14px/20px): button labels and section headers within a
  card — the same size as Label, separated by weight alone.
- **Code** (500 — 700 on Android, 12px, monospace): identifiers and raw values.

### Named Rules

**The Weight-Not-Size Rule.** Label and Label Strong are the same 14px; the only
difference is weight. Emphasis at small sizes is a weight change, never a size
bump, which keeps line rhythm intact in dense rows.

**The Single-Line Control Rule.** Control labels never wrap. Segmented-control
labels are single-line and shrink or scroll rather than breaking; a label that
splits mid-word ("Competiti / ons") is a layout defect. Past four options a
segmented control scrolls horizontally instead of squeezing every label.

## Layout

A single-column, vertically stacked layout inside a centered column capped at
**800px** (`MaxContentWidth`), so the design holds on a tablet without stretching
list rows to unreadable widths.

Spacing runs on a seven-step scale — **2 / 4 / 8 / 16 / 24 / 32 / 64px**
(`half` / `one` / `two` / `three` / `four` / `five` / `six`). Card padding is 16,
inter-element gaps are 8 or 16, and 64 is reserved for the vertical breathing
room of an empty state. Values outside this scale do not appear and should not
be introduced.

Screens clear the bottom tab bar with a platform-specific inset — **50px on iOS,
80px on Android** (`BottomTabInset`) — applied as scroll-content padding so the
last row is never trapped behind the tabs. Content scrolls; the tab bar and the
floating action button do not.

Density is comfortable rather than tight: list rows use 8px vertical padding and
rely on tonal grouping inside a card rather than dividers between every row.

## Elevation & Depth

**This system is flat.** Depth is expressed entirely through tonal layering:
`Ink Purple` ground → `Surface Purple` card → `Raised Surface Purple` selection.
Three steps, each one lighter than the last, and that stack carries every
"in front of" relationship in the app.

There is exactly one exception in the entire codebase.

### Shadow Vocabulary

- **Floating action** (`elevation: 4`,
  `shadowColor: #000, offset 0 2, opacity 0.2, radius 6`): the FAB only. It is
  the single element that genuinely floats above scrolling content, so it is the
  single element that casts a shadow.

### Named Rules

**The One Shadow Rule.** The floating action button is the only element in
ShotLedger permitted a shadow. Cards, tiles, sheets, headers, and chips are flat
and separate by tone. Adding a shadow to a card is a defect, not a refinement —
it breaks the one signal that means "this floats".

## Shapes

A four-step radius scale, each step with a settled job:

- **8px** (`small`): elements nested inside another rounded surface — a segment
  inside a segmented-control track, a field inside a card.
- **12px** (`medium`): the workhorse — cards, tiles, buttons, list groups. If a
  surface is rounded and you are unsure, it is 12.
- **20px** (`large`): large containers that need a softer silhouette.
- **999px** (`pill`): chips and the floating action button — anything that reads
  as a token or a floating control rather than a panel.

Borders are rare. Most edges are defined by a tonal step rather than a stroke,
and `Border Violet` appears only where a real division is needed (an input's
resting outline, a divider between grouped sections).

## Components

Components are **precise and restrained**: quiet surfaces, exact spacing, no
ornament, and state changes that are unmistakable but never loud.

### Buttons

- **Shape:** softly rounded (12px, `Radius.medium`)
- **Primary:** Signal Lavender ground with Deep Aubergine Label Strong text,
  16px vertical / 24px horizontal padding, centered, full width. One per screen.
- **Pressed:** the whole control drops to **85% opacity**. There is no separate
  hover state — this is a touch platform.
- **The One Primary Action Rule.** `PrimaryButton` is the single most important
  action on a screen. A screen with three of them has no primary action.

### Chips

- **Style:** pill (999px), 8px horizontal / 2px vertical padding, Label type,
  self-sizing to content.
- **Neutral:** Raised Surface Purple ground, Bone White text — session type,
  tags, discipline.
- **Selectable** (option pickers, tag and shot chips): a `border` outline on
  `backgroundElement` at rest; chosen, the pill takes the `selected` fill and
  a `selectedOutline` border of the same width, so nothing moves.
- **Primary:** Signal Lavender ground, Deep Aubergine text — reserved for a chip
  that marks a genuine achievement or active filter, not general labelling.

### Cards / Containers

- **Corner Style:** 12px (`Radius.medium`)
- **Background:** `surface` — Surface Purple in dark, white in light
- **Shadow Strategy:** none, ever — see The One Shadow Rule
- **Border:** none in dark, where tone does the separating; 1px `border` in
  light, where white on off-white does not
- **Internal Padding:** 16px, with an 8px gap between stacked children

### Inputs / Fields

`app/src/components/text-field.tsx` (`TextField`) is the only text input in the
app. Nothing should style a bare `TextInput` again.

- **Style:** 1px Border Violet outline (3:1 on ground and card in both
  themes), transparent ground, 8px radius (it nests inside a card), 16px text,
  placeholder in Muted Lilac.
- **Focus:** the outline becomes Signal Lavender. This is the one place the
  Scarce Accent Rule admits a second lavender element on screen — focus is
  interaction, and only one field holds it at a time.

### Navigation

- **Bottom tab bar**, five destinations (Home, Statistics, Firearms, Tools,
  Settings), icon above a Label-sized caption.
- **Active:** icon and label in Signal Lavender. **Inactive:** Muted Lilac.
- Labels are single words wherever possible — a tab label that truncates
  ("Firearms & Am…") is a defect; shorten the label rather than shrinking the
  type.

### Segmented Control

The app's signature selector — session Series/Stats, Home's All/Series/Rounds,
theme and language pickers.

- **Track:** Surface Purple, 12px radius, 2px padding, 2px gap between segments.
- **Segment:** 8px radius, 8px padding, **48dp minimum height**, a 2px
  border on every segment; the selected one fills with `selected` and its
  border turns `selectedOutline` (6.6:1 on the dark track, 6.3:1 on the
  light), unselected ones keep a transparent border and Muted Lilac text. The 48 is Material's touch-target floor, deliberately off the
  spacing scale — a segment is a control, and a shooter taps it in gloves and
  sunlight.
- **Overflow:** labels are single-line always; **past four options** the control
  switches to content-width segments in a horizontal scroller rather than
  squeezing every label into an equal share.

### Stat Tile

The primitive behind Home's header totals and every stats readout: a Card
holding a Headline-sized number above a Label-sized caption, left-aligned, with
an 2px gap. The number is the content; the caption is the annotation.

### Empty State

Never a bare "no results" line. A centered block with 64px vertical breathing
room: Headline title, Body text in Muted Lilac, and an optional Primary Button
offering the action that would fill the screen.

## Do's and Don'ts

### Do:

- **Do** express depth with the tonal stack — Ink Purple → Surface Purple →
  Raised Surface Purple.
- **Do** show a selection as `selected` fill plus `selectedOutline` border —
  never by text colour or border width alone.
- **Do** take chart colours from `DataViz`, in slot order.
- **Do** take spacing from the seven-step scale (2/4/8/16/24/32/64) and radius
  from the four-step scale (8/12/20/999).
- **Do** keep Signal Lavender scarce; one interactive accent per screen region.
- **Do** assert contrast in `shared/src/design-tokens/tokens.test.ts` when
  adding or changing a color — sunlight legibility is a tested invariant here, not a
  judgement call.
- **Do** keep control labels on one line, shrinking or scrolling instead of
  wrapping.
- **Do** use weight, not size, to emphasize at 14px.

### Don't:

- **Don't** add a shadow to anything but the floating action button.
- **Don't** introduce a neutral gray into the dark theme; every neutral is
  purple-tinted.
- **Don't** assign `PURPLE_RAIN_GOLD_ACCENT_REJECTED` (`#E8B84B`) to `primary`
  or any interactive token — it is retained for its contrast work only.
- **Don't** put more than one Primary Button on a screen.
- **Don't** invent a radius or spacing value outside the scales.
- **Don't** load a custom typeface; the platform system font is the deliberate
  choice.
- **Don't** let a tab or control label truncate — shorten the string instead.
