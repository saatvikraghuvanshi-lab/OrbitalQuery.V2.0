import type { SearchPreset } from "@/types/query";

/**
 * Curated example regions for the "AVAILABLE SEARCHES" panel.
 * These are SEARCH PRESETS, not separate datasets — every one flows through
 * the same query → STAC → visualization → analysis pipeline as a typed
 * query. Hyderabad is marked as the flagship example.
 */
export const PRESET_CATALOG: SearchPreset[] = [
  // ---------------- CITIES ----------------
  {
    id: "hyderabad",
    name: "Hyderabad",
    group: "CITIES",
    type: "city",
    bbox: [77.9, 17.2, 78.7, 17.75],
    defaultAnalysis: "urban_change",
    suggestedDateRange: { startDate: "2018-01-01", endDate: "2026-12-31" },
    query: "urban expansion in Hyderabad between 2018 and 2026",
    flagship: true,
  },
  {
    id: "mumbai",
    name: "Mumbai",
    group: "CITIES",
    type: "city",
    bbox: [72.77, 18.88, 73.1, 19.28],
    defaultAnalysis: "urban_change",
    suggestedDateRange: { startDate: "2018-01-01", endDate: "2024-12-31" },
    query: "land use change around Mumbai from 2018 to 2024",
  },
  {
    id: "delhi-ncr",
    name: "Delhi NCR",
    group: "CITIES",
    type: "city",
    bbox: [76.85, 28.35, 77.6, 28.85],
    defaultAnalysis: "urban_change",
    suggestedDateRange: { startDate: "2018-01-01", endDate: "2025-12-31" },
    query: "urban change in Delhi NCR from 2018 to 2025",
  },
  {
    id: "jaipur",
    name: "Jaipur",
    group: "CITIES",
    type: "city",
    bbox: [75.35, 26.75, 76.05, 27.1],
    defaultAnalysis: "urban_change",
    suggestedDateRange: { startDate: "2018-01-01", endDate: "2025-12-31" },
    query: "urban change in Jaipur from 2018 to 2025",
  },
  {
    id: "dehradun",
    name: "Dehradun",
    group: "CITIES",
    type: "city",
    bbox: [77.95, 30.25, 78.15, 30.42],
    defaultAnalysis: "urban_change",
    suggestedDateRange: { startDate: "2018-01-01", endDate: "2025-12-31" },
    query: "urban change in Dehradun from 2018 to 2025",
  },
  {
    id: "srinagar",
    name: "Srinagar",
    group: "CITIES",
    type: "city",
    bbox: [74.75, 34.0, 74.99, 34.18],
    defaultAnalysis: "urban_change",
    suggestedDateRange: { startDate: "2018-01-01", endDate: "2025-12-31" },
    query: "urban change in Srinagar from 2018 to 2025",
  },

  // ---------------- REGIONS ----------------
  {
    id: "western-ghats",
    name: "Western Ghats",
    group: "REGIONS",
    type: "region",
    bbox: [73.2, 10.5, 76.0, 16.2],
    defaultAnalysis: "vegetation_change",
    suggestedDateRange: { startDate: "2019-01-01", endDate: "2025-12-31" },
    query: "forest change in the Western Ghats from 2019 to 2025",
  },
  {
    id: "himalayan-belt",
    name: "Himalayan Belt",
    group: "REGIONS",
    type: "region",
    bbox: [76.5, 29.5, 80.5, 33.5],
    defaultAnalysis: "vegetation_change",
    suggestedDateRange: { startDate: "2019-01-01", endDate: "2025-12-31" },
    query: "vegetation change in the Himalayan Belt from 2019 to 2025",
  },
  {
    id: "thar-desert",
    name: "Thar Desert",
    group: "REGIONS",
    type: "region",
    bbox: [69.5, 24.5, 73.5, 28.5],
    defaultAnalysis: "land_use_change",
    suggestedDateRange: { startDate: "2018-01-01", endDate: "2025-12-31" },
    query: "land use change in the Thar Desert from 2018 to 2025",
  },
  {
    id: "sundarbans",
    name: "Sundarbans",
    group: "REGIONS",
    type: "region",
    bbox: [88.0, 21.4, 89.2, 22.3],
    defaultAnalysis: "vegetation_change",
    suggestedDateRange: { startDate: "2018-01-01", endDate: "2025-12-31" },
    query: "vegetation change in the Sundarbans from 2018 to 2025",
  },

  // ---------------- CHANGE & RISK ----------------
  {
    id: "nepal",
    name: "Nepal",
    group: "CHANGE & RISK",
    type: "region",
    bbox: [80.0, 26.3, 88.2, 30.4],
    defaultAnalysis: "vegetation_change",
    suggestedDateRange: { startDate: "2020-01-01", endDate: "2026-12-31" },
    query: "vegetation change in Nepal between 2020 and 2026",
  },
  {
    id: "kathmandu-valley",
    name: "Kathmandu Valley",
    group: "CHANGE & RISK",
    type: "city",
    bbox: [85.15, 27.55, 85.6, 27.85],
    defaultAnalysis: "urban_change",
    suggestedDateRange: { startDate: "2018-01-01", endDate: "2026-12-31" },
    query: "urban change in Kathmandu Valley from 2018 to 2026",
  },
  {
    id: "uttarakhand",
    name: "Uttarakhand",
    group: "CHANGE & RISK",
    type: "region",
    bbox: [77.5, 28.7, 81.1, 31.45],
    defaultAnalysis: "vegetation_change",
    suggestedDateRange: { startDate: "2019-01-01", endDate: "2025-12-31" },
    query: "forest change in Uttarakhand from 2019 to 2025",
  },
  {
    id: "brahmaputra-basin",
    name: "Brahmaputra Basin",
    group: "CHANGE & RISK",
    type: "region",
    bbox: [89.5, 24.0, 95.5, 28.5],
    defaultAnalysis: "vegetation_change",
    suggestedDateRange: { startDate: "2019-01-01", endDate: "2025-12-31" },
    query: "land use change in the Brahmaputra Basin from 2019 to 2025",
  },
  {
    id: "northeast-india",
    name: "Northeast India",
    group: "CHANGE & RISK",
    type: "region",
    bbox: [89.8, 22.0, 96.5, 28.5],
    defaultAnalysis: "vegetation_change",
    suggestedDateRange: { startDate: "2019-01-01", endDate: "2025-12-31" },
    query: "vegetation change in Northeast India from 2019 to 2025",
  },
];

/** Presets grouped for panel rendering, preserving spec order. */
export function groupedPresets(): Array<{
  group: "CITIES" | "REGIONS" | "CHANGE & RISK";
  presets: SearchPreset[];
}> {
  const order: Array<"CITIES" | "REGIONS" | "CHANGE & RISK"> = [
    "CITIES",
    "REGIONS",
    "CHANGE & RISK",
  ];
  return order.map((group) => ({
    group,
    presets: PRESET_CATALOG.filter((p) => p.group === group),
  }));
}
