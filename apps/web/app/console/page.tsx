"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";

import { AnalysisPanel, type AnalysisPhase } from "@/components/analysis/AnalysisPanel";
import { MapControls } from "@/components/map/MapControls";
import type { MapMode } from "@/components/map/EOMap";
import { QueryBar } from "@/components/search/QueryBar";
import { QueryInterpretation } from "@/components/search/QueryInterpretation";
import { SearchResults } from "@/components/search/SearchResults";
import { Card } from "@/components/ui/Card";
import { ErrorState, LoadingState } from "@/components/ui/LoadingState";
import { groupedPresets } from "@/lib/presets";
import type { AnalysisResponse } from "@/types/analysis";
import type { BBox } from "@/types/geojson";
import type { ParsedQuery } from "@/types/query";
import type { SceneSummary } from "@/types/scene";

// Heavy map bundle loads client-side only.
const EOMap = dynamic(() => import("@/components/map/EOMap"), {
  ssr: false,
  loading: () => (
    <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "var(--bg)" }}>
      <LoadingState label="Loading map…" />
    </div>
  ),
});

interface SearchOk {
  parsedQuery: ParsedQuery;
  aoi: BBox;
  candidateScenes: SceneSummary[];
  selectedScenes: { before: SceneSummary | null; after: SceneSummary | null };
  selectionNotes?: string[];
}

function ConsoleInner() {
  const params = useSearchParams();
  const initialQuery = params.get("q") ?? "";

  const [query, setQuery] = useState(initialQuery);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [result, setResult] = useState<SearchOk | null>(null);

  const [mode, setMode] = useState<MapMode>("before");
  const [analysisPhase, setAnalysisPhase] = useState<AnalysisPhase>("idle");
  const [analysisResult, setAnalysisResult] = useState<AnalysisResponse | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);

  const ranInitial = useRef(false);

  const runSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed || searching) return;
    setSearching(true);
    setSearchError(null);
    setResult(null);
    setAnalysisPhase("idle");
    setAnalysisResult(null);
    setAnalysisError(null);
    setSelectedRegionId(null);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed }),
        signal: AbortSignal.timeout(25000),
      });
      const body = await res.json();
      if (!res.ok) {
        setSearchError(body.error ?? `search failed (${res.status})`);
        return;
      }
      setResult(body as SearchOk);
      setMode("before");
    } catch (e) {
      setSearchError(
        e instanceof Error && e.name === "AbortError"
          ? "Search timed out after 25s — the catalog may be slow; try again."
          : "Search failed — check your connection and try again."
      );
    } finally {
      setSearching(false);
    }
  }, [searching]);

  // auto-run the query passed from the homepage
  useEffect(() => {
    if (initialQuery && !ranInitial.current) {
      ranInitial.current = true;
      runSearch(initialQuery);
    }
  }, [initialQuery, runSearch]);

  const runAnalysis = useCallback(async () => {
    if (!result?.selectedScenes.before || !result?.selectedScenes.after) return;
    setAnalysisPhase("running");
    setAnalysisError(null);
    setAnalysisResult(null);
    setSelectedRegionId(null);
    try {
      const res = await fetch("/api/analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          beforeScene: result.selectedScenes.before,
          afterScene: result.selectedScenes.after,
          bbox: result.aoi,
          analysisKind: result.parsedQuery.analysis,
        }),
        signal: AbortSignal.timeout(120000),
      });
      const body = await res.json();
      if (!res.ok) {
        setAnalysisPhase("error");
        setAnalysisError(body.error ?? `analysis failed (${res.status})`);
        return;
      }
      setAnalysisResult(body as AnalysisResponse);
      setAnalysisPhase("done");
      setMode("change");
    } catch (e) {
      setAnalysisPhase("error");
      setAnalysisError(
        e instanceof Error && e.name === "AbortError"
          ? "Analysis timed out after 120s."
          : "Could not reach the analysis service."
      );
    }
  }, [result]);

  const before = result?.selectedScenes.before ?? null;
  const after = result?.selectedScenes.after ?? null;
  const changeGeojson = analysisPhase === "done" ? ((analysisResult?.geojson ?? null) as never) : null;

  return (
    <div className="console-root">
      <header className="console-topbar">
        <a href="/" className="wordmark" style={{ fontSize: 16 }}>
          Orbital<span className="q">Query</span>
        </a>
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-faint)" }}>
          EO Console
        </span>
        <div style={{ flex: 1 }} />
        <a href="/api/health" target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "var(--text-faint)" }}>
          system health
        </a>
      </header>

      <div className="console-main">
        <div className="console-map-area">
          <EOMap
            aoi={result?.aoi ?? null}
            beforeScene={before}
            afterScene={after}
            mode={mode}
            changeGeojson={changeGeojson}
            selectedRegionId={selectedRegionId}
            onRegionSelect={setSelectedRegionId}
          />
          {(before || after) && (
            <MapControls
              mode={mode}
              onModeChange={setMode}
              beforeScene={before}
              afterScene={after}
              hasChange={analysisPhase === "done" && !!analysisResult?.geojson}
            />
          )}
          {!result && !searching && (
            <div
              style={{
                position: "absolute", inset: 0, display: "grid", placeItems: "center",
                background: "radial-gradient(ellipse at center, rgba(7,17,13,0.2), rgba(7,17,13,0.85))",
                pointerEvents: "none", zIndex: 3,
              }}
            >
              <div style={{ textAlign: "center", maxWidth: 460, padding: 20 }}>
                <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>
                  Ask about any place on Earth
                </div>
                <div style={{ color: "var(--text-dim)", fontSize: 14 }}>
                  Search a location and time range. Sentinel-2 scenes load on the map;
                  run change analysis to see where the landscape changed.
                </div>
              </div>
            </div>
          )}
        </div>

        <aside className="console-side">
          <Card title="Search">
            <QueryBar onSubmit={runSearch} busy={searching} />
            {searching && <div style={{ marginTop: 10 }}><LoadingState label="Interpreting query → searching STAC…" /></div>}
            {searchError && (
              <div style={{ marginTop: 10 }}>
                <ErrorState message={searchError} />
              </div>
            )}
          </Card>

          {result && (
            <Card title="Query interpretation">
              <QueryInterpretation parsed={result.parsedQuery} />
            </Card>
          )}

          {result && (
            <Card title="Scenes">
              <SearchResults
                candidates={result.candidateScenes}
                before={before}
                after={after}
              />
              {result.selectionNotes && result.selectionNotes.length > 0 && (
                <ul style={{ margin: "10px 0 0", paddingLeft: 16, fontSize: 11, color: "var(--text-faint)" }}>
                  {result.selectionNotes.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          <AnalysisPanel
            phase={analysisPhase}
            result={analysisResult}
            error={analysisError}
            canRun={!!(before && after)}
            onRun={runAnalysis}
            selectedRegionId={selectedRegionId}
            onRegionSelect={setSelectedRegionId}
            analysisKind={result?.parsedQuery.analysis ?? "land_use_change"}
          />

          <Card title="Available searches">
            <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 12 }}>
              Explore example regions — or search any location above.
            </div>
            {groupedPresets().map(({ group, presets }) => (
              <div key={group} className="preset-group" style={{ marginBottom: 14 }}>
                <div className="preset-group-label">{group}</div>
                <div className="preset-grid">
                  {presets.map((p) => (
                    <button
                      key={p.id}
                      className={`preset-tile${p.flagship ? " flagship" : ""}`}
                      onClick={() => {
                        setQuery(p.query);
                        runSearch(p.query);
                      }}
                      type="button"
                      title={p.query}
                    >
                      <span className="t-name">
                        {p.name}
                        {p.flagship ? " ★" : ""}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </Card>
        </aside>
      </div>
    </div>
  );
}

export default function ConsolePage() {
  return (
    <Suspense fallback={<LoadingState label="Loading console…" />}>
      <ConsoleInner />
    </Suspense>
  );
}
