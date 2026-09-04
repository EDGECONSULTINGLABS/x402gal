/** Legend / list marker. Solid = placed at the address; hollow = approximate (city or market centre). */
export function Dot({ color, hollow = false, size = 10 }: { color: string; hollow?: boolean; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="mt-[3px] inline-block shrink-0 rounded-full"
      style={{
        width: size,
        height: size,
        background: hollow ? "transparent" : color,
        border: `${hollow ? 1.6 : 1}px solid ${hollow ? color : "rgba(13,17,23,0.9)"}`,
      }}
    />
  );
}
