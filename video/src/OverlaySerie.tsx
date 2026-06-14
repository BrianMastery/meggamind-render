import { AbsoluteFill, Sequence, useVideoConfig } from "remotion";
import { AvisoSistema, Posicion } from "./AvisoSistema";
import { PlacaInflexion } from "./PlacaInflexion";

// Un evento del sistema, surgido del guion (ver knowledge/sistema_visual.md).
export type Evento = {
  label: string;
  contexto?: string;
  segundo?: number; // cuándo aparece
  duracion?: number; // cuánto dura (0.6–1.2 s ideal, máx 2)
  posicion?: Posicion | "auto";
};

export type OverlayProps = {
  formato: "reel" | "youtube";
  eventos: Evento[];
};

// Capa transparente que coloca cada aviso en su momento. Un solo elemento a la vez.
export const OverlaySerie: React.FC<OverlayProps> = ({ formato, eventos }) => {
  const { fps } = useVideoConfig();
  const posDefault: Posicion = formato === "reel" ? "superior" : "inferior-izq";

  return (
    <AbsoluteFill style={{ backgroundColor: "transparent" }}>
      {eventos.map((e, i) => {
        const from = Math.round((e.segundo ?? 0) * fps);
        const dur = Math.max(1, Math.round((e.duracion ?? 1.0) * fps));
        const pos: Posicion =
          e.posicion && e.posicion !== "auto" ? e.posicion : posDefault;
        const esInflexion = /INFLEXI/i.test(e.label);
        return (
          <Sequence key={i} from={from} durationInFrames={dur}>
            {esInflexion ? (
              <PlacaInflexion label={e.label} contexto={e.contexto} />
            ) : (
              <AvisoSistema label={e.label} contexto={e.contexto} posicion={pos} />
            )}
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
