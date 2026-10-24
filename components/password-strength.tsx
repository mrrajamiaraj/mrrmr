import { PASSWORD_RULES } from "@/lib/password";

const LEVELS: [string, string, string][] = [
  ["Too weak", "var(--color-bad)", "var(--color-bad)"],
  ["Weak", "var(--color-bad)", "var(--color-bad)"],
  ["Fair", "var(--color-owed)", "var(--color-owed-bar)"],
  ["Good", "var(--color-info)", "var(--color-info)"],
  ["Strong", "var(--color-brand-2)", "var(--color-brand-2)"],
];

export function PasswordStrength({ value }: { value: string }) {
  const rules = PASSWORD_RULES.map((r) => ({ label: r.label, ok: r.test(value) }));
  const score = rules.filter((r) => r.ok).length;
  const lv = value ? LEVELS[score] : ["—", "var(--color-slate-500)", "var(--color-line)"];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1.5" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="h-1.5 flex-1 rounded-[3px]" style={{ background: value && i < Math.max(score, 1) ? lv[2] : "var(--color-line)" }} />
        ))}
      </div>
      <div className="text-[13.5px] font-semibold" style={{ color: lv[1] }}>Strength: {lv[0]}</div>
      <ul className="m-0 grid list-none grid-cols-1 gap-x-3 min-[400px]:grid-cols-2 gap-y-1 p-0 text-[13.5px]">
        {rules.map((r) => (
          <li key={r.label} className="flex items-center gap-1.5" style={{ color: r.ok ? "var(--color-brand-2)" : "var(--color-slate-500)" }}>
            <span aria-hidden="true" className="w-3.5 font-semibold">{r.ok ? "✓" : "○"}</span>
            {r.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
