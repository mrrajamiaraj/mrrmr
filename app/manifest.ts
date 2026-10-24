import type { MetadataRoute } from "next";

// "Add to Home Screen" / "Install app": opens full-screen with the RMR mark, starting on the Bank Account page.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "RMR Finance",
    short_name: "RMR Finance",
    description: "Bank balance, debtors, loans and credit cards in one private workspace.",
    start_url: "/account",
    display: "standalone",
    background_color: "#F5F4F0",
    theme_color: "#1F4D3A",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png", purpose: "any" },
    ],
  };
}
