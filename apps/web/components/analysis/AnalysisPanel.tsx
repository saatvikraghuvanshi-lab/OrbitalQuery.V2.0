"use client";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState, ErrorState, LoadingState, WarningState } from "@/components/ui/LoadingState";
import { ChangeStats } from "./ChangeStats";
import { ChangeRegionCard } from "./ChangeRegionCard";
import type { AnalysisResponse } from "@/types/analysis";
import type { ChangeFeatureCollection } from "@/types/geojson";

export type AnalysisPhase = "idle" | "running" | "done" | "error";

export function AnalysisPanel({
  phase,
  result,
  error,
  canRun,
  onRun,
  selectedRegionId,
  onRegionSelect,
  analysisKind,
}: {
  phase: AnalysisPhase;
  result: AnalysisResponse | null;
  error: string | null;
  canRun: boolean;
  onRun: () => void;
  selectedRegionId: string | null;
  onRegionSelect: (id: string | null) => void;
  analysisKind: string;
}) {
  const geojson = (result?.geojson ?? null) as ChangeFeatureCollection | null;

  return (
    <Card
      title="Change analysis"
      badge={
        result?.source === "cache" ? (
          <Badge tone="orange">cached</Badge>
        ) : result?.source === "live" ? (
          <Badge tone="purple">live</Badge>
        ) : null
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {phase === "idle" && (
          <>
            <EmptyState message={`Run ${analysisKind.replace("_", " ")} detection on the selected scenes and AOI.`} />
            <Button variant="purple" onClick={onRun} disabled={!canRun}>
              Run change analysis
            </Button>
            {!canRun && (
              <div style={{ fontSize: 12, color: "var(--text-faint)", textAlign: "center" }}>
                Requires two selected scenes.
              </div>
            )}
          </>
        )}

        {phase === "running" && (
          <LoadingState label="Streaming imagery bands and detecting change… (cold starts can take ~30s)" />
        )}

        {phase === "error" && (
          <>
            <ErrorState
              message={error ?? "analysis failed"}
              hint="The analysis service may be unavailable. For the flagship Hyderabad demo a cached result is used automatically."
            />
            <Button variant="ghost" onClick={onRun}>
              Retry
            </Button>
          </>
        )}

        {phase === "done" && result && (
          <>
            {result.warnings && result.warnings.length > 0 && (
              <WarningState message={result.warnings[0]} />
            )}
            {result.status === "no_change" && (
              <EmptyState message={result.message ?? "No significant change detected at this threshold."} />
            )}
            {result.statistics && result.status === "ok" && (
              <>
                <ChangeStats stats={result.statistics} />
                {geojson && geojson.features.length > 0 && (
                  <>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-faint)" }}>
                      Regions — click to highlight
                    </div>
                    <ChangeRegionCard geojson={geojson} selectedId={selectedRegionId} onSelect={onRegionSelect} />
                  </>
                )}
                {result.timing_ms != null && (
                  <div style={{ fontSize: 11, color: "var(--text-faint)", textAlign: "right", fontFamily: "var(--mono)" }}>
                    analyzed in {(result.timing_ms / 1000).toFixed(1)}s
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
