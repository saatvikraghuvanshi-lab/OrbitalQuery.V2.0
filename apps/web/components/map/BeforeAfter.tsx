"use client";

import maplibregl, { type Map as MLMap } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";

import type { SceneSummary } from "@/types/scene";

/**
 * Swipe implementation: the base map renders BEFORE imagery; a second,
 * perfectly-synced overlay map renders AFTER imagery and is clipped with a
 * CSS clip-path driven by a draggable divider. Same approach as the
 * maplibre-gl-compare plugin, minus the dependency.
 */
export function BeforeAfterSwipe({
  afterScene,
  getBaseMap,
}: {
  afterScene: SceneSummary;
  getBaseMap: () => MLMap | null;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const overlayMapRef = useRef<MLMap | null>(null);
  const overlayLoadedRef = useRef(false);
  const [posPct, setPosPct] = useState(50);
  const [failed, setFailed] = useState(false);

  // create overlay map + bidirectional view sync
  useEffect(() => {
    const base = getBaseMap();
    if (!overlayRef.current || !base) return;
    const overlay = new maplibregl.Map({
      container: overlayRef.current,
      style: { version: 8, sources: {}, layers: [] },
      center: base.getCenter(),
      zoom: base.getZoom(),
      interactive: false,
      attributionControl: false,
    });
    overlayMapRef.current = overlay;
    overlay.on("load", () => {
      overlayLoadedRef.current = true;
    });

    const sync = () => {
      overlay.jumpTo({
        center: base.getCenter(),
        zoom: base.getZoom(),
        bearing: base.getBearing(),
        pitch: base.getPitch(),
      });
    };
    sync();
    base.on("move", sync);
    return () => {
      base.off("move", sync);
      overlay.remove();
      overlayMapRef.current = null;
      overlayLoadedRef.current = false;
    };
  }, [getBaseMap]);

  // load/refresh AFTER imagery in the overlay whenever the scene changes
  useEffect(() => {
    const overlay = overlayMapRef.current;
    if (!overlay) return;
    let cancelled = false;

    const addImagery = async () => {
      try {
        const res = await fetch(afterScene.tileUrl, { signal: AbortSignal.timeout(10000) });
        if (!res.ok) throw new Error(String(res.status));
        const tj = (await res.json()) as { tiles: string[]; bounds?: number[] };
        if (cancelled) return;
        if (overlay.getLayer("after-imagery")) overlay.removeLayer("after-imagery");
        if (overlay.getSource("after-imagery")) overlay.removeSource("after-imagery");
        overlay.addSource("after-imagery", {
          type: "raster",
          tiles: tj.tiles,
          bounds: (tj.bounds ?? [-180, -85, 180, 85]) as [number, number, number, number],
          tileSize: 256,
        });
        overlay.addLayer({ id: "after-imagery", type: "raster", source: "after-imagery" });
      } catch {
        if (!cancelled) setFailed(true);
      }
    };

    if (overlayLoadedRef.current || overlay.isStyleLoaded()) {
      addImagery();
    } else {
      overlay.once("load", addImagery);
    }
    return () => {
      cancelled = true;
    };
  }, [afterScene]);

  // divider drag
  const startDrag = (clientX: number) => {
    const move = (e: PointerEvent) => {
      const rect = overlayRef.current?.parentElement?.getBoundingClientRect();
      if (!rect) return;
      const pct = Math.min(96, Math.max(4, ((e.clientX - rect.left) / rect.width) * 100));
      setPosPct(pct);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    move(new PointerEvent("pointermove", { clientX }));
  };

  if (failed) return null;

  return (
    <>
      <div
        style={{
          position: "absolute",
          inset: 0,
          clipPath: `inset(0 0 0 ${posPct}%)`,
          zIndex: 4,
        }}
      >
        <div ref={overlayRef} style={{ position: "absolute", inset: 0 }} />
      </div>
      <div
        className="swipe-handle"
        style={{ left: `${posPct}%` }}
        onPointerDown={(e) => {
          e.preventDefault();
          startDrag(e.clientX);
        }}
        role="separator"
        aria-orientation="vertical"
        aria-label="Drag to compare before and after"
      >
        <div className="grab">⇔</div>
      </div>
    </>
  );
}
