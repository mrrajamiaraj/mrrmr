import type { MetadataRoute } from "next";

// "Add to Home Screen" / "Install app": opens full-screen with the MRRMR mark, starting on the Bank Account page.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MRRMR",
    short_name: "MRRMR",
    description: "Private financial workspace: bank balance, debtors, loans, credit cards and research ledger.",
    start_url: "/account",
    display: "standalone",
    background_color: "#F4F4F1",
    theme_color: "#0E5A48",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png", purpose: "any" },
    ],
  };
}
