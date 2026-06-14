// video/concatenar_tramos.mjs — une los tramos parciales en el MP4 4K final (job concat de Actions).
// Baja render/tramos/seg_*.mp4 de R2 -> ffmpeg concat -> sube render/VLOG_CHINA_FINAL_4K.mp4 a R2.
// Clave: el VIDEO se copia sin recodificar (-c:v copy → 4K intacto, rápido); solo el AUDIO se
// re-codifica (-c:a aac), lo que elimina los micro-cortes de priming en las uniones de tramos.
// Env: R2_* (cuenta/llaves/bucket), OUT_KEY (render/VLOG_CHINA_FINAL_4K.mp4).
import {
  S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import path from "node:path";

const E = process.env;
const OUT_KEY = E.OUT_KEY ?? "render/VLOG_CHINA_FINAL_4K.mp4";
const PREFIJO_TRAMOS = "render/tramos/";

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${E.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: E.R2_ACCESS_KEY_ID, secretAccessKey: E.R2_SECRET_ACCESS_KEY },
});

function run(cmd, args) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, args, { stdio: "inherit" });
    p.on("error", rej);
    p.on("close", (c) => (c === 0 ? res() : rej(new Error(`${cmd} salió con código ${c}`))));
  });
}

async function listarTramos() {
  const keys = [];
  let token;
  do {
    const r = await s3.send(new ListObjectsV2Command({ Bucket: E.R2_BUCKET, Prefix: PREFIJO_TRAMOS, ContinuationToken: token }));
    for (const o of r.Contents ?? []) if (o.Key.endsWith(".mp4")) keys.push(o.Key);
    token = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (token);
  return keys.sort(); // seg_00, seg_01, ... en orden
}
async function descargar(key, destino) {
  await mkdir(path.dirname(destino), { recursive: true });
  const r = await s3.send(new GetObjectCommand({ Bucket: E.R2_BUCKET, Key: key }));
  await pipeline(r.Body, createWriteStream(destino));
}

async function main() {
  const dir = path.resolve("out", "tramos");
  await mkdir(dir, { recursive: true });
  const keys = await listarTramos();
  if (!keys.length) throw new Error(`No hay tramos en R2 bajo ${PREFIJO_TRAMOS}`);
  console.log(`[concat] ${keys.length} tramos a unir:`);

  const locales = [];
  for (const k of keys) {
    const dst = path.join(dir, path.basename(k));
    console.log(`  R2 -> ${path.basename(k)}`);
    await descargar(k, dst);
    locales.push(dst);
  }

  const lista = path.join(dir, "lista.txt");
  await writeFile(lista, locales.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n") + "\n");

  const out = path.resolve("out", "VLOG_CHINA_FINAL_4K.mp4");
  console.log(`[concat] ffmpeg: video copy (4K intacto) + audio aac -> ${path.basename(out)}`);
  await run("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", lista,
    "-c:v", "copy", "-c:a", "aac", "-b:a", "320k", "-movflags", "+faststart", out]);

  const mb = (await stat(out)).size / 1e6;
  console.log(`[concat] subiendo ${mb.toFixed(0)} MB -> ${OUT_KEY}`);
  await s3.send(new PutObjectCommand({ Bucket: E.R2_BUCKET, Key: OUT_KEY, Body: await readFile(out) }));

  // Borrar los tramos parciales: ya no sirven y liberan espacio (regla de los 10 GB de R2).
  await s3.send(new DeleteObjectsCommand({ Bucket: E.R2_BUCKET, Delete: { Objects: keys.map((k) => ({ Key: k })) } }));
  console.log(`[concat] tramos borrados (${keys.length}). ✅ MP4 4K final en R2: ${OUT_KEY}`);
}

main().catch((e) => { console.error("concat FALLÓ:", e.message); process.exit(1); });
