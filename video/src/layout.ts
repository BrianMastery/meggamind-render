// knowledge/layout.ts — posiciones y tipografía oficiales (safe zones 2026)
// Tipografía: Inter Tight (títulos/avisos), Inter (subtítulos). Pesos Medium / SemiBold / Bold.
// Paleta: negro #05070A, blanco #F4F7FA, plata #BFC7D5, cian #00E5FF (cian solo para 1 énfasis).

export const VERTICAL = {
  canvas: { w: 1080, h: 1920 },
  // banda segura cruzada (Reels + TikTok + Shorts)
  safe: { top: 300, bottom: 1300, left: 90, rightTop: 990, rightLower: 890 },
  hook: { // apertura 0–2.5s
    box: { centerX: 540, maxWidth: 900, top: 330 },
    font: "Inter Tight", weight: 700, size: 96, lineHeight: 1.08,
    maxCharsPerLine: 16, maxLines: 3,
    color: "#F4F7FA", keyword: { size: 124, color: "#00E5FF" },
  },
  subtitles: {
    box: { centerX: 540, maxWidth: 780, centerY: 1150, bottomLimit: 1260 },
    font: "Inter", weight: 600, size: 68, lineHeight: 1.15,
    maxCharsPerLine: 18, maxLines: 2,
    color: "#F4F7FA", keyword: { size: 92, color: "#00E5FF" },
    shadow: "0 4px 14px rgba(5,7,10,0.65)",
  },
  systemNotice: {
    anchor: "top-left", x: 90, y: 320,
    label:   { font: "Inter Tight", weight: 500, size: 36, uppercase: true, letterSpacing: 2, color: "#F4F7FA" },
    context: { font: "Inter", weight: 400, size: 24, color: "#BFC7D5" },
    accent: "#00E5FF", maxScreenPct: 10, durationSec: [0.6, 1.2],
  },
};

export const HORIZONTAL = {
  canvas: { w: 1920, h: 1080 },
  safe: { sideMargin: 100, topBottomMargin: 60, controlsBottom: 100 }, // texto dentro del 90%
  subtitles: {
    box: { centerX: 960, maxWidth: 1400, centerY: 950, bottomLimit: 1000 },
    font: "Inter", weight: 600, size: 52, lineHeight: 1.2,
    maxCharsPerLine: 38, maxLines: 2,
    color: "#F4F7FA", keyword: { size: 70, color: "#00E5FF" },
    shadow: "0 4px 14px rgba(5,7,10,0.65)",
  },
  title: {
    anchor: "bottom-left", x: 100, baselineY: 930,
    font: "Inter Tight", weight: 600, size: 64, color: "#F4F7FA",
  },
  systemNotice: {
    anchor: "bottom-left", x: 100, y: 920,
    label:   { font: "Inter Tight", weight: 500, size: 40, uppercase: true, letterSpacing: 2, color: "#F4F7FA" },
    context: { font: "Inter", weight: 400, size: 28, color: "#BFC7D5" },
    accent: "#00E5FF", maxScreenPct: 10, durationSec: [0.6, 1.2],
  },
};

// REGLA (Principio 6): un solo overlay a la vez. Si systemNotice está activo, pausar subtitles.
