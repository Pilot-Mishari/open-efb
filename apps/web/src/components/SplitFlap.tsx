import { useEffect, useRef, useState } from "react";

/**
 * One value on a mechanical split-flap board: monospaced characters with a flap seam across the
 * middle, flipping once when the value changes. The flip is pure CSS, runs only on change, and is
 * staggered a few milliseconds per character; the global `prefers-reduced-motion` rule in
 * index.css disables it entirely for users who ask for no animation.
 */
export function SplitFlap({ value, className = "" }: { value: string; className?: string }) {
  const prev = useRef(value);
  const [flip, setFlip] = useState(0);

  useEffect(() => {
    if (prev.current !== value) {
      prev.current = value;
      setFlip((k) => k + 1);
    }
  }, [value]);

  const chars = [...value.toUpperCase()];

  return (
    <span dir="ltr" aria-label={value} className={`inline-flex gap-[2px] ${className}`}>
      {chars.map((c, i) => (
        <span
          key={`${flip}:${i}`}
          aria-hidden="true"
          className={`sf-cell${flip > 0 ? " sf-flip" : ""}`}
          style={flip > 0 ? { animationDelay: `${i * 40}ms` } : undefined}
        >
          {c === " " ? "\u00A0" : c}
        </span>
      ))}
    </span>
  );
}
