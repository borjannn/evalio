"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * An easter egg. Click your own name in the header five times inside three
 * seconds.
 *
 * It wraps the name rather than replacing it, so the header keeps rendering the
 * signed-in user server-side and this only adds the counting. Nothing about it
 * is reachable by accident: five clicks on a non-interactive label is not a
 * gesture anyone performs by mistake, and a slow fifth click resets the run
 * instead of firing.
 *
 * The fireworks are a canvas, which makes this the second piece of motion in the
 * app that is JavaScript rather than CSS (see `components/ui/tally.tsx` for the
 * first). The reason is the same shape: a few hundred independent particles with
 * their own velocity, drag and gravity is not something `@keyframes` can
 * express — CSS would need one element and one hand-written keyframe set per
 * particle. Everything that *can* be CSS still is: the backdrop, the letters,
 * the sheen, the shockwave and the exit all live in `globals.css`.
 *
 * Reduced motion is honoured by construction rather than by exception. The CSS
 * classes collapse to their finished state, and the canvas is never mounted, so
 * there is no animation left to freeze.
 */

/** Five clicks within this window fires it. */
const CLICK_WINDOW_MS = 3000;
const CLICKS_NEEDED = 5;
/** How long the reveal holds before it dismisses itself. */
const HOLD_MS = 5000;
const EXIT_MS = 550;

const REVEALED_NAME = "Borjan Dimeski";

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  decay: number;
  hue: number;
  size: number;
};

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * The fireworks layer.
 *
 * Mounted only while the reveal is up, and only when motion is welcome, so the
 * `rAF` loop cannot outlive the overlay. Shells rise, burst into a ring of
 * particles with jittered speed, then fall under gravity while drag bleeds off
 * their horizontal travel — the jitter is what stops a burst looking like a
 * clock face.
 */
function Fireworks() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    // Back the canvas at device resolution — at 1x the particles are visibly
    // soft on a high-DPI screen.
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    let width = 0;
    let height = 0;

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * ratio;
      canvas.height = height * ratio;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const particles: Particle[] = [];

    function burst(x: number, y: number, hue: number) {
      const count = 70 + Math.floor(Math.random() * 40);
      for (let index = 0; index < count; index += 1) {
        const angle = (Math.PI * 2 * index) / count + Math.random() * 0.3;
        const speed = 2 + Math.random() * 5;
        particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 1,
          decay: 0.008 + Math.random() * 0.012,
          // A narrow hue spread per burst keeps each one a recognisable colour
          // instead of confetti.
          hue: hue + Math.random() * 40 - 20,
          size: 1 + Math.random() * 2.5,
        });
      }
    }

    let frame = 0;
    let raf = 0;
    let running = true;

    const tick = () => {
      if (!running) return;
      frame += 1;

      // A new burst every ~22 frames, plus a flurry at the very start so the
      // reveal opens loudly rather than warming up.
      if (frame % 22 === 0 || frame === 1 || frame === 6 || frame === 12) {
        burst(
          width * (0.12 + Math.random() * 0.76),
          height * (0.12 + Math.random() * 0.5),
          Math.random() * 360,
        );
      }

      // Fade the previous frame rather than clearing it — that is what leaves
      // the trails behind each particle. `destination-out` lowers alpha without
      // painting a colour, so it works over a transparent canvas.
      context.globalCompositeOperation = "destination-out";
      context.fillStyle = "rgba(0, 0, 0, 0.16)";
      context.fillRect(0, 0, width, height);
      context.globalCompositeOperation = "lighter";

      for (let index = particles.length - 1; index >= 0; index -= 1) {
        const particle = particles[index];
        particle.vy += 0.045; // gravity
        particle.vx *= 0.985; // drag
        particle.vy *= 0.985;
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.life -= particle.decay;

        if (particle.life <= 0) {
          particles.splice(index, 1);
          continue;
        }

        context.beginPath();
        context.fillStyle = `hsla(${particle.hue}, 100%, ${
          55 + particle.life * 25
        }%, ${particle.life})`;
        context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        context.fill();
      }

      raf = window.requestAnimationFrame(tick);
    };

    raf = window.requestAnimationFrame(tick);

    return () => {
      running = false;
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0"
    />
  );
}

export function NameReveal({ name }: { name: string }) {
  const [revealed, setRevealed] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [reduced, setReduced] = useState(false);
  /** Timestamps of recent clicks, trimmed to the window on every press. */
  const clicks = useRef<number[]>([]);

  const dismiss = useCallback(() => {
    setLeaving(true);
    window.setTimeout(() => {
      setRevealed(false);
      setLeaving(false);
    }, EXIT_MS);
  }, []);

  useEffect(() => {
    if (!revealed || leaving) return;
    const timer = window.setTimeout(dismiss, HOLD_MS);
    // Escape closes it early. An overlay with no way out is a trap, however
    // short-lived.
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
    };
  }, [revealed, leaving, dismiss]);

  function press() {
    const now = Date.now();
    // Keep only the clicks still inside the window, then test the run. Trimming
    // rather than resetting on a late click means a slow start followed by five
    // fast clicks still counts.
    clicks.current = [...clicks.current, now].filter(
      (at) => now - at <= CLICK_WINDOW_MS,
    );
    if (clicks.current.length >= CLICKS_NEEDED && !revealed) {
      clicks.current = [];
      setReduced(prefersReducedMotion());
      setRevealed(true);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={press}
        // Not `pressable`: this is dressed as the plain label it replaced, and a
        // name in the header that lifts under the cursor advertises itself as a
        // control. The egg is meant to be found, not signposted.
        className="cursor-default rounded-md text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {name}
      </button>

      {/* Portalled to <body>, and that is load-bearing rather than tidiness.
          Both headers carry `backdrop-blur-md`, and an element with a
          `backdrop-filter` becomes the containing block for its
          position:fixed descendants — so rendered in place, `fixed inset-0`
          resolves to the 72px header strip and the reveal happens inside it.
          The same is true of `filter`, `transform`, `perspective` and
          `will-change`, which is why this cannot be fixed with a z-index. */}
      {revealed && createPortal(
        <div
          role="dialog"
          aria-label={REVEALED_NAME}
          onClick={dismiss}
          className={`fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-foreground/85 ${
            leaving ? "egg-exit" : "egg-backdrop"
          }`}
        >
          {!reduced && <Fireworks />}

          {/* The ring that leaves the name on impact. Behind the words, and
              pointer-transparent so the click-to-dismiss above still lands. */}
          {!reduced && (
            <span
              aria-hidden="true"
              className="egg-shockwave pointer-events-none absolute size-[min(70vw,70vh)] rounded-full border-2 border-white/40"
              style={{ animationDelay: "0.5s" }}
            />
          )}

          {/* `perspective` on the container is what gives the letters' rotateX
              somewhere to rotate in. */}
          <div
            className="relative px-6 text-center"
            style={{ perspective: "1000px" }}
          >
            <h2 className="text-[clamp(2.5rem,13vw,11rem)] leading-[1.05] font-semibold tracking-tight whitespace-nowrap">
              {REVEALED_NAME.split("").map((character, index) => (
                <span
                  key={`${character}-${index}`}
                  className="egg-letter"
                  // Two delays for the two animations on `.egg-letter`, in the
                  // order they are declared there: the flight staggers by index
                  // — the whole choreography, no timeline and no library — and
                  // the sheen waits for the last letter to land before sweeping.
                  style={{ animationDelay: `${index * 55}ms, 1.4s` }}
                >
                  {character === " " ? " " : character}
                </span>
              ))}
            </h2>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
