import type { Metadata, Viewport } from "next";
import "./globals.css";
import { APPEARANCE_INIT_SCRIPT } from "@/game/appearance";

export const metadata: Metadata = {
  title: "Hong Kong Mahjong",
  description:
    "Play Hong Kong old-style mahjong against three computer opponents — full 144-tile set, chow/pung/kong claims and faan scoring.",
  icons: { icon: "/favicon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0d3b2e",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="jade" data-suits="vivid" data-tiles="pips">
      <head>
        {/* Restores the saved appearance before first paint, so a chosen
            theme never flashes the default one. */}
        <script dangerouslySetInnerHTML={{ __html: APPEARANCE_INIT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
