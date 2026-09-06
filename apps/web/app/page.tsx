"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { groupedPresets } from "@/lib/presets";

const EXAMPLES = [
  "urban expansion in Hyderabad between 2018 and 2026",
  "forest change in the Western Ghats from 2019 to 2025",
  "vegetation change in Nepal between 2020 and 2026",
];

export default function HomePage() {
  const router = useRouter();
  const [query, setQuery] = useState("");

  function run(q: string) {
    const trimmed = q.trim();
    if (!trimmed) return;
    router.push(`/console?q=${encodeURIComponent(trimmed)}`);
  }

  return (
    <main className="oq-container">
      <nav style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 0" }}>
        <a href="/" className="wordmark">
          Orbital<span className="q">Query</span>
        </a>
        <div style={{ display: "flex", gap: 20, alignItems: "center", fontSize: 14 }}>
          <a href="/console">Console</a>
          <a href="https://github.com" target="_blank" rel="noreferrer">
            GitHub
          </a>
        </div>
      </nav>

      <section className="hero">
        <span className="oq-badge">Earth Observation · Multi-temporal analysis</span>
        <h1>
          Ask questions.<br />
          Discover Earth Observation data.<br />
          <span className="accent">See what changed.</span>
        </h1>
        <p className="sub">
          OrbitalQuery interprets a plain-language request, finds Sentinel-2 scenes over
          your area and period, and turns before/after imagery into localized, quantified
          change regions — EO-derived evidence for researchers and decision-makers.
        </p>

        <form
          className="hero-search"
          onSubmit={(e) => {
            e.preventDefault();
            run(query);
          }}
        >
          <input
            className="oq-input"
            placeholder='e.g. "urban expansion in Hyderabad between 2018 and 2026"'
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search query"
          />
          <button className="oq-btn" type="submit">
            Analyze
          </button>
        </form>

        <div style={{ marginTop: 14, fontSize: 13, color: "var(--text-faint)" }}>
          {EXAMPLES.map((ex, i) => (
            <span key={ex}>
              <button
                className="preset-chip"
                style={{ fontSize: 12, padding: "4px 12px" }}
                onClick={() => run(ex)}
                type="button"
              >
                {ex}
              </button>
              {i < EXAMPLES.length - 1 ? " " : ""}
            </span>
          ))}
        </div>
      </section>

      <section className="preset-section">
        <h2>How it works</h2>
        <div className="oq-card" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 18 }}>
          {[
            ["1 · Describe", "Type any location and time range — no special syntax needed."],
            ["2 · Discover", "We query the Planetary Computer STAC catalog for Sentinel-2 scenes."],
            ["3 · Compare", "Before/after imagery on the map, with a working swipe comparison."],
            ["4 · Quantify", "NDVI change detection outlines where the landscape actually changed, with area and magnitude per region."],
          ].map(([k, v]) => (
            <div key={k}>
              <div style={{ color: "var(--lime)", fontWeight: 700, fontSize: 13, marginBottom: 6 }}>{k}</div>
              <div style={{ color: "var(--text-dim)", fontSize: 14 }}>{v}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="preset-section">
        <h2>Explore example regions — or search any location</h2>
        {groupedPresets().map(({ group, presets }) => (
          <div key={group}>
            <h2 style={{ marginTop: 18 }}>{group}</h2>
            <div className="preset-grid">
              {presets.map((p) => (
                <button
                  key={p.id}
                  className={`preset-chip${p.flagship ? " flagship" : ""}`}
                  onClick={() => run(p.query)}
                  type="button"
                  title={p.flagship ? "Flagship example" : p.query}
                >
                  {p.name}
                  {p.flagship ? " ★" : ""}
                </button>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="preset-section">
        <h2>Research &amp; references</h2>
        <div className="oq-card" style={{ fontSize: 14, color: "var(--text-dim)", display: "flex", flexDirection: "column", gap: 8 }}>
          <a href="https://planetarycomputer.microsoft.com/dataset/sentinel-2-l2a" target="_blank" rel="noreferrer">
            Sentinel-2 Level-2A — Microsoft Planetary Computer
          </a>
          <a href="https://planetarycomputer.microsoft.com/docs/overview/about/" target="_blank" rel="noreferrer">
            About the Planetary Computer platform
          </a>
          <span>
            Method: NDVI = (B08 − B04) / (B08 + B04); change = |ΔNDVI| ≥ 0.20 with morphological
            cleanup. EO-derived change regions are evidence to support review, not validated
            ground truth.
          </span>
        </div>
      </section>

      <footer className="footer">
        <a href="/" className="wordmark" style={{ fontSize: 15 }}>
          Orbital<span className="q">Query</span>
        </a>
        <span>EO discovery &amp; multi-temporal analysis</span>
        <span style={{ flex: 1 }} />
        <a href="https://github.com" target="_blank" rel="noreferrer">GitHub</a>
        <a href="/console">Open console →</a>
      </footer>
    </main>
  );
}
