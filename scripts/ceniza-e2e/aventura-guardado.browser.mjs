// Prueba de navegador de la persistencia de la aventura de docs/index.html: avGuardar, avLeer, avBorrarGuardado y
// avPartidaInicial, con la clave de localStorage ceniza.aventura.v1. No entra en node --test: necesita Chromium.
// Ejecutar desde la raíz del repo: node scripts/ceniza-e2e/aventura-guardado.browser.mjs
// Sirve docs/ en local (127.0.0.1, puerto libre), carga los módulos 2D de la aventura y ejecuta en la página el bloque
// de guardado de docs/index.html (leído de ese archivo, no copiado). Un contexto nuevo de Playwright empieza con
// localStorage vacío, así que no quedan restos de otra ejecución.
// Sale con código 0 si todo pasa; si no, con código 1 y un mensaje por cada comprobación fallida.
// Requisitos: Playwright (require("playwright") desde cualquier directorio) y Chromium.
// Ruta de Chromium: variable CENIZA_CHROMIUM (opcional), después la de Playwright y /opt/pw-browsers/chromium.

import { createRequire } from "node:module";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DOCS = path.join(RAIZ, "docs");
const ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"];
// Módulos 2D de la aventura, en el orden de AV_2D de docs/index.html.
const AV_2D = ["ceniza/datos.js", "ceniza/mundo.js", "ceniza/personaje-ui.js", "ceniza/aventura-nucleo.js", "ceniza/aventura-ui.js"];
const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
};

const resultados = [];
function registrar(ok, texto) {
  resultados.push({ ok, texto });
  console.log((ok ? "OK    " : "FALLO ") + texto);
}

// Sirve la carpeta docs/ por HTTP local. Solo entrega archivos que estén dentro de esa carpeta.
function servir(raiz) {
  return new Promise((resolver) => {
    const servidor = http.createServer((req, res) => {
      const ruta = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname);
      const archivo = path.join(raiz, ruta === "/" ? "index.html" : ruta);
      if (!archivo.startsWith(raiz + path.sep) || !fs.existsSync(archivo) || fs.statSync(archivo).isDirectory()) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, { "content-type": TIPOS[path.extname(archivo)] || "application/octet-stream" });
      fs.createReadStream(archivo).pipe(res);
    });
    servidor.listen(0, "127.0.0.1", () => resolver(servidor));
  });
}

async function lanzarNavegador(chromium) {
  const candidatos = [{ nombre: "Playwright", opciones: {} }];
  if (process.env.CENIZA_CHROMIUM) candidatos.push({ nombre: "CENIZA_CHROMIUM", opciones: { executablePath: process.env.CENIZA_CHROMIUM } });
  if (fs.existsSync("/opt/pw-browsers/chromium")) candidatos.push({ nombre: "/opt/pw-browsers/chromium", opciones: { executablePath: "/opt/pw-browsers/chromium" } });
  const errores = [];
  for (const c of candidatos) {
    try {
      return await chromium.launch({ headless: true, args: ARGS, ...c.opciones });
    } catch (err) {
      errores.push(c.nombre + ": " + String(err.message).split("\n")[0]);
    }
  }
  throw new Error("No se pudo abrir Chromium (" + errores.join(" | ") + ")");
}

async function main() {
  let chromium;
  try {
    ({ chromium } = require("playwright"));
  } catch (err) {
    throw new Error("No se encuentra Playwright (require(\"playwright\")): " + err.message);
  }
  const servidor = await servir(DOCS);
  const origen = "http://127.0.0.1:" + servidor.address().port;
  const navegador = await lanzarNavegador(chromium);
  const errores = [];
  try {
    const contexto = await navegador.newContext();
    const pagina = await contexto.newPage();
    pagina.on("pageerror", (e) => errores.push("error de página: " + e.message));
    // Sin red externa: la página pide fuentes de Google, que aquí no hacen falta.
    await pagina.route((url) => url.origin !== origen, (ruta) => ruta.abort());
    await pagina.goto(origen + "/index.html");

    // El juego entero vive en un bloque privado (IIFE) de docs/index.html, así que sus funciones de guardado no son
    // globales. Se toma el bloque de código tal cual del propio index.html (de AV_CLAVE al arranque de Ceniza3D),
    // se inyecta en la página junto con los módulos 2D, en el mismo orden que cargarAventura2D, y se ejecuta allí.
    // DEMO es false: es la página sin ?demo, que es el caso que se prueba.
    const html = fs.readFileSync(path.join(DOCS, "index.html"), "utf8");
    const inicio = html.indexOf("const AV_CLAVE = 'ceniza.aventura.v1';");
    const fin = html.indexOf("// Ceniza3D.start se llama de forma síncrona");
    if (inicio < 0 || fin < inicio) throw new Error("no encuentro el bloque de guardado en docs/index.html");
    for (const rel of AV_2D) await pagina.addScriptTag({ url: origen + "/" + rel });
    await pagina.addScriptTag({ content: "const DEMO = false;\n" + html.slice(inicio, fin) });
    const cargada = await pagina.evaluate(() => typeof avGuardar === "function" && !!globalThis.CenizaAventuraNucleo);
    registrar(cargada, "aventura: el bloque de guardado de docs/index.html y los módulos 2D cargan en la página");
    if (!cargada) throw new Error("no se pudo cargar el bloque de guardado; no hay nada que comprobar");

    // 1) avGuardar escribe en ceniza.aventura.v1 y avLeer devuelve la misma partida.
    const ida = await pagina.evaluate(() => {
      localStorage.removeItem(AV_CLAVE);
      const N = globalThis.CenizaAventuraNucleo;
      const p = N.crearPartida({ personaje: globalThis.CenizaDatos.personajePorDefecto(), semilla: 1234 });
      avGuardar(p);
      const texto = localStorage.getItem(AV_CLAVE);
      const leida = avLeer();
      return {
        clave: AV_CLAVE,
        escribeLoQueSerializa: texto === N.serializar(p),
        semilla: leida ? leida.semilla : null,
        idaYVuelta: leida !== null && N.serializar(leida) === texto,
      };
    });
    registrar(ida.clave === "ceniza.aventura.v1", "la clave de la aventura es ceniza.aventura.v1");
    registrar(ida.escribeLoQueSerializa, "avGuardar escribe en localStorage lo que devuelve serializar");
    registrar(ida.idaYVuelta && ida.semilla === 1234, "avLeer devuelve la partida guardada (semilla " + ida.semilla + ")");

    // 2) avBorrarGuardado borra la partida y no toca otras claves.
    const borrado = await pagina.evaluate(() => {
      localStorage.setItem("ceniza.prueba-otra-clave", "conservada");
      avBorrarGuardado();
      return {
        borrada: localStorage.getItem(AV_CLAVE) === null,
        leida: avLeer(),
        otra: localStorage.getItem("ceniza.prueba-otra-clave"),
      };
    });
    registrar(borrado.borrada && borrado.leida === null, "avBorrarGuardado quita ceniza.aventura.v1 y avLeer devuelve null");
    registrar(borrado.otra === "conservada", "avBorrarGuardado no toca otras claves de localStorage");

    // 3) Un guardado corrupto, vacío o sin versión no se usa: avLeer devuelve null y no lanza.
    const invalidos = await pagina.evaluate(() => {
      const salida = {};
      for (const [nombre, texto] of [["corrupto", "{no es json"], ["vacío", ""], ["sin versión", '{"partida":{}}']]) {
        localStorage.setItem(AV_CLAVE, texto);
        try {
          salida[nombre] = avLeer();
        } catch (e) {
          salida[nombre] = "lanzó: " + e.message;
        }
      }
      localStorage.removeItem(AV_CLAVE);
      return salida;
    });
    for (const nombre of ["corrupto", "vacío", "sin versión"]) {
      registrar(invalidos[nombre] === null, "un guardado " + nombre + " se ignora y avLeer devuelve null (" + String(invalidos[nombre]) + ")");
    }

    // 4) Una partida ganada no se reanuda: avPartidaInicial empieza otra con el mismo personaje.
    //    Una partida en curso guardada sí se reanuda (misma semilla).
    const reanudar = await pagina.evaluate(() => {
      const N = globalThis.CenizaAventuraNucleo;
      const M = globalThis.CenizaMundo;
      const personaje = globalThis.CenizaDatos.personajePorDefecto();
      // Una partida en "victoria" solo es válida con el jefe X vencido (aventura-nucleo, validación de la partida).
      const jefeX = Object.keys(M.TIPOS_ENEMIGO).find((id) => M.TIPOS_ENEMIGO[id].jefeX === true);
      const ganada = N.crearPartida({ personaje, semilla: 555 });
      ganada.jefesVencidos = [jefeX];
      ganada.faseActual = "victoria";
      const valida = N.deserializar(N.serializar(ganada)).ok;
      avGuardar(ganada);
      const inicial = avPartidaInicial();
      const enCurso = N.crearPartida({ personaje, semilla: 777 });
      avGuardar(enCurso);
      const reanudada = avPartidaInicial();
      localStorage.removeItem(AV_CLAVE);
      return {
        valida,
        faseTrasGanar: inicial.faseActual,
        mismoPersonaje: JSON.stringify(inicial.personaje) === JSON.stringify(ganada.personaje),
        semillaTrasGanar: inicial.semilla,
        semillaEnCurso: reanudada.semilla,
      };
    });
    registrar(reanudar.valida, "la partida ganada de la prueba es un guardado válido (jefe X vencido)");
    registrar(reanudar.faseTrasGanar !== "victoria", "una partida ganada no se reanuda (fase al abrir: " + reanudar.faseTrasGanar + ")");
    registrar(reanudar.mismoPersonaje, "tras ganar, la partida nueva conserva el personaje");
    registrar(reanudar.semillaTrasGanar !== 555, "tras ganar, la partida nueva es otra (semilla distinta de la ganada)");
    registrar(reanudar.semillaEnCurso === 777, "una partida en curso guardada se reanuda con su semilla (" + reanudar.semillaEnCurso + ")");

    for (const e of errores) registrar(false, "Error en la página: " + e);
    await contexto.close();
  } finally {
    await navegador.close();
    servidor.close();
  }
  const fallos = resultados.filter((r) => !r.ok).length;
  console.log("Resultado: " + (resultados.length - fallos) + " de " + resultados.length + " comprobaciones correctas");
  if (fallos > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error("FALLO general: " + (err && err.message ? err.message : err));
  process.exitCode = 1;
});
