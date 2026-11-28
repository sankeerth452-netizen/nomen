"use client";
import { useEffect, useId, useRef, useState } from "react";

/**
 * A small (i) beside something that can puzzle a first-time user: hover or focus it for a one-line explanation, or tap
 * it on a phone. The note opens towards the middle of the screen, so it's never cut off at an edge.
 */
export default function Hint({ text, label = "What's this?" }: { text: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const [side, setSide] = useState<"left" | "right">("left");
  const id = useId();
  const box = useRef<HTMLSpanElement>(null);

  const place = () => {
    const r = box.current?.getBoundingClientRect();
    if (r) setSide(r.left > window.innerWidth / 2 ? "right" : "left");
  };

  // A tapped note closes when you tap anywhere else, or press Escape.
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [open]);

  return (
    <span ref={box} className={`hint hint-${side}${open ? " open" : ""}`} onMouseEnter={place}>
      <button type="button" className="hint-btn" aria-label={label} aria-describedby={id} aria-expanded={open}
        onFocus={place} onClick={(e) => { e.preventDefault(); e.stopPropagation(); place(); setOpen((o) => !o); }}>i</button>
      <span role="tooltip" id={id} className="hint-tip">{text}</span>
    </span>
  );
}
