"use client";

import maplibregl, { type Map as MLMap } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";

import type { ChangeFeatureCollection } from "@/types/geojson";
import type { BBox } from "@/types/geojson";
import type { SceneSummary } from "@/types/scene";
import { BeforeAfterSwipe } from "./BeforeAfter";

export type MapMode = "before" | "after" | "swipe" | "change";

// Neutral dark basemap (Esri World Dark Gray Canvas — keyless, no watermark).
// CARTO dark_all now bakes "API KEY REQUIRED" watermarks into keyless tiles,
// which would poison the console backdrop.
const BASEMAP_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    basemap: {
      type: "raster",
      tiles: [
        "https://services.arcgisonline.com/arcgis/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      attribution: "Esri, HERE, Garmin, FAO, NOAA, USGS | Basemap © Esri",
      maxzoom: 16,
    },
  },
  layers: [{ id: "basemap", type: "raster", source: "basemap", paint: { "raster-opacity": 0.85 } }],
};

/** Resolve a Planetary Computer tilejson URL to raster source options. */
async function resolveRaster(
  tilejsonUrl: string
): Promise<{ tiles: string[]; bounds: number[]; minzoom: number; maxzoom: number } | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(tilejsonUrl, { signal: ctrl.signal });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      tiles?: string[];
      bounds?: number[];
      minzoom?: number;
      maxzoom?: number;
    };
    if (!data.tiles?.length) return null;
    return {
      tiles: data.tiles,
      bounds: data.bounds ?? [-180, -85, 180, 85],
      minzoom: data.minzoom ?? 0,
      maxzoom: Math.min(data.maxzoom ?? 19, 19),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function safeRemoveLayer(map: MLMap, id: string) {
  if (map.getLayer(id)) map.removeLayer(id);
}
function safeRemoveSource(map: MLMap, id: string) {
  if (map.getSource(id)) map.removeSource(id);
}

// CHANGE mode shows the AFTER scene dimmed beneath the purple change polygons,
// so the regions stay clearly visible over the satellite evidence.
const CHANGE_IMAGERY_OPACITY = 0.6;

/** AFTER-imagery per mode: full in AFTER, dimmed under the change polygons in CHANGE, hidden otherwise. */
function applyAfterImageryMode(map: MLMap, mode: MapMode) {
  const show = mode === "after" || mode === "change";
  map.setLayoutProperty("after-imagery", "visibility", show ? "visible" : "none");
  map.setPaintProperty("after-imagery", "raster-opacity", mode === "change" ? CHANGE_IMAGERY_OPACITY : 1);
}

/** Add a scene raster layer (id + outline layers) once its tilejson resolves. */
async function addSceneLayer(map: MLMap, scene: SceneSummary, layerId: string, beforeId?: string) {
  const raster = await resolveRaster(scene.tileUrl);
  if (!raster || !map.getStyle()) return false;
  safeRemoveLayer(map, layerId);
  safeRemoveSource(map, layerId);
  if (!map.getSource(layerId)) {
    map.addSource(layerId, {
      type: "raster",
      tiles: raster.tiles,
      bounds: raster.bounds as [number, number, number, number],
      minzoom: raster.minzoom,
      maxzoom: raster.maxzoom,
      tileSize: 256,
      attribution: "Contains modified Copernicus Sentinel data — Planetary Computer",
    });
    // Scene imagery slots below the AOI outline when one is requested
    // (CHANGE target order: basemap → imagery → AOI → change polygons).
    const insertBefore = beforeId && map.getLayer(beforeId) ? beforeId : undefined;
    map.addLayer({ id: layerId, type: "raster", source: layerId, paint: { "raster-opacity": 1 } }, insertBefore);
  }
  return true;
}

export interface EOMapProps {
  aoi: BBox | null;
  beforeScene: SceneSummary | null;
  afterScene: SceneSummary | null;
  mode: MapMode;
  changeGeojson: ChangeFeatureCollection | null;
  selectedRegionId: string | null;
  onRegionSelect: (regionId: string | null) => void;
}

export default function EOMap(props: EOMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const lastAoiKey = useRef<string>("");
  // Live mode for async completions: raster effects finish loading after the
  // user may have switched mode, so they must not trust captured props.mode.
  const modeRef = useRef<MapMode>("before");

  // ---- map init ----
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASEMAP_STYLE,
      center: [78.4, 17.4],
      zoom: 9,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    map.on("load", () => setMapReady(true));
    map.on("error", (e) => {
      // Raster tile hiccups are recoverable; style errors are fatal.
      const msg = e?.error?.message ?? "";
      if (msg.includes("style")) setLoadError("map style failed to load");
    });
    return () => {
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, []);

  // ---- fit bounds when AOI changes ----
  useEffect(() => {
    if (!mapReady || !props.aoi) return;
    const key = props.aoi.join(",");
    if (key === lastAoiKey.current) return;
    lastAoiKey.current = key;
    mapRef.current?.fitBounds(
      [
        [props.aoi[0], props.aoi[1]],
        [props.aoi[2], props.aoi[3]],
      ],
      { padding: 40, duration: 900, maxZoom: 13 }
    );
  }, [props.aoi, mapReady]);

  // ---- AOI outline ----
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map || !props.aoi) return;
    const [w, s, e, n] = props.aoi;
    safeRemoveLayer(map, "aoi-outline");
    safeRemoveSource(map, "aoi");
    map.addSource("aoi", {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {},
            geometry: {
              type: "Polygon",
              coordinates: [[
                [w, s], [e, s], [e, n], [w, n], [w, s],
              ]],
            },
          },
        ],
      },
    });
    map.addLayer({
      id: "aoi-outline",
      type: "line",
      source: "aoi",
      paint: {
        "line-color": "#a3e635",
        "line-width": 1.5,
        "line-dasharray": [3, 2],
        "line-opacity": 0.8,
      },
    });
  }, [props.aoi, mapReady]);

  // ---- before raster ----
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    let stale = false;
    (async () => {
      if (props.beforeScene) {
        const ok = await addSceneLayer(map, props.beforeScene, "before-imagery");
        if (stale) return;
        if (!ok) setLoadError("before imagery could not be loaded");
      } else {
        safeRemoveLayer(map, "before-imagery");
        safeRemoveSource(map, "before-imagery");
      }
    })();
    return () => {
      stale = true;
    };
  }, [props.beforeScene, mapReady]);

  // ---- after raster ----
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    let stale = false;
    (async () => {
      if (props.afterScene) {
        const ok = await addSceneLayer(map, props.afterScene, "after-imagery", "aoi-outline");
        if (stale) return;
        if (!ok) {
          setLoadError("after imagery could not be loaded");
        } else if (map.getLayer("after-imagery")) {
          // Apply the mode that is live NOW (the fetch may have outlived a switch).
          applyAfterImageryMode(map, modeRef.current);
        }
      } else {
        safeRemoveLayer(map, "after-imagery");
        safeRemoveSource(map, "after-imagery");
      }
    })();
    return () => {
      stale = true;
    };
  }, [props.afterScene, mapReady]);

  // ---- change regions ----
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    safeRemoveLayer(map, "change-selected");
    safeRemoveLayer(map, "change-outline");
    safeRemoveLayer(map, "change-fill");
    safeRemoveSource(map, "change");
    if (!props.changeGeojson) return;
    map.addSource("change", { type: "geojson", data: props.changeGeojson as never });
    map.addLayer({
      id: "change-fill",
      type: "fill",
      source: "change",
      paint: {
        "fill-color": "#a78bfa",
        "fill-opacity": [
          "interpolate", ["linear"], ["get", "change_magnitude"],
          0.2, 0.25, 0.5, 0.5, 0.8, 0.7,
        ],
      },
    });
    map.addLayer({
      id: "change-outline",
      type: "line",
      source: "change",
      paint: { "line-color": "#c4b5fd", "line-width": 1.2, "line-opacity": 0.9 },
    });
    map.addLayer({
      id: "change-selected",
      type: "line",
      source: "change",
      filter: ["==", ["get", "region_id"], props.selectedRegionId ?? "__none__"],
      paint: { "line-color": "#ffffff", "line-width": 3 },
    });

    // click → select + popup
    map.on("click", "change-fill", (ev) => {
      const f = ev.features?.[0];
      if (!f) return;
      const p = f.properties as Record<string, unknown>;
      const rid = String(p.region_id ?? "");
      props.onRegionSelect(rid);
      const html = `
        <div style="min-width:190px">
          <div style="font-weight:800;color:#a78bfa;margin-bottom:6px">Region ${rid}</div>
          <div>Area: <b>${Number(p.area_km2 ?? 0).toFixed(3)} km²</b></div>
          <div>Change magnitude: <b>${Number(p.change_magnitude ?? 0).toFixed(3)}</b></div>
          <div>NDVI before: ${p.ndvi_before != null ? Number(p.ndvi_before).toFixed(3) : "—"}</div>
          <div>NDVI after: ${p.ndvi_after != null ? Number(p.ndvi_after).toFixed(3) : "—"}</div>
        </div>`;
      new maplibregl.Popup({ closeButton: false })
        .setLngLat(ev.lngLat)
        .setHTML(html)
        .addTo(map);
    });
    map.on("mouseenter", "change-fill", () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", "change-fill", () => {
      map.getCanvas().style.cursor = "";
    });
  }, [props.changeGeojson, mapReady]);

  // ---- selected region filter ----
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map || !map.getLayer("change-selected")) return;
    map.setFilter("change-selected", ["==", ["get", "region_id"], props.selectedRegionId ?? "__none__"]);
  }, [props.selectedRegionId, mapReady]);

  // ---- raster visibility by mode ----
  useEffect(() => {
    modeRef.current = props.mode;
    const map = mapRef.current;
    if (!mapReady || !map) return;
    const showBefore = props.mode === "before" || props.mode === "swipe";
    const showChange = props.mode === "change";
    if (map.getLayer("before-imagery")) {
      map.setLayoutProperty("before-imagery", "visibility", showBefore ? "visible" : "none");
      map.setPaintProperty("before-imagery", "raster-opacity", showChange ? 0.3 : 1);
    }
    if (map.getLayer("after-imagery")) {
      applyAfterImageryMode(map, props.mode);
    }
  }, [props.mode, mapReady, props.beforeScene, props.afterScene, props.changeGeojson]);

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
      {mapReady && props.mode === "swipe" && props.beforeScene && props.afterScene && (
        <BeforeAfterSwipe afterScene={props.afterScene} getBaseMap={() => mapRef.current} />
      )}
      {loadError && (
        <div className="state-box error" style={{ position: "absolute", top: 60, left: 14, zIndex: 8, background: "rgba(7,17,13,0.9)" }}>
          {loadError}
        </div>
      )}
    </div>
  );
}
