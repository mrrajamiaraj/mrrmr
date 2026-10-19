import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono, Noto_Sans_Bengali } from "next/font/google";
import "./globals.css";

const sans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex-sans" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex-mono" });
// Plex has no ৳; this supplies it (and any Bangla names) at a matching weight.
const bangla = Noto_Sans_Bengali({ subsets: ["bengali"], weight: ["400", "500", "600"], variable: "--font-bangla", preload: false });

export const metadata: Metadata = {
  title: "Finance Workspace",
  description: "Accounts, debtor receivables, loan tracking and credit cards",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} ${bangla.variable}`}>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
