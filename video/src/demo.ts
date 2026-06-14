import { Caption } from "./Subtitulos";
import { Evento } from "./OverlaySerie";

// Eventos de muestra para previsualizar en Remotion Studio. En producción los genera
// el agente Contenido a partir del guion (overlay JSON).
export const DEMO: Evento[] = [
  { label: "NUEVA ETAPA", contexto: "nivel 01, la partida empieza", segundo: 1, duracion: 1.2 },
  { label: "PATRÓN IDENTIFICADO", contexto: "la dispersión vuelve", segundo: 3, duracion: 1.2 },
  { label: "PUNTO DE INFLEXIÓN", contexto: "soltar para comprometerse", segundo: 5.2, duracion: 1.6 },
  { label: "COSTO AÚN DESCONOCIDO", segundo: 7.6, duracion: 1.2 },
];

// Subtítulos de muestra (en producción salen de Whisper sobre el audio real).
export const DEMO_CAPTIONS: Caption[] = [
  { text: "Convertí mi vida en un videojuego", startMs: 0, endMs: 1800, keyword: "videojuego" },
  { text: "y empiezo en Nivel 01", startMs: 1800, endMs: 3200, keyword: "Nivel 01" },
  { text: "mi jefe final soy yo mismo", startMs: 3200, endMs: 5200, keyword: "yo mismo" },
];
