// The caliber vocabulary. Free text made `9×19`, `9x19` and `9 mm Luger`
// three different calibers; the picker now offers this list and nothing else.
//
// Canonical spelling, one rule per family:
//  - imperial: leading dot, no leading zero, then the cartridge's usual name
//    with only the universally-abbreviated suffixes kept (LR, ACP, WMR, HMR,
//    BMG, SIG, S&W, H&R) — manufacturers and "Magnum" spelled out.
//  - metric with a case length: `<bore>×<case> mm`, `×` is U+00D7 with no
//    spaces around it, one space before `mm`, `.` as the decimal separator,
//    a rimmed `R` attached to the case length (`7.62×54R mm`).
//  - metric bore only (air): `<bore> mm`.
//
// Scope: target-shooting chamberings plus the range-shot hunting rifle
// cartridges a European or North American shooter is likely to hold a license
// for. No shotgun gauges (`weapon_type` has no shotgun), no dangerous-game or
// wildcat tail, no muzzleloaders.

export const CALIBER_FAMILIES = ['air', 'rimfire', 'handgun', 'rifle'] as const;
export type CaliberFamily = (typeof CALIBER_FAMILIES)[number];

export interface CaliberPreset {
  /** Canonical spelling — this is what lands in the DB column. */
  readonly name: string;
  readonly family: CaliberFamily;
  /**
   * Spellings seen in the wild that mean this caliber, as already-normalized
   * keys (see `caliberKey`). The canonical name's own key is added
   * automatically and is not repeated here.
   */
  readonly aliases?: readonly string[];
}

export const CALIBER_PRESETS: readonly CaliberPreset[] = [
  // --- Air ---------------------------------------------------------------
  { name: '4.5 mm', family: 'air', aliases: ['177', '177cal', '4.5mmdiabolo'] },
  { name: '5.5 mm', family: 'air' },
  { name: '6.35 mm', family: 'air' },

  // --- Rimfire -----------------------------------------------------------
  { name: '.22 Short', family: 'rimfire' },
  { name: '.22 LR', family: 'rimfire', aliases: ['22longrifle', '22l.r.'] },
  { name: '.22 WMR', family: 'rimfire', aliases: ['22mag', '22magnum', '22wmrf', '22winmag'] },
  { name: '.17 HMR', family: 'rimfire', aliases: ['17hornadymagnumrimfire'] },

  // --- Centerfire handgun ------------------------------------------------
  { name: '.25 ACP', family: 'handgun', aliases: ['25auto', '6.35browning', '6.35x16'] },
  { name: '.32 ACP', family: 'handgun', aliases: ['32auto', '7.65browning', '7.65x17'] },
  { name: '.32 S&W Long', family: 'handgun', aliases: ['32swlong', '32smith&wessonlong'] },
  { name: '.32 H&R Magnum', family: 'handgun', aliases: ['32hrmagnum', '32hrmag', '32h&rmag'] },
  { name: '.327 Federal Magnum', family: 'handgun', aliases: ['327federal', '327fedmag'] },
  { name: '7.62×25 mm Tokarev', family: 'handgun', aliases: ['7.62x25', '7.62tokarev'] },
  {
    name: '7.65×21 mm Parabellum',
    family: 'handgun',
    aliases: ['7.65x21', '7.65luger', '7.65parabellum', '30luger'],
  },
  {
    name: '.380 ACP',
    family: 'handgun',
    aliases: ['380auto', '9x17mm', '9x17', '9mmshort', '9mmkurz', '9mmcorto', '9mmbrowningshort'],
  },
  { name: '9×18 mm Makarov', family: 'handgun', aliases: ['9x18', '9mmmakarov', '9mmmak'] },
  {
    name: '9×19 mm',
    family: 'handgun',
    aliases: [
      '9mm',
      '9mmluger',
      '9mmparabellum',
      '9mmpara',
      '9x19luger',
      '9x19mmluger',
      '9x19parabellum',
      '9mmnato',
      '9x19nato',
    ],
  },
  { name: '9×21 mm', family: 'handgun', aliases: ['9x21imi', '9mmimi'] },
  { name: '.38 Special', family: 'handgun', aliases: ['38spl', '38spec', '38sp', '38special+p'] },
  { name: '.38 Super', family: 'handgun', aliases: ['38superauto', '38supercomp'] },
  { name: '.357 Magnum', family: 'handgun', aliases: ['357mag', '357magnum', '9x33r'] },
  { name: '.357 SIG', family: 'handgun', aliases: ['357sigsauer'] },
  { name: '.40 S&W', family: 'handgun', aliases: ['40sw', '40smith&wesson', '10x22'] },
  { name: '10 mm Auto', family: 'handgun', aliases: ['10mm', '10x25'] },
  { name: '.41 Magnum', family: 'handgun', aliases: ['41mag', '41remingtonmagnum'] },
  { name: '.44 Special', family: 'handgun', aliases: ['44spl', '44spec'] },
  { name: '.44 Magnum', family: 'handgun', aliases: ['44mag', '44remingtonmagnum'] },
  { name: '.45 ACP', family: 'handgun', aliases: ['45auto', '11.43x23'] },
  { name: '.45 Colt', family: 'handgun', aliases: ['45longcolt', '45lc'] },
  { name: '.454 Casull', family: 'handgun' },
  { name: '.500 S&W Magnum', family: 'handgun', aliases: ['500sw', '500swmag'] },

  // --- Centerfire rifle --------------------------------------------------
  { name: '.22 Hornet', family: 'rifle', aliases: ['5.6x35r'] },
  { name: '.204 Ruger', family: 'rifle', aliases: ['204'] },
  { name: '.222 Remington', family: 'rifle', aliases: ['222rem', '222'] },
  { name: '.223 Remington', family: 'rifle', aliases: ['223rem', '223'] },
  { name: '5.56×45 mm', family: 'rifle', aliases: ['5.56nato', '5.56x45nato', '5.56mm', '5.56'] },
  { name: '.22-250 Remington', family: 'rifle', aliases: ['22-250', '22250', '22250rem'] },
  { name: '.243 Winchester', family: 'rifle', aliases: ['243win', '243'] },
  { name: '6 mm Norma BR', family: 'rifle', aliases: ['6mmbr', '6br', '6mmbrnorma'] },
  { name: '6 mm Creedmoor', family: 'rifle', aliases: ['6creedmoor', '6mmcreed'] },
  { name: '6.5 Grendel', family: 'rifle', aliases: ['6.5x39grendel'] },
  { name: '6.5×47 mm Lapua', family: 'rifle', aliases: ['6.5x47lapua', '6.5x47'] },
  {
    name: '6.5×55 mm',
    family: 'rifle',
    aliases: ['6.5x55se', '6.5x55mmse', '6.5x55swedish', '6.5swedishmauser', '6.5x55skan'],
  },
  { name: '6.5 Creedmoor', family: 'rifle', aliases: ['6.5creed', '6.5creedmore'] },
  { name: '6.5 PRC', family: 'rifle' },
  { name: '.260 Remington', family: 'rifle', aliases: ['260rem', '260'] },
  { name: '.270 Winchester', family: 'rifle', aliases: ['270win', '270'] },
  { name: '7 mm-08 Remington', family: 'rifle', aliases: ['7mm-08', '7mm08', '708'] },
  { name: '7×57 mm Mauser', family: 'rifle', aliases: ['7x57', '7mmmauser'] },
  { name: '7×64 mm', family: 'rifle', aliases: ['7x64brenneke'] },
  {
    name: '7 mm Remington Magnum',
    family: 'rifle',
    aliases: ['7mmremmag', '7remmag', '7mmrem', '7mmmagnum'],
  },
  { name: '.30 Carbine', family: 'rifle', aliases: ['7.62x33'] },
  { name: '.30-30 Winchester', family: 'rifle', aliases: ['30-30', '3030', '30-30win'] },
  { name: '.308 Winchester', family: 'rifle', aliases: ['308win', '308'] },
  { name: '7.62×51 mm', family: 'rifle', aliases: ['7.62x51nato', '7.62nato'] },
  { name: '7.62×39 mm', family: 'rifle', aliases: ['7.62x39m43'] },
  { name: '7.62×54R mm', family: 'rifle', aliases: ['7.62x54', '7.62r'] },
  {
    name: '.30-06 Springfield',
    family: 'rifle',
    aliases: ['30-06', '3006', '30.06', '30-06sprg', '7.62x63'],
  },
  { name: '.300 Blackout', family: 'rifle', aliases: ['300blk', '300aac', '300aacblackout'] },
  {
    name: '.300 Winchester Magnum',
    family: 'rifle',
    aliases: ['300winmag', '300wm', '300win'],
  },
  { name: '.303 British', family: 'rifle', aliases: ['303', '303brit'] },
  {
    name: '8×57 mm IS',
    family: 'rifle',
    aliases: ['8x57', '8x57js', '8mmmauser', '7.92x57', '8x57mmjs'],
  },
  { name: '.338 Lapua Magnum', family: 'rifle', aliases: ['338lapua', '338lm', '8.6x70'] },
  { name: '9.3×62 mm', family: 'rifle', aliases: ['9.3x62mauser'] },
  { name: '.45-70 Government', family: 'rifle', aliases: ['45-70', '4570', '45-70govt'] },
  { name: '.50 BMG', family: 'rifle', aliases: ['12.7x99'] },
] as const;

/** Canonical names in the curated display order. */
export const CALIBER_PRESET_NAMES: readonly string[] = CALIBER_PRESETS.map((preset) => preset.name);
