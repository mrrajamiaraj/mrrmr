import { SignInCard } from "./sign-in-card";
import { headers } from "next/headers";
import { turnstileSiteKey } from "@/lib/turnstile";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  // Viewers are the usual visitors; an auth error (e.g. from a reset link) belongs to the admin form.
  return <SignInCard next={next ?? "/"} error={error} initialMode={error ? "admin" : "viewer"} siteKey={turnstileSiteKey()} nonce={(await headers()).get("x-nonce") ?? undefined} />;
}
