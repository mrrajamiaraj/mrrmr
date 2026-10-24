import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono, Noto_Sans_Bengali } from "next/font/google";
import { themeScript } from "@/lib/theme-script";
import "./globals.css";

const sans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex-sans" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex-mono" });
// Plex has no ৳; this supplies it (and any Bangla names) at a matching weight.
const bangla = Noto_Sans_Bengali({ subsets: ["bengali"], weight: ["400", "500", "600"], variable: "--font-bangla", preload: false });

export const metadata: Metadata = {
  title: { default: "RMR Finance", template: "%s · RMR Finance" },
  description: "Bank balance, debtors, loans and credit cards in one private workspace.",
  applicationName: "RMR Finance",
  appleWebApp: { capable: true, title: "RMR Finance", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

// cover: lets the phone tab bar sit under the home indicator, padded by env(safe-area-inset-bottom).
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F5F4F0" },
    { media: "(prefers-color-scheme: dark)", color: "#111110" },
  ],
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The theme script sets data-theme before React hydrates, so <html> differs from the server render on purpose.
    <html lang="en" suppressHydrationWarning className={`${sans.variable} ${mono.variable} ${bangla.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
