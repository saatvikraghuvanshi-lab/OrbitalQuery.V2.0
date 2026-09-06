import type { ParsedQuery } from "@/types/query";

export function QueryInterpretation({ parsed }: { parsed: ParsedQuery }) {
  return (
    <div>
      <div className="meta-grid">
        <div className="meta-item">
          <div className="mk">Location</div>
          <div className="mv">{parsed.location}</div>
        </div>
        <div className="meta-item">
          <div className="mk">Period</div>
          <div className="mv mono">
            {parsed.startDate} → {parsed.endDate}
          </div>
        </div>
        <div className="meta-item">
          <div className="mk">Analysis</div>
          <div className="mv">{parsed.analysis.replace("_", " ")}</div>
        </div>
        <div className="meta-item">
          <div className="mk">Dataset</div>
          <div className="mv dim">Sentinel-2 L2A</div>
        </div>
      </div>
      {(parsed.notes.length > 0 || parsed.warnings.length > 0) && (
        <ul className="sidebar-list" style={{ marginTop: 10 }}>
          {parsed.notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
          {parsed.warnings.map((w, i) => (
            <li key={`w${i}`} className="warn">
              ⚠ {w}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
