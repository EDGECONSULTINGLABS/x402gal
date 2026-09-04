import type { Metadata } from "next";
import { METHODOLOGY_PAYLOAD_JSON, METHODOLOGY_PUBLISHED } from "@/lib/footprint";
import {
  ESTIMATE_LABEL,
  KWH_PER_IMAGE,
  MEDIA,
  METHODOLOGY_HASH,
  METHODOLOGY_NAME,
  METHODOLOGY_VERSION,
  SIGNIFICANT_FIGURES,
  USAGE,
} from "@/lib/match/assessment";
import { LEGAL_LINE } from "@/lib/match/legal";

export const metadata: Metadata = {
  title: `${METHODOLOGY_NAME} — ${METHODOLOGY_VERSION} edition`,
  description: "What the estimate on the Summit instrument is, how it is computed, and how to verify the hash.",
};

/**
 * The document the result screen's "2026-09 edition · sha256:…" line points to. Public on
 * purpose — not behind the preview gate. Everything shown here is read from the same constants
 * the app computes with; nothing is retyped.
 */
export default function MethodologyPage() {
  const m = METHODOLOGY_PUBLISHED;
  const hex = METHODOLOGY_HASH.replace(/^sha256:/, "");
  return (
    <main className="match-screen px-5 pb-16 pt-8">
      <div className="mx-auto flex max-w-[640px] flex-col">
        <p className="match-quiet text-[13px]">x402GAL · Summit instrument</p>
        <h1 className="mt-1 text-[1.6rem] font-semibold leading-tight">{METHODOLOGY_NAME}</h1>
        <p className="match-mono match-quiet mt-2 break-all text-[12px]">
          {METHODOLOGY_VERSION} edition · {METHODOLOGY_HASH}
        </p>
        <p className="mt-4 text-[15px] leading-relaxed">{ESTIMATE_LABEL}</p>
        <p className="match-quiet mt-2 text-[13px] leading-relaxed">{LEGAL_LINE}</p>

        <Section title="What the three questions become">
          <p>
            The instrument asks how much text you run through AI in a day, how often you generate images
            or video, and where you are based. The first two pick a row from the tables below. The third
            picks the metro whose data center the map hands off to; it does not change the number.
          </p>
          <Table
            head={["Text use per day", "Tokens in", "Tokens out"]}
            rows={Object.values(USAGE).map((u) => [u.label, fmtInt(u.tokensIn), fmtInt(u.tokensOut)])}
          />
          <Table
            head={["Images or video", "Items per day", "IT energy per item"]}
            rows={Object.values(MEDIA).map((x) => [x.label, String(x.itemsPerDay), `${KWH_PER_IMAGE} kWh`])}
          />
          <p>
            Text tokens go through the model below at the <code className="match-mono">gpt4_class</code> and{" "}
            <code className="match-mono">hyperscaler</code> defaults, in <code className="match-mono">site</code> mode
            (water used at the data center itself; no upstream power-plant water, no hardware lifecycle). Image
            energy is added as a fixed per-day overhead. The result is shown to {SIGNIFICANT_FIGURES} significant
            figure{SIGNIFICANT_FIGURES === 1 ? "" : "s"} until the coefficients above are signed off; a year is 365
            such days.
          </p>
        </Section>

        <Section title="The model">
          <p className="match-quiet text-[13px]">{m.spec}</p>
          <pre className="match-card match-mono mt-2 overflow-x-auto whitespace-pre-wrap break-words p-3 text-[12px] leading-relaxed">
            {m.formula}
          </pre>
          <p>
            <code className="match-mono">WUE</code> is water-use effectiveness in litres per kWh of IT energy (the
            Green Grid definition). <code className="match-mono">e_in</code> and{" "}
            <code className="match-mono">e_out</code> are kWh per thousand input and output tokens.{" "}
            <code className="match-mono">e_overhead</code> is fixed per-request energy.{" "}
            <code className="match-mono">F_boundary</code> is 1.0 when energy is already at the IT boundary.
          </p>
          <Table
            head={["Model tier", "e_in (kWh / 1K tokens)", "e_out (kWh / 1K tokens)"]}
            rows={Object.entries(m.modelDefaults).map(([k, v]) => [k, String(v.e_in), String(v.e_out)])}
          />
          <Table
            head={["Infrastructure tier", "WUE (L / kWh)"]}
            rows={Object.entries(m.wueDefaults).map(([k, v]) => [k, String(v)])}
          />
          <Table
            head={["Mode", "Multiplier", "Meaning"]}
            rows={[
              ["site", String(m.modeMultipliers.site), "Water used at the data center. This is what the instrument shows."],
              ["source", String(m.modeMultipliers.source), "Adds the water behind the electricity. Not shown."],
              ["lifecycle", String(m.modeMultipliers.lifecycle), "Adds hardware manufacturing. Informational only. Not shown."],
            ]}
          />
        </Section>

        <Section title="Where the defaults come from">
          <ul className="flex flex-col gap-1.5">
            {m.refs.map((url) => (
              <li key={url} className="break-all text-[13px]">
                <a href={url} target="_blank" rel="noreferrer" className="match-link">
                  {url}
                </a>
              </li>
            ))}
          </ul>
          <p className="match-quiet text-[13px]">
            Operator disclosures behind the WUE defaults: Microsoft FY25 (0.27), Meta 2024 (0.19), AWS 2024 (0.15), LBNL
            2024 hyperscale median (0.32) and AI-specialised median (0.61). Energy intensity from Epoch AI&apos;s GPT-4o
            estimate (~0.0006 kWh per 1K output tokens).
          </p>
        </Section>

        <Section title="Verifying the hash">
          <p>
            The hash on the result screen is SHA-256 of the exact string below — the specification line, the formula,
            the references and the three default tables, in that key order. Change any coefficient and the hash
            changes; the edition date changes with the question tables above.
          </p>
          <pre className="match-card match-mono mt-2 overflow-x-auto whitespace-pre-wrap break-all p-3 text-[11px] leading-relaxed">
            {METHODOLOGY_PAYLOAD_JSON}
          </pre>
          <p className="match-quiet text-[13px]">
            Paste the string into any SHA-256 tool, or on a Mac / Linux shell:{" "}
            <code className="match-mono break-all">printf &apos;%s&apos; &apos;&lt;string&gt;&apos; | shasum -a 256</code>. Expected:{" "}
            <code className="match-mono break-all">{hex}</code>
          </p>
        </Section>

        <Section title="What this is not">
          <p>
            It is not a measurement of any facility, and it is not a claim about a specific operator. The map shows
            public watershed boundaries and principal aquifers from the USGS, and data center locations from a
            directory-sourced list, geocoded to the street. Nothing on the instrument is minted, offered, or a water
            right.
          </p>
        </Section>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8 flex flex-col gap-3 text-[14px] leading-relaxed">
      <h2 className="text-[17px] font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="match-card overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="match-quiet text-left">
            {head.map((h) => (
              <th key={h} className="px-3 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r[0]} className="border-t border-[var(--hc-border)]">
              {r.map((c, i) => (
                <td key={`${r[0]}-${i}`} className={`px-3 py-2 ${i > 0 ? "match-mono" : ""}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function fmtInt(n: number): string {
  return n.toLocaleString("en-US");
}
