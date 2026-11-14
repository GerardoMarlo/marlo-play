import { useState, type CSSProperties } from "react";

/** Decorative, deterministic particles; never intercept gallery interaction. */
export function Snowfall() {
  const [paused, setPaused] = useState(false);
  return (
    <>
      <div className="snowfall" aria-hidden="true" data-paused={paused}>
        {Array.from({ length: 24 }, (_, i) => (
          <span
            key={i}
            style={
              {
                "--snow-x": `${(i * 37 + 7) % 100}%`,
                "--snow-size": `${3 + (i % 4) * 2}px`,
                "--snow-time": `${9 + (i % 7)}s`,
                "--snow-delay": `${-((i * 7) % 17)}s`,
                "--snow-drift": `${(i % 2 ? 1 : -1) * (18 + i)}px`,
              } as CSSProperties
            }
          />
        ))}
      </div>
      <button
        className="snow-toggle"
        aria-pressed={paused}
        onClick={() => setPaused(!paused)}
      >
        {paused ? "Reanudar nieve" : "Pausar nieve"}
      </button>
    </>
  );
}
