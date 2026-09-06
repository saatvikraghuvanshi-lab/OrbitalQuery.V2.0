import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Tile imagery is loaded directly by MapLibre from Planetary Computer
  // (CORS-open endpoints). No image optimization or remote patterns needed.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
