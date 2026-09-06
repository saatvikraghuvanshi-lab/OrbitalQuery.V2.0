"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";

const QUICK_EXAMPLES = [
  "urban expansion in Hyderabad between 2018 and 2026",
  "land use change around Mumbai from 2018 to 2024",
  "forest change in the Western Ghats from 2019 to 2025",
  "vegetation change in Nepal between 2020 and 2026",
];

export function QueryBar({ onSubmit, busy }: { onSubmit: (q: string) => void; busy: boolean }) {
  const [value, setValue] = useState("");
  const [showExamples, setShowExamples] = useState(false);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <form
        style={{ display: "flex", gap: 8 }}
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(value);
        }}
      >
        <input
          className="oq-input"
          style={{ fontSize: 14 }}
          placeholder='Try "urban expansion in Hyderabad between 2018 and 2026"'
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={busy}
          aria-label="Search query"
        />
        <Button type="submit" disabled={busy || !value.trim()}>
          {busy ? "Searching…" : "Search"}
        </Button>
      </form>
      <div style={{ fontSize: 12, color: "var(--text-faint)" }}>
        Any location works —{" "}
        <button
          type="button"
          onClick={() => setShowExamples((s) => !s)}
          style={{ background: "none", border: "none", color: "var(--lime)", cursor: "pointer", padding: 0, font: "inherit" }}
        >
          {showExamples ? "hide examples" : "see examples"}
        </button>
      </div>
      {showExamples && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {QUICK_EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              className="preset-chip"
              style={{ fontSize: 12, padding: "6px 12px", textAlign: "left" }}
              onClick={() => {
                setValue(ex);
                onSubmit(ex);
              }}
            >
              {ex}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
