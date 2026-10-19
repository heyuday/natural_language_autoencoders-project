"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Renders its children only once they come within a screen of the viewport, so the
 * interactive figures below the fold do not all hydrate at page load. The placeholder
 * keeps the layout from jumping.
 */
export function Lazy({ children, minHeight = 320 }: { children: ReactNode; minHeight?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || show) return;
    if (typeof IntersectionObserver === "undefined") { setShow(true); return; }
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) { setShow(true); io.disconnect(); }
    }, { rootMargin: "900px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [show]);
  return (
    <div ref={ref} style={show ? undefined : { minHeight }}>
      {show ? children : <p className="pt-2 text-sm text-muted">Loading figure…</p>}
    </div>
  );
}
