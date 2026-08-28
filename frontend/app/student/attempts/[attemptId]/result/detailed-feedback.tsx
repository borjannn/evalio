"use client";

import { useEffect, useRef, useState } from "react";

import { Card, CardBody } from "@/components/ui/card";

/**
 * The detailed passage, condensed — docs/FRONTEND.md §7 still governs the passage
 * itself (one continuous block, never split into bullets or per-question chunks);
 * this only controls how much of it is visible before a click.
 *
 * Roughly 6 lines at text-base/leading-relaxed: enough to read as a real passage,
 * short enough to invite a click when there's more below the fold.
 */
const COLLAPSED_HEIGHT = 168;

export function DetailedFeedback({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  // Starts null so the server-rendered shape (no clipping) matches the client's
  // first paint — whether truncation is even needed depends on rendered line count,
  // which is unknowable without measuring, so it can only be decided after mount.
  // Read from state rather than `contentRef.current` at render time: refs are for
  // event handlers and effects, not render — reading one during render can leave
  // the component out of sync with what actually painted.
  const [contentHeight, setContentHeight] = useState<number | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (contentRef.current) {
      setContentHeight(contentRef.current.scrollHeight);
    }
  }, [text]);

  const truncatable = contentHeight !== null && contentHeight > COLLAPSED_HEIGHT;
  const collapsed = truncatable && !expanded;

  const passage = (
    <div
      className="relative overflow-hidden transition-[max-height] duration-300 ease-out motion-reduce:transition-none"
      style={{
        maxHeight: collapsed ? COLLAPSED_HEIGHT : (contentHeight ?? 2000),
      }}
    >
      <div
        ref={contentRef}
        className="max-w-2xl space-y-4 text-base leading-relaxed whitespace-pre-line"
      >
        {text}
      </div>
      {/* The condensed look: the text underneath blurs out toward the bottom edge
          rather than just fading to the card colour, so it reads as "there's more
          here" rather than "the text ran out." mask-image ramps the blur's own
          opacity from none to full, which is what makes the blur graduated instead
          of a hard-edged patch. */}
      {collapsed && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-16"
          style={{
            backdropFilter: "blur(3px)",
            WebkitBackdropFilter: "blur(3px)",
            maskImage: "linear-gradient(to bottom, transparent, black)",
            WebkitMaskImage: "linear-gradient(to bottom, transparent, black)",
          }}
        />
      )}
    </div>
  );

  if (!truncatable) {
    return (
      <Card>
        <CardBody className="p-8">{passage}</CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardBody className="p-0">
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          aria-expanded={expanded}
          className="pressable block w-full rounded-md p-8 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {passage}
          <p className="mt-3 text-sm font-medium text-primary">
            {expanded ? "Show less" : "Read more"}
          </p>
        </button>
      </CardBody>
    </Card>
  );
}
