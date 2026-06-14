import React from "react";
import {
  AbsoluteFill,
  Audio,
  CalculateMetadataFunction,
  Easing,
  interpolate,
  OffthreadVideo,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { loadFont } from "@remotion/google-fonts/InterTight";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";

const { fontFamily: INTER_TIGHT } = loadFont();
const { fontFamily: INTER } = loadInter();

// Plan generado por tools/plan_descript.py: piezas 4K limpias de Descript (corte real, intocable).
// Cada bloque de habla/trading es UN video continuo -> cero flashes, lip-sync de Descript intacto.
type Palabra = { w: string; s: number };
type Caption = { t: string; s: number; e: number; w: Palabra[] };
type Frag = {
  video: string; // visual (B-roll conformado o pieza de Descript)
  from?: number; // inicio dentro del video (s)
  dur: number;
  conAudio?: boolean; // true = el video lleva su propio audio (talking-head)
  vo?: { src: string; from: number; dur: number }; // voz en off desde una pieza
  grade?: "A1" | "B1" | "C1";
};
type Bloque = {
  tipo: "habla" | "trading" | "title_card" | "cold_open" | "outro";
  video?: string; // pieza 4K continua de Descript
  dur?: number; // duración real en segundos
  grade?: "A1" | "B1" | "C1";
  zoom?: "punch" | "panzoom" | "kenburns";
  captions?: Caption[]; // tiempos relativos a la pieza
  broll?: string[]; // overlays mudos sobre el bloque (el audio del spine sigue)
  frags?: Frag[]; // solo cold_open
};
export type VlogProps = { fps: number; bloques: Bloque[] };

const vidUrl = (f: string) => staticFile(`china/${f}`);
const APPLE = Easing.bezier(0.25, 0.1, 0.25, 1);

// --- Grade por categoría (las piezas ya vienen SDR de Descript; esto es el look cinematográfico encima) ---
const FILTRO: Record<string, string> = {
  A1: "contrast(1.05) saturate(1.04)", // naturaleza
  B1: "contrast(1.05) saturate(1.0) brightness(0.99)", // trading
  C1: "contrast(1.04) saturate(0.99)", // talking-head, piel fiel
};
const Grade: React.FC<{ preset?: string; children: React.ReactNode }> = ({ preset = "C1", children }) => (
  <AbsoluteFill style={{ filter: FILTRO[preset] ?? FILTRO.C1 }}>
    {children}
    <AbsoluteFill style={{
      background: preset === "B1"
        ? "radial-gradient(ellipse at 50% 46%, transparent 42%, rgba(0,0,0,0.34) 100%)"
        : "radial-gradient(ellipse at center, transparent 62%, rgba(0,0,0,0.20) 100%)",
      pointerEvents: "none",
    }} />
    {preset === "C1" && (
      <AbsoluteFill style={{ background: "#13283a", mixBlendMode: "soft-light", opacity: 0.1, pointerEvents: "none" }} />
    )}
  </AbsoluteFill>
);

// --- Zoom lento de alta gama (curva Apple, clamp) ---
const Zoom: React.FC<{ kind?: string; dur: number; children: React.ReactNode }> = ({ kind, dur, children }) => {
  const f = useCurrentFrame();
  let scale = 1;
  let origin = "50% 42%";
  if (kind === "kenburns") scale = interpolate(f, [0, dur], [1.0, 1.07], { easing: APPLE, extrapolateRight: "clamp" });
  else if (kind === "panzoom") { scale = interpolate(f, [0, dur], [1.0, 1.04], { easing: APPLE, extrapolateRight: "clamp" }); origin = "50% 50%"; }
  else scale = interpolate(f, [0, dur], [1.0, 1.035], { easing: APPLE, extrapolateRight: "clamp" }); // push lento talking-head
  return <AbsoluteFill style={{ transform: `scale(${scale})`, transformOrigin: origin }}>{children}</AbsoluteFill>;
};

// Subtítulos de marca: Inter, pequeños y elegantes, abajo al centro. Karaoke sutil
// (la palabra hablada pasa de 55% a 100% de opacidad). Capa propia: NUNCA escalan con el zoom.
const Subs: React.FC<{ captions: Caption[] }> = ({ captions }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = f / fps;
  const cap = captions.find((c) => t >= c.s && t <= c.e + 0.25);
  if (!cap) return null;
  const inOp = interpolate(t, [cap.s, cap.s + 0.12], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", pointerEvents: "none" }}>
      <div style={{
        marginBottom: 132, maxWidth: 2700, textAlign: "center", opacity: inOp,
        fontFamily: INTER, fontWeight: 600, fontSize: 88, lineHeight: 1.2,
        color: "#F4F7FA", textShadow: "0 4px 18px rgba(5,7,10,0.75)",
      }}>
        {cap.w.map((p, i) => (
          <span key={i} style={{ opacity: t >= p.s ? 1 : 0.55, transition: "none" }}>
            {p.w}{" "}
          </span>
        ))}
      </div>
    </AbsoluteFill>
  );
};

// Cold open (tráiler 30-45s, NO revela el resultado del trade): fragmentos con corte directo,
// B-roll con voz en off de las piezas, y momentos a cámara. Fade solo al inicio y al final.
const ColdOpen: React.FC<{ frags: Frag[] }> = ({ frags }) => {
  const { fps } = useVideoConfig();
  const f = useCurrentFrame();
  const total = frags.reduce((s, x) => s + Math.round(x.dur * fps), 0);
  const fadeIn = interpolate(f, [0, 18], [0, 1], { extrapolateRight: "clamp" });
  const fadeOut = interpolate(f, [total - 14, total], [1, 0], { extrapolateLeft: "clamp" });
  let acc = 0;
  return (
    <AbsoluteFill style={{ backgroundColor: "#05070A", opacity: Math.min(fadeIn, fadeOut) }}>
      {frags.map((fr, i) => {
        const dur = Math.round(fr.dur * fps);
        const from = acc;
        acc += dur;
        return (
          <Sequence key={i} from={from} durationInFrames={dur}>
            <Grade preset={fr.grade ?? "A1"}>
              <Zoom kind="kenburns" dur={dur}>
                <OffthreadVideo
                  src={vidUrl(fr.video)}
                  trimBefore={Math.round((fr.from ?? 0) * fps)}
                  muted={!fr.conAudio}
                  toneMapped={false}
                />
              </Zoom>
            </Grade>
            {fr.vo && (
              <Audio
                src={vidUrl(fr.vo.src)}
                trimBefore={Math.round(fr.vo.from * fps)}
                trimAfter={Math.round((fr.vo.from + fr.vo.dur) * fps)}
              />
            )}
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

// Outro: B-roll emocional (el niño del lago) con fade a negro y la marca pequeña.
const Outro: React.FC<{ video?: string }> = ({ video }) => {
  const { fps } = useVideoConfig();
  const f = useCurrentFrame();
  const dur = Math.round(8 * fps);
  const fadeOut = interpolate(f, [dur - 90, dur], [1, 0], { extrapolateLeft: "clamp" });
  const textOp = interpolate(f, [40, 70], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ backgroundColor: "#05070A" }}>
      {video && (
        <AbsoluteFill style={{ opacity: fadeOut }}>
          <Grade preset="A1">
            <Zoom kind="kenburns" dur={dur}>
              <OffthreadVideo src={vidUrl(video)} muted toneMapped={false} />
            </Zoom>
          </Grade>
        </AbsoluteFill>
      )}
      <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", opacity: textOp * fadeOut }}>
        <div style={{ marginBottom: 160, fontFamily: INTER_TIGHT, color: "#F4F7FA", letterSpacing: "0.5em", fontSize: 44, fontWeight: 600, paddingLeft: "0.5em", textShadow: "0 4px 18px rgba(5,7,10,0.8)" }}>
          EL JUEGO REAL
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const TitleCard: React.FC = () => {
  const f = useCurrentFrame();
  const op = interpolate(f, [0, 16, 130, 150], [0, 1, 1, 0], { extrapolateRight: "clamp" });
  const y = interpolate(f, [0, 34], [30, 0], { easing: APPLE, extrapolateRight: "clamp" });
  const lineW = interpolate(f, [20, 52], [0, 240], { easing: APPLE, extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ backgroundColor: "#05070A", justifyContent: "center", alignItems: "center" }}>
      <div style={{ opacity: op, transform: `translateY(${y}px)`, textAlign: "center" }}>
        <div style={{ fontFamily: INTER_TIGHT, color: "#00E5FF", letterSpacing: "0.6em", fontSize: 54, fontWeight: 600, paddingLeft: "0.6em", marginBottom: 40 }}>
          EL JUEGO REAL
        </div>
        <div style={{ fontFamily: INTER_TIGHT, color: "#F4F7FA", fontSize: 196, fontWeight: 800, lineHeight: 0.98, letterSpacing: "-0.025em" }}>
          Trading desde<br />el cielo
        </div>
        <div style={{ width: lineW, height: 5, background: "#00E5FF", margin: "52px auto 0", borderRadius: 3 }} />
      </div>
    </AbsoluteFill>
  );
};

export const bloqueDur = (b: Bloque, fps: number): number => {
  if (b.tipo === "habla" || b.tipo === "trading") return Math.max(1, Math.round((b.dur ?? 1) * fps));
  if (b.tipo === "title_card") return Math.round(2.5 * fps);
  if (b.tipo === "cold_open")
    return (b.frags ?? []).reduce((s, fr) => s + Math.round(fr.dur * fps), 0) || Math.round(6 * fps);
  if (b.tipo === "outro") return Math.round(8 * fps);
  return fps;
};

// Overlays de B-roll repartidos sobre el bloque (mudos; el audio del spine sigue sonando).
const Overlays: React.FC<{ broll: string[]; total: number }> = ({ broll, total }) => {
  const { fps } = useVideoConfig();
  const n = broll.length;
  if (!n) return null;
  const margen = Math.round(total * 0.16);
  const paso = (total - 2 * margen) / (n + 1);
  const dur = Math.round(4.5 * fps);
  return (
    <>
      {broll.map((bl, i) => {
        const start = Math.max(0, Math.round(margen + (i + 1) * paso - dur / 2));
        return (
          <Sequence key={i} from={start} durationInFrames={dur}>
            <Grade preset="A1">
              <Zoom kind="kenburns" dur={dur}>
                <OffthreadVideo src={vidUrl(bl)} muted toneMapped={false} />
              </Zoom>
            </Grade>
          </Sequence>
        );
      })}
    </>
  );
};

export const Vlog: React.FC<VlogProps> = ({ fps, bloques }) => {
  let acc = 0;
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {bloques.map((b, i) => {
        const dur = bloqueDur(b, fps);
        const from = acc;
        acc += dur;
        let inner: React.ReactNode;
        if (b.tipo === "habla" || b.tipo === "trading")
          inner = (
            <>
              <Grade preset={b.grade}>
                <Zoom kind={b.zoom} dur={dur}>
                  <OffthreadVideo src={vidUrl(b.video!)} toneMapped={false} />
                </Zoom>
              </Grade>
              {b.broll && <Overlays broll={b.broll} total={dur} />}
              {b.captions && <Subs captions={b.captions} />}
            </>
          );
        else if (b.tipo === "title_card") inner = <TitleCard />;
        else if (b.tipo === "cold_open") inner = <ColdOpen frags={b.frags ?? []} />;
        else inner = <Outro video={b.video} />;
        return (
          <Sequence key={i} from={from} durationInFrames={dur}>
            {inner}
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

export const calcVlog: CalculateMetadataFunction<VlogProps> = async () => {
  const plan = await fetch(staticFile("render_plan.json")).then((r) => r.json());
  const caps: Record<string, Caption[]> = await fetch(staticFile("china/subs/captions.json"))
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}));
  const fps: number = plan.fps ?? 60;
  const bloques: Bloque[] = (plan.bloques ?? []).map((b: Bloque) => {
    if (!b.video) return b;
    const stem = b.video.split("/").pop()!.replace(/\.mp4$/, "");
    return { ...b, captions: caps[stem] ?? [] };
  });
  const total = bloques.reduce((s: number, b: Bloque) => s + bloqueDur(b, fps), 0);
  return { durationInFrames: Math.max(fps, total), fps, props: { fps, bloques } };
};
