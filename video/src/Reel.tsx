import {
  AbsoluteFill,
  Easing,
  getRemotionEnvironment,
  interpolate,
  OffthreadVideo,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  Video,
} from "remotion";

// Reel vertical dirigido por reel_plan.json (la RECETA — nada horneado sin receta).
// Canvas 1080×1920; el 4K sale con `--scale=2`. Fuente SIEMPRE SDR bt709 (decisión B).
// Audio: SIEMPRE el del spine de piezas (sin offsets). Los overlays solo tapan el video.

export type Reframe = { cx: number; cy?: number; zoom: number; cxTo?: number; zoomTo?: number; fit?: boolean };
export type Pieza = { src: string; clip: string; bloque: string; at: number; dur: number; atF?: number; durF?: number; reframe: Reframe };
export type Overlay = { tipo: string; at: number; dur: number; in: number; pip?: boolean; titulo?: string };
export type Plan = {
  fps: number;
  modo: "proxy" | "4k";
  total: number;
  frames: number;
  piezas: Pieza[];
  overlays: Overlay[];
};
export type ReelProps = { plan: Plan | null; forceVideoTag?: boolean };

// flag para stills locales en macOS 13 (el compositor OffthreadVideo exige macOS 15)
let FORCE_VIDEO_TAG = false;

export const calcReel = async ({ props }: { props: ReelProps }) => {
  const plan: Plan = props.plan ?? (await fetch(staticFile("reel_plan.json")).then((r) => r.json()));
  FORCE_VIDEO_TAG = !!props.forceVideoTag;
  return { durationInFrames: Math.max(60, plan.frames), fps: plan.fps, props: { ...props, plan } };
};

const SRC_W = 3840; // fuentes horizontales 4K (los psrc son 960×540: misma geometría relativa)
const SRC_H = 2160;

const Media: React.FC<{ src: string; muted?: boolean; style?: React.CSSProperties; trimBefore?: number }> = (p) => {
  const C = getRemotionEnvironment().isRendering && !FORCE_VIDEO_TAG ? OffthreadVideo : Video;
  return <C src={p.src} muted={p.muted} style={p.style} toneMapped={false} trimBefore={p.trimBefore} pauseWhenBuffering />;
};

// Una pieza del spine con reencuadre 9:16 (cx en px de la fuente 3840) y panzoom continuo.
const Cam: React.FC<{ p: Pieza; modo: Plan["modo"]; muted: boolean }> = ({ p, modo, muted }) => {
  const frame = useCurrentFrame();
  const { fps, width: CW, height: CH } = useVideoConfig();
  const durF = Math.max(1, Math.round(p.dur * fps));
  const r = p.reframe;
  const zoom = interpolate(frame, [0, durF], [r.zoom, r.zoomTo ?? r.zoom], {
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.ease),
  });
  const cx = interpolate(frame, [0, durF], [r.cx, r.cxTo ?? r.cx], {
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.ease),
  });
  const dispH = CH * zoom;
  const dispW = SRC_W * (dispH / SRC_H);
  const left = CW / 2 - cx * (dispW / SRC_W);
  const cy = r.cy ?? SRC_H * 0.5;
  const top = Math.min(0, Math.max(CH - dispH, CH / 2 - cy * (dispH / SRC_H)));
  const src = staticFile(`${modo === "proxy" ? "psrc" : "rsrc"}/${p.src}`);
  if (r.fit) {
    // punch-in 16:9: panel completo con FONDO DE RELLENO BLUR del mismo video (nada de vacío negro)
    const pw = CW, ph = Math.round((CW * 9) / 16);
    return (
      <AbsoluteFill style={{ backgroundColor: "#05070A", overflow: "hidden" }}>
        <Media
          src={src}
          muted
          style={{
            position: "absolute", width: CW * 2.6, height: CH * 1.5, left: -CW * 0.8, top: -CH * 0.25,
            maxWidth: "none", objectFit: "cover",
            filter: "blur(46px) brightness(0.38) saturate(1.1)",
          }}
        />
        <div style={{
          position: "absolute", left: -200, top: CH * 0.22, width: CW + 400, height: ph + 400,
          background: "radial-gradient(closest-side, rgba(0,229,255,0.07), rgba(0,229,255,0))",
        }} />
        <div style={{
          position: "absolute", left: 0, top: Math.round(CH * 0.30), width: pw, height: ph,
          overflow: "hidden", borderRadius: 18,
          boxShadow: "0 26px 70px rgba(0,0,0,0.65)",
          transform: `scale(${1 + (zoom - (r.zoom ?? 1)) * 0.5 + 0.0})`,
        }}>
          <Media src={src} muted={muted} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill style={{ overflow: "hidden", backgroundColor: "#05070A" }}>
      <Media
        src={src}
        muted={muted}
        style={{ position: "absolute", width: dispW, height: dispH, left, top, maxWidth: "none" }}
      />
    </AbsoluteFill>
  );
};

// Spine completo: todas las piezas en secuencia (el audio del reel vive aquí).
const Spine: React.FC<{ plan: Plan; muted: boolean }> = ({ plan, muted }) => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill>
      {plan.piezas.map((p, i) => (
        <Sequence
          key={i}
          from={p.atF ?? Math.round(p.at * fps)}
          durationInFrames={Math.max(1, p.durF ?? Math.round(p.dur * fps))}
          premountFor={2 * fps}
        >
          <Cam p={p} modo={plan.modo} muted={muted} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};

// Panel de Brian dentro del screencast: plano MEDIO abierto desde la fuente original
// (nunca el spine, que ya viene recortado 9:16 y quedaría doble-crop = cara gigante).
const PanelCam: React.FC<{ plan: Plan; o: Overlay; W: number; H: number }> = ({ plan, o, W, H }) => {
  const { fps } = useVideoConfig();
  const piezas = plan.piezas.filter((p) => p.at < o.at + o.dur && p.at + p.dur > o.at);
  const dispH = H;                       // altura completa de la fuente -> plano abierto
  const dispW = SRC_W * (dispH / SRC_H); // ancho resultante (se recorta a los lados)
  return (
    <>
      {piezas.map((p, i) => {
        const srcV = staticFile(`${plan.modo === "proxy" ? "psrc" : "rsrc"}/${p.src}`);
        const from = Math.round((p.at - o.at) * fps);
        const durF = Math.max(1, Math.round(p.dur * fps));
        if (p.reframe.fit) {
          return (
            <Sequence key={i} from={from} durationInFrames={durF} premountFor={fps}>
              <Media src={srcV} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </Sequence>
          );
        }
        const left = Math.min(0, Math.max(W - dispW, W / 2 - p.reframe.cx * (dispW / SRC_W)));
        return (
          <Sequence key={i} from={from} durationInFrames={durF} premountFor={fps}>
            <Media src={srcV} muted
              style={{ position: "absolute", width: dispW, height: dispH, left, top: 0, maxWidth: "none" }} />
          </Sequence>
        );
      })}
    </>
  );
};

// Screencast "dúo": dos paneles apilados que LLENAN el 9:16 — arriba la pantalla grande,
// abajo Brian en su propio panel (plano medio, no un PiP miniatura). Chip de título arriba.
const Screencast: React.FC<{ o: Overlay; plan: Plan }> = ({ o, plan }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const durF = Math.max(1, Math.round(o.dur * fps));
  const zoom = interpolate(frame, [0, durF], [1.0, 1.045], { extrapolateRight: "clamp" });
  const fade = Math.min(
    interpolate(frame, [0, 9], [0, 1], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) }),
    interpolate(frame, [durF - 9, durF], [1, 0], { extrapolateLeft: "clamp" }),
  );
  const M = 26;                 // margen lateral
  const W = 1080 - M * 2;       // 1028
  const H1 = Math.round((W * 9) / 16); // pantalla 16:9 -> 578
  const TOP1 = 400;
  const TOP2 = TOP1 + H1 + 22;  // panel de Brian
  const H2 = 1920 - TOP2 - 120; // llena hasta cerca del borde seguro inferior
  return (
    <AbsoluteFill style={{ backgroundColor: "#05070A", opacity: fade }}>
      <div
        style={{
          position: "absolute", left: -240, top: 260, width: 1560, height: 1400,
          background: "radial-gradient(closest-side, rgba(0,229,255,0.09), rgba(0,229,255,0))",
        }}
      />
      {/* chip de título */}
      <div
        style={{
          position: "absolute", left: M + 6, top: 318, display: "flex", alignItems: "center", gap: 18,
          fontFamily: "Inter Tight, Inter, sans-serif", fontWeight: 600, fontSize: 36,
          letterSpacing: 3.5, color: "#F4F7FA",
        }}
      >
        <div style={{ width: 6, height: 36, background: "#00E5FF", borderRadius: 3 }} />
        {o.titulo ?? "PANTALLA"}
      </div>
      {/* PANEL 1: la pantalla, grande */}
      <div
        style={{
          position: "absolute", left: M, top: TOP1, width: W, height: H1,
          borderRadius: 20, overflow: "hidden",
          border: "1px solid rgba(191,199,213,0.14)",
          boxShadow: "0 26px 70px rgba(0,0,0,0.6), 0 4px 18px rgba(0,229,255,0.05)",
        }}
      >
        <Media
          src={staticFile("fuentes/escena_plataformas.mp4")}
          muted
          trimBefore={Math.round(o.in * fps)}
          style={{
            width: "100%", height: "100%", objectFit: "cover",
            transform: `scale(${1.2 * zoom}) translateY(-2.6%)`,
          }}
        />
      </div>
      {/* PANEL 2: Brian en plano medio abierto (desde la fuente, no el spine) */}
      <div
        style={{
          position: "absolute", left: M, top: TOP2, width: W, height: H2,
          borderRadius: 20, overflow: "hidden",
          border: "1px solid rgba(191,199,213,0.10)",
          boxShadow: "0 18px 50px rgba(0,0,0,0.55)",
        }}
      >
        <PanelCam plan={plan} o={o} W={W} H={H2} />
      </div>
    </AbsoluteFill>
  );
};

export const Reel: React.FC<ReelProps> = ({ plan }) => {
  const { fps } = useVideoConfig();
  if (!plan) return <AbsoluteFill style={{ backgroundColor: "#05070A" }} />;
  return (
    <AbsoluteFill style={{ backgroundColor: "#05070A" }}>
      {/* SPINE: video + AUDIO de las piezas, siempre corriendo desde frame 0 */}
      <Spine plan={plan} muted={false} />
      {/* OVERLAYS: tapan el video del spine, jamás su audio */}
      {plan.overlays.map((o, i) => (
        <Sequence
          key={i}
          from={Math.round(o.at * fps)}
          durationInFrames={Math.max(1, Math.round(o.dur * fps))}
          premountFor={2 * fps}
        >
          <Screencast o={o} plan={plan} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
