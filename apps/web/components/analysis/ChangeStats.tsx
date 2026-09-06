import type { ChangeStatistics } from "@/types/analysis";

export function ChangeStats({ stats }: { stats: ChangeStatistics }) {
  return (
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
  );
}
