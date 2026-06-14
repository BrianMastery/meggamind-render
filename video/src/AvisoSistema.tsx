import {
  AbsoluteFill,
  Easing,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { APPEAR, COLORS, DISAPPEAR, FONT_INTER, FONT_TIGHT } from "./theme";

export type Posicion = "superior" | "inferior-izq";

// Un aviso de la "inteligencia que observa". Aparece · respira · desaparece.
// Un solo elemento a la vez, <=10% de pantalla. Nunca rebota/gira/vibra.
export const AvisoSistema: React.FC<{
  label: string;
  contexto?: string;
  posicion?: Posicion;
}> = ({ label, contexto, posicion = "inferior-izq" }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const enter = interpolate(frame, [0, APPEAR], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const exit = interpolate(frame, [durationInFrames - DISAPPEAR, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const opacity = Math.min(enter, exit);
  const translateY = interpolate(enter, [0, 1], [10, 0]); // movimiento mínimo
  const blur = interpolate(enter, [0, 1], [6, 0]);

  const arriba = posicion === "superior";
  return (
    <AbsoluteFill
      style={{
        justifyContent: arriba ? "flex-start" : "flex-end",
        alignItems: "flex-start",
        padding: arriba ? "150px 80px" : "80px",
      }}
    >
      <div
        style={{
          opacity,
          transform: `translateY(${translateY}px)`,
          filter: `blur(${blur}px)`,
          display: "flex",
          flexDirection: "column",
          gap: 10,
          maxWidth: "72%",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 22,
              height: 2,
              background: COLORS.cian,
              boxShadow: `0 0 12px ${COLORS.cian}`,
            }}
          />
          <span
            style={{
              fontFamily: FONT_TIGHT,
              fontWeight: 600,
              fontSize: 30,
              letterSpacing: "0.18em",
              color: COLORS.blanco,
              textTransform: "uppercase",
              textShadow: "0 2px 20px rgba(0,0,0,0.6)",
            }}
          >
            {label}
          </span>
        </div>
        {contexto ? (
          <span
            style={{
              fontFamily: FONT_INTER,
              fontWeight: 500,
              fontSize: 22,
              letterSpacing: "0.02em",
              color: COLORS.plata,
              marginLeft: 36,
              textShadow: "0 2px 16px rgba(0,0,0,0.6)",
            }}
          >
            {contexto}
          </span>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
