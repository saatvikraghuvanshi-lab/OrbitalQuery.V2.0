"use client";

import { useCallback, useState } from "react";

import type { ParsedQuery } from "@/types/query";
import type { SceneSummary } from "@/types/scene";
import type { AnalysisResponse } from "@/types/analysis";
import type { ChangeFeatureCollection } from "@/types/geojson";

/* ===================================================================
   HELPERS
   =================================================================== */

function sanitizeFilename(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

function makeFilename(
  parsed: ParsedQuery,
  before: SceneSummary | null,
  after: SceneSummary | null,
): string {
  const loc = sanitizeFilename(parsed.location ?? "search");
  const y1 = before?.datetime ? new Date(before.datetime).getFullYear() : "";
  const y2 = after?.datetime ? new Date(after.datetime).getFullYear() : "";
  const range = y1 && y2 ? `${y1}-${y2}` : "";
  return `orbitalquery-${loc}${range ? "-" + range : ""}`;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** Platform from STAC item ID (e.g. S2A_MSIL2A_... → S2A). */
function platform(scene: SceneSummary | null): string {
  if (!scene?.id) return "—";
  const m = scene.id.match(/^(S2[AB])/);
  return m ? m[1] : "—";
}

/** Extract MGRS tile from scene id if not stored on the object. */
function tile(scene: SceneSummary | null): string {
  if (scene?.mgrsTile) return scene.mgrsTile;
  if (!scene?.id) return "—";
  const m = scene.id.match(/T(\w{5})_/);
  return m ? m[1] : "—";
}

function interpText(stats: AnalysisResponse["statistics"]): string {
  if (!stats || stats.ndvi_before_mean == null || stats.ndvi_after_mean == null) return "";
  const diff = stats.ndvi_after_mean - stats.ndvi_before_mean;
  const dir =
    Math.abs(diff) < 1e-6 ? "remained stable" : diff < 0 ? "decreased" : "increased";
  return (
    `Vegetation signal ${dir} across the analysed area. Mean NDVI changed from ` +
    `${stats.ndvi_before_mean.toFixed(3)} to ${stats.ndvi_after_mean.toFixed(3)}, with ` +
    `${stats.total_changed_area_km2.toFixed(1)} km\u00B2 exceeding the configured ` +
    `|dNDVI| \u2265 ${stats.threshold_used.toFixed(2)} threshold.`
  );
}

/** Safe ASCII version of interpretation for PDF (no Unicode). */
function interpTextAscii(stats: AnalysisResponse["statistics"]): string {
  if (!stats || stats.ndvi_before_mean == null || stats.ndvi_after_mean == null) return "";
  const diff = stats.ndvi_after_mean - stats.ndvi_before_mean;
  const dir =
    Math.abs(diff) < 1e-6 ? "remained stable" : diff < 0 ? "decreased" : "increased";
  return (
    `Vegetation signal ${dir} across the analysed area. Mean NDVI changed from ` +
    `${stats.ndvi_before_mean.toFixed(3)} to ${stats.ndvi_after_mean.toFixed(3)}, with ` +
    `${stats.total_changed_area_km2.toFixed(1)} sq km exceeding the configured ` +
    `|dNDVI| >= ${stats.threshold_used.toFixed(2)} threshold.`
  );
}

function topRegions(geojson: ChangeFeatureCollection | null, limit = 10) {
  if (!geojson?.features) return [];
  return [...geojson.features]
    .sort((a, b) => b.properties.area_km2 - a.properties.area_km2)
    .slice(0, limit);
}

/* ===================================================================
   PDF COLOR PALETTE (RGB)
   =================================================================== */

const C = {
  deepGreen: [13, 32, 25] as const,
  lime: [163, 230, 53] as const,
  purple: [167, 139, 250] as const,
  blue: [96, 165, 250] as const,
  orange: [251, 146, 60] as const,
  textDark: [20, 30, 20] as const,
  textMuted: [100, 110, 100] as const,
  white: [255, 255, 255] as const,
  offWhite: [240, 245, 238] as const,
  midGray: [160, 170, 160] as const,
  lightGray: [200, 210, 200] as const,
  tableBg: [235, 240, 235] as const,
} as const;

/* ===================================================================
   PDF GENERATION — 4-page professional EO report
   =================================================================== */

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

  const PW = 210;
  const PH = 297;
  const LM = 18;
  const RM = PW - 18;
  const RW = RM - LM;
  let y = 0;
  let pageNum = 0;
  const totalPages = 4;

  /* --- primitive helpers --- */
  function setFont(
    style: "helvetica" | "times" = "helvetica",
    weight: "normal" | "bold" | "italic" = "normal",
    size = 10,
  ) {
    doc.setFont(style, weight);
    doc.setFontSize(size);
  }

  function setColor(c: readonly number[]) {
    doc.setTextColor(c[0], c[1], c[2]);
  }

  function txt(
    t: string,
    x: number,
    yy: number,
    opts?: { style?: "normal" | "bold" | "italic"; size?: number; color?: readonly number[] },
  ) {
    const st = opts?.style ?? "normal";
    const sz = opts?.size ?? 10;
    doc.setFont("helvetica", st);
    doc.setFontSize(sz);
    setColor(opts?.color ?? C.textDark);
    doc.text(t, x, yy);
  }

  function lineW() {
    doc.setDrawColor(C.lightGray[0], C.lightGray[1], C.lightGray[2]);
    doc.setLineWidth(0.3);
    doc.line(LM, y, RM, y);
    y += 2;
  }

  function addPage() {
    doc.addPage();
    pageNum++;
    y = 25;
  }

  function footer() {
    const prevY = y;
    y = PH - 12;
    setFont("helvetica", "normal", 8);
    setColor(C.textMuted);
    doc.text("OrbitalQuery  |  Earth Observation Analysis Report", LM, y);
    doc.text(`Page ${pageNum} of ${totalPages}`, RM, y, { align: "right" as never });
    y = prevY;
  }

  function newSection(
    title: string,
    needSpace = 20,
    size = 13,
  ) {
    if (y + needSpace > PH - 25) addPage();
    y += 4;
    lineW();
    y += 2;
    txt(title, LM, y, { style: "bold", size, color: C.deepGreen });
    y += size * 0.45 + 2;
  }

  function subsection(
    title: string,
    needSpace = 12,
  ) {
    if (y + needSpace > PH - 25) addPage();
    y += 2;
    txt(title, LM, y, { style: "bold", size: 11, color: C.purple });
    y += 5;
  }

  function metaRow(label: string, value: string) {
    if (y > PH - 35) addPage();
    txt(label, LM, y, { style: "normal", size: 9, color: C.textMuted });
    txt(value, LM + 52, y, { style: "normal", size: 9.5 });
    y += 5;
  }

  function sectionNote(text: string, yy: number) {
    const lines = doc.splitTextToSize(text, RW);
    txt(lines[0], LM, yy, { style: "italic", size: 9, color: C.textMuted });
    if (lines.length > 1) txt(lines[1], LM, yy + 4.5, { style: "italic", size: 9, color: C.textMuted });
  }

  /* =================================================================
     PAGE 1 — EXECUTIVE SUMMARY
     ================================================================= */
  pageNum = 1;
  y = 22;

  // Title block
  txt("ORBITALQUERY", LM, y, { style: "bold", size: 28, color: C.purple });
  y += 10;
  setFont("helvetica", "normal", 12);
  setColor(C.textMuted);
  doc.text("Earth Observation Analysis Report", LM, y);
  y += 9;

  // Location + date range
  const loc = props.parsed.location ?? "Unknown Location";
  txt(loc.toUpperCase(), LM, y, { style: "bold", size: 16, color: C.deepGreen });
  y += 8;

  const d1 = props.before?.datetime
    ? new Date(props.before.datetime).toLocaleDateString("en-GB", {
        day: "2-digit", month: "short", year: "numeric",
      })
    : "—";
  const d2 = props.after?.datetime
    ? new Date(props.after.datetime).toLocaleDateString("en-GB", {
        day: "2-digit", month: "short", year: "numeric",
      })
    : "—";
  txt(`${d1}  >  ${d2}`, LM, y, { style: "normal", size: 12, color: C.midGray });
  y += 12;

  lineW();
  y += 3;

  // ANALYSIS SNAPSHOT heading
  txt("ANALYSIS SNAPSHOT", LM, y, { style: "bold", size: 10, color: C.deepGreen });
  y += 7;

  // 4 metric cards
  const stats = props.result.statistics;
  if (stats) {
    const cards: Array<{
      label: string;
      value: string;
      color: readonly number[];
    }> = [
      {
        label: "DETECTED REGIONS",
        value: `${stats.n_regions}`,
        color: C.purple,
      },
      {
        label: "CHANGED AREA",
        value: `${stats.total_changed_area_km2.toFixed(1)} km²`,
        color: C.orange,
      },
      {
        label: "MEAN |ΔNDVI|",
        value: stats.mean_change_magnitude.toFixed(3),
        color: C.purple,
      },
      {
        label: "MEAN NDVI",
        value: `${stats.ndvi_before_mean?.toFixed(3) ?? "—"}  >  ${stats.ndvi_after_mean?.toFixed(3) ?? "—"}`,
        color: C.deepGreen,
      },
    ];

    const cardW = (RW - 12) / 4;
    const cardH = 24;
    const startX = LM;

    cards.forEach((c, i) => {
      const cx = startX + i * (cardW + 4);

      // Background
      doc.setFillColor(C.offWhite[0], C.offWhite[1], C.offWhite[2]);
      doc.roundedRect(cx, y, cardW, cardH, 1.5, 1.5, "F");

      // Top accent line
      doc.setFillColor(c.color[0], c.color[1], c.color[2]);
      doc.rect(cx, y, cardW, 1.2, "F");

      // Label
      setFont("helvetica", "bold", 6.5);
      setColor(C.textMuted);
      doc.text(c.label, cx + 3, y + 7.5);

      // Value
      setFont("helvetica", "bold", 13);
      setColor(c.color);
      doc.text(c.value, cx + 3, y + 18);
    });

    y += cardH + 6;
  }

  // ANALYSIS CONTEXT
  txt("ANALYSIS CONTEXT", LM, y, { style: "bold", size: 10, color: C.deepGreen });
  y += 6;

  const metaItems: Array<[string, string]> = [
    ["Location", loc],
    ["Analysis", props.parsed.analysis?.replace(/_/g, " ") ?? "—"],
    ["Dataset", props.parsed.dataset ?? "Sentinel-2 L2A"],
    ["Date range", `${props.parsed.startDate ?? "—"} to ${props.parsed.endDate ?? "—"}`],
  ];
  if (stats) {
    metaItems.push(["AOI area", `${stats.aoi_area_km2.toFixed(0)} km²`]);
  }
  metaItems.forEach(([k, v]) => metaRow(k, v));
  y += 3;

  // KEY FINDING
  const interp = interpTextAscii(stats);
  if (interp) {
    txt("KEY FINDING", LM, y, { style: "bold", size: 10, color: C.deepGreen });
    y += 6;

    const boxTop = y;
    const lines = doc.splitTextToSize(interp, RW - 6);
    const boxH = lines.length * 5 + 8;

    // Box
    doc.setFillColor(C.offWhite[0], C.offWhite[1], C.offWhite[2]);
    doc.roundedRect(LM, boxTop, RW, boxH, 1.5, 1.5, "F");
    // Left accent
    doc.setFillColor(C.purple[0], C.purple[1], C.purple[2]);
    doc.rect(LM, boxTop, 1.2, boxH, "F");

    setFont("helvetica", "normal", 9.5);
    setColor(C.textDark);
    doc.text(lines, LM + 4, boxTop + 6);

    y = boxTop + boxH + 4;
  }

  footer();
  addPage();

  /* =================================================================
     PAGE 2 — OBSERVATION DATA
     ================================================================= */
  newSection("OBSERVATION DATA");

  // 1. Search
  subsection("1. Search");
  metaRow("Query", props.parsed.location ?? "—");
  metaRow("Location", loc);
  metaRow("Analysis type", props.parsed.analysis?.replace(/_/g, " ") ?? "—");
  metaRow("Date range", `${props.parsed.startDate ?? "—"} to ${props.parsed.endDate ?? "—"}`);
  metaRow("Dataset", props.parsed.dataset ?? "Sentinel-2 L2A");
  if (stats) metaRow("AOI area", `${stats.aoi_area_km2.toFixed(0)} km²`);
  y += 4;

  // 2. Selected Scenes
  subsection("2. Selected Scenes");

  const hdrH = 7;
  const rowH = 7;
  const colW = [50, 54, 54];

  function drawTableHeader(labels: string[], widths: number[]) {
    doc.setFillColor(
      C.deepGreen[0], C.deepGreen[1], C.deepGreen[2],
    );
    doc.rect(LM, y, RW, hdrH, "F");
    let cx = LM;
    labels.forEach((l, i) => {
      setFont("helvetica", "bold", 7.5);
      setColor(C.white);
      doc.text(l, cx + 3, y + 5);
      cx += widths[i];
    });
    y += hdrH;
  }

  function drawTableRow(cells: string[], widths: number[]) {
    doc.setFillColor(248, 250, 248);
    doc.rect(LM, y, RW, rowH, "F");
    doc.setDrawColor(C.lightGray[0], C.lightGray[1], C.lightGray[2]);
    doc.setLineWidth(0.15);
    doc.line(LM, y + rowH, RM, y + rowH);
    let cx = LM;
    cells.forEach((c, i) => {
      setFont("helvetica", "normal", 8);
      setColor(C.textDark);
      doc.text(c, cx + 3, y + 5);
      cx += widths[i];
    });
    y += rowH;
  }

  // Scenes table
  drawTableHeader(["", "BEFORE", "AFTER"], colW);
  drawTableRow(
    ["Acquisition", fmtDate(props.before?.datetime), fmtDate(props.after?.datetime)],
    colW,
  );
  drawTableRow(
    ["Platform", platform(props.before), platform(props.after)],
    colW,
  );
  drawTableRow(
    [
      "Cloud cover",
      props.before ? `${props.before.cloudCover.toFixed(1)}%` : "—",
      props.after ? `${props.after.cloudCover.toFixed(1)}%` : "—",
    ],
    colW,
  );
  drawTableRow(["Tile", tile(props.before), tile(props.after)], colW);
  drawTableRow(
    [
      "Dataset",
      props.before?.collection ?? "Sentinel-2 L2A",
      props.after?.collection ?? "Sentinel-2 L2A",
    ],
    colW,
  );

  // Scene IDs in a compact row
  y += 2;
  setFont("helvetica", "bold", 7);
  setColor(C.textMuted);
  doc.text("Scene IDs", LM, y);
  y += 4;
  setFont("helvetica", "normal", 7);
  const beforeId = props.before?.id ? doc.splitTextToSize(props.before.id, RW - 4) : ["—"];
  const afterId = props.after?.id ? doc.splitTextToSize(props.after.id, RW - 4) : ["—"];
  doc.text(`Before: ${beforeId[0]}`, LM, y);
  y += 4;
  doc.text(`After:  ${afterId[0]}`, LM, y);
  y += 6;

  // 3. Satellite Imagery
  subsection("3. Satellite Imagery");

  if (props.mapCanvas) {
    try {
      const imgH = RW * 0.42;
      doc.addImage(props.mapCanvas, "PNG", LM, y, RW, imgH);
      y += imgH + 3;
      setFont("helvetica", "italic", 7.5);
      setColor(C.textMuted);
      doc.text(
        `Figure 1. Sentinel-2 imagery for the selected scene pair — ${loc}`,
        LM,
        y,
      );
      y += 6;
    } catch {
      sectionNote(
        "Satellite imagery could not be embedded in this export. View the interactive OrbitalQuery console for full imagery.",
        y,
      );
      y += 10;
    }
  } else {
    sectionNote(
      "Satellite imagery could not be embedded (cross-origin restriction). View the interactive console for full imagery.",
      y,
    );
    y += 10;
  }

  footer();
  addPage();

  /* =================================================================
     PAGE 3 — CHANGE ANALYSIS
     ================================================================= */
  newSection("CHANGE ANALYSIS");

  // Metrics grid table
  if (stats) {
    drawTableHeader(["Metric", "Value"], [100, 80]);
    const metricRows: Array<[string, string]> = [
      ["Detected regions", `${stats.n_regions}`],
      ["Changed area", `${stats.total_changed_area_km2.toFixed(1)} km²`],
      ["Mean magnitude", stats.mean_change_magnitude.toFixed(3)],
      ["Largest region", `${stats.max_region_area_km2.toFixed(2)} km²`],
      ["AOI area", `${stats.aoi_area_km2.toFixed(0)} km²`],
      ["Threshold", `|dNDVI| >= ${stats.threshold_used.toFixed(2)}`],
      ["NDVI before (mean)", stats.ndvi_before_mean?.toFixed(3) ?? "—"],
      ["NDVI after (mean)", stats.ndvi_after_mean?.toFixed(3) ?? "—"],
    ];
    metricRows.forEach(([k, v]) => drawTableRow([k, v], [100, 80]));
    y += 5;
  }

  // NDVI Comparison Visual
  if (stats && stats.ndvi_before_mean != null && stats.ndvi_after_mean != null) {
    subsection("NDVI Comparison");
    const nb = stats.ndvi_before_mean;
    const na = stats.ndvi_after_mean;
    const diff = na - nb;

    const visX = LM + 24;
    const barW = RW - 48;
    const maxVal = Math.max(nb, na, 1);

    // BEFORE bar
    setFont("helvetica", "bold", 9);
    setColor(C.blue);
    doc.text("BEFORE", LM, y + 4);
    const bw = (Math.abs(nb) / maxVal) * barW;
    doc.setFillColor(C.blue[0], C.blue[1], C.blue[2]);
    doc.roundedRect(visX, y, bw, 6, 1, 1, "F");
    setFont("helvetica", "bold", 8);
    setColor(C.white);
    doc.text(nb.toFixed(3), visX + 3, y + 4.5);
    y += 10;

    // Arrow
    txt("v", visX + barW / 2, y - 1, {
      style: "bold",
      size: 9,
      color: C.purple,
    });
    y += 3;

    // AFTER bar
    setFont("helvetica", "bold", 9);
    setColor(C.orange);
    doc.text("AFTER ", LM, y + 4);
    const aw = (Math.abs(na) / maxVal) * barW;
    doc.setFillColor(C.orange[0], C.orange[1], C.orange[2]);
    doc.roundedRect(visX, y, aw, 6, 1, 1, "F");
    setFont("helvetica", "bold", 8);
    setColor(C.white);
    doc.text(na.toFixed(3), visX + 3, y + 4.5);
    y += 11;

    // dNDVI line
    const diffStr = diff >= 0 ? `+${diff.toFixed(3)}` : diff.toFixed(3);
    setFont("helvetica", "bold", 9);
    setColor(diff < 0 ? C.orange : C.lime);
    doc.text(`dNDVI = ${diffStr}`, visX, y);
    y += 6;

    // Interpretation
    const interp = interpTextAscii(stats);
    if (interp) {
      const lines = doc.splitTextToSize(interp, RW);
      setFont("helvetica", "normal", 9);
      setColor(C.textDark);
      doc.text(lines, LM, y);
      y += lines.length * 4.5 + 4;
    }
  }

  // Top Change Regions table
  const regions = topRegions(props.geojson, 10);
  if (regions.length > 0) {
    subsection("Top 10 Detected Regions");

    const cols = ["Rank", "Region", "Area (km\u00B2)", "|dNDVI|", "NDVI Before", "NDVI After"];
    const cw = [14, 22, 26, 26, 46, 46];

    drawTableHeader(cols, cw);
    regions.forEach((f, i) => {
      const p = f.properties;
      drawTableRow(
        [
          `${i + 1}`,
          p.region_id,
          p.area_km2.toFixed(3),
          p.change_magnitude.toFixed(3),
          p.ndvi_before?.toFixed(3) ?? "—",
          p.ndvi_after?.toFixed(3) ?? "—",
        ],
        cw,
      );
    });
    y += 5;
  }

  // Top regions bar chart
  if (regions.length > 0) {
    subsection("Top Change Regions by Area");

    const maxArea = regions[0].properties.area_km2;
    const barStartX = LM + 38;
    const maxBarW = RW - 58;

    regions.forEach((f) => {
      const p = f.properties;
      if (y > PH - 25) {
        addPage();
        y = 25;
      }
      const bw = (p.area_km2 / maxArea) * maxBarW;

      setFont("helvetica", "bold", 8);
      setColor(C.purple);
      doc.text(p.region_id, LM, y + 4);

      doc.setFillColor(C.purple[0], C.purple[1], C.purple[2]);
      doc.roundedRect(barStartX, y + 0.5, bw, 4, 0.8, 0.8, "F");

      setFont("helvetica", "normal", 7.5);
      setColor(C.textDark);
      doc.text(`${p.area_km2.toFixed(3)} km²`, barStartX + bw + 2, y + 4);
      y += 6.5;
    });
    y += 3;
  }

  footer();
  addPage();

  /* =================================================================
     PAGE 4 — METHOD AND INTERPRETATION
     ================================================================= */
  newSection("METHOD AND INTERPRETATION");

  // 1. Method
  subsection("1. Method");

  setFont("helvetica", "normal", 9);
  setColor(C.textDark);

  const methodItems = [
    "Dataset: Sentinel-2 Level-2A imagery retrieved through Microsoft Planetary Computer.",
    "Vegetation index: NDVI = (B08 - B04) / (B08 + B04)",
    "Change metric: |dNDVI| = |NDVI_after - NDVI_before|",
    `Detection threshold: |dNDVI| >= ${stats ? stats.threshold_used.toFixed(2) : "0.20"}`,
    "Processing: AOI clipping, valid-pixel masking, morphological cleanup, connected-component filtering, change-region vectorization.",
  ];
  methodItems.forEach((item) => {
    if (y > PH - 30) addPage();
    doc.setFillColor(C.lime[0], C.lime[1], C.lime[2]);
    doc.circle(LM + 2, y - 1.5, 1.2, "F");
    setFont("helvetica", "normal", 9);
    setColor(C.textDark);
    const lines = doc.splitTextToSize(item, RW - 8);
    doc.text(lines, LM + 6, y);
    y += lines.length * 4.5 + 1;
  });
  y += 4;

  // 2. Data Provenance
  subsection("2. Data Provenance");

  const provItems: Array<[string, string]> = [
    ["Dataset", props.parsed.dataset ?? "Sentinel-2 L2A"],
    ["Provider", "Microsoft Planetary Computer (Copernicus Sentinel-2)"],
    ["BEFORE acquisition", props.before?.datetime ?? "—"],
    ["AFTER acquisition", props.after?.datetime ?? "—"],
    ["Tile", tile(props.before)],
    ["Cloud cover", props.before ? `${props.before.cloudCover.toFixed(1)}%` : "—"],
    ["Threshold", `|dNDVI| >= ${stats ? stats.threshold_used.toFixed(2) : "0.20"}`],
  ];
  provItems.forEach(([k, v]) => {
    if (y > PH - 30) addPage();
    metaRow(k, v);
  });
  y += 4;

  // 3. Interpretation
  subsection("3. Interpretation");

  const interpFull = interpText(props.result.statistics);
  if (interpFull) {
    setFont("helvetica", "normal", 9.5);
    setColor(C.textDark);
    const lines = doc.splitTextToSize(interpFull, RW);
    doc.text(lines, LM, y);
    y += lines.length * 5 + 6;
  } else {
    setFont("helvetica", "normal", 9);
    setColor(C.textMuted);
    doc.text("No interpretation available.", LM, y);
    y += 10;
  }

  // 4. Scientific Note
  if (y > PH - 45) addPage();

  txt("SCIENTIFIC NOTE", LM, y, { style: "bold", size: 10, color: C.deepGreen });
  y += 6;

  const noteBoxTop = y;
  const noteText =
    "EO-derived change regions are evidence for review and are not validated ground truth. " +
    "Results depend on the selected imagery, preprocessing, spatial resolution and configured detection threshold.";
  const noteLines = doc.splitTextToSize(noteText, RW - 6);
  const noteBoxH = noteLines.length * 5 + 8;

  doc.setFillColor(C.offWhite[0], C.offWhite[1], C.offWhite[2]);
  doc.roundedRect(LM, noteBoxTop, RW, noteBoxH, 1.5, 1.5, "F");
  doc.setFillColor(C.purple[0], C.purple[1], C.purple[2]);
  doc.rect(LM, noteBoxTop, 1.2, noteBoxH, "F");

  setFont("helvetica", "italic", 9);
  setColor(C.textMuted);
  doc.text(noteLines, LM + 4, noteBoxTop + 6);

  footer();

  // Save
  const filename = makeFilename(props.parsed, props.before, props.after);
  doc.save(`${filename}.pdf`);
}

/* ===================================================================
   DOCX GENERATION — Professional EO report
   =================================================================== */

async function generateDOCX(props: {
  parsed: ParsedQuery;
  before: SceneSummary | null;
  after: SceneSummary | null;
  result: AnalysisResponse;
  geojson: ChangeFeatureCollection | null;
}): Promise<void> {
  const docx = await import("docx");
  const {
    Document,
    Packer,
    Paragraph,
    TextRun,
    Table,
    TableRow,
    TableCell,
    WidthType,
    AlignmentType,
    HeadingLevel,
    BorderStyle,
    ShadingType,
    PageNumber,
    Header,
    Footer,
    Tab,
    TabStopType,
    TabStopPosition,
    convertInchesToTwip,
  } = docx;

  const noBorder = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };
  const thinBorder = { style: BorderStyle.SINGLE, size: 1, color: "C8D2C8" };
  const thinBorders = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };
  const accentBorder = { style: BorderStyle.SINGLE, size: 1, color: "0D2019" };
  const accentBorders = { top: noBorder, bottom: noBorder, left: accentBorder, right: noBorder };

  // Color constants (hex)
  const DEEP_GREEN = "0D2019";
  const LIME = "A3E635";
  const PURPLE = "A78BFA";
  const BLUE = "60A5FA";
  const ORANGE = "FB923C";
  const TEXT_DARK = "141E14";
  const TEXT_MUTED = "646E64";
  const OFF_WHITE = "F0F5EE";

  const stats = props.result.statistics;
  const loc = props.parsed.location ?? "Unknown Location";
  const interp = interpText(stats);
  const regions = topRegions(props.geojson, 10);

  /* --- helpers --- */
  const heading = (
    text: string,
    level: (typeof HeadingLevel)[keyof typeof HeadingLevel] = HeadingLevel.HEADING_2,
  ) =>
    new Paragraph({
      text,
      heading: level,
      spacing: { before: 280, after: 120 },
    });

  const subheading = (text: string) =>
    new Paragraph({
      children: [
        new TextRun({
          text,
          bold: true,
          size: 22,
          color: PURPLE,
          font: "Calibri",
        }),
      ],
      spacing: { before: 200, after: 80 },
    });

  const body = (text: string, opts?: { italic?: boolean; color?: string; size?: number }) =>
    new Paragraph({
      children: [
        new TextRun({
          text,
          size: opts?.size ?? 20,
          color: opts?.color ?? TEXT_DARK,
          font: "Calibri",
          italics: opts?.italic,
        }),
      ],
      spacing: { after: 80 },
    });

  const metaRow = (label: string, value: string) =>
    new Paragraph({
      spacing: { after: 60 },
      children: [
        new TextRun({ text: `${label}: `, bold: true, size: 18, color: TEXT_MUTED, font: "Calibri" }),
        new TextRun({ text: value, size: 18, font: "Calibri" }),
      ],
    });

  const spacer = (h = 120) => new Paragraph({ spacing: { after: h } });

  /* --- metric cards as a 2x2 table --- */
  function metricCardsTable(): InstanceType<typeof Table> {
    if (!stats) return new Table({ rows: [new TableRow({ children: [] })] });

    const cards: Array<[string, string, string]> = [
      ["DETECTED REGIONS", `${stats.n_regions}`, PURPLE],
      ["CHANGED AREA", `${stats.total_changed_area_km2.toFixed(1)} km\u00B2`, ORANGE],
      ["MEAN |dNDVI|", stats.mean_change_magnitude.toFixed(3), PURPLE],
      [
        "MEAN NDVI",
        `${stats.ndvi_before_mean?.toFixed(3) ?? "\u2014"} \u2192 ${stats.ndvi_after_mean?.toFixed(3) ?? "\u2014"}`,
        DEEP_GREEN,
      ],
    ];

    function cardCell(label: string, value: string, accent: string) {
      return new TableCell({
        borders: noBorders,
        shading: { fill: OFF_WHITE, type: ShadingType.CLEAR },
        width: { size: 50, type: WidthType.PERCENTAGE },
        children: [
          new Paragraph({
            children: [new TextRun({ text: " ", size: 2 })],
            spacing: { after: 0 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: label,
                bold: true,
                size: 14,
                color: TEXT_MUTED,
                font: "Calibri",
              }),
            ],
            spacing: { after: 40 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: value,
                bold: true,
                size: 26,
                color: accent,
                font: "Calibri",
              }),
            ],
            spacing: { after: 40 },
          }),
        ],
      });
    }

    return new Table({
      rows: [
        new TableRow({
          children: [
            cardCell(cards[0][0], cards[0][1], cards[0][2]),
            cardCell(cards[1][0], cards[1][1], cards[1][2]),
          ],
        }),
        new TableRow({
          children: [
            cardCell(cards[2][0], cards[2][1], cards[2][2]),
            cardCell(cards[3][0], cards[3][1], cards[3][2]),
          ],
        }),
      ],
      width: { size: 100, type: WidthType.PERCENTAGE },
    });
  }

  /* --- data table helper --- */
  function dataTable(
    headers: string[],
    rows: string[][],
    headerColor: string = DEEP_GREEN,
  ): InstanceType<typeof Table> {
    return new Table({
      rows: [
        new TableRow({
          children: headers.map(
            (h) =>
              new TableCell({
                borders: noBorders,
                shading: { fill: headerColor, type: ShadingType.CLEAR },
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: h,
                        bold: true,
                        size: 16,
                        color: "FFFFFF",
                        font: "Calibri",
                      }),
                    ],
                  }),
                ],
              }),
          ),
        }),
        ...rows.map(
          (cells) =>
            new TableRow({
              children: cells.map(
                (v) =>
                  new TableCell({
                    borders: { ...noBorders, bottom: thinBorder },
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({ text: v, size: 18, font: "Calibri" }),
                        ],
                      }),
                    ],
                  }),
              ),
            }),
        ),
      ],
      width: { size: 100, type: WidthType.PERCENTAGE },
    });
  }

  /* --- Key Finding box --- */
  function keyFindingBox(): (InstanceType<typeof Paragraph> | InstanceType<typeof Table>)[] {
    if (!interp) return [];
    return [
      new Paragraph({
        children: [
          new TextRun({
            text: "KEY FINDING",
            bold: true,
            size: 20,
            color: DEEP_GREEN,
            font: "Calibri",
          }),
        ],
        spacing: { before: 200, after: 80 },
      }),
      new Table({
        rows: [
          new TableRow({
            children: [
              new TableCell({
                borders: accentBorders,
                shading: { fill: OFF_WHITE, type: ShadingType.CLEAR },
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: interp,
                        size: 19,
                        font: "Calibri",
                        color: TEXT_DARK,
                      }),
                    ],
                    spacing: { before: 80, after: 80 },
                  }),
                ],
              }),
            ],
          }),
        ],
        width: { size: 100, type: WidthType.PERCENTAGE },
      }),
      spacer(200),
    ];
  }

  /* --- Scientific note box --- */
  function scientificNoteBox(): (InstanceType<typeof Paragraph> | InstanceType<typeof Table>)[] {
    const noteText =
      "EO-derived change regions are evidence for review and are not validated ground truth. " +
      "Results depend on the selected imagery, preprocessing, spatial resolution and configured detection threshold.";
    return [
      heading("Scientific Note"),
      new Table({
        rows: [
          new TableRow({
            children: [
              new TableCell({
                borders: accentBorders,
                shading: { fill: OFF_WHITE, type: ShadingType.CLEAR },
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: noteText,
                        italics: true,
                        size: 18,
                        color: TEXT_MUTED,
                        font: "Calibri",
                      }),
                    ],
                    spacing: { before: 80, after: 80 },
                  }),
                ],
              }),
            ],
          }),
        ],
        width: { size: 100, type: WidthType.PERCENTAGE },
      }),
    ];
  }

  /* =================================================================
     BUILD DOCUMENT
     ================================================================= */

  const children: (InstanceType<typeof Paragraph> | InstanceType<typeof Table>)[] = [];

  // ── PAGE 1 — EXECUTIVE SUMMARY ──────────────────────────────
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "ORBITALQUERY",
          bold: true,
          size: 56,
          color: PURPLE,
          font: "Calibri",
        }),
      ],
      spacing: { after: 100 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: "Earth Observation Analysis Report",
          size: 24,
          color: TEXT_MUTED,
          font: "Calibri",
        }),
      ],
      spacing: { after: 200 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: loc.toUpperCase(),
          bold: true,
          size: 32,
          color: DEEP_GREEN,
          font: "Calibri",
        }),
      ],
      spacing: { after: 80 },
    }),
  );

  // Date range
  const d1 = props.before?.datetime
    ? new Date(props.before.datetime).toLocaleDateString("en-GB", {
        day: "2-digit", month: "short", year: "numeric",
      })
    : "\u2014";
  const d2 = props.after?.datetime
    ? new Date(props.after.datetime).toLocaleDateString("en-GB", {
        day: "2-digit", month: "short", year: "numeric",
      })
    : "\u2014";
  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: `${d1}  \u2192  ${d2}`, size: 24, color: "A0AAA0", font: "Calibri" }),
      ],
      spacing: { after: 200 },
    }),
  );

  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: "\u2500".repeat(40), size: 14, color: "C8D2C8", font: "Calibri" }),
      ],
      spacing: { after: 200 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "ANALYSIS SNAPSHOT", bold: true, size: 20, color: DEEP_GREEN, font: "Calibri" }),
      ],
      spacing: { after: 160 },
    }),
  );

  children.push(metricCardsTable());
  children.push(spacer(200));

  // Analysis Context
  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: "ANALYSIS CONTEXT", bold: true, size: 20, color: DEEP_GREEN, font: "Calibri" }),
      ],
      spacing: { after: 120 },
    }),
    metaRow("Location", loc),
    metaRow("Analysis", props.parsed.analysis?.replace(/_/g, " ") ?? "\u2014"),
    metaRow("Dataset", props.parsed.dataset ?? "Sentinel-2 L2A"),
    metaRow("Date range", `${props.parsed.startDate ?? "\u2014"} to ${props.parsed.endDate ?? "\u2014"}`),
  );
  if (stats) {
    children.push(metaRow("AOI area", `${stats.aoi_area_km2.toFixed(0)} km\u00B2`));
  }
  children.push(spacer(200));

  // Key Finding
  children.push(...keyFindingBox());

  // ── PAGE 2 — OBSERVATION DATA ───────────────────────────────
  children.push(heading("Observation Data", HeadingLevel.HEADING_1));

  // Search
  children.push(subheading("1. Search"));
  children.push(metaRow("Query", props.parsed.location ?? "\u2014"));
  children.push(metaRow("Location", loc));
  children.push(metaRow("Analysis type", props.parsed.analysis?.replace(/_/g, " ") ?? "\u2014"));
  children.push(metaRow("Date range", `${props.parsed.startDate ?? "\u2014"} to ${props.parsed.endDate ?? "\u2014"}`));
  children.push(metaRow("Dataset", props.parsed.dataset ?? "Sentinel-2 L2A"));
  if (stats) children.push(metaRow("AOI area", `${stats.aoi_area_km2.toFixed(0)} km\u00B2`));
  children.push(spacer(200));

  // Scenes
  children.push(subheading("2. Selected Scenes"));
  children.push(
    dataTable(
      ["", "BEFORE", "AFTER"],
      [
        ["Acquisition", fmtDate(props.before?.datetime), fmtDate(props.after?.datetime)],
        ["Platform", platform(props.before), platform(props.after)],
        [
          "Cloud cover",
          props.before ? `${props.before.cloudCover.toFixed(1)}%` : "\u2014",
          props.after ? `${props.after.cloudCover.toFixed(1)}%` : "\u2014",
        ],
        ["Tile", tile(props.before), tile(props.after)],
        [
          "Dataset",
          props.before?.collection ?? "Sentinel-2 L2A",
          props.after?.collection ?? "Sentinel-2 L2A",
        ],
      ],
    ),
  );
  children.push(spacer(100));

  // Scene IDs
  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: "Scene IDs: ", bold: true, size: 16, color: TEXT_MUTED, font: "Calibri" }),
        new TextRun({ text: props.before?.id ?? "\u2014", size: 16, font: "Calibri" }),
      ],
      spacing: { after: 40 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "             ", size: 16, font: "Calibri" }),
        new TextRun({ text: props.after?.id ?? "\u2014", size: 16, font: "Calibri" }),
      ],
      spacing: { after: 200 },
    }),
  );

  // Imagery placeholder note
  children.push(subheading("3. Satellite Imagery"));
  children.push(
    body(
      "Satellite imagery from the selected scene pair is available in the interactive OrbitalQuery console. " +
        "Cross-origin restrictions prevent reliable embedding in document exports.",
      { italic: true, color: TEXT_MUTED },
    ),
  );
  children.push(spacer(200));

  // ── PAGE 3 — CHANGE ANALYSIS ────────────────────────────────
  children.push(heading("Change Analysis", HeadingLevel.HEADING_1));

  if (stats) {
    children.push(
      dataTable(
        ["Metric", "Value"],
        [
          ["Detected regions", `${stats.n_regions}`],
          ["Changed area", `${stats.total_changed_area_km2.toFixed(1)} km\u00B2`],
          ["Mean magnitude", stats.mean_change_magnitude.toFixed(3)],
          ["Largest region", `${stats.max_region_area_km2.toFixed(2)} km\u00B2`],
          ["AOI area", `${stats.aoi_area_km2.toFixed(0)} km\u00B2`],
          ["Threshold", `|dNDVI| \u2265 ${stats.threshold_used.toFixed(2)}`],
          ["NDVI before (mean)", stats.ndvi_before_mean?.toFixed(3) ?? "\u2014"],
          ["NDVI after (mean)", stats.ndvi_after_mean?.toFixed(3) ?? "\u2014"],
        ],
      ),
    );
    children.push(spacer(200));
  }

  // NDVI Comparison
  if (stats && stats.ndvi_before_mean != null && stats.ndvi_after_mean != null) {
    children.push(subheading("NDVI Comparison"));
    const nb = stats.ndvi_before_mean;
    const na = stats.ndvi_after_mean;
    const diff = na - nb;
    const diffStr = diff >= 0 ? `+${diff.toFixed(3)}` : diff.toFixed(3);

    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: "BEFORE: ", bold: true, size: 22, color: BLUE, font: "Calibri" }),
          new TextRun({ text: nb.toFixed(3), bold: true, size: 22, font: "Calibri" }),
        ],
        spacing: { after: 60 },
      }),
      new Paragraph({
        children: [
          new TextRun({ text: "  \u2193", size: 22, color: PURPLE, font: "Calibri" }),
        ],
        spacing: { after: 60 },
      }),
      new Paragraph({
        children: [
          new TextRun({ text: "AFTER:  ", bold: true, size: 22, color: ORANGE, font: "Calibri" }),
          new TextRun({ text: na.toFixed(3), bold: true, size: 22, font: "Calibri" }),
        ],
        spacing: { after: 60 },
      }),
      new Paragraph({
        children: [
          new TextRun({ text: `\u0394NDVI = ${diffStr}`, bold: true, size: 20, color: diff < 0 ? ORANGE : LIME, font: "Calibri" }),
        ],
        spacing: { after: 200 },
      }),
    );

    // Interpretation
    if (interp) {
      children.push(body(interp));
      children.push(spacer(200));
    }
  }

  // Top Regions table
  if (regions.length > 0) {
    children.push(subheading("Top 10 Detected Regions"));
    children.push(
      dataTable(
        ["Rank", "Region", "Area (km\u00B2)", "|dNDVI|", "NDVI Before", "NDVI After"],
        regions.map((f, i) => {
          const p = f.properties;
          return [
            `${i + 1}`,
            p.region_id,
            p.area_km2.toFixed(3),
            p.change_magnitude.toFixed(3),
            p.ndvi_before?.toFixed(3) ?? "\u2014",
            p.ndvi_after?.toFixed(3) ?? "\u2014",
          ];
        }),
      ),
    );
    children.push(spacer(200));
  }

  // Top regions visual (text bar chart)
  if (regions.length > 0) {
    children.push(subheading("Top Change Regions by Area"));
    const maxArea = regions[0].properties.area_km2;

    regions.forEach((f) => {
      const p = f.properties;
      const barLen = Math.round((p.area_km2 / maxArea) * 30);
      const bar = "\u2588".repeat(barLen) + "\u2591".repeat(30 - barLen);
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: `${p.region_id.padEnd(8)} `, bold: true, size: 16, color: PURPLE, font: "Courier New" }),
            new TextRun({ text: bar, size: 16, color: PURPLE, font: "Courier New" }),
            new TextRun({ text: `  ${p.area_km2.toFixed(3)} km\u00B2`, size: 16, font: "Calibri" }),
          ],
          spacing: { after: 40 },
        }),
      );
    });
    children.push(spacer(200));
  }

  // ── PAGE 4 — METHOD AND INTERPRETATION ──────────────────────
  children.push(heading("Method and Interpretation", HeadingLevel.HEADING_1));

  // Method
  children.push(subheading("1. Method"));
  const methodItems = [
    "Dataset: Sentinel-2 Level-2A imagery retrieved through Microsoft Planetary Computer.",
    "Vegetation index: NDVI = (B08 \u2212 B04) / (B08 + B04)",
    "Change metric: |\u0394NDVI| = |NDVI_after \u2212 NDVI_before|",
    `Detection threshold: |\u0394NDVI| \u2265 ${stats ? stats.threshold_used.toFixed(2) : "0.20"}`,
    "Processing: AOI clipping, valid-pixel masking, morphological cleanup, connected-component filtering, change-region vectorization.",
  ];
  methodItems.forEach((item) => {
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: "\u2022  ", size: 18, color: LIME, font: "Calibri" }),
          new TextRun({ text: item, size: 18, font: "Calibri" }),
        ],
        spacing: { after: 60 },
      }),
    );
  });
  children.push(spacer(200));

  // Data Provenance
  children.push(subheading("2. Data Provenance"));
  children.push(metaRow("Dataset", props.parsed.dataset ?? "Sentinel-2 L2A"));
  children.push(metaRow("Provider", "Microsoft Planetary Computer (Copernicus Sentinel-2)"));
  children.push(metaRow("BEFORE acquisition", props.before?.datetime ?? "\u2014"));
  children.push(metaRow("AFTER acquisition", props.after?.datetime ?? "\u2014"));
  children.push(metaRow("Tile", tile(props.before)));
  children.push(metaRow("Cloud cover", props.before ? `${props.before.cloudCover.toFixed(1)}%` : "\u2014"));
  children.push(metaRow("Threshold", `|\u0394NDVI| \u2265 ${stats ? stats.threshold_used.toFixed(2) : "0.20"}`));
  children.push(spacer(200));

  // Interpretation
  children.push(subheading("3. Interpretation"));
  if (interp) {
    children.push(body(interp));
  } else {
    children.push(body("No interpretation available.", { italic: true, color: TEXT_MUTED }));
  }
  children.push(spacer(200));

  // Scientific Note
  children.push(...scientificNoteBox());

  /* --- build and save --- */
  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: convertInchesToTwip(8.27), height: convertInchesToTwip(11.69) },
            margin: {
              top: convertInchesToTwip(0.7),
              bottom: convertInchesToTwip(0.7),
              left: convertInchesToTwip(0.7),
              right: convertInchesToTwip(0.7),
            },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: "ORBITALQUERY", bold: true, size: 16, color: PURPLE, font: "Calibri" }),
                  new TextRun({ text: `  |  ${loc}`, size: 16, color: TEXT_MUTED, font: "Calibri" }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: "OrbitalQuery  |  Earth Observation Analysis Report", size: 14, color: "A0AAA0", font: "Calibri" }),
                  new TextRun({ text: "    " }),
                  new TextRun({ text: "Page ", size: 14, color: "A0AAA0", font: "Calibri" }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 14, color: "A0AAA0", font: "Calibri" }),
                  new TextRun({ text: " of ", size: 14, color: "A0AAA0", font: "Calibri" }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 14, color: "A0AAA0", font: "Calibri" }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${makeFilename(props.parsed, props.before, props.after)}.docx`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ===================================================================
   COMPONENT
   =================================================================== */

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
          {busy === "pdf" ? "Generating\u2026" : "PDF"}
        </button>
        <button
          className="oq-btn oq-btn--ghost"
          onClick={handleDOCX}
          disabled={busy !== null}
          type="button"
          style={{ flex: 1, fontSize: 12 }}
        >
          {busy === "docx" ? "Generating\u2026" : "Word (.docx)"}
        </button>
      </div>

      {error && (
        <div style={{ fontSize: 11, color: "var(--orange)" }}>{error}</div>
      )}
    </div>
  );
}
