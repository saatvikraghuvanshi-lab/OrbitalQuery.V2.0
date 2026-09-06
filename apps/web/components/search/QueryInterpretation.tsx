import { Badge } from "@/components/ui/Badge";
import type { ParsedQuery } from "@/types/query";

export function QueryInterpretation({ parsed }: { parsed: ParsedQuery }) {
  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
        <Badge>📍 {parsed.location}</Badge>
        <Badge tone="blue">
          {parsed.startDate} → {parsed.endDate}
        </Badge>
        <Badge tone="purple">{parsed.analysis.replace("_", " ")}</Badge>
        <Badge>Sentinel-2 L2A</Badge>
      </div>
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "var(--text-dim)", display: "flex", flexDirection: "column", gap: 3 }}>
        {parsed.notes.map((n, i) => (
          <li key={i}>{n}</li>
        ))}
        {parsed.warnings.map((w, i) => (
          <li key={`w${i}`} style={{ color: "var(--orange)" }}>
            ⚠ {w}
          </li>
        ))}
      </ul>
    </div>
  );
}
