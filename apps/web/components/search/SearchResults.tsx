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
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--blue)", marginBottom: 4 }}>
            Before
          </div>
          {before ? (
            <>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>{fmtDate(before.datetime)}</div>
              <div style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--mono)" }}>
                ☁ {before.cloudCover.toFixed(1)}% · {before.mgrsTile ?? "—"}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 12, color: "var(--text-dim)" }}>none</div>
          )}
        </div>
        <div
          style={{
            borderLeft: "1px solid var(--border)",
            paddingLeft: 14,
            borderRight: "1px solid var(--border)",
            paddingRight: 14,
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--orange)", marginBottom: 4 }}>
            After
          </div>
          {after ? (
            <>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>{fmtDate(after.datetime)}</div>
              <div style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--mono)" }}>
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
          <div style={{ maxHeight: 180, overflowY: "auto", marginTop: 6, display: "flex", flexDirection: "column" }}>
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
                    gap: 8,
                    fontSize: 11,
                    fontFamily: "var(--mono)",
                    color: "var(--text-dim)",
                    borderBottom: "1px solid var(--border)",
                    padding: "5px 2px",
                  }}
                >
                  <span>{fmtDate(s.datetime)}</span>
                  <span>☁ {s.cloudCover.toFixed(1)}%</span>
                  {isBefore && (
                    <span style={{ color: "var(--blue)", fontWeight: 700 }}>B</span>
                  )}
                  {isAfter && (
                    <span style={{ color: "var(--orange)", fontWeight: 700 }}>A</span>
                  )}
                </div>
              );
            })}
          </div>
        </details>
      )}
    </div>
  );
}
