// Pruebas del registro de partidas de scripts/games.mjs (raid y CENIZA).
// Cada caso escribe un JSON con issues de prueba y ejecuta el script real con --dry.
// El modo en seco no llama a GitHub, no escribe games/state.json ni los SVG: solo imprime
// la primera línea de la respuesta de cada issue y un resumen del estado.
// Ejecutar: node --test scripts/games.test.mjs

import { after, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const GAMES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "games.mjs");
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "games-test-"));
after(() => fs.rmSync(DIR, { recursive: true, force: true }));

let seq = 0;
// Un issue por jugador: así no se aplica el enfriamiento entre casos.
function issue(title, body = "") {
  seq += 1;
  const login = `prueba-${seq}`;
  return { number: seq, title, body, user: { login, avatar_url: `https://example.invalid/${login}.png` } };
}

const statsBody = (stats) => `ceniza-stats: ${JSON.stringify(stats)}`;
const statsCeniza = (arma, victoria = true) => ({ arma, jefes: 5, nivel: 3, victoria, puntos: 1200, segundos: 600 });

// Ejecuta games.mjs --dry con los issues dados. Devuelve el mapa issue -> respuesta y la salida completa.
function ejecutar(issues) {
  const archivo = path.join(DIR, `issues-${seq}-${process.hrtime.bigint()}.json`);
  fs.writeFileSync(archivo, JSON.stringify(issues));
  const salida = execFileSync(process.execPath, [GAMES, "--dry", archivo], { encoding: "utf8" });
  const respuestas = new Map();
  for (const linea of salida.split("\n")) {
    const m = /^\[dry\] #(\d+) -> (.*)$/.exec(linea);
    if (m) respuestas.set(Number(m[1]), m[2]);
  }
  return { respuestas, salida };
}

// Lee la línea de resumen "[dry] ceniza:" (solo aparece si el lote cambió algo).
function resumenCeniza(salida) {
  const linea = salida.split("\n").find((l) => l.startsWith("[dry] ceniza:"));
  return linea ? JSON.parse(linea.slice("[dry] ceniza:".length)) : null;
}

// ----------------------------------------------------------------------------- raid: nombres de arma
test("raid: 'constructor' y otras claves heredadas de Object se rechazan y no tocan la vida del coloso", () => {
  const malos = [issue("raid: constructor"), issue("raid: toString"), issue("raid: __proto__")];
  const { respuestas, salida } = ejecutar(malos);
  // "constructor" y "toString" llegan a la comprobación de arma: deben rechazarse con su nombre.
  assert.match(respuestas.get(malos[0].number) ?? "", /no conozco el arma \*\*constructor\*\*/);
  assert.match(respuestas.get(malos[1].number) ?? "", /no conozco el arma \*\*tostring\*\*/);
  // "__proto__" no pasa el patrón del título: no hay respuesta, pero tampoco cambio alguno.
  assert.equal(respuestas.has(malos[2].number), false);
  // Ningún lote con solo rechazos debe cambiar el raid: sin resumen y sin NaN en la salida.
  assert.match(salida, /Sin jugadas nuevas/);
  assert.doesNotMatch(salida, /NaN/);
  assert.doesNotMatch(salida, /undefined/);
});

test("raid: una clave heredada no envenena las jugadas válidas del mismo lote", () => {
  const lote = [issue("raid: constructor"), issue("raid: espada")];
  const { respuestas, salida } = ejecutar(lote);
  assert.match(respuestas.get(lote[0].number) ?? "", /no conozco el arma \*\*constructor\*\*/);
  assert.match(respuestas.get(lote[1].number) ?? "", /−\d+ HP/);
  assert.doesNotMatch(salida, /NaN/);
  const raid = salida.split("\n").find((l) => l.startsWith("[dry] raid:"));
  assert.ok(raid, "debe haber resumen del raid");
  assert.equal(Number.isFinite(JSON.parse(raid.slice("[dry] raid:".length)).hp), true);
});

test("raid: las armas reales (espada, arco, bomba) siguen funcionando", () => {
  const lote = [issue("raid: espada"), issue("raid: arco"), issue("raid: bomba")];
  const { respuestas } = ejecutar(lote);
  assert.match(respuestas.get(lote[0].number) ?? "", /−\d+ HP/);
  assert.match(respuestas.get(lote[1].number) ?? "", /−\d+ HP|0 de daño/);
  assert.match(respuestas.get(lote[2].number) ?? "", /−\d+ HP|0 de daño/);
});

// ----------------------------------------------------------------------------- CENIZA: armas admitidas
test("ceniza: victoria acepta las armas de la fase 3D (rifle, escopeta, plasma) y las de la 2D", () => {
  const armas = ["rifle", "escopeta", "plasma", "hoja", "arco", "martillo", "lanza"];
  const lote = armas.map((arma) => issue("ceniza: victoria", statsBody(statsCeniza(arma))));
  const { respuestas, salida } = ejecutar(lote);
  armas.forEach((arma, i) => {
    assert.match(respuestas.get(lote[i].number) ?? "", new RegExp(`Victoria registrada con \\*\\*${arma}\\*\\*`), `arma ${arma}`);
  });
  // El resumen guarda cada victoria con su arma.
  const ceniza = resumenCeniza(salida);
  assert.ok(ceniza, "debe haber resumen de CENIZA");
  const guardadas = ceniza.wins.map((w) => w.arma).sort();
  assert.deepEqual(guardadas, [...armas].sort());
});

test("ceniza: caida acepta las armas de la fase 3D", () => {
  const lote = [issue("ceniza: caida", statsBody(statsCeniza("plasma", false)))];
  const { respuestas } = ejecutar(lote);
  assert.match(respuestas.get(lote[0].number) ?? "", /registramos tu caída en CENIZA con \*\*plasma\*\*/);
});

test("ceniza: rechaza armas que no son de CENIZA, incluidas claves heredadas de Object", () => {
  const malas = ["constructor", "pistola", "__proto__"];
  const lote = malas.map((arma) => issue("ceniza: victoria", statsBody(statsCeniza(arma))));
  const { respuestas, salida } = ejecutar(lote);
  for (const i of [0, 1]) {
    assert.match(respuestas.get(lote[i].number) ?? "", /arma no válida \(hoja, arco, martillo, lanza, rifle, escopeta o plasma\)/);
  }
  // "__proto__" es un JSON válido con arma no admitida: también debe rechazarse.
  assert.match(respuestas.get(lote[2].number) ?? "", /arma no válida/);
  assert.doesNotMatch(salida, /\[dry\] ceniza:/, "un rechazo no debe cambiar el registro de CENIZA");
});
