export const PASSWORD_RULES = [
  { label: "At least 8 characters", test: (p: string) => p.length >= 8 },
  { label: "One uppercase letter", test: (p: string) => /[A-Z]/.test(p) },
  { label: "One number", test: (p: string) => /[0-9]/.test(p) },
  { label: "One symbol (!@#…)", test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

export function passwordProblems(p: string) {
  return PASSWORD_RULES.filter((r) => !r.test(p)).map((r) => r.label);
}
