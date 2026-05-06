export function Stat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="glass glass-hover rounded-xl p-5">
      <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">{label}</div>
      <div
        className={`tick mt-2 text-3xl font-semibold ${
          accent ? "text-hydro-300" : "text-slate-100"
        }`}
      >
        {value}
      </div>
      {sub != null && <div className="mt-1 text-xs text-slate-400">{sub}</div>}
    </div>
  );
}
