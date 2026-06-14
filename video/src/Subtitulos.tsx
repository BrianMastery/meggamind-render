import {
  AbsoluteFill,
  Easing,
  interpolate,
  OffthreadVideo,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { HORIZONTAL, VERTICAL } from "./layout";
import { FONT_INTER } from "./theme";

// Un subtítulo con timing (de Whisper). keyword = palabra clave a resaltar.
export type Caption = {
  text: string;
  startMs: number;
  endMs: number;
  keyword?: string;
};

export type SubtitulosProps = {
  formato: "reel" | "youtube";
  captions: Caption[];
  video?: string; // footage de fondo para QUEMAR encima; si falta, fondo transparente (capa)
};

type SubCfg = typeof VERTICAL.subtitles;

// Resalta la palabra clave (a mayor tamaño + cian). Solo una por bloque (brand_voice).
function conKeyword(text: string, keyword: string | undefined, cfg: SubCfg) {
  if (!keyword) return text;
  const i = text.toLowerCase().indexOf(keyword.toLowerCase());
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <span style={{ fontSize: cfg.keyword.size, color: cfg.keyword.color, fontWeight: 700 }}>
        {text.slice(i, i + keyword.length)}
      </span>
      {text.slice(i + keyword.length)}
    </>
  );
}

const Bloque: React.FC<{ c: Caption; cfg: SubCfg }> = ({ c, cfg }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const f = 4; // fade rápido y limpio
  const opacity = Math.min(
    interpolate(frame, [0, f], [0, 1], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) }),
    interpolate(frame, [durationInFrames - f, durationInFrames], [1, 0], { extrapolateLeft: "clamp" }),
  );
  return (
    <div
      style={{
        position: "absolute",
        left: cfg.box.centerX,
        top: cfg.box.centerY,
        transform: "translate(-50%, -50%)",
        width: cfg.box.maxWidth,
        textAlign: "center",
        opacity,
        fontFamily: FONT_INTER,
        fontWeight: cfg.weight,
        fontSize: cfg.size,
        lineHeight: cfg.lineHeight,
        color: cfg.color,
        textShadow: cfg.shadow,
      }}
    >
      {conKeyword(c.text, c.keyword, cfg)}
    </div>
  );
};

// Capa de subtítulos. Vertical = quemados sobre el reel; horizontal = solo para clips
// (el YouTube largo usa .srt, no quemado). Posiciones/tipografía: knowledge/layout.ts.
export const Subtitulos: React.FC<SubtitulosProps> = ({ formato, captions, video }) => {
  const { fps } = useVideoConfig();
  const cfg = (formato === "reel" ? VERTICAL.subtitles : HORIZONTAL.subtitles) as SubCfg;
  return (
    <AbsoluteFill style={{ backgroundColor: "transparent" }}>
      {video ? <OffthreadVideo src={video} /> : null}
      {captions.map((c, i) => {
        const from = Math.round((c.startMs / 1000) * fps);
        const dur = Math.max(1, Math.round(((c.endMs - c.startMs) / 1000) * fps));
        return (
          <Sequence key={i} from={from} durationInFrames={dur}>
            <Bloque c={c} cfg={cfg} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
