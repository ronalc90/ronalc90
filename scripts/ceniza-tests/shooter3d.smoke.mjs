// Smoke de docs/ceniza/shooter3d.js (Ceniza3D) con three.min.js r160.
// Ejecutar desde la raíz del repo: node --test scripts/ceniza-tests/
// Sin jsdom: el repo no tiene node_modules, así que el DOM es mínimo y solo cubre lo que usa el script.
// Sin WebGL (getContext devuelve null): el render se omite y la simulación corre igual con step().
// Los archivos se cargan con vm.runInContext, como scripts clásicos del navegador.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ARCHIVO_THREE = path.join(RAIZ, "docs", "ceniza", "vendor", "three.min.js");
const ARCHIVO_JUEGO = path.join(RAIZ, "docs", "ceniza", "shooter3d.js");

// Elemento del DOM mínimo.
class ElementoFalso {
  constructor(tag) {
    this.tagName = tag;
    this.className = "";
    this.textContent = "";
    this.style = {};
    this.hijos = [];
    this.parentNode = null;
    this.oyentes = [];
    this.atributos = {};
    this.clientWidth = 800;
    this.clientHeight = 450;
  }
  appendChild(h) { h.parentNode = this; this.hijos.push(h); return h; }
  removeChild(h) { this.hijos = this.hijos.filter((x) => x !== h); h.parentNode = null; return h; }
  addEventListener(tipo, fn) { this.oyentes.push([tipo, fn]); }
  removeEventListener(tipo, fn) {
    this.oyentes = this.oyentes.filter(([t, f]) => !(t === tipo && f === fn));
  }
  setAttribute(k, v) { this.atributos[k] = String(v); }
  getContext() { return null; } // sin WebGL: el script debe seguir funcionando sin render
  requestPointerLock() {}
}

// Ventana y documento mínimos. La ventana guarda sus oyentes para simular teclas y clics.
function crearEntorno() {
  const ventana = {
    devicePixelRatio: 1,
    oyentes: [],
    addEventListener(tipo, fn) { this.oyentes.push([tipo, fn]); },
    removeEventListener(tipo, fn) {
      this.oyentes = this.oyentes.filter(([t, f]) => !(t === tipo && f === fn));
    },
    emitir(tipo, ev) {
      for (const [t, f] of this.oyentes.slice()) if (t === tipo) f(ev);
    },
  };
  const documento = {
    pointerLockElement: null,
    head: new ElementoFalso("head"),
    createElement: (tag) => new ElementoFalso(tag),
    addEventListener() {},
    removeEventListener() {},
    exitPointerLock() {},
  };
  return { ventana, documento };
}

// Carga three.min.js y shooter3d.js en un mismo contexto, como en el navegador.
function cargarJuego() {
  const { ventana, documento } = crearEntorno();
  const contexto = {
    window: ventana,
    document: documento,
    console: { log() {}, warn() {}, error: (...a) => console.error(...a) },
  };
  vm.createContext(contexto);
  vm.runInContext(fs.readFileSync(ARCHIVO_THREE, "utf8"), contexto, { filename: "three.min.js" });
  vm.runInContext(fs.readFileSync(ARCHIVO_JUEGO, "utf8"), contexto, { filename: "shooter3d.js" });
  return { contexto, ventana, documento };
}

const plano = (x) => JSON.parse(JSON.stringify(x));

// Busca dentro del DOM falso el primer elemento que cumpla el predicado.
function buscar(el, pred) {
  if (pred(el)) return el;
  for (const h of el.hijos || []) {
    const r = buscar(h, pred);
    if (r) return r;
  }
  return null;
}

function nuevoJuego(opciones = {}) {
  const { contexto, ventana, documento } = cargarJuego();
  const contenedor = new ElementoFalso("div");
  const juego = contexto.Ceniza3D.start({ contenedor, semilla: 7, ...opciones });
  return { juego, contenedor, ventana, documento, C: contexto.Ceniza3D, T: contexto.THREE };
}

const tecla = (ventana, code, tipo = "keydown") => ventana.emitir(tipo, { code, preventDefault() {} });

test("three.min.js es r160 y shooter3d.js define Ceniza3D.start como función", () => {
  const { contexto } = cargarJuego();
  assert.equal(contexto.THREE.REVISION, "160");
  assert.equal(typeof contexto.Ceniza3D.start, "function");
  assert.equal(contexto.Ceniza3D.version, "0.1.0");
});

test("datos del contrato: orden de sectores, minutos y armas 3D (docs/ceniza-diseno.md, 6.2)", () => {
  const { C } = nuevoJuego();
  assert.deepEqual(plano(C.ORDEN), ["S1", "S2", "S3", "COLOSO"]);
  assert.equal(plano(C.SECTORES).reduce((s, x) => s + x.minutos, 0), 48);
  assert.deepEqual(plano(C.SECTORES).map((s) => s.oleadas), [3, 3, 2, 0]);
  assert.equal(C.ARMAS.rifle.dano / C.ARMAS.rifle.cadencia, 90);
  assert.ok(Math.abs((C.ARMAS.escopeta.perdigones * C.ARMAS.escopeta.dano) / C.ARMAS.escopeta.cadencia - 88.9) < 0.1);
  assert.ok(Math.abs(C.ARMAS.plasma.dano / C.ARMAS.plasma.cadencia - 75) < 1e-9);
});

test("start sin contenedor o sin opciones lanza un error claro", () => {
  const { contexto } = cargarJuego();
  assert.throws(() => contexto.Ceniza3D.start({}), (err) => err.name === "TypeError");
  assert.throws(() => contexto.Ceniza3D.start(), (err) => err.name === "TypeError");
});

test("arranque en S1: pausado, con rifle, vida completa y sin WebGL", () => {
  const { juego } = nuevoJuego();
  const e = juego.estado();
  assert.equal(e.sector, "S1");
  assert.equal(e.pausado, true);
  assert.equal(e.webgl, false);
  assert.deepEqual(plano(e.armas), ["rifle"]);
  assert.equal(e.arma, "rifle");
  assert.deepEqual(plano(e.municion), { cargador: 30, reserva: 90 });
  assert.equal(e.vida, 100);
  assert.equal(e.enemigosVivos, 0);
  juego.destruir();
});

test("caminar hasta la primera puerta de S1 crea la oleada de 4 exploradores", () => {
  const { juego, ventana } = nuevoJuego();
  juego.reanudar();
  tecla(ventana, "KeyW");
  const e = juego.step(240);
  tecla(ventana, "KeyW", "keyup");
  assert.equal(e.enemigosVivos, 4);
  assert.match(e.objetivo, /^Elimina a los enemigos: 4$/);
  assert.equal(e.terminado, false);
  juego.destruir();
});

test("S2 crea su oleada con torreta (3 exploradores y 1 torreta)", () => {
  const { juego, ventana } = nuevoJuego({ sectorInicial: "S2" });
  juego.reanudar();
  tecla(ventana, "KeyW");
  const e = juego.step(240);
  tecla(ventana, "KeyW", "keyup");
  assert.equal(e.sector, "S2");
  assert.equal(e.enemigosVivos, 4);
  juego.destruir();
});

test("armas: al entrar en S2 hay rifle y escopeta; la 3 no se puede usar hasta S3", () => {
  const { juego, ventana } = nuevoJuego({ sectorInicial: "S2" });
  juego.reanudar();
  assert.deepEqual(plano(juego.estado().armas), ["rifle", "escopeta"]);
  tecla(ventana, "Digit3");
  assert.equal(juego.estado().arma, "escopeta");
  tecla(ventana, "Digit1");
  assert.equal(juego.estado().arma, "rifle");
  juego.destruir();
});

test("S3 entrega las tres armas", () => {
  const { juego } = nuevoJuego({ sectorInicial: "S3" });
  const e = juego.estado();
  assert.deepEqual(plano(e.armas), ["rifle", "escopeta", "plasma"]);
  assert.equal(e.arma, "plasma");
  juego.destruir();
});

test("sin disparar, los exploradores matan al viajero parado: una sola llamada a onCaida", () => {
  const llamadas = [];
  const { juego, ventana } = nuevoJuego({ onCaida: (r) => llamadas.push(r) });
  juego.reanudar();
  tecla(ventana, "KeyW");
  juego.step(240);
  tecla(ventana, "KeyW", "keyup");
  juego.step(60 * 60);
  const e = juego.estado();
  assert.equal(e.terminado, true);
  assert.equal(e.resultado, "caida");
  assert.equal(llamadas.length, 1);
  assert.equal(llamadas[0].resultado, "caida");
  assert.equal(llamadas[0].sector, "S1");
  const tiempo = e.tiempo;
  juego.step(600);
  assert.equal(juego.estado().tiempo, tiempo, "tras terminar, la simulación se detiene");
  assert.equal(llamadas.length, 1);
  juego.destruir();
});

test("pausa con Escape y con P; step ignora la pausa", () => {
  const { juego, ventana } = nuevoJuego();
  juego.reanudar();
  tecla(ventana, "Escape");
  assert.equal(juego.estado().pausado, true);
  const t0 = juego.estado().tiempo;
  juego.step(60);
  assert.ok(juego.estado().tiempo > t0, "step avanza aunque esté en pausa");
  tecla(ventana, "KeyP");
  assert.equal(juego.estado().pausado, false);
  juego.destruir();
});

test("el botón Salir del menú de pausa llama a onSalir con resultado salida", () => {
  const salidas = [];
  const { juego, contenedor } = nuevoJuego({ onSalir: (r) => salidas.push(r) });
  const boton = buscar(contenedor, (el) => el.className === "ceniza3d-boton ceniza3d-boton-2");
  assert.ok(boton, "existe el botón Salir");
  boton.oyentes.filter(([t]) => t === "click").forEach(([, f]) => f());
  assert.equal(salidas.length, 1);
  assert.equal(salidas[0].resultado, "salida");
  juego.destruir();
});

test("el Coloso final arranca en fase 1 y la simulación corre sin errores con el viajero blindado", () => {
  const { juego } = nuevoJuego({ sectorInicial: "COLOSO", bonos: { vida: 100000 } });
  let e = juego.estado();
  assert.equal(e.sector, "COLOSO");
  assert.equal(e.fase, 1);
  assert.equal(e.enemigosVivos, 1);
  e = juego.step(60 * 90);
  assert.equal(e.fase, 1);
  assert.equal(e.terminado, false);
  juego.destruir();
});

test("destruir no lanza excepciones y estado sigue respondiendo", () => {
  const { juego } = nuevoJuego();
  juego.destruir();
  juego.destruir();
  assert.equal(typeof juego.estado().vida, "number");
});
