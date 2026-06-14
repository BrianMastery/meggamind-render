// video/scripts/subtitulos.mjs
// Subtítulos automáticos con Whisper local ($0). Ver knowledge/sistema_visual.md y layout.ts.
//
// Uso:
//   npm --prefix video run subs -- <audio> [--formato reel|youtube] [--video footage] [--out dir]
//
// Flujo: audio -> wav 16kHz -> whisper.cpp (medium, español) -> captions -> agrupa en
// bloques (keyword resaltada) -> render del reel con subtítulos quemados + exporta .srt.
// El .srt sirve para los CC de YouTube (horizontal no se quema). Probarlo con un audio real.

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  downloadWhisperModel,
  installWhisperCpp,
  toCaptions,
  transcribe,
} from "@remotion/install-whisper-cpp";

const VIDEO_DIR = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const WHISPER_DIR = path.join(VIDEO_DIR, ".whisper");
const WHISPER_VERSION = "1.7.4";
const MODEL = "medium"; // buena precisión en español

const args = process.argv.slice(2);
const audio = args.find((a) => !a.startsWith("--"));
const flag = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
if (!audio) {
  console.error("Uso: npm --prefix video run subs -- <audio> [--formato reel|youtube] [--video footage] [--out dir]");
  process.exit(1);
}
const formato = flag("formato", "reel");
const videoBg = flag("video", null);
const outDir = path.resolve(flag("out", path.join(VIDEO_DIR, "out")));
mkdirSync(outDir, { recursive: true });
mkdirSync(WHISPER_DIR, { recursive: true });

// 1) audio -> wav 16kHz mono (lo que pide whisper.cpp)
const wav = path.join(outDir, "audio_16k.wav");
console.log("[1/5] audio -> wav 16kHz");
execFileSync("npx", ["remotion", "ffmpeg", "-y", "-i", path.resolve(audio), "-ar", "16000", "-ac", "1", wav], {
  cwd: VIDEO_DIR,
  stdio: "inherit",
});

// 2) whisper.cpp + modelo medium (la 1a vez descarga ~1.5GB)
console.log("[2/5] preparando whisper.cpp + modelo medium");
await installWhisperCpp({ to: WHISPER_DIR, version: WHISPER_VERSION });
await downloadWhisperModel({ model: MODEL, folder: WHISPER_DIR });

// 3) transcribir (español, timing por token)
console.log("[3/5] transcribiendo");
const whisperOutput = await transcribe({
  inputPath: wav,
  whisperPath: WHISPER_DIR,
  whisperCppVersion: WHISPER_VERSION,
  model: MODEL,
  tokenLevelTimestamps: true,
  language: "es",
});
const { captions } = toCaptions({ whisperCppOutput: whisperOutput });

// 4) agrupar en bloques + keyword + .srt (siempre)
const bloques = agrupar(captions);
const srtPath = path.join(outDir, "subtitulos.srt");
writeFileSync(srtPath, toSrt(bloques), "utf-8");
console.log(`[4/5] ${bloques.length} bloques -> ${srtPath}`);

// 5) render del reel con subtítulos quemados (vertical) o clip horizontal
const comp = formato === "youtube" ? "SubtitulosHorizontal" : "SubtitulosVertical";
const props = { formato, captions: bloques, ...(videoBg ? { video: path.resolve(videoBg) } : {}) };
const propsPath = path.join(outDir, "subs_props.json");
writeFileSync(propsPath, JSON.stringify(props), "utf-8");
const ext = videoBg ? "mp4" : "mov"; // con footage -> mp4; capa sola -> .mov con alfa
const codecArgs = videoBg ? ["--codec=h264"] : ["--codec=prores", "--prores-profile=4444"];
const out = path.join(outDir, `${comp}.${ext}`);
console.log("[5/5] render");
try {
  execFileSync("npx", ["remotion", "render", comp, out, `--props=${propsPath}`, ...codecArgs], {
    cwd: VIDEO_DIR,
    stdio: "inherit",
  });
  console.log(`Listo: ${out}  +  ${srtPath}`);
} catch {
  console.warn("Render falló (probable macOS<15 sin navegador). El .srt y la transcripción SÍ quedaron.");
  console.warn("El render de producción corre en Linux/Railway. SRT:", srtPath);
}

// ---------- helpers ----------
function agrupar(caps, maxChars = 34, maxGapMs = 600) {
  const blocks = [];
  let cur = null;
  for (const c of caps) {
    const w = (c.text || "").trim();
    if (!w) continue;
    if (cur && cur.text.length + 1 + w.length <= maxChars && c.startMs - cur.endMs <= maxGapMs) {
      cur.text += " " + w;
      cur.endMs = c.endMs;
    } else {
      if (cur) blocks.push(cur);
      cur = { text: w, startMs: c.startMs, endMs: c.endMs };
    }
  }
  if (cur) blocks.push(cur);
  // keyword = palabra más larga del bloque (>=5 letras); resalta una por bloque (brand_voice)
  for (const b of blocks) {
    const kw = b.text
      .split(/\s+/)
      .map((x) => x.replace(/[^0-9A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, ""))
      .filter((x) => x.length >= 5)
      .sort((a, z) => z.length - a.length)[0];
    if (kw) b.keyword = kw;
  }
  return blocks;
}

function toSrt(blocks) {
  return blocks
    .map((b, i) => `${i + 1}\n${srtTime(b.startMs)} --> ${srtTime(b.endMs)}\n${b.text.trim()}\n`)
    .join("\n");
}

function srtTime(ms) {
  const p = (n, l = 2) => String(n).padStart(l, "0");
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${p(h)}:${p(m)}:${p(s)},${p(ms % 1000, 3)}`;
}
