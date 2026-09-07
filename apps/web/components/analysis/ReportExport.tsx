"use client";

import { useCallback, useState } from "react";

import type { ParsedQuery } from "@/types/query";
import type { SceneSummary } from "@/types/scene";
import type { AnalysisResponse } from "@/types/analysis";
import type { ChangeFeatureCollection } from "@/types/geojson";

/* ---------- helpers ---------- */

function sanitizeFilename(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

function makeFilename(parsed: ParsedQuery, before: SceneSummary | null, after: SceneSummary | null): string {
  const location = parsed.location ?? "search";
  const y1 = before?.datetime ? new Date(before.datetime).getFullYear() : "";
  const y2 = after?.datetime ? new Date(after.datetime).getFullYear() : "";
  const range = y1 && y2 ? `${y1}-${y2}` : "";
  return `orbitalquery-${sanitizeFilename(location)}${range ? "-" + range : ""}`;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function interpretationText(stats: AnalysisResponse["statistics"]): string {
  if (!stats || stats.ndvi_before_mean == null || stats.ndvi_after_mean == null) return "";
  const diff = stats.ndvi_after_mean - stats.ndvi_before_mean;
  const direction = Math.abs(diff) < 1e-6 ? "remained stable" : diff < 0 ? "decreased" : "increased";
  return `Vegetation signal ${direction} across the analysed area. Mean NDVI changed from ${stats.ndvi_before_mean.toFixed(3)} to ${stats.ndvi_after_mean.toFixed(3)}, with ${stats.total_changed_area_km2.toFixed(1)} km² exceeding the configured |ΔNDVI| threshold of ${stats.threshold_used.toFixed(2)}.`;
}

function topRegions(geojson: ChangeFeatureCollection | null, limit = 10) {
  if (!geojson?.features) return [];
  return [...geojson.features]
    .sort((a, b) => b.properties.area_km2 - a.properties.area_km2)
    .slice(0, limit);
}

/* ---------- PDF generation ---------- */

async function generatePDF(props: {
  parsed: ParsedQuery;
  before: SceneSummary | null;
  after: SceneSummary | null;
  result: AnalysisResponse;
  geojson: ChangeFeatureCollection | null;
  mapCanvas?: string | null;
}): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const LM = 15;
  const RW = W - 2 * LM;
  let y = 20;

  const header = (text: string, fontSize = 16) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(fontSize);
    doc.text(text, LM, y);
    y += fontSize * 0.5;
  };

  const label = (text: string) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(text.toUpperCase(), LM, y);
    doc.setTextColor(0, 0, 0);
    y += 5;
  };

  const line = (text: string, fontSize = 11) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(fontSize);
    doc.text(text, LM, y);
    y += fontSize * 0.45;
  };

  const gap = (mm = 4) => { y += mm; };

  /* title */
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(167, 139, 250); // purple
  doc.text("OrbitalQuery", LM, y);
  doc.setTextColor(0, 0, 0);
  y += 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(100, 100, 100);
  doc.text("Earth Observation Analysis Report", LM, y);
  doc.setTextColor(0, 0, 0);
  y += 10;

  /* 1. Search */
  header("1. Search");
  label("Query");
  line("(see location below)");
  label("Location");
  line(props.parsed.location ?? "—");
  label("Analysis type");
  line(props.parsed.analysis ?? "—");
  label("Date range");
  line(`${props.parsed.startDate ?? "—"} → ${props.parsed.endDate ?? "—"}`);
  label("Dataset");
  line(props.parsed.dataset ?? "Sentinel-2 L2A");
  gap();

  /* 2. Selected scenes */
  header("2. Selected scenes");
  label("Before");
  line(`Date: ${fmtDate(props.before?.datetime)}  ·  Cloud: ${props.before?.cloudCover.toFixed(1) ?? "—"}%  ·  Scene: ${props.before?.id ?? "—"}`);
  label("After");
  line(`Date: ${fmtDate(props.after?.datetime)}  ·  Cloud: ${props.after?.cloudCover.toFixed(1) ?? "—"}%  ·  Scene: ${props.after?.id ?? "—"}`);
  gap();

  /* 3. Change analysis */
  const stats = props.result.statistics;
  if (stats) {
    header("3. Change analysis");
    const rows: [string, string][] = [
      ["Detected regions", `${stats.n_regions}`],
      ["Changed area", `${stats.total_changed_area_km2.toFixed(1)} km²`],
      ["Mean magnitude", stats.mean_change_magnitude.toFixed(3)],
      ["Largest region", `${stats.max_region_area_km2.toFixed(2)} km²`],
      ["AOI area", `${stats.aoi_area_km2.toFixed(0)} km²`],
      ["Threshold", `|ΔNDVI| ≥ ${stats.threshold_used.toFixed(2)}`],
      ["NDVI before (mean)", stats.ndvi_before_mean?.toFixed(3) ?? "—"],
      ["NDVI after (mean)", stats.ndvi_after_mean?.toFixed(3) ?? "—"],
    ];
    for (const [k, v] of rows) {
      label(k);
      line(v);
    }
    gap();
  }

  /* 4. Imagery placeholder */
  header("4. Before / After imagery");
  if (props.mapCanvas) {
    try {
      doc.addImage(props.mapCanvas, "PNG", LM, y, RW, RW * 0.5);
      y += RW * 0.5 + 4;
    } catch {
      line("Map imagery could not be embedded in the PDF.");
      y += 4;
    }
  } else {
    line("Map imagery could not be exported (cross-origin restriction).");
    line("View the interactive map in the console for full imagery.");
    y += 4;
  }

  /* 5. Top regions */
  const regions = topRegions(props.geojson, 10);
  if (regions.length > 0) {
    header("5. Top detected regions");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    const cols = ["Region", "Area (km²)", "ΔNDVI", "NDVI before", "NDVI after"];
    const colX = [LM, LM + 22, LM + 44, LM + 62, LM + 82];
    cols.forEach((c, i) => doc.text(c, colX[i], y));
    doc.setTextColor(0, 0, 0);
    y += 4;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    for (const f of regions) {
      const p = f.properties;
      if (y > 270) { doc.addPage(); y = 20; }
      doc.text(p.region_id, colX[0], y);
      doc.text(p.area_km2.toFixed(3), colX[1], y);
      doc.text(p.change_magnitude.toFixed(3), colX[2], y);
      doc.text(p.ndvi_before?.toFixed(3) ?? "—", colX[3], y);
      doc.text(p.ndvi_after?.toFixed(3) ?? "—", colX[4], y);
      y += 4.5;
    }
    gap();
  }

  /* 6. Interpretation */
  const interp = interpretationText(stats);
  if (interp) {
    header("6. Interpretation");
    const lines = doc.splitTextToSize(interp, RW);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(lines, LM, y);
    y += lines.length * 4.5;
    gap();
  }

  /* 7. Scientific note */
  if (y > 260) { doc.addPage(); y = 20; }
  header("7. Scientific note");
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  const note = doc.splitTextToSize(
    "EO-derived change regions are evidence for review and are not validated ground truth.",
    RW
  );
  doc.text(note, LM, y);

  /* save */
  const filename = makeFilename(props.parsed, props.before, props.after);
  doc.save(`${filename}.pdf`);
}

/* ---------- DOCX generation ---------- */

async function generateDOCX(props: {
  parsed: ParsedQuery;
  before: SceneSummary | null;
  after: SceneSummary | null;
  result: AnalysisResponse;
  geojson: ChangeFeatureCollection | null;
}): Promise<void> {
  const docx = await import("docx");
  const {
    Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
    WidthType, AlignmentType, HeadingLevel, BorderStyle, convertInchesToTwip,
  } = docx;

  const heading = (text: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel] = HeadingLevel.HEADING_2) =>
    new Paragraph({ text, heading: level, spacing: { before: 200, after: 100 } });

  const body = (text: string) =>
    new Paragraph({ text, spacing: { after: 60 } });

  const boldLabel = (label: string, value: string) =>
    new Paragraph({
      spacing: { after: 40 },
      children: [
        new TextRun({ text: `${label}: `, bold: true, size: 20 }),
        new TextRun({ text: value, size: 20 }),
      ],
    });

  const noBorder = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };

  /* build sections */
  const children: (InstanceType<typeof Paragraph> | InstanceType<typeof Table>)[] = [];

  /* title */
  children.push(
    new Paragraph({
      heading: HeadingLevel.TITLE,
      spacing: { after: 200 },
      children: [new TextRun({ text: "OrbitalQuery", bold: true, color: "A78BFA", size: 44 })],
    }),
    new Paragraph({
      spacing: { after: 400 },
      children: [new TextRun({ text: "Earth Observation Analysis Report", size: 22, color: "666666" })],
    }),
  );

  /* 1. Search */
  children.push(heading("1. Search"));
  children.push(boldLabel("Location", props.parsed.location ?? "—"));
  children.push(boldLabel("Analysis type", props.parsed.analysis ?? "—"));
  children.push(boldLabel("Date range", `${props.parsed.startDate ?? "—"} → ${props.parsed.endDate ?? "—"}`));
  children.push(boldLabel("Dataset", props.parsed.dataset ?? "Sentinel-2 L2A"));

  /* 2. Selected scenes */
  children.push(heading("2. Selected scenes"));
  children.push(boldLabel("Before", `Date: ${fmtDate(props.before?.datetime)}  ·  Cloud: ${props.before?.cloudCover.toFixed(1) ?? "—"}%  ·  Scene: ${props.before?.id ?? "—"}`));
  children.push(boldLabel("After", `Date: ${fmtDate(props.after?.datetime)}  ·  Cloud: ${props.after?.cloudCover.toFixed(1) ?? "—"}%  ·  Scene: ${props.after?.id ?? "—"}`));

  /* 3. Change analysis */
  const stats = props.result.statistics;
  if (stats) {
    children.push(heading("3. Change analysis"));
    const rows: [string, string][] = [
      ["Detected regions", `${stats.n_regions}`],
      ["Changed area", `${stats.total_changed_area_km2.toFixed(1)} km²`],
      ["Mean magnitude", stats.mean_change_magnitude.toFixed(3)],
      ["Largest region", `${stats.max_region_area_km2.toFixed(2)} km²`],
      ["AOI area", `${stats.aoi_area_km2.toFixed(0)} km²`],
      ["Threshold", `|ΔNDVI| ≥ ${stats.threshold_used.toFixed(2)}`],
      ["NDVI before (mean)", stats.ndvi_before_mean?.toFixed(3) ?? "—"],
      ["NDVI after (mean)", stats.ndvi_after_mean?.toFixed(3) ?? "—"],
    ];
    for (const [k, v] of rows) children.push(boldLabel(k, v));
  }

  /* 4. Top regions */
  const regions = topRegions(props.geojson, 10);
  if (regions.length > 0) {
    children.push(heading("4. Top detected regions"));
    const headerCells = ["Region", "Area (km²)", "ΔNDVI", "NDVI before", "NDVI after"].map(
      (h) => new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 18 })] })],
        shading: { fill: "0D2019" },
        borders: noBorders,
      })
    );
    const tableRows = [new TableRow({ children: headerCells })];

    for (const f of regions) {
      const p = f.properties;
      const cells = [
        p.region_id,
        p.area_km2.toFixed(3),
        p.change_magnitude.toFixed(3),
        p.ndvi_before?.toFixed(3) ?? "—",
        p.ndvi_after?.toFixed(3) ?? "—",
      ].map(
        (v) => new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: v, size: 18 })] })],
          borders: noBorders,
        })
      );
      tableRows.push(new TableRow({ children: cells }));
    }

    children.push(
      new Table({
        rows: tableRows,
        width: { size: 100, type: WidthType.PERCENTAGE },
      })
    );
    children.push(new Paragraph({ spacing: { after: 200 } }));
  }

  /* 5. Interpretation */
  const interp = interpretationText(stats);
  if (interp) {
    children.push(heading("5. Interpretation"));
    children.push(body(interp));
  }

  /* 6. Scientific note */
  children.push(heading("6. Scientific note"));
  children.push(
    new Paragraph({
      spacing: { after: 200 },
      children: [new TextRun({
        text: "EO-derived change regions are evidence for review and are not validated ground truth.",
        italics: true,
        size: 20,
        color: "666666",
      })],
    })
  );

  /* build and save */
  const doc = new Document({
    sections: [{ properties: {}, children }],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${makeFilename(props.parsed, props.before, props.after)}.docx`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ---------- component ---------- */

export function ReportExport({
  parsed,
  beforeScene,
  afterScene,
  result,
  geojson,
  mapRef,
}: {
  parsed: ParsedQuery;
  beforeScene: SceneSummary | null;
  afterScene: SceneSummary | null;
  result: AnalysisResponse | null;
  geojson: ChangeFeatureCollection | null;
  mapRef?: React.RefObject<{ getCanvas: () => HTMLCanvasElement } | null>;
}) {
  const [busy, setBusy] = useState<"pdf" | "docx" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const getMapCanvas = useCallback((): string | null => {
    try {
      const canvas = mapRef?.current?.getCanvas();
      if (!canvas) return null;
      return canvas.toDataURL("image/png");
    } catch {
      return null;
    }
  }, [mapRef]);

  const handlePDF = useCallback(async () => {
    if (!result) return;
    setBusy("pdf");
    setError(null);
    try {
      await generatePDF({
        parsed,
        before: beforeScene,
        after: afterScene,
        result,
        geojson,
        mapCanvas: getMapCanvas(),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "PDF generation failed");
    } finally {
      setBusy(null);
    }
  }, [parsed, beforeScene, afterScene, result, geojson, getMapCanvas]);

  const handleDOCX = useCallback(async () => {
    if (!result) return;
    setBusy("docx");
    setError(null);
    try {
      await generateDOCX({
        parsed,
        before: beforeScene,
        after: afterScene,
        result,
        geojson,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "DOCX generation failed");
    } finally {
      setBusy(null);
    }
  }, [parsed, beforeScene, afterScene, result, geojson]);

  if (!result || result.status !== "ok" || !result.statistics) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--text-faint)",
        }}
      >
        Export report
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button
          className="oq-btn oq-btn--ghost"
          onClick={handlePDF}
          disabled={busy !== null}
          type="button"
          style={{ flex: 1, fontSize: 12 }}
        >
          {busy === "pdf" ? "Generating…" : "PDF"}
        </button>
        <button
          className="oq-btn oq-btn--ghost"
          onClick={handleDOCX}
          disabled={busy !== null}
          type="button"
          style={{ flex: 1, fontSize: 12 }}
        >
          {busy === "docx" ? "Generating…" : "Word (.docx)"}
        </button>
      </div>

      {error && (
        <div style={{ fontSize: 11, color: "var(--orange)" }}>{error}</div>
      )}
    </div>
  );
}
