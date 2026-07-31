"use client";

import { useState } from "react";

import { cn } from "@/lib/cn";

/**
 * The reorder interaction for the quiz builder's question list (docs/FRONTEND.md §8).
 *
 * It owns *only* the mechanics — geometry, drag state, the insertion line — and
 * knows nothing about questions beyond `id`. What each row looks like is
 * `renderItem`'s business, which is what lets the builder swap a row for the
 * inline edit form without this file knowing.
 *
 * ## The model is an insertion slot, not a destination row
 *
 * A slot is an integer `0..items.length`, read as "goes before item *n*", with
 * `items.length` meaning "goes last". That is literally what the blue line
 * shows, so the drop and its preview can't disagree — and "above the first" and
 * "below the last" are just slots 0 and N rather than special cases.
 *
 * The earlier version tracked a destination *row* and tinted its border, which
 * couldn't express either end of the list and left the teacher guessing whether
 * the dragged question would land above or below the row it lit up.
 *
 * ## Why the HTML5 drag API rather than pointer events
 *
 * `draggable` gives the drag image, the cursor, edge autoscroll and — the one
 * that matters — Escape-to-cancel, all from the browser. Rebuilding those on
 * pointer events is where drag-and-drop usually turns clunky. The cost is that
 * HTML5 drag does not fire for touch; the grip's arrow keys are the fallback,
 * and they are the accessible path regardless.
 *
 * Cancelling works because the reorder is committed in `drop`, never in
 * `dragend` — `dragend` fires either way, so committing there would make Escape
 * reorder the quiz anyway.
 */

/** Wiring for the row's grip. Spread it onto the handle; see `QuestionRow`. */
export type DragHandleProps = {
  onPointerDown: () => void;
  onPointerUp: () => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
  "aria-label": string;
};

/** Half the 12px gutter, less half the 2px line — the line's optical centre. */
const LINE_INSET = "7px";

/** How far rows part to open a gap. Doubled across the gutter, so 6px of travel. */
const SHIFT = "3px";

export function QuestionList<T extends { id: number }>({
  items,
  onReorder,
  renderItem,
}: {
  items: T[];
  /** Both indices are into the current `items`. */
  onReorder: (from: number, to: number) => void;
  renderItem: (item: T, index: number, handle: DragHandleProps) => React.ReactNode;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [slot, setSlot] = useState<number | null>(null);
  /** Which row is currently `draggable`. See the grip's comment in `QuestionRow`. */
  const [armed, setArmed] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState("");

  // The two slots either side of the dragged row put it back where it started.
  // Showing a line there would promise a change that isn't going to happen, so
  // everything downstream keys off this rather than off `slot`.
  const activeSlot =
    dragIndex !== null && slot !== null && slot !== dragIndex && slot !== dragIndex + 1
      ? slot
      : null;

  function reset() {
    setDragIndex(null);
    setSlot(null);
    setArmed(null);
  }

  function announce(to: number) {
    setAnnouncement(`Moved to position ${to + 1} of ${items.length}.`);
  }

  function moveByKey(from: number, delta: -1 | 1) {
    const to = from + delta;
    if (to < 0 || to >= items.length) return;
    onReorder(from, to);
    announce(to);
  }

  function handleFor(index: number): DragHandleProps {
    return {
      onPointerDown: () => setArmed(index),
      // Covers the click that never became a drag. A click that *did* is cleared
      // by `dragend` instead, which fires even when the pointer is released
      // somewhere else entirely.
      onPointerUp: () => setArmed(null),
      onKeyDown: (event) => {
        if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
        event.preventDefault();
        moveByKey(index, event.key === "ArrowUp" ? -1 : 1);
      },
      "aria-label": `Question ${index + 1} of ${items.length}. Use the arrow keys to move it.`,
    };
  }

  return (
    <>
      {/* `py-2` is not decoration: the first and last lines sit 7px outside the
          rows they mark, and without the padding they would be clipped by the
          section's flow. */}
      <ol
        className="relative space-y-3 py-2"
        // A drop is refused unless *something* cancels dragover. The rows do it
        // too, but the 12px gutters between them belong to this element.
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          if (dragIndex !== null && activeSlot !== null) {
            // Slots index the list as it stands; pulling the row out first
            // shifts everything after it down one.
            const to = activeSlot > dragIndex ? activeSlot - 1 : activeSlot;
            onReorder(dragIndex, to);
            announce(to);
          }
          reset();
        }}
        // Bubbles from the row that started the drag. Clean-up only.
        onDragEnd={reset}
      >
        {items.map((item, index) => (
          <li
            key={item.id}
            // Deliberately *not* transformed — the shift below lives on an inner
            // element. Slots are read off this box, and a drop target that moved
            // as you approached its edge would oscillate between two slots.
            className="relative"
            draggable={armed === index}
            onDragStart={() => {
              setDragIndex(index);
              setSlot(index);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              const box = event.currentTarget.getBoundingClientRect();
              // Top half of a row means "before it", bottom half "after it".
              // Every boundary in the list is therefore reachable, including the
              // two at the ends.
              setSlot(index + (event.clientY > box.top + box.height / 2 ? 1 : 0));
            }}
          >
            <DropLine edge="top" active={activeSlot === index} />
            {index === items.length - 1 && (
              <DropLine edge="bottom" active={activeSlot === items.length} />
            )}

            <div
              className="transition-[transform,opacity] duration-200 ease-out motion-reduce:transition-none"
              style={{
                transform:
                  activeSlot === null
                    ? undefined
                    : `translateY(${index < activeSlot ? `-${SHIFT}` : SHIFT})`,
                // Applied a paint after the drag image is captured, so the ghost
                // the teacher drags is the solid card, not the faded one.
                opacity: dragIndex === index ? 0.4 : undefined,
              }}
            >
              {renderItem(item, index, handleFor(index))}
            </div>
          </li>
        ))}
      </ol>

      {/* The keyboard path moves a row out from under the reader's cursor with
          no visual cue they can use. This is that cue. */}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </>
  );
}

/**
 * The insertion line. One per boundary, all mounted, all but one collapsed —
 * so "only one is visible" is structural rather than something to keep in sync.
 *
 * It grows from the left instead of fading in place: the direction reads as the
 * line arriving, and `transform`/`opacity` are the only two properties that
 * animate without touching layout.
 */
function DropLine({ active, edge }: { active: boolean; edge: "top" | "bottom" }) {
  return (
    <span
      aria-hidden="true"
      style={edge === "top" ? { top: `-${LINE_INSET}` } : { bottom: `-${LINE_INSET}` }}
      className={cn(
        "pointer-events-none absolute inset-x-0 z-10 block h-0.5 origin-left rounded-full bg-primary",
        // `scale`, not `transform`: Tailwind v4 compiles `scale-x-*` to the
        // standalone `scale` property, so a transition naming `transform` here
        // silently animates nothing and the line just pops to full width.
        "transition-[scale,opacity] duration-150 ease-out motion-reduce:transition-none",
        active ? "scale-x-100 opacity-100" : "scale-x-0 opacity-0",
      )}
    >
      {/* The cap. Without it a 2px rule reads as a border on the card below. */}
      <span className="absolute -top-[3px] -left-px block size-2 rounded-full bg-primary" />
    </span>
  );
}
