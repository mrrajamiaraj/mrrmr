"use client"; // Next 16: replaces the root layout when it fails, so it renders its own <html> and <body>.

/**
 * Last-resort error page. Shows no internal details (in production Next passes only a digest), keeps the page usable
 * with a retry, and never prints the error to the screen.
 */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error && "digest" in error ? String((error as Error & { digest?: string }).digest ?? "") : "";
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100dvh", display: "grid", placeItems: "center", background: "#F4F4F1", color: "#14161A", font: "15px/1.5 system-ui, sans-serif" }}>
        <main style={{ maxWidth: 440, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 22, margin: "0 0 8px" }}>MRRMR couldn’t load</h1>
          <p style={{ margin: "0 0 16px", color: "#55554F" }}>Nothing was changed — your records are safe. This is usually a brief connection problem.</p>
          <button type="button" onClick={() => retry()} style={{ minHeight: 44, padding: "0 20px", borderRadius: 10, border: 0, background: "#0E5A48", color: "#fff", fontSize: 15, cursor: "pointer" }}>
            Try again
          </button>
          {digest && <p style={{ marginTop: 16, fontSize: 12, color: "#6B6B64", fontFamily: "monospace" }}>Reference: {digest}</p>}
        </main>
      </body>
    </html>
  );
}
