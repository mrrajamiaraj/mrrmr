import { PaymentCard, type PaymentCardTheme } from "@/components/PaymentCard";

export const metadata = { title: "Card themes" };

const THEMES: [PaymentCardTheme, string][] = [["rose-gold", "Rose gold"], ["platinum", "Platinum"], ["graphite", "Graphite"], ["gold", "Gold"]];
const SAMPLE = { brandName: "NOVA RESERVE", holderName: "SAMPLE HOLDER", last4: "4417", expiry: "03/29", memberSince: "22" } as const;

/** Demo of <PaymentCard />: all four themes, both number groupings, and the three reference widths. */
export default function CardsDemoPage() {
  return (
    <main className="min-h-screen px-4 py-10 text-[#e4e4e7] sm:px-8" style={{ background: "#0f0f10" }}>
      <div className="mx-auto flex max-w-[1100px] flex-col gap-12">
        <header>
          <h1 className="m-0 text-[28px] font-semibold tracking-tight text-white">Payment card themes</h1>
          <p className="m-0 mt-2 max-w-[640px] text-[15px] text-[#d4d4d8]">
            Drawn entirely with HTML, CSS and inline SVG. Sample data only — the component takes nothing but the last four digits.
            Hover a card to tilt it.
          </p>
        </header>

        <section aria-labelledby="themes-h">
          <h2 id="themes-h" className="m-0 mb-5 text-[18px] font-semibold text-white">Themes</h2>
          <ul className="m-0 grid list-none gap-10 p-0 sm:grid-cols-2">
            {THEMES.map(([theme, label], i) => (
              <li key={theme} className="flex flex-col gap-3">
                <div className="w-full max-w-[420px]">
                  <PaymentCard {...SAMPLE} theme={theme} grouping={i % 2 ? "4-4-4-4" : "4-6-5"} />
                </div>
                <p className="m-0 text-[14px] text-[#d4d4d8]">{label} · {i % 2 ? "4-4-4-4" : "4-6-5"} grouping</p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="sizes-h">
          <h2 id="sizes-h" className="m-0 mb-5 text-[18px] font-semibold text-white">Same card at 280, 420 and 600 px</h2>
          <ul className="m-0 flex list-none flex-wrap items-end gap-8 p-0">
            {[280, 420, 600].map((w) => (
              <li key={w} className="flex flex-col gap-3" style={{ width: `min(${w}px, 100%)` }}>
                <PaymentCard {...SAMPLE} />
                <p className="m-0 text-[14px] text-[#d4d4d8]">{w}px</p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
