# MRRMR Design System

How the interface is put together, so changes stay consistent. Tokens live in `app/globals.css`; primitives in
`components/ui.tsx`; the shell in `components/shell.tsx`.

## Themes
| Key (stored) | Name | Character |
| --- | --- | --- |
| `light` | **Executive Minimal** | porcelain paper `#F4F4F1`, graphite ink `#14161A`, deep jade `#0E5A48`, brass for money owed |
| `dark` | **Midnight Finance** | midnight `#0A0D13`, silver ink `#E7EBF1`, luminous jade `#5CC4A2`, warm brass `#E8B264` |
| `system` | Auto | follows the device |

`T` toggles anywhere (ignored while typing); the Shortcuts sheet (`?`) has the three-way choice. The theme is set
before first paint by `lib/theme-script.ts`, so there's no flash.

**Contrast is tested.** `tests/contrast.test.mjs` reads `globals.css` and fails if any text/background pair drops below
WCAG AA (4.5:1 text, 3:1 marks) in either theme — including white on the *hovered* primary button.

## Tokens
* **Colour:** `page · surface · subtle · soft · line · line-strong · ink · rail`; semantic `brand / brand-2 / brand-ink`
  (good), `owed / owed-bar` (money owed), `bad` (problems, late), `info`. Each has `-tint` / `-line` companions for
  badges. Never use raw hex in a component; Research category marks (`lib/research.ts`) are the one documented
  exception (mid-tones checked ≥ 3:1 on both surfaces).
* **Type:** IBM Plex Sans (UI, figures — tabular digits everywhere money appears), Instrument Serif (`font-display`:
  page titles and wordmark only, never numbers), Noto Sans Bengali for ৳ and Bangla names. Scale: `text-display`,
  `text-title`, `text-figure`, `text-heading`, `text-body`, `text-small`, `text-micro`; `eyebrow` for uppercase labels.
* **Shape:** radius `sm 6 · md 8 · lg 10 (controls) · xl 14 (cards) · 2xl 18 (sheets)`. Elevation `shadow-card`
  (resting) → `shadow-lift` (hover) → `shadow-pop` (dialogs, menus, toasts).
* **Layout:** `--sidebar-w` 256px (≥1024px), `--bottom-nav-h` 62px (<1024px), `page-gutter` respects notches.

## Components (`components/ui.tsx` unless noted)
| Need | Use |
| --- | --- |
| Buttons | `Button` / `buttonClass(variant, size)` — `primary · secondary · ghost · danger · quiet`; `IconButton` (label required) |
| Money | `Money` (tabular, optional ± with screen-reader "plus/minus"); KPI rows: `Statement` + `Figure` (`balance-editor.tsx`) |
| Status | `StatusPill`, `DuePill` (late = icon + word, not colour alone) in `debtors/bits.tsx`; generic `Badge` |
| Sections & tables | `SectionCard` + `SectionHead`, `th/td/theadRow/totalRow`, `.stack-table` (rows become cards < 640px) |
| Dialogs | `Modal` (bottom sheet on phones, centred or `side` drawer on larger screens; focus trap, Esc, focus return) |
| Confirm destructive | `DeleteRecordDialog` / `ClearHistoryDialog` — always, with "cannot be undone" wording |
| Menus | `Menu` (WAI-ARIA menu button: arrows, Home/End, Esc, outside click) |
| Hints | `Tooltip` (hover + focus, Esc dismiss) — never the only place critical detail appears |
| States | `EmptyState`, `ErrorState` (+ `app/(dashboard)/error.tsx`, retry re-fetches), `Skeleton` / `loading.tsx` |
| Feedback | `toast(text, "success" \| "error" \| "info")` — errors use `role="alert"` |
| Icons | `components/icons.tsx` — Lucide (pinned), same names as before; decorative (`aria-hidden`) by default |

## Shell
* **≥1024px:** fixed sidebar — wordmark, search (Ctrl K), sections grouped (Money · Lending · Credit cards · Ledgers),
  then theme, export, shortcuts, admin, sign out. Viewer sees only Research plus a "View only" notice.
* **<1024px:** compact top bar (wordmark, search, theme, More menu) + bottom tab bar with safe-area padding.
* **Every page:** `Shell` renders the eyebrow (group), display-serif title, one-line description and page actions;
  a skip link jumps to `#main`.

## Motion
Entrances 200–420ms on `--ease-out-expo`; no motion is load-bearing. `prefers-reduced-motion: reduce` collapses all
animation and transition to ~0 (and back-to-top scrolls instantly). No glassmorphism beyond the translucent bars.
