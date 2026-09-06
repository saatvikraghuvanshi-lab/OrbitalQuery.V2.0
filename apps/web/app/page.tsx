"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { groupedPresets } from "@/lib/presets";

const EXAMPLES = [
  "urban expansion in Hyderabad between 2018 and 2026",
  "forest change in the Western Ghats from 2019 to 2025",
  "vegetation change in Nepal between 2020 and 2026",
];

/** Secondary line under each preset tile name (spec section 5). */
const TILE_SUBTITLES: Record<string, string> = {
  hyderabad: "Urban change",
  mumbai: "Urban change",
  "delhi-ncr": "Urban change",
  jaipur: "Urban change",
  dehradun: "Urban change",
  srinagar: "Urban change",
  "western-ghats": "Forest change",
  "himalayan-belt": "Landscape change",
  "thar-desert": "Landscape change",
  sundarbans: "Vegetation change",
  nepal: "Vegetation / landscape change",
  "kathmandu-valley": "Urban change",
  uttarakhand: "Forest change",
  "brahmaputra-basin": "Landscape change",
  "northeast-india": "Vegetation / landscape change",
};

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
      <div className="hero-wrap">
        <nav className="site-nav">
          <a href="/" className="wordmark">
            Orbital<span className="q">Query</span>
          </a>
          <div className="nav-links">
            <a href="/console">Console</a>
            <a href="https://github.com" target="_blank" rel="noreferrer">
              GitHub
            </a>
          </div>
        </nav>

        <section className="hero">
          <span className="oq-badge">Earth Observation · Multi-temporal analysis</span>
          <h1>
            Ask questions.
            <br />
            Discover Earth Observation data.
            <br />
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

          <div className="hero-examples">
            <span>Try:</span>
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                className="preset-chip"
                onClick={() => run(ex)}
                type="button"
              >
                {ex}
              </button>
            ))}
          </div>
        </section>
      </div>

      <section className="preset-section">
        <div className="section-head">
          <h2>How it works</h2>
        </div>
        <div className="pipeline">
          <div className="step">
            <div className="step-num">01</div>
            <div className="step-name">Describe</div>
            <div className="step-desc">Natural-language request</div>
          </div>
          <div className="step">
            <div className="step-num">02</div>
            <div className="step-name">Discover</div>
            <div className="step-desc">Relevant Earth Observation scenes</div>
          </div>
          <div className="step">
            <div className="step-num">03</div>
            <div className="step-name">Compare</div>
            <div className="step-desc">Multi-temporal imagery</div>
          </div>
          <div className="step">
            <div className="step-num">04</div>
            <div className="step-name">Quantify</div>
            <div className="step-desc">Localized change evidence</div>
          </div>
        </div>
      </section>

      <section className="preset-section">
        <div className="section-head">
          <h2>Available searches</h2>
          <span className="lede">Explore example regions — or search any location.</span>
        </div>
        {groupedPresets().map(({ group, presets }) => (
          <div key={group} className="preset-group">
            <div className="preset-group-label">{group}</div>
            <div className="preset-grid">
              {presets.map((p) => (
                <button
                  key={p.id}
                  className={`preset-tile${p.flagship ? " flagship" : ""}`}
                  onClick={() => run(p.query)}
                  type="button"
                  title={p.query}
                >
                  <span className="t-name">
                    {p.name}
                    {p.flagship ? " ★" : ""}
                  </span>
                  <span className="t-sub">{TILE_SUBTITLES[p.id] ?? "Change analysis"}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="preset-section">
        <div className="section-head">
          <h2>Research &amp; references</h2>
        </div>
        <div className="research-grid">
          <div>
            <div className="col-label">References</div>
            <ul>
              <li>
                <a
                  href="https://planetarycomputer.microsoft.com/dataset/sentinel-2-l2a"
                  target="_blank"
                  rel="noreferrer"
                >
                  Sentinel-2 Level-2A — Microsoft Planetary Computer
                </a>
              </li>
              <li>
                <a
                  href="https://planetarycomputer.microsoft.com/docs/overview/about/"
                  target="_blank"
                  rel="noreferrer"
                >
                  About the Planetary Computer platform
                </a>
              </li>
            </ul>
          </div>
          <div>
            <div className="col-label">Method</div>
            <ul>
              <li>
                <code>NDVI = (B08 − B04) / (B08 + B04)</code>
              </li>
              <li>
                <code>change = |ΔNDVI| ≥ 0.20</code> with morphological cleanup
              </li>
            </ul>
            <p className="note">
              EO-derived change regions are evidence to support review, not validated
              ground truth.
            </p>
          </div>
        </div>
      </section>

      <footer className="footer">
        <a href="/" className="wordmark" style={{ fontSize: 15 }}>
          Orbital<span className="q">Query</span>
        </a>
        <span className="tagline">EO discovery &amp; multi-temporal analysis</span>
        <span style={{ flex: 1 }} />
        <a href="https://github.com" target="_blank" rel="noreferrer">
          GitHub
        </a>
        <a href="/console">Open console →</a>
      </footer>
    </main>
  );
}
