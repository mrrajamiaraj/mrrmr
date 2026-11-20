"use client";

import { useEffect, useRef } from "react";

// Cloudflare Turnstile, rendered explicitly. The script is loaded once per page; each widget keeps its own id.
// Tokens are single-use and expire after 300 s, so the widget is reset after every failed submit and on expiry.

type RenderOptions = {
  sitekey: string;
  action: string;
  appearance: "always" | "execute" | "interaction-only";
  theme: "light" | "dark" | "auto";
  "response-field": boolean;
  callback: (token: string) => void;
  "expired-callback": () => void;
  "timeout-callback": () => void;
  "error-callback": () => boolean | void;
};
type TurnstileApi = {
  render: (el: HTMLElement, opts: RenderOptions) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};
declare global {
  interface Window { turnstile?: TurnstileApi }
}

const SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let loading: Promise<TurnstileApi> | null = null;

function loadTurnstile(nonce?: string): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = SRC;
      s.async = true;
      if (nonce) s.nonce = nonce;
      s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile")));
      s.onerror = () => { loading = null; reject(new Error("turnstile")); };
      document.head.appendChild(s);
    });
  }
  return loading;
}

/**
 * The bot check. Shows nothing unless Cloudflare needs an interaction. `onToken` gets the token (or "" when it is
 * used up, expired or failed); change `resetSignal` (e.g. the action's result object) to ask for a fresh token.
 * The hidden `cf-turnstile-response` input carries the token to the server action.
 */
export function Turnstile({ siteKey, action, onToken, resetSignal, nonce, token }: {
  siteKey: string | null;
  action: "login" | "reset" | "view" | "mfa";
  onToken: (token: string) => void;
  resetSignal?: unknown;
  nonce?: string;
  token: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const id = useRef<string | null>(null);
  const tokenCb = useRef(onToken);
  tokenCb.current = onToken;

  useEffect(() => {
    if (!siteKey || !box.current) return;
    let alive = true;
    const el = box.current;
    loadTurnstile(nonce).then((ts) => {
      if (!alive || id.current) return;
      const dark = document.documentElement.dataset.theme === "dark";
      id.current = ts.render(el, {
        sitekey: siteKey,
        action,
        appearance: "interaction-only",
        theme: dark ? "dark" : "light",
        "response-field": false,
        callback: (t) => tokenCb.current(t),
        "expired-callback": () => { tokenCb.current(""); if (id.current) ts.reset(id.current); },
        "timeout-callback": () => { tokenCb.current(""); if (id.current) ts.reset(id.current); },
        "error-callback": () => { tokenCb.current(""); },
      });
    }).catch(() => tokenCb.current(""));
    return () => {
      alive = false;
      if (id.current && window.turnstile) window.turnstile.remove(id.current);
      id.current = null;
    };
  }, [siteKey, action, nonce]);

  // A submit used the token (single-use): get a new one.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    tokenCb.current("");
    if (id.current && window.turnstile) window.turnstile.reset(id.current);
  }, [resetSignal]);

  return (
    <>
      <input type="hidden" name="cf-turnstile-response" value={token} />
      <div ref={box} className="empty:hidden" />
      {!siteKey && (
        <p role="status" className="m-0 rounded-lg border border-line bg-subtle px-3 py-2.5 text-[13px] text-slate-600">
          Sign-in protection isn&apos;t set up on this server yet, so signing in is turned off.
        </p>
      )}
    </>
  );
}
