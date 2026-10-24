import { ImageResponse } from "next/og";

// Home-screen icon for iPhone/iPad (and the PNG the manifest offers Android). iOS rounds the corners itself,
// so this fills the square edge to edge. Same drawing as app/icon.svg, scaled up.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "linear-gradient(135deg, #2E6B52, #163A2B)" }}>
        <svg width="180" height="180" viewBox="0 0 32 32">
          <path d="M11 23V9h5.5a4.5 4.5 0 0 1 0 9H11" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M16 18l5 5" fill="none" stroke="#9FD9B8" strokeWidth="2.6" strokeLinecap="round" />
        </svg>
      </div>
    ),
    size
  );
}
