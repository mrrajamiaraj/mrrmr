import { ImageResponse } from "next/og";

// Home-screen icon for iPhone/iPad (and the PNG the manifest offers Android). iOS rounds the corners itself,
// so this fills the square edge to edge. Same drawing as app/icon.svg and components/brand.tsx, scaled up.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "linear-gradient(135deg, #16705A, #0A3E32)" }}>
        <svg width="180" height="180" viewBox="0 0 32 32">
          <path d="M8.5 23V9.5l7.5 8" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M16 17.5l7.5-8V23" fill="none" stroke="#A8E0C8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    ),
    size
  );
}
