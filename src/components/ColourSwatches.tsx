import { swatchesFor } from "@/lib/sheet/swatches";

/** A Google colour value as filled circles. The name is in the tooltip and read out by screen readers. */
export function ColourSwatches({ value, small = false }: { value: string; small?: boolean }) {
  const swatches = swatchesFor(value);
  return (
    <span className={`swatches${small ? " small" : ""}`}>
      {swatches.map(({ name, paint }) => paint
        ? <span key={name} className="swatch" style={{ background: paint }} title={name} role="img" aria-label={name} />
        : <span key={name} className="swatch-word">{name}</span>)}
    </span>
  );
}
