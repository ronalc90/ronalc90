// Smoke de docs/ceniza/aventura-ui.js (CenizaAventuraUI).
// Ejecutar desde la raíz del repo: node --test scripts/ceniza-tests/aventura-ui.smoke.mjs
// Sin jsdom: el repo no tiene node_modules, así que el DOM es mínimo y solo cubre lo que usa la interfaz.
// Los scripts se cargan con vm.runInContext en un mismo contexto, como scripts clásicos del navegador:
// datos.js, mundo.js, personaje-ui.js, aventura-nucleo.js y aventura-ui.js.
// El contexto no tiene requestAnimationFrame, así que no hay bucle de pantalla: el tiempo lo avanza avanzar().

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const leer = (rel) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

const SIN_PRUEBA = "http://localhost/aventura";
const CON_PRUEBA = "http://localhost/aventura?prueba=1";

// Contexto de dibujo que acepta cualquier llamada y cualquier asignación. La interfaz no lee propiedades del contexto.
function contextoDeDibujo() {
  const estado = {};
  return new Proxy(estado, {
    get(objetivo, clave) {
      if (clave in objetivo) return objetivo[clave];
      if (typeof clave === "symbol") return undefined;
      return () => {};
    },
    set(objetivo, clave, valor) {
      objetivo[clave] = valor;
      return true;
    },
  });
}

// Elemento del DOM mínimo: hijos, atributos, texto, estilo, oyentes y canvas de prueba.
class Elemento {
  constructor(tag, doc) {
    this.tagName = tag.toUpperCase();
    this.ownerDocument = doc;
    this.hijos = [];
    this.parentNode = null;
    this.atributos = {};
    this.oyentes = {};
    this.style = {};
    this.textoPropio = "";
    this.contexto = null;
    if (this.tagName === "CANVAS") {
      this.width = 300;
      this.height = 150;
    }
  }
  get firstChild() {
    return this.hijos[0] || null;
  }
  get textContent() {
    return this.textoPropio + this.hijos.map((h) => h.textContent).join("");
  }
  set textContent(t) {
    for (const h of this.hijos) h.parentNode = null;
    this.hijos = [];
    this.textoPropio = String(t);
  }
  appendChild(h) {
    if (h.parentNode) h.parentNode.removeChild(h);
    h.parentNode = this;
    this.hijos.push(h);
    return h;
  }
  removeChild(h) {
    if (!this.hijos.includes(h)) throw new Error("El nodo no es hijo de este elemento");
    this.hijos = this.hijos.filter((x) => x !== h);
    h.parentNode = null;
    return h;
  }
  setAttribute(k, v) {
    this.atributos[k] = String(v);
  }
  getAttribute(k) {
    return Object.prototype.hasOwnProperty.call(this.atributos, k) ? this.atributos[k] : null;
  }
  addEventListener(tipo, fn) {
    (this.oyentes[tipo] = this.oyentes[tipo] || []).push(fn);
  }
  removeEventListener(tipo, fn) {
    this.oyentes[tipo] = (this.oyentes[tipo] || []).filter((f) => f !== fn);
  }
  focus() {
    this.ownerDocument.activeElement = this;
  }
  getContext(tipo) {
    if (tipo !== "2d") return null;
    if (!this.contexto) this.contexto = contextoDeDibujo();
    return this.contexto;
  }
}

class Documento {
  constructor() {
    this.activeElement = null;
  }
  createElement(tag) {
    return new Elemento(tag, this);
  }
  addEventListener() {}
  removeEventListener() {}
}

// Crea un contexto de navegador con los scripts de la aventura cargados en orden.
function cargar(url) {
  const contexto = vm.createContext({ location: { href: url } });
  for (const rel of [
    "docs/ceniza/datos.js",
    "docs/ceniza/mundo.js",
    "docs/ceniza/personaje-ui.js",
    "docs/ceniza/aventura-nucleo.js",
    "docs/ceniza/aventura-ui.js",
  ]) {
    vm.runInContext(leer(rel), contexto, { filename: rel });
  }
  return contexto;
}

// Monta la aventura con una partida nueva y registra cada llamada de retorno.
function montarEn(contexto) {
  const doc = new Documento();
  const contenedor = doc.createElement("div");
  const N = contexto.CenizaAventuraNucleo;
  const D = contexto.CenizaDatos;
  const partida = N.crearPartida({ personaje: D.personajePorDefecto(), semilla: 42 });
  const registro = { onGuardar: 0, onFase3D: 0, onVictoria: 0, onSalir: 0 };
  const control = contexto.CenizaAventuraUI.montar({
    contenedor,
    partida,
    onGuardar: () => { registro.onGuardar += 1; },
    onFase3D: () => { registro.onFase3D += 1; },
    onVictoria: () => { registro.onVictoria += 1; },
    onSalir: () => { registro.onSalir += 1; },
  });
  return { contenedor, control, registro };
}

// Búsqueda en el árbol del DOM mínimo.
function todos(nodo, pred, acum = []) {
  if (pred(nodo)) acum.push(nodo);
  for (const h of nodo.hijos) todos(h, pred, acum);
  return acum;
}

test("montar crea el canvas de 960 x 540 dentro del contenedor", () => {
  const contexto = cargar(SIN_PRUEBA);
  const { contenedor, control } = montarEn(contexto);
  const canvas = todos(contenedor, (n) => n.tagName === "CANVAS");
  assert.equal(canvas.length, 1, "debe haber exactamente un canvas");
  assert.equal(canvas[0].width, 960);
  assert.equal(canvas[0].height, 540);
  control.destruir();
});

test("CENIZA_TEST solo existe con prueba=1 en la URL", () => {
  const sinPrueba = cargar(SIN_PRUEBA);
  const a = montarEn(sinPrueba);
  assert.equal(sinPrueba.CENIZA_TEST, undefined, "sin prueba=1 no debe existir el gancho");
  a.control.destruir();

  const conPrueba = cargar(CON_PRUEBA);
  const b = montarEn(conPrueba);
  const gancho = conPrueba.CENIZA_TEST;
  assert.equal(typeof gancho, "object", "con prueba=1 debe existir el gancho");
  for (const nombre of ["estado", "avanzar", "entrarSala", "matarEnemigosDeSala", "vencerJefe"]) {
    assert.equal(typeof gancho[nombre], "function", `falta CENIZA_TEST.${nombre}`);
  }
  b.control.destruir();
  assert.equal(conPrueba.CENIZA_TEST, undefined, "destruir debe retirar el gancho");
});

test("avanzar(10) simula diez segundos de juego sin lanzar", () => {
  const contexto = cargar(CON_PRUEBA);
  const { control } = montarEn(contexto);
  const estado = contexto.CENIZA_TEST.avanzar(10);
  assert.equal(estado.tiempo, 10, "10 s de simulación a 1/60 s por fotograma");
  assert.equal(estado.sala, "Z1.1");
  assert.equal(estado.modo, "juego");
  control.destruir();
});

test("entrarSala a una sala no alcanzable devuelve error", () => {
  const contexto = cargar(CON_PRUEBA);
  const { control } = montarEn(contexto);
  const inexistente = contexto.CENIZA_TEST.entrarSala("Z9.9");
  assert.equal(inexistente.ok, false);
  assert.equal(typeof inexistente.error, "string");
  assert.ok(inexistente.error.length > 0, "el error debe explicar el motivo");
  // Z2.1 existe, pero no hay puerta desde Z1.1 hacia ella: también debe fallar.
  const lejana = contexto.CENIZA_TEST.entrarSala("Z2.1");
  assert.equal(lejana.ok, false);
  control.destruir();
});

test("vencerJefe del guardian de chatarra pasa a fase 3d y llama onFase3D sin lanzar", () => {
  const contexto = cargar(CON_PRUEBA);
  const { control, registro } = montarEn(contexto);
  let resultado;
  assert.doesNotThrow(() => {
    resultado = contexto.CENIZA_TEST.vencerJefe("guardian-chatarra");
  });
  // Se comparan campos sueltos: el objeto viene de otro contexto vm y deepStrictEqual exigiría el mismo prototipo.
  assert.equal(resultado.ok, true);
  assert.equal(resultado.faseActual, "3d");
  assert.equal(registro.onFase3D, 1, "onFase3D debe llamarse una vez al entrar en 3D");
  // Ceniza3D no está cargado en esta prueba: la interfaz avisa y vuelve a 2D sin fallar.
  const estado = contexto.CENIZA_TEST.estado();
  assert.equal(estado.fase, "3d");
  assert.equal(estado.modo, "juego");
  assert.ok(estado.aviso.includes("3D"), "el aviso debe explicar que la fase 3D no está cargada");
  control.destruir();
});
