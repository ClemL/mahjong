import type { MetadataRoute } from "next";

/**
 * Installable so the tablet acting as the table can run standalone: no browser
 * chrome to tap by accident, no back gesture mid-hand, and roughly 100px of
 * vertical space back.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Hong Kong Mahjong",
    short_name: "Mahjong",
    description:
      "Hong Kong old-style mahjong — play solo against the computer, or share a table with friends.",
    start_url: "/",
    display: "standalone",
    background_color: "#0d3b2e",
    theme_color: "#0d3b2e",
    // The table wants landscape and a phone wants portrait, and one manifest
    // cannot say both, so neither is forced.
    orientation: "any",
    categories: ["games"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
