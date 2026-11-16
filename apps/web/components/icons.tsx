// Simple inline icons (no external icon library). Decorative: aria-hidden.
type Props = { size?: number };
const base = (size: number) => ({
  width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
  strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true,
});

export const CompassIcon = ({ size = 28 }: Props) => (
  <svg {...base(size)}><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2 5-5 2 2-5z" /></svg>
);
export const HomeIcon = ({ size = 22 }: Props) => (
  <svg {...base(size)}><path d="M4 11 12 4l8 7" /><path d="M6 10v9h12v-9" /></svg>
);
export const BookIcon = ({ size = 22 }: Props) => (
  <svg {...base(size)}><path d="M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" /><path d="M5 17a3 3 0 0 1 3-3h10" /></svg>
);
export const NoteIcon = ({ size = 22 }: Props) => (
  <svg {...base(size)}><path d="M6 3h9l4 4v14H6z" /><path d="M9 12h7M9 16h5" /></svg>
);
export const TemplateIcon = ({ size = 22 }: Props) => (
  <svg {...base(size)}><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 7h8M8 11h8M8 15h4" /></svg>
);
export const SearchIcon = ({ size = 22 }: Props) => (
  <svg {...base(size)}><circle cx="11" cy="11" r="6" /><path d="m20 20-4.5-4.5" /></svg>
);
export const MoreIcon = ({ size = 22 }: Props) => (
  <svg {...base(size)}><circle cx="5" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="19" cy="12" r="1.2" /></svg>
);
export const SettingsIcon = ({ size = 22 }: Props) => (
  <svg {...base(size)}><circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" /></svg>
);
export const ChevronLeftIcon = ({ size = 18 }: Props) => (
  <svg {...base(size)}><path d="m15 5-7 7 7 7" /></svg>
);
export const ChevronRightIcon = ({ size = 18 }: Props) => (
  <svg {...base(size)}><path d="m9 5 7 7-7 7" /></svg>
);
