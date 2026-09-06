"use client";

import type { SceneSummary } from "@/types/scene";
import type { MapMode } from "./EOMap";

const MODES: Array<{ id: MapMode; label: string; cls?: string }> = [
  { id: "before", label: "BEFORE" },
  { id: "after", label: "AFTER", cls: "mode-after" },
  { id: "swipe", label: "SWIPE" },
  { id: "change", label: "CHANGE", cls: "mode-change" },
];

export function MapControls({
  mode,
  onModeChange,
  beforeScene,
  afterScene,
  hasChange,
}: {
  mode: MapMode;
  onModeChange: (m: MapMode) => void;
  beforeScene: SceneSummary | null;
  afterScene: SceneSummary | null;
  hasChange: boolean;
}) {
  function fmtDate(iso: string) {
    const d = new Date(iso);
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  }

  return (
    <>
      <div className="map-mode-toggle">
        {MODES.map((m) => {
          const needsPair = m.id === "swipe";
          const needsChange = m.id === "change";
          const disabled =
            (needsPair && (!beforeScene || !afterScene)) ||
            (needsChange && !hasChange) ||
            (!beforeScene && !afterScene);
          return (
            <button
              key={m.id}
              className={`map-mode-btn${mode === m.id ? ` active ${m.cls ?? ""}` : ""}`}
              disabled={disabled}
              onClick={() => onModeChange(m.id)}
              type="button"
            >
              {m.label}
            </button>
          );
        })}
      </div>

      <div className="map-scene-chip">
        {beforeScene && (
          <div className="scene-chip">
            <div className="label before">Before</div>
            <div className="value">{fmtDate(beforeScene.datetime)}</div>
            <div className="meta">
              Sentinel-2 · ☁ {beforeScene.cloudCover.toFixed(1)}%
            </div>
          </div>
        )}
        {afterScene && (
          <div className="scene-chip">
            <div className="label after">After</div>
            <div className="value">{fmtDate(afterScene.datetime)}</div>
            <div className="meta">
              Sentinel-2 · ☁ {afterScene.cloudCover.toFixed(1)}%
            </div>
          </div>
        )}
      </div>
    </>
  );
}
