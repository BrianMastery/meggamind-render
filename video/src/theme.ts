// Tokens del sistema visual de la serie. Spec: knowledge/sistema_visual.md
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadInterTight } from "@remotion/google-fonts/InterTight";

// 90% negro/plata, 10% cian (el cian solo enfatiza).
export const COLORS = {
  negro: "#05070A",
  blanco: "#F4F7FA",
  plata: "#BFC7D5",
  cian: "#00E5FF",
} as const;

// Inter Tight (primaria), Inter (secundaria). loadFont(style?, options?):
// el 1er arg es el estilo, no las opciones. Sin args carga la fuente correctamente.
export const FONT_TIGHT = loadInterTight().fontFamily;
export const FONT_INTER = loadInter().fontFamily;

// Animación Apple: aparece · respira · desaparece (300–800 ms; sin rebote).
export const FPS = 30;
export const APPEAR = 14; // ~0.47 s
export const DISAPPEAR = 14;
