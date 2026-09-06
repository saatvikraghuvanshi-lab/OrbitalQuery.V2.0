export type BBox = [number, number, number, number];

export interface PolygonGeometry {
  type: "Polygon";
  coordinates: number[][][];
}

export interface MultiPolygonGeometry {
  type: "MultiPolygon";
  coordinates: number[][][][];
}

export type GeoGeometry = PolygonGeometry | MultiPolygonGeometry;

export interface GeoFeature<P> {
  type: "Feature";
  geometry: GeoGeometry | null;
  properties: P;
  id?: string | number;
}

export interface FeatureCollection<P> {
  type: "FeatureCollection";
  features: GeoFeature<P>[];
}

export type ChangeFeatureCollection = FeatureCollection<import("./analysis").ChangeRegionProps>;
