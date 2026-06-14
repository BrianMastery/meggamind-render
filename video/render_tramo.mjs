// video/render_tramo.mjs — renderiza UN tramo (frameRange) del Vlog en un runner de GitHub Actions.
// Baja las piezas del plan de R2 -> `remotion render --frames=FROM-TO` -> sube el parcial a R2.
// Env: R2_* (cuenta/llaves/bucket), FROM, TO, IDX, CONCURRENCY (2), OFFTHREAD_CACHE, PREFIJO (china).
import {
  S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { spawn } from "node:child_process";
import { mkdir, readFile, stat } from "node:fs/promises";
import { createWriteStream, existsSync } from "node:fs";
import { pipeline } from "node:stream/promises";
import path from "node:path";

const E = process.env;
const PREFIJO = E.PREFIJO ?? "china";
const FROM = Number(E.FROM ?? 0);
const TO = Number(E.TO ?? 0);
const IDX = E.IDX ?? "00";
const CONCURRENCY = E.CONCURRENCY ?? "2";
const OFFTHREAD_CACHE = E.OFFTHREAD_CACHE ?? "268435456"; // 256MB; el runner privado tiene 7GB
const CRF = E.CRF ?? "16";                                 // 16 = alta calidad 4K (menor = mejor)
const OUT_KEY = `render/tramos/seg_${IDX}.mp4`;

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${E.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: E.R2_ACCESS_KEY_ID, secretAccessKey: E.R2_SECRET_ACCESS_KEY },
});
const PUB = path.resolve("public");
const CLIPS = path.join(PUB, "china");

function run(cmd, args) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, args, { stdio: "inherit" });
    p.on("error", rej);
    p.on("close", (c) => (c === 0 ? res() : rej(new Error(`${cmd} salió con código ${c}`))));
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// bloqueDur: réplica EXACTA de src/Vlog.tsx (para ubicar cada bloque en la timeline).
function bloqueDur(b, fps) {
  if (b.tipo === "habla" || b.tipo === "trading") return Math.max(1, Math.round((b.dur ?? 1) * fps));
  if (b.tipo === "title_card") return Math.round(2.5 * fps);
  if (b.tipo === "cold_open")
    return (b.frags ?? []).reduce((s, fr) => s + Math.round(fr.dur * fps), 0) || Math.round(6 * fps);
  if (b.tipo === "outro") return Math.round(8 * fps);
  return fps;
}

// Solo las piezas de los bloques que se solapan con [from, to]: un tramo no necesita las 22
// piezas (ahorra disco y descarga). Remotion no monta los bloques fuera del rango renderizado.
function piezasDelTramo(plan, from, to) {
  const fps = plan.fps ?? 60;
  const s = new Set();
  let acc = 0;
  for (const b of plan.bloques ?? []) {
    const dur = bloqueDur(b, fps);
    const ini = acc, fin = acc + dur - 1;
    acc += dur;
    if (fin < from || ini > to) continue; // no intersecta el tramo
    if (b.video) s.add(b.video);
    for (const f of b.frags ?? []) { if (f.video) s.add(f.video); if (f.vo?.src) s.add(f.vo.src); }
    for (const br of b.broll ?? []) s.add(br);
  }
  return [...s];
}

async function listarKeys(prefijo) {
  const keys = new Set();
  let token;
  do {
    const r = await s3.send(new ListObjectsV2Command({ Bucket: E.R2_BUCKET, Prefix: prefijo, ContinuationToken: token }));
    for (const o of r.Contents ?? []) keys.add(o.Key);
    token = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (token);
  return keys;
}
async function descargar(key, destino, intentos = 3) {
  await mkdir(path.dirname(destino), { recursive: true });
  for (let i = 1; i <= intentos; i++) {
    try {
      const r = await s3.send(new GetObjectCommand({ Bucket: E.R2_BUCKET, Key: key }));
      await pipeline(r.Body, createWriteStream(destino));
      return;
    } catch (e) {
      if (i === intentos) throw e;
      await sleep(2000 * i);
    }
  }
}

async function main() {
  const plan = JSON.parse(await readFile(path.join(PUB, "render_plan.json"), "utf8"));
  const videos = piezasDelTramo(plan, FROM, TO);
  console.log(`[tramo ${IDX}] frames ${FROM}-${TO} — ${videos.length} piezas (de su rango) a bajar de R2`);

  const enR2 = await listarKeys(`${PREFIJO}/`);
  const faltan = videos.filter((v) => !enR2.has(`${PREFIJO}/${v}`));
  if (faltan.length) throw new Error(`Faltan ${faltan.length} piezas en R2: ${faltan.join(", ")}`);

  for (const [i, v] of videos.entries()) {
    const dst = path.join(CLIPS, v);
    if (existsSync(dst)) continue;
    console.log(`  [${i + 1}/${videos.length}] R2 -> ${v}`);
    await descargar(`${PREFIJO}/${v}`, dst);
  }

  const out = path.resolve("out", `seg_${IDX}.mp4`);
  await mkdir(path.dirname(out), { recursive: true });
  console.log(`[tramo ${IDX}] remotion render --frames=${FROM}-${TO} concurrency=${CONCURRENCY} crf=${CRF}`);
  await run("npx", ["remotion", "render", "Vlog", out,
    `--frames=${FROM}-${TO}`, `--concurrency=${CONCURRENCY}`,
    `--crf=${CRF}`,                          // calidad alta de salida (16 ~ visualmente sin pérdida en 4K)
    `--offthreadvideo-cache-size-in-bytes=${OFFTHREAD_CACHE}`]);

  const mb = (await stat(out)).size / 1e6;
  console.log(`[tramo ${IDX}] subiendo ${mb.toFixed(0)} MB -> ${OUT_KEY}`);
  await s3.send(new PutObjectCommand({ Bucket: E.R2_BUCKET, Key: OUT_KEY, Body: await readFile(out) }));
  console.log(`[tramo ${IDX}] LISTO ✓`);
}

main().catch((e) => { console.error(`tramo ${IDX} FALLÓ:`, e.message); process.exit(1); });
