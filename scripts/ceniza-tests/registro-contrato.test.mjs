// Contrato de registro de CENIZA: el enlace que escribe docs/index.html (regUrl de la arena y
// avUrlRegistro de la aventura) debe ser aceptado por scripts/games.mjs en modo --dry.
// No copia las funciones: las extrae del código real de docs/index.html y las ejecuta.
// Los valores de S (estado de la arena) son un fixture con las mismas rutas de campo que usa regUrl.
// Ejecutar: node --test scripts/ceniza-tests/registro-contrato.test.mjs

import { after, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const GAMES = path.join(RAIZ, "scripts", "games.mjs");
const INDEX = path.join(RAIZ, "docs", "index.html");
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "registro-contrato-"));
after(() => fs.rmSync(DIR, { recursive: true, force: true }));

const REPO_ISSUES = "https://github.com/ronalc90/ronalc90/issues/new";
const ARMAS_2D = ["hoja", "arco", "martillo", "lanza"];
const ARMAS_3D = ["rifle", "escopeta", "plasma"];
const CAMPOS = ["arma", "jefes", "nivel", "victoria", "puntos", "segundos"];

// Extrae una función de nivel superior de docs/index.html: desde su cabecera hasta el "}" de columna 0 que la cierra.
function extraerFuncion(html, nombre) {
  const inicio = html.indexOf(`function ${nombre}(`);
  assert.notEqual(inicio, -1, `no encuentro function ${nombre} en docs/index.html`);
  const fin = html.indexOf("\n}\n", inicio);
  assert.notEqual(fin, -1, `no encuentro el cierre de ${nombre} en docs/index.html`);
  return html.slice(inicio, fin + 3);
}

// Emisores reales. regUrl necesita S (la arena); avUrlRegistro no usa nada externo.
const html = fs.readFileSync(INDEX, "utf8");
const fabrica = new Function(
  "S",
  `${extraerFuncion(html, "regUrl")}\n${extraerFuncion(html, "avUrlRegistro")}\nreturn { regUrl, avUrlRegistro };`
);

// Separa el enlace de nuevo IssueForm: título y cuerpo tal como los vería GitHub.
function enlace(url) {
  const u = new URL(url);
  assert.equal(u.origin + u.pathname, REPO_ISSUES, "el enlace debe abrir un issue nuevo del repo del perfil");
  const title = u.searchParams.get("title");
  const body = u.searchParams.get("body");
  assert.ok(title !== null && body !== null, "el enlace debe llevar title y body");
  return { title, body };
}

// Lee la línea ceniza-stats del cuerpo: debe ser una sola línea con el prefijo exacto.
function statsDelCuerpo(body) {
  assert.match(body, /^ceniza-stats: \{[^\n]*\}$/, "el cuerpo debe ser una sola línea ceniza-stats");
  return JSON.parse(body.slice("ceniza-stats: ".length));
}

// Ejecuta games.mjs --dry con los issues dados y devuelve la respuesta de cada uno y el registro de CENIZA.
function ejecutar(issues) {
  const archivo = path.join(DIR, `lote-${process.hrtime.bigint()}.json`);
  fs.writeFileSync(archivo, JSON.stringify(issues));
  const salida = execFileSync(process.execPath, [GAMES, "--dry", archivo], { encoding: "utf8" });
  const respuestas = new Map();
  for (const linea of salida.split("\n")) {
    const m = /^\[dry\] #(\d+) -> (.*)$/.exec(linea);
    if (m) respuestas.set(Number(m[1]), m[2]);
  }
  const linea = salida.split("\n").find((l) => l.startsWith("[dry] ceniza:"));
  assert.ok(linea, "debe haber resumen de CENIZA");
  return { respuestas, ceniza: JSON.parse(linea.slice("[dry] ceniza:".length)) };
}

// Comprueba que games.mjs ha aceptado el caso y lo ha guardado con los mismos datos que emitió la página.
function comprobarAceptado(caso, respuesta, ceniza) {
  const quien = `${caso.origen} arma ${caso.stats.arma}`;
  assert.doesNotMatch(respuesta ?? "", /no pude leer/, `${quien}: games.mjs rechaza el enlace (${respuesta})`);
  const jugador = ceniza.players[caso.login];
  assert.ok(jugador, `${quien}: la partida debe quedar en el registro`);
  assert.equal(jugador.runs, 1, `${quien}: una partida registrada`);
  assert.equal(jugador.bestLevel, caso.stats.nivel, `${quien}: nivel guardado`);
  if (caso.stats.victoria) {
    assert.equal(jugador.wins, 1, `${quien}: una victoria registrada`);
    const guardada = ceniza.wins.find((w) => w.user === caso.login);
    assert.ok(guardada, `${quien}: la victoria debe estar en el ranking`);
    assert.deepEqual(Object.fromEntries(CAMPOS.map((k) => [k, guardada[k]])), caso.stats, `${quien}: campos guardados`);
  } else {
    assert.equal(jugador.wins, 0, `${quien}: una caída no suma victoria`);
  }
}

test("registro: el enlace de la arena (regUrl) lo acepta games.mjs con las armas 2D", () => {
  const casos = ARMAS_2D.map((arma, i) => {
    const S = { weapon: arma, stats: { bosses: i }, boss: { lvl: i + 2 }, victory: false, final: 880 + i, t: 415.7 + i };
    const url = fabrica(S).regUrl();
    const { title, body } = enlace(url);
    // La arena no tiene victoria (docs/ceniza-diseno.md, 12): su título es siempre de caída.
    assert.equal(title, "ceniza: caída");
    const stats = { arma, jefes: i, nivel: i + 2, victoria: false, puntos: 880 + i, segundos: Math.floor(415.7 + i) };
    assert.deepEqual(statsDelCuerpo(body), stats, `arena ${arma}: el cuerpo no coincide con el estado de la partida`);
    return { origen: "arena", login: `contrato-arena-${i}`, stats, title, body };
  });
  const lote = casos.map((c, i) => ({
    number: i + 1, title: c.title, body: c.body,
    user: { login: c.login, avatar_url: `https://example.invalid/${c.login}.png` },
  }));
  const { respuestas, ceniza } = ejecutar(lote);
  casos.forEach((c, i) => comprobarAceptado(c, respuestas.get(i + 1), ceniza));
});

test("registro: el enlace de la aventura (avUrlRegistro) lo acepta games.mjs con armas 2D y 3D, victoria y caída", () => {
  const entradas = [
    ...ARMAS_2D.map((arma) => ({ arma, victoria: true })),
    ...ARMAS_3D.map((arma) => ({ arma, victoria: true })),
    { arma: "hoja", victoria: false },
    { arma: "plasma", victoria: false },
  ];
  const casos = entradas.map((e, i) => {
    const stats = { arma: e.arma, jefes: 5, nivel: 4, victoria: e.victoria, puntos: 1234 + i, segundos: 610 + i };
    const url = fabrica(null).avUrlRegistro(stats);
    const { title, body } = enlace(url);
    assert.equal(title, e.victoria ? "ceniza: victoria" : "ceniza: caída", `aventura ${e.arma}: título según victoria`);
    assert.deepEqual(statsDelCuerpo(body), stats, `aventura ${e.arma}: el cuerpo no coincide con las estadísticas`);
    return { origen: "aventura", login: `contrato-aventura-${i}`, stats, title, body };
  });
  const lote = casos.map((c, i) => ({
    number: i + 1, title: c.title, body: c.body,
    user: { login: c.login, avatar_url: `https://example.invalid/${c.login}.png` },
  }));
  const { respuestas, ceniza } = ejecutar(lote);
  casos.forEach((c, i) => comprobarAceptado(c, respuestas.get(i + 1), ceniza));
});
