import "server-only";
import { formatSecurityEvent, type SecurityEvent } from "@/lib/security-log-core";

/**
 * Writes one JSON line per security event to the server log (Vercel runtime logs → log drain). Never an email,
 * token, password, amount or raw IP: the IP is an HMAC keyed by SECURITY_LOG_SALT (set it in Vercel; without it a
 * fixed fallback key is used, which still hides the address from a casual reader but is weaker).
 */
export function logSecurityEvent(event: SecurityEvent, fields: { ip?: string; action?: string; limiter?: string; reason?: string; status?: string | number }) {
  const salt = process.env.SECURITY_LOG_SALT || "mrrmr-security-log";
  console.info(formatSecurityEvent(event, fields, new Date(), salt));
}
