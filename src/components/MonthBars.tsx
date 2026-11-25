/** Twelve small bars, January to December: when a phrase is searched (from Google's monthly history). */
export function MonthBars({ months, label }: { months: number[]; label: string }) {
  const max = Math.max(1, ...months);
  return (
    <svg className="month-bars" viewBox="0 0 60 16" role="img" aria-label={label}>
      {months.map((v, i) => { const h = Math.max(1, Math.round((v / max) * 15)); return <rect key={i} x={i * 5} y={16 - h} width={4} height={h} />; })}
    </svg>
  );
}
