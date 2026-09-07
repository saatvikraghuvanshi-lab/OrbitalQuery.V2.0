import type { ChangeFeatureCollection } from "@/types/geojson";
import type { ChangeStatistics } from "@/types/analysis";

/* ---------- helpers ---------- */

/** Deterministic one-sentence interpretation from the actual analysis values. */
function interpretChange(
  before: number,
  after: number,
  area: number,
  threshold: number
): string {
  const diff = after - before;
  const direction =
    Math.abs(diff) < 1e-6 ? "remained stable" : diff < 0 ? "decreased" : "increased";
  return `Vegetation signal ${direction} across the analysed area. Mean NDVI changed from ${before.toFixed(3)} to ${after.toFixed(3)}, with ${area.toFixed(1)} km\u00B2 exceeding the configured |ΔNDVI| threshold of ${threshold.toFixed(2)}.`;
}

/* ---------- sub-components ---------- */

function NdviTransition({
  before,
  after,
}: {
  before: number | null;
  after: number | null;
}) {
  if (before == null || after == null) return null;
  const decreased = after < before;
  const changed = Math.abs(after - before) > 1e-6;

  return (
    <div
      style={{
        background: "var(--bg)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm)",
        padding: "10px 12px",
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.09em",
          textTransform: "uppercase",
          color: "var(--text-faint)",
          marginBottom: 8,
        }}
      >
        NDVI Transition
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: "var(--mono)" }}>
        {/* before */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, minWidth: 56 }}>
          <span style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--blue)" }}>
            Before
          </span>
          <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text)" }}>
            {before.toFixed(3)}
          </span>
        </div>

        {/* arrow */}
        <div
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: changed ? (decreased ? "var(--orange)" : "var(--lime)") : "var(--text-faint)",
            lineHeight: 1,
          }}
        >
          ↓
        </div>

        {/* after */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, minWidth: 56 }}>
          <span style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--orange)" }}>
            After
          </span>
          <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text)" }}>
            {after.toFixed(3)}
          </span>
        </div>

        {/* direction badge */}
        {changed && (
          <div
            style={{
              marginLeft: "auto",
              fontSize: 11,
              fontWeight: 600,
              color: decreased ? "var(--orange)" : "var(--lime)",
              fontFamily: "var(--font)",
            }}
          >
            {decreased ? "↓ decreased" : "↑ increased"}
          </div>
        )}
      </div>
    </div>
  );
}

function TopRegions({
  regions,
  maxArea,
}: {
  regions: ChangeFeatureCollection["features"];
  maxArea: number;
}) {
  if (regions.length === 0) return null;

  return (
    <div
      style={{
        background: "var(--bg)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm)",
        padding: "10px 12px",
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.09em",
          textTransform: "uppercase",
          color: "var(--text-faint)",
          marginBottom: 8,
        }}
      >
        Top Change Regions
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {regions.map((f) => {
          const p = f.properties;
          const pct = Math.max(4, (p.area_km2 / maxArea) * 100);
          return (
            <div
              key={p.region_id}
              style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}
            >
              <span
                style={{
                  width: 44,
                  fontFamily: "var(--mono)",
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--purple)",
                  flexShrink: 0,
                }}
              >
                {p.region_id}
              </span>

              {/* bar */}
              <div
                style={{
                  flex: 1,
                  height: 5,
                  background: "var(--purple-dim)",
                  borderRadius: 3,
                }}
              >
                <div
                  style={{
                    width: `${pct}%`,
                    height: "100%",
                    background: "var(--purple)",
                    borderRadius: 3,
                  }}
                />
              </div>

              <span
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 11,
                  color: "var(--text-dim)",
                  width: 64,
                  textAlign: "right",
                  flexShrink: 0,
                }}
              >
                {p.area_km2.toFixed(2)} km²
              </span>

              <span
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 11,
                  fontWeight: 600,
                  color: "var(--purple)",
                  width: 44,
                  textAlign: "right",
                  flexShrink: 0,
                }}
              >
                Δ{p.change_magnitude.toFixed(3)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- main ---------- */

export function ChangeStats({
  stats,
  geojson,
}: {
  stats: ChangeStatistics;
  geojson?: ChangeFeatureCollection | null;
}) {
  /* top 5 regions by area */
  const features = geojson?.features ?? [];
  const sorted = [...features].sort((a, b) => b.properties.area_km2 - a.properties.area_km2);
  const top5 = sorted.slice(0, 5);
  const maxArea = top5[0]?.properties.area_km2 ?? 1;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* 1. NDVI before → after transition */}
      <NdviTransition before={stats.ndvi_before_mean} after={stats.ndvi_after_mean} />

      {/* 2. Top change regions bar chart */}
      {top5.length > 0 && <TopRegions regions={top5} maxArea={maxArea} />}

      {/* 3. Interpretation summary */}
      {stats.ndvi_before_mean != null && stats.ndvi_after_mean != null && (
        <div
          style={{
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            padding: "10px 12px",
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.09em",
              textTransform: "uppercase",
              color: "var(--text-faint)",
              marginBottom: 6,
            }}
          >
            Interpretation
          </div>
          <div
            style={{
              fontSize: 12,
              lineHeight: 1.55,
              color: "var(--text-dim)",
            }}
          >
            {interpretChange(
              stats.ndvi_before_mean,
              stats.ndvi_after_mean,
              stats.total_changed_area_km2,
              stats.threshold_used,
            )}
          </div>
        </div>
      )}

      {/* existing aggregate stat grid — preserved */}
      <div className="stat-grid">
        <div className="stat-cell">
          <div className="k">Detected regions</div>
          <div className="v">{stats.n_regions}</div>
        </div>
        <div className="stat-cell">
          <div className="k">Changed area</div>
          <div className="v">
            {stats.total_changed_area_km2.toFixed(1)} <em>km²</em>
          </div>
        </div>
        <div className="stat-cell">
          <div className="k">Mean magnitude</div>
          <div className="v">{stats.mean_change_magnitude.toFixed(3)}</div>
        </div>
        <div className="stat-cell">
          <div className="k">Largest region</div>
          <div className="v">
            {stats.max_region_area_km2.toFixed(2)} <em>km²</em>
          </div>
        </div>
        <div className="stat-cell" style={{ gridColumn: "1 / -1" }}>
          <div className="k">AOI · threshold · NDVI before → after</div>
          <div className="v" style={{ fontSize: 13 }}>
            {stats.aoi_area_km2.toFixed(0)} km² · |ΔNDVI| ≥ {stats.threshold_used.toFixed(2)} ·{" "}
            {stats.ndvi_before_mean != null ? stats.ndvi_before_mean.toFixed(3) : "—"} →{" "}
            {stats.ndvi_after_mean != null ? stats.ndvi_after_mean.toFixed(3) : "—"}
          </div>
        </div>
      </div>
    </div>
  );
}
