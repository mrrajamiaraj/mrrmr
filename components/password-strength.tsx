import { PASSWORD_RULES } from "@/lib/password";

const LEVELS: [string, string, string][] = [
  ["Too weak", "#9B3426", "#B4483A"],
  ["Weak", "#9B3426", "#B4483A"],
  ["Fair", "#85570F", "#B9852F"],
  ["Good", "#355276", "#5A7397"],
  ["Strong", "#2E6B52", "#2E6B52"],
];

export function PasswordStrength({ value }: { value: string }) {
  const rules = PASSWORD_RULES.map((r) => ({ label: r.label, ok: r.test(value) }));
  const score = rules.filter((r) => r.ok).length;
  const lv = value ? LEVELS[score] : ["—", "#7A766C", "#E3E1DA"];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1.5" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="h-1.5 flex-1 rounded-[3px]" style={{ background: value && i < Math.max(score, 1) ? lv[2] : "#E3E1DA" }} />
        ))}
      </div>
      <div className="text-[13.5px] font-semibold" style={{ color: lv[1] }}>Strength: {lv[0]}</div>
      <ul className="m-0 grid list-none grid-cols-1 gap-x-3 min-[400px]:grid-cols-2 gap-y-1 p-0 text-[13.5px]">
        {rules.map((r) => (
          <li key={r.label} className="flex items-center gap-1.5" style={{ color: r.ok ? "#2E6B52" : "#7A766C" }}>
            <span aria-hidden="true" className="w-3.5 font-semibold">{r.ok ? "✓" : "○"}</span>
            {r.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
