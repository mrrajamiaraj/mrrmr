import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono, Instrument_Serif, Noto_Sans_Bengali } from "next/font/google";
import { headers } from "next/headers";
import { themeScript } from "@/lib/theme-script";
import "./globals.css";

const sans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex-sans" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex-mono" });
// Editorial display face: page titles and the wordmark only (figures stay in Plex for tabular digits).
const display = Instrument_Serif({ subsets: ["latin"], weight: "400", variable: "--font-instrument" });
// Plex has no ৳; this supplies it (and any Bangla names) at a matching weight.
const bangla = Noto_Sans_Bengali({ subsets: ["bengali"], weight: ["400", "500", "600"], variable: "--font-bangla", preload: false });

export const metadata: Metadata = {
  title: { default: "MRRMR", template: "%s · MRRMR" },
  description: "Private financial workspace: bank balance, debtors, loans, credit cards and research ledger.",
  applicationName: "MRRMR",
  appleWebApp: { capable: true, title: "MRRMR", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

// cover: lets the phone tab bar sit under the home indicator, padded by env(safe-area-inset-bottom).
// Colours: the page token of Executive Minimal (light) and Midnight Finance (dark).
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F4F4F1" },
    { media: "(prefers-color-scheme: dark)", color: "#0A0D13" },
  ],
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Per-request nonce from proxy.ts: the CSP only runs inline scripts that carry it.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    // The theme script sets data-theme before React hydrates, so <html> differs from the server render on purpose.
    <html lang="en" suppressHydrationWarning className={`${sans.variable} ${mono.variable} ${display.variable} ${bangla.variable}`}>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body suppressHydrationWarning>
        {/* Aurora: slow-drifting light behind every page (decorative; still under reduced motion). */}
        <div className="aurora" aria-hidden="true"><span /><span /><span /></div>
        {children}
      </body>
    </html>
  );
}
