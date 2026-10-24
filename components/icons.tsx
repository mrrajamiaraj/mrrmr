type P = { size?: number; className?: string; strokeWidth?: number };

function Svg({ size = 22, className, strokeWidth = 1.8, children }: P & { children: React.ReactNode }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className}>
      {children}
    </svg>
  );
}

export const WalletIcon = (p: P) => (
  <Svg {...p}><path d="M20 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-2" /><path d="M21 9h-6a3 3 0 0 0 0 6h6z" /></Svg>
);
export const BankIcon = (p: P) => (
  <Svg {...p}><path d="M3 10l9-6 9 6" /><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8" /><path d="M3 21h18" /></Svg>
);
export const CardIcon = (p: P) => (
  <Svg {...p}><rect x="2.5" y="5" width="19" height="14" rx="2.5" /><path d="M2.5 10h19M6.5 15h4" /></Svg>
);
export const PersonIcon = (p: P) => (
  <Svg strokeWidth={2} {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21c1-4 4-6 8-6s7 2 8 6" /></Svg>
);
export const PeopleIcon = (p: P) => (
  <Svg strokeWidth={2} {...p}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20c-.5-2.5-2-4.2-4-5" /></Svg>
);
export const PlusIcon = (p: P) => <Svg strokeWidth={2.2} {...p}><path d="M12 5v14M5 12h14" /></Svg>;
export const LockIcon = (p: P) => (
  <Svg strokeWidth={2} {...p}><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></Svg>
);
export const EyeIcon = (p: P) => (
  <Svg strokeWidth={2} {...p}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></Svg>
);
export const EyeOffIcon = (p: P) => (
  <Svg strokeWidth={2} {...p}><path d="M10.6 5.1A10.8 10.8 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-2.7 3.6M6.6 6.6C3.7 8.5 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M3 3l18 18" /></Svg>
);
export const KeyIcon = (p: P) => (
  <Svg strokeWidth={2} {...p}><circle cx="7.5" cy="15.5" r="4.5" /><path d="M10.7 12.3L20 3M16 7l3 3M14 9l2 2" /></Svg>
);
export const CloseIcon = (p: P) => <Svg strokeWidth={2} {...p}><path d="M6 6l12 12M18 6L6 18" /></Svg>;
export const PencilIcon = (p: P) => <Svg strokeWidth={2} {...p}><path d="M4 20h4L19 9l-4-4L4 16z" /></Svg>;
export const SearchIcon = (p: P) => <Svg strokeWidth={2} {...p}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></Svg>;
export const ChevronLeft = (p: P) => <Svg strokeWidth={2} {...p}><path d="M15 6l-6 6 6 6" /></Svg>;
export const ChevronRight = (p: P) => <Svg strokeWidth={2} {...p}><path d="M9 6l6 6-6 6" /></Svg>;
export const ShieldIcon = (p: P) => (
  <Svg {...p}><path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z" /><path d="M9 12l2 2 4-4" /></Svg>
);
export const TrendIcon = (p: P) => <Svg strokeWidth={2} {...p}><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></Svg>;
export const HistoryIcon = (p: P) => (
  <Svg strokeWidth={2} {...p}><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5M12 7v5l3 2" /></Svg>
);
export const TrashIcon = (p: P) => (
  <Svg strokeWidth={2} {...p}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></Svg>
);
export const DownloadIcon = (p: P) => (
  <Svg strokeWidth={2} {...p}><path d="M12 4v11M7 10l5 5 5-5" /><path d="M4 20h16" /></Svg>
);
export const LogoutIcon = (p: P) => (
  <Svg strokeWidth={2} {...p}><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 17l-5-5 5-5M5 12h11" /></Svg>
);
export const FlaskIcon = (p: P) => (
  <Svg {...p}><path d="M9 3h6M10 3v6L4.5 18.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3" /><path d="M7 15h10" /></Svg>
);
export const CheckIcon = (p: P) => <Svg strokeWidth={2.2} {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></Svg>;
export const ArrowRightIcon = (p: P) => <Svg strokeWidth={2} {...p}><path d="M5 12h14M13 6l6 6-6 6" /></Svg>;
export const ArrowUpIcon = (p: P) => <Svg strokeWidth={2} {...p}><path d="M12 19V5M6 11l6-6 6 6" /></Svg>;
export const CommandIcon = (p: P) => (
  <Svg {...p}><path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3" /></Svg>
);
export const SunIcon = (p: P) => (
  <Svg strokeWidth={2} {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4" /></Svg>
);
export const MoonIcon = (p: P) => <Svg strokeWidth={2} {...p}><path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z" /></Svg>;
export const MonitorIcon = (p: P) => (
  <Svg strokeWidth={2} {...p}><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></Svg>
);
export const ChipIcon = () => (
  <svg aria-hidden="true" width="40" height="30" viewBox="0 0 40 30" fill="none" stroke="var(--color-line)" strokeWidth="1.4">
    <rect x="1" y="1" width="38" height="28" rx="5" /><path d="M1 11h12M1 19h12M27 11h12M27 19h12M13 1v28M27 1v28" />
  </svg>
);
