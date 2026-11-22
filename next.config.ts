import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/** SITE_URL's host (e.g. "mrrmr.example.com"), or null when unset/invalid. */
const siteHost = (() => {
  try { return process.env.SITE_URL ? new URL(process.env.SITE_URL).host : null; } catch { return null; }
})();

// The Content-Security-Policy is NOT set here any more: proxy.ts sets a per-request nonce policy (lib/csp.ts) on every
// page, route and action response. Files the proxy doesn't run for (static chunks, images, the manifest) get the
// static policy below, which is stricter than any page needs: they never run scripts.
const assetCsp = "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox";
const securityHeaders = [
  // Older browsers that ignore frame-ancestors: never render this app inside someone else's frame.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // Our responses may not be embedded by other sites (images, scripts, PDFs), and no Flash/Acrobat cross-domain policy.
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  // HTTPS only, for two years, once deployed (localhost stays plain HTTP). Not "preload": see docs/SECURITY.md.
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
];

const nextConfig: NextConfig = {
  // A stray package-lock.json in the home folder otherwise confuses root detection.
  turbopack: { root: __dirname },
  // Dev logs every server action's arguments by default, which would print passwords (changePassword, signIn).
  logging: { serverFunctions: false },
  // Don't advertise the framework in every response.
  poweredByHeader: false,
  experimental: {
    serverActions: {
      // Same-origin is always allowed; this list adds only our own public host (from SITE_URL), never a wildcard,
      // for the case where a proxy in front reports a different Host.
      allowedOrigins: siteHost ? [siteHost] : [],
      // No form here sends more than a few KB (the biggest is a 10-payer card purchase); 1 MB default → 100 KB.
      bodySizeLimit: "100kb",
    },
    // Client cache: a page you just opened (or that a tab prefetched) is reused for a short while, so switching tabs
    // back and forth is instant. Any save (a server action calling revalidatePath) and pull-to-refresh clear it, so
    // your own changes always show at once; only edits made elsewhere (another device) can take up to 2 minutes.
    staleTimes: { dynamic: 60, static: 120 },
  },
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      { source: "/:file*.(svg|png|jpg|jpeg|gif|webp|ico)", headers: [{ key: "Content-Security-Policy", value: assetCsp }] },
      { source: "/manifest.webmanifest", headers: [{ key: "Content-Security-Policy", value: assetCsp }] },
      // Signed-in pages and the CSV hold private figures: never store them in shared or browser caches.
      { source: "/(account|debtors|cards|research|export)(.*)", headers: [{ key: "Cache-Control", value: "private, no-store" }] },
    ];
  },
};

export default nextConfig;
