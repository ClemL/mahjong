"use client";

import { useMemo } from "react";
import qrcode from "qrcode-generator";

/**
 * A QR code drawn as SVG modules.
 *
 * Deliberately black on white in both themes: a scanner needs the contrast and
 * the light quiet zone around the symbol, and a tastefully muted QR code is one
 * nobody's phone can read.
 */
export function QrCode({
  value,
  label,
  className = "",
}: {
  value: string;
  label: string;
  className?: string;
}) {
  const { size, path } = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(value);
    qr.make();
    const count = qr.getModuleCount();
    let d = "";
    for (let row = 0; row < count; row += 1) {
      for (let col = 0; col < count; col += 1) {
        if (qr.isDark(row, col)) d += `M${col} ${row}h1v1h-1z`;
      }
    }
    return { size: count, path: d };
  }, [value]);

  const quiet = 4;
  const extent = size + quiet * 2;

  return (
    <svg
      className={`qr ${className}`.trim()}
      viewBox={`0 0 ${extent} ${extent}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
    >
      <rect width={extent} height={extent} fill="#ffffff" />
      <path d={path} transform={`translate(${quiet} ${quiet})`} fill="#000000" />
    </svg>
  );
}
