// Render del Reel (proxy 1080x1920 completo para auditoría/preview): baja assets de R2,
// `remotion render Reel`, sube el MP4. Env: R2_*.
import { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { createWriteStream } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { execSync } from "node:child_process";
import { dirname } from "node:path";

const E = process.env;
const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${E.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: E.R2_ACCESS_KEY_ID, secretAccessKey: E.R2_SECRET_ACCESS_KEY },
});

async function listar(prefijo) {
  const keys = [];
  let token;
  do {
    const r = await s3.send(new ListObjectsV2Command({ Bucket: E.R2_BUCKET, Prefix: prefijo, ContinuationToken: token }));
    for (const o of r.Contents ?? []) keys.push(o.Key);
    token = r.NextContinuationToken;
  } while (token);
  return keys;
}

async function bajar(key, destino) {
  await mkdir(dirname(destino), { recursive: true });
  const r = await s3.send(new GetObjectCommand({ Bucket: E.R2_BUCKET, Key: key }));
  await pipeline(r.Body, createWriteStream(destino));
}

const keys = (await listar("reel/")).filter((k) => !k.startsWith("reel/out/"));
console.log(`bajando ${keys.length} assets de R2...`);
for (const k of keys) await bajar(k, `public/${k.slice(5)}`);
await mkdir("out", { recursive: true });

execSync(
  "npx remotion render Reel out/reel_proxy.mp4 --codec=h264 --crf=20 --concurrency=2 --log=info",
  { stdio: "inherit" },
);

const body = await readFile("out/reel_proxy.mp4");
await s3.send(new PutObjectCommand({
  Bucket: E.R2_BUCKET, Key: "reel/out/reel_proxy.mp4", Body: body, ContentType: "video/mp4",
}));
console.log(`Subido reel/out/reel_proxy.mp4 (${(body.length / 1e6).toFixed(1)} MB)`);
