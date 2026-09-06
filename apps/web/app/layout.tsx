import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import "./globals.css";

export const metadata: Metadata = {
  title: "OrbitalQuery — Earth Observation Discovery",
  description:
    "Ask questions. Discover Earth Observation data. See what changed. Multi-temporal Sentinel-2 analysis for researchers and decision-makers.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={GeistSans.variable}>
      <body>{children}</body>
    </html>
  );
}
