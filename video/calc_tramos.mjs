// video/calc_tramos.mjs — calcula los tramos (frameRanges) para la matrix de GitHub Actions.
// Imprime `matrix=[{idx,from,to},...]` a GITHUB_OUTPUT. SEGMENT ajusta el tamaño del tramo.
// bloqueDur() es réplica EXACTA de src/Vlog.tsx; si cambia una, cambia la otra.
import { readFile } from "node:fs/promises";
import { appendFile } from "node:fs/promises";

const SEGMENT = Number(process.env.SEGMENT) || 2500; // vacío/0/NaN -> 2500 (margen de disco/caché en /mnt)

function bloqueDur(b, fps) {
  if (b.tipo === "habla" || b.tipo === "trading") return Math.max(1, Math.round((b.dur ?? 1) * fps));
  if (b.tipo === "title_card") return Math.round(2.5 * fps);
  if (b.tipo === "cold_open")
    return (b.frags ?? []).reduce((s, fr) => s + Math.round(fr.dur * fps), 0) || Math.round(6 * fps);
  if (b.tipo === "outro") return Math.round(8 * fps);
  return fps;
}

// Modo rescate: RANGOS llega en BASE64 (un JSON con comillas rompería el YAML del workflow al
// reinyectarse en env). Decodifica y úsalo tal cual: re-renderiza tramos que fallaron, partidos
// más chicos, sin recalcular todo ni desperdiciar los tramos buenos.
if (process.env.RANGOS && process.env.RANGOS.trim()) {
  const matrix = Buffer.from(process.env.RANGOS.trim(), "base64").toString("utf8");
  JSON.parse(matrix); // valida que sea JSON; lanza si la decodificación salió mal
  console.error(`RANGOS (rescate): ${matrix}`);
  console.log(matrix);
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `matrix=${matrix}\n`);
} else {

const plan = JSON.parse(await readFile("public/render_plan.json", "utf8"));
const fps = plan.fps ?? 60;
const total = Math.max(fps, (plan.bloques ?? []).reduce((s, b) => s + bloqueDur(b, fps), 0));

const tramos = [];
for (let from = 0, i = 0; from < total; from += SEGMENT, i++) {
  const to = Math.min(from + SEGMENT - 1, total - 1);
  tramos.push({ idx: String(i).padStart(2, "0"), from, to });
}

const matrix = JSON.stringify(tramos);
console.error(`total ${total} frames @${fps}fps -> ${tramos.length} tramos de ${SEGMENT} (último ${tramos.at(-1).from}-${tramos.at(-1).to})`);
console.log(matrix);
if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `matrix=${matrix}\n`);
}
