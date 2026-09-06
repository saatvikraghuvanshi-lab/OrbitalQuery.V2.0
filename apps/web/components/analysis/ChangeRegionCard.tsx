import type { ChangeFeatureCollection } from "@/types/geojson";

export function ChangeRegionCard({
  geojson,
  selectedId,
  onSelect,
}: {
  geojson: ChangeFeatureCollection;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const regions = geojson.features.slice(0, 50);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {regions.map((f) => {
        const p = f.properties;
        const selected = f.properties.region_id === selectedId;
        return (
          <button
            key={p.region_id}
            className={`region-row${selected ? " selected" : ""}`}
            onClick={() => onSelect(p.region_id)}
            type="button"
          >
            <span>
              <span className="rid">{p.region_id}</span>
              <div className="rmeta">
                {p.area_km2.toFixed(3)} km² · Δ {p.change_magnitude.toFixed(3)}
              </div>
            </span>
            <span style={{ fontSize: 11, color: "var(--text-faint)", fontFamily: "var(--mono)" }}>
              {p.ndvi_before != null ? p.ndvi_before.toFixed(2) : "—"}→
              {p.ndvi_after != null ? p.ndvi_after.toFixed(2) : "—"}
            </span>
          </button>
        );
      })}
      {geojson.features.length > regions.length && (
        <div style={{ fontSize: 11, color: "var(--text-faint)", textAlign: "center" }}>
          + {geojson.features.length - regions.length} more regions
        </div>
      )}
    </div>
  );
}
