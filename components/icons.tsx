// One icon family for the whole app: Lucide (lucide-react, pinned in package.json). Every icon here keeps the
// name and props the pages already use, so swapping the family never touches a call site.
// Icons are decorative by default (aria-hidden); a control that shows only an icon must carry its own aria-label.
import {
  ArrowRight, ArrowUp, CalendarClock, Check, ChevronLeft as LChevronLeft, ChevronRight as LChevronRight, CircleAlert,
  Command, CreditCard, Download, Ellipsis, Eye, EyeOff, FlaskConical, House, Inbox, Info, KeyRound, Landmark,
  LockKeyhole, LogOut, Monitor, Moon, PanelLeft, PenLine, Plus, RefreshCw, RotateCcwClock, Search, Settings2, ShieldCheck, Sun,
  Trash, TrendingUp, UserRound, Users, Wallet, X, type LucideIcon,
} from "lucide-react";

type P = { size?: number; className?: string; strokeWidth?: number };

/** Wraps a Lucide icon with the app's defaults: 22px, 1.8 stroke, hidden from screen readers. */
const icon = (I: LucideIcon, defaultStroke = 1.8) => {
  const C = ({ size = 22, className, strokeWidth = defaultStroke }: P) => (
    <I aria-hidden="true" focusable="false" size={size} strokeWidth={strokeWidth} className={className} />
  );
  C.displayName = I.displayName;
  return C;
};

export const WalletIcon = icon(Wallet);
export const BankIcon = icon(Landmark);
export const CardIcon = icon(CreditCard);
export const PersonIcon = icon(UserRound, 2);
export const PeopleIcon = icon(Users, 2);
export const PlusIcon = icon(Plus, 2.2);
export const LockIcon = icon(LockKeyhole, 2);
export const EyeIcon = icon(Eye, 2);
export const EyeOffIcon = icon(EyeOff, 2);
export const KeyIcon = icon(KeyRound, 2);
export const CloseIcon = icon(X, 2);
export const PencilIcon = icon(PenLine, 2);
export const SearchIcon = icon(Search, 2);
export const ChevronLeft = icon(LChevronLeft, 2);
export const ChevronRight = icon(LChevronRight, 2);
export const ShieldIcon = icon(ShieldCheck);
export const TrendIcon = icon(TrendingUp, 2);
export const HistoryIcon = icon(RotateCcwClock, 2);
export const TrashIcon = icon(Trash, 2);
export const DownloadIcon = icon(Download, 2);
export const LogoutIcon = icon(LogOut, 2);
export const FlaskIcon = icon(FlaskConical);
export const CheckIcon = icon(Check, 2.2);
export const ArrowRightIcon = icon(ArrowRight, 2);
export const ArrowUpIcon = icon(ArrowUp, 2);
export const CommandIcon = icon(Command);
export const SunIcon = icon(Sun, 2);
export const MoonIcon = icon(Moon, 2);
export const MonitorIcon = icon(Monitor, 2);
// New in the design system.
export const AlertIcon = icon(CircleAlert, 2);
export const InfoIcon = icon(Info, 2);
export const InboxIcon = icon(Inbox);
export const RetryIcon = icon(RefreshCw, 2);
export const DueIcon = icon(CalendarClock, 2);
export const MoreIcon = icon(Ellipsis, 2);
export const HomeIcon = icon(House);
export const SidebarIcon = icon(PanelLeft, 2);
export const SettingsIcon = icon(Settings2, 2);

/** The card chip on the card visual: not an icon, a drawing, so it stays custom. */
export const ChipIcon = () => (
  <svg aria-hidden="true" width="40" height="30" viewBox="0 0 40 30" fill="none" stroke="var(--color-line)" strokeWidth="1.4">
    <rect x="1" y="1" width="38" height="28" rx="5" /><path d="M1 11h12M1 19h12M27 11h12M27 19h12M13 1v28M27 1v28" />
  </svg>
);
