import { PASSWORD_RULES } from "@/lib/password";

const LEVELS: [string, string, string][] = [
  ["Too weak", "#B91C1C", "#EF4444"],
  ["Weak", "#B91C1C", "#EF4444"],
  ["Fair", "#B45309", "#F59E0B"],
  ["Good", "#1D4ED8", "#3B82F6"],
  ["Strong", "#047857", "#10B981"],
];

export function PasswordStrength({ value }: { value: string }) {
  const rules = PASSWORD_RULES.map((r) => ({ label: r.label, ok: r.test(value) }));
  const score = rules.filter((r) => r.ok).length;
  const lv = value ? LEVELS[score] : ["—", "#64748B", "#E2E8F0"];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1.5" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="h-1.5 flex-1 rounded-[3px]" style={{ background: value && i < Math.max(score, 1) ? lv[2] : "#E2E8F0" }} />
        ))}
      </div>
      <div className="text-[13.5px] font-semibold" style={{ color: lv[1] }}>Strength: {lv[0]}</div>
      <ul className="m-0 grid list-none grid-cols-2 gap-x-3 gap-y-1 p-0 text-[13.5px]">
        {rules.map((r) => (
          <li key={r.label} className="flex items-center gap-1.5" style={{ color: r.ok ? "#047857" : "#64748B" }}>
            <span aria-hidden="true" className="w-3.5 font-bold">{r.ok ? "✓" : "○"}</span>
            {r.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
