// Inline icons: the web app takes no icon dependency.
import type { SVGProps } from 'react';

const base: SVGProps<SVGSVGElement> = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

/** The app icon's rings. */
export function BrandMark() {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" aria-hidden className="brand-mark">
      <circle cx={12} cy={12} r={10} fill="none" stroke="currentColor" strokeWidth={2.2} />
      <circle cx={12} cy={12} r={6} fill="none" stroke="currentColor" strokeWidth={2.2} />
      <circle cx={12} cy={12} r={2.2} fill="currentColor" />
    </svg>
  );
}

export function ChartIcon() {
  return (
    <svg {...base}>
      <path d="M3 3v18h18" />
      <path d="M7 15l4-4 3 3 5-6" />
    </svg>
  );
}

export function UserIcon() {
  return (
    <svg {...base}>
      <circle cx={12} cy={8} r={4} />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  );
}

export function ChevronDownIcon() {
  return (
    <svg {...base}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function SignOutIcon() {
  return (
    <svg {...base}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}
