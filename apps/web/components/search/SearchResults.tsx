import { Badge } from "@/components/ui/Badge";
import type { SceneSummary } from "@/types/scene";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function SearchResults({
  candidates,
  before,
  after,
}: {
  candidates: SceneSummary[];
  before: SceneSummary | null;
  after: SceneSummary | null;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <div style={{ flex: 1, border: "1px solid rgba(96,165,250,0.4)", borderRadius: 8, padding: "8px 10px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: "var(--blue)", marginBottom: 2 }}>BEFORE</div>
          {before ? (
            <>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{fmtDate(before.datetime)}</div>
              <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
                ☁ {before.cloudCover.toFixed(1)}% · {before.mgrsTile ?? "—"}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 12, color: "var(--text-dim)" }}>none</div>
          )}
        </div>
        <div style={{ flex: 1, border: "1px solid rgba(251,146,60,0.4)", borderRadius: 8, padding: "8px 10px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: "var(--orange)", marginBottom: 2 }}>AFTER</div>
          {after ? (
            <>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{fmtDate(after.datetime)}</div>
              <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
                ☁ {after.cloudCover.toFixed(1)}% · {after.mgrsTile ?? "—"}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 12, color: "var(--text-dim)" }}>none</div>
          )}
        </div>
      </div>

      {candidates.length > 0 && (
        <details>
          <summary style={{ fontSize: 12, color: "var(--text-faint)", cursor: "pointer" }}>
            {candidates.length} candidate scenes
          </summary>
          <div style={{ maxHeight: 180, overflowY: "auto", marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
            {candidates.map((s) => {
              const isBefore = before?.id === s.id;
              const isAfter = after?.id === s.id;
              return (
                <div
                  key={s.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontSize: 11,
                    fontFamily: "var(--mono)",
                    color: "var(--text-dim)",
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    padding: "5px 8px",
                  }}
                >
                  <span>{fmtDate(s.datetime)}</span>
                  <span>☁ {s.cloudCover.toFixed(1)}%</span>
                  {isBefore && <Badge tone="blue">B</Badge>}
                  {isAfter && <Badge tone="orange">A</Badge>}
                </div>
              );
            })}
          </div>
        </details>
      )}
    </div>
  );
}
