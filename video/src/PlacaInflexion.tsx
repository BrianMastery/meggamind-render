import {
  AbsoluteFill,
  Easing,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { COLORS, FONT_INTER, FONT_TIGHT } from "./theme";

// Momento grande del arco (p. ej. "PUNTO DE INFLEXIÓN"). Centrado, fade lento,
// igual de sobrio. Sigue siendo el marco; la historia manda.
export const PlacaInflexion: React.FC<{ label: string; contexto?: string }> = ({
  label,
  contexto,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const enter = interpolate(frame, [0, 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const exit = interpolate(frame, [durationInFrames - 20, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const opacity = Math.min(enter, exit);
  const blur = interpolate(enter, [0, 1], [10, 0]);

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <div
        style={{
          opacity,
          filter: `blur(${blur}px)`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 18,
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 40,
            height: 2,
            background: COLORS.cian,
            boxShadow: `0 0 16px ${COLORS.cian}`,
          }}
        />
        <span
          style={{
            fontFamily: FONT_TIGHT,
            fontWeight: 600,
            fontSize: 52,
            letterSpacing: "0.22em",
            color: COLORS.blanco,
            textTransform: "uppercase",
            textShadow: "0 2px 30px rgba(0,0,0,0.7)",
          }}
        >
          {label}
        </span>
        {contexto ? (
          <span
            style={{
              fontFamily: FONT_INTER,
              fontWeight: 500,
              fontSize: 26,
              letterSpacing: "0.02em",
              color: COLORS.plata,
              textShadow: "0 2px 18px rgba(0,0,0,0.6)",
            }}
          >
            {contexto}
          </span>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
