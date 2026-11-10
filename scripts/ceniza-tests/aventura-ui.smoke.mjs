// Smoke de docs/ceniza/aventura-ui.js (CenizaAventuraUI).
// Ejecutar desde la raíz del repo: node --test scripts/ceniza-tests/aventura-ui.smoke.mjs
// Sin jsdom: el repo no tiene node_modules, así que el DOM es mínimo y solo cubre lo que usa la interfaz.
// Los scripts se cargan con vm.runInContext en un mismo contexto, como scripts clásicos del navegador:
// datos.js, mundo.js, personaje-ui.js, aventura-nucleo.js, historia.js y aventura-ui.js.
// El contexto no tiene requestAnimationFrame, así que no hay bucle de pantalla: el tiempo lo avanza avanzar().
// Las teclas se despachan con doc.dispatch("keydown", ...) y los botones con sus oyentes de clic.
// La fase 3D se prueba con un Ceniza3D falso (estado() y pausar/reanudar), así que no hace falta WebGL.

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

// Documento mínimo: guarda los oyentes de teclado para poder despacharlos desde la prueba.
class Documento {
  constructor() {
    this.activeElement = null;
    this.oyentes = {};
  }
  createElement(tag) {
    return new Elemento(tag, this);
  }
  addEventListener(tipo, fn) {
    (this.oyentes[tipo] = this.oyentes[tipo] || []).push(fn);
  }
  removeEventListener(tipo, fn) {
    this.oyentes[tipo] = (this.oyentes[tipo] || []).filter((f) => f !== fn);
  }
  dispatch(tipo, datos) {
    const e = { key: "", repeat: false, target: this.activeElement, preventDefault() {}, ...datos };
    for (const f of this.oyentes[tipo] || []) f(e);
  }
}

// Crea un contexto de navegador con los scripts de la aventura cargados en orden.
// opciones.tactil: true simula una pantalla táctil (navigator.maxTouchPoints > 0).
function cargar(url, opciones = {}) {
  const contexto = vm.createContext({
    location: { href: url },
    navigator: opciones.tactil ? { maxTouchPoints: 5 } : {},
  });
  for (const rel of [
    "docs/ceniza/datos.js",
    "docs/ceniza/mundo.js",
    "docs/ceniza/personaje-ui.js",
    "docs/ceniza/aventura-nucleo.js",
    "docs/ceniza/historia.js",
    "docs/ceniza/aventura-ui.js",
  ]) {
    vm.runInContext(leer(rel), contexto, { filename: rel });
  }
  return contexto;
}

// Monta la aventura con una partida nueva y registra cada llamada de retorno.
// Por defecto el despertar (inicio) y la zona 1 ya están vistos (si no, sus cuadros abren al montar).
// Opciones: sinInicio, sinZona1 (no marcarlas), nucleos, usos (parcial), armas, semilla, vida.
// registro.guardados guarda cada partida que llega a onGuardar (la copia tal como la recibe la página).
function montarEn(contexto, extra = {}) {
  const doc = new Documento();
  const contenedor = doc.createElement("div");
  const N = contexto.CenizaAventuraNucleo;
  const D = contexto.CenizaDatos;
  let partida = N.crearPartida({ personaje: D.personajePorDefecto(), semilla: extra.semilla ?? 42 });
  if (!extra.sinInicio) partida = N.marcarHistoria(partida, "inicio");
  if (!extra.sinZona1) partida = N.marcarHistoria(partida, "zona:1");
  if (extra.nucleos !== undefined) partida.nucleos = extra.nucleos;
  if (extra.usos) Object.assign(partida.usos, extra.usos);
  if (extra.armas) partida.armas = extra.armas.slice();
  if (extra.vida !== undefined) partida.vida = extra.vida;
  const registro = { onGuardar: 0, onFase3D: 0, onVictoria: 0, onSalir: 0, guardados: [] };
  const control = contexto.CenizaAventuraUI.montar({
    contenedor,
    partida,
    onGuardar: (p) => {
      registro.onGuardar += 1;
      registro.guardados.push(p);
    },
    onFase3D: () => { registro.onFase3D += 1; },
    onVictoria: () => { registro.onVictoria += 1; },
    onSalir: () => { registro.onSalir += 1; },
  });
  return { doc, contenedor, control, registro };
}

// Monta la aventura con una partida ya existente, como tras una recarga de la página.
function montarCon(contexto, partida) {
  const doc = new Documento();
  const contenedor = doc.createElement("div");
  const control = contexto.CenizaAventuraUI.montar({ contenedor, partida, onGuardar: () => {} });
  return { doc, contenedor, control };
}

// Búsqueda en el árbol del DOM mínimo.
function todos(nodo, pred, acum = []) {
  if (pred(nodo)) acum.push(nodo);
  for (const h of nodo.hijos) todos(h, pred, acum);
  return acum;
}

const porClase = (nodo, clase) => todos(nodo, (n) => n.atributos.class === clase)[0];
const botonPorEtiqueta = (nodo, etiqueta) =>
  todos(nodo, (n) => n.tagName === "BUTTON" && n.atributos["aria-label"] === etiqueta)[0];
const botonPorTexto = (nodo, texto) =>
  todos(nodo, (n) => n.tagName === "BUTTON" && n.textoPropio === texto)[0];
const pulsar = (boton) => boton.oyentes.click.forEach((f) => f({}));
const dialogoAbierto = (contenedor) => porClase(contenedor, "av-historia").style.display === "flex";

// Copia en JSON: los arrays creados dentro del contexto vm son de otro realm y deepStrictEqual no los acepta.
const plano = (x) => JSON.parse(JSON.stringify(x));

// Pulsa Continuar `veces` veces: cierra solo las líneas de un momento, sin encadenar el siguiente.
function pulsarHistoria(contenedor, veces) {
  for (let i = 0; i < veces; i++) pulsar(botonPorTexto(contenedor, "Continuar"));
}

// Pasa todas las líneas del cuadro de historia con su botón Continuar (encadena los momentos pendientes).
function cerrarHistoria(contenedor) {
  for (let i = 0; i < 20 && dialogoAbierto(contenedor); i++) pulsar(botonPorTexto(contenedor, "Continuar"));
  assert.equal(dialogoAbierto(contenedor), false, "el cuadro de historia debe cerrarse");
}

// Ceniza3D falso: start() guarda las opciones y devuelve un control con estado() leído por la prueba.
function con3DFalso(contexto) {
  const f = { sector: "S1", fase: null, terminado: false, pausas: 0, reanudas: 0, destruidos: 0, op: null };
  contexto.Ceniza3D = {
    start(op) {
      f.op = op;
      return {
        estado: () => ({ sector: f.sector, fase: f.fase, terminado: f.terminado }),
        pausar() { f.pausas += 1; },
        reanudar() { f.reanudas += 1; },
        destruir() { f.destruidos += 1; },
      };
    },
  };
  return f;
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

test("CENIZA_TEST solo existe con prueba=1 en la URL y tiene los ganchos documentados", () => {
  const sinPrueba = cargar(SIN_PRUEBA);
  const a = montarEn(sinPrueba);
  assert.equal(sinPrueba.CENIZA_TEST, undefined, "sin prueba=1 no debe existir el gancho");
  a.control.destruir();

  const conPrueba = cargar(CON_PRUEBA);
  const b = montarEn(conPrueba);
  const gancho = conPrueba.CENIZA_TEST;
  assert.equal(typeof gancho, "object", "con prueba=1 debe existir el gancho");
  for (const nombre of ["estado", "avanzar", "entrarSala", "matarEnemigosDeSala", "vencerJefe", "enemigos", "secretosDisponibles", "colocar"]) {
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

test("vencerJefe del guardian de chatarra: cuadros de caída y de entrada en 3D, y pasa a fase 3d", () => {
  const contexto = cargar(CON_PRUEBA);
  const { contenedor, control, registro } = montarEn(contexto);
  let resultado;
  assert.doesNotThrow(() => {
    resultado = contexto.CENIZA_TEST.vencerJefe("guardian-chatarra");
  });
  assert.equal(resultado.ok, true);
  assert.equal(resultado.faseActual, "3d");
  // La caída abre su cuadro antes de entrar en 3D: onFase3D todavía no se ha llamado.
  assert.equal(contexto.CENIZA_TEST.estado().modo, "historia");
  assert.equal(registro.onFase3D, 0, "onFase3D va después del cuadro de caída");
  pulsarHistoria(contenedor, 2);   // las dos líneas de la caída (alCaer y trasJefe)
  // Tras el cuadro: onFase3D una vez, y los cuadros de entrada (3d:entrada y 3d:S1) antes de Ceniza3D.
  assert.equal(registro.onFase3D, 1, "onFase3D debe llamarse una vez al entrar en 3D");
  assert.equal(contexto.CENIZA_TEST.estado().modo, "historia");
  pulsarHistoria(contenedor, 2);   // 3d:entrada y 3d:S1
  // Ceniza3D no está cargado en esta prueba: la interfaz avisa y vuelve a 2D sin fallar.
  const estado = contexto.CENIZA_TEST.estado();
  assert.equal(estado.fase, "3d");
  assert.equal(estado.modo, "juego");
  assert.ok(estado.aviso.includes("3D"), "el aviso debe explicar que la fase 3D no está cargada");
  control.destruir();
});

test("historia: el cuadro de zona sale una sola vez y no vuelve a salir", () => {
  const contexto = cargar(CON_PRUEBA);
  const { contenedor, control } = montarEn(contexto, { sinZona1: true });
  const gancho = contexto.CENIZA_TEST;
  // Al montar, la zona 1 se muestra: dos líneas y el título de la zona.
  let estado = gancho.estado();
  assert.equal(estado.modo, "historia", "el cuadro de entrada pausa la aventura");
  assert.equal(estado.dialogo.titulo, "Zona 1 · Duna tibia");
  assert.equal(estado.dialogo.total, 2, "la entrada de zona tiene dos líneas");
  assert.ok(estado.dialogo.texto.includes("traje de"), "el traje sale con su nombre en español");
  assert.ok(!estado.dialogo.texto.includes("{"), "no deben quedar marcadores sin sustituir");
  assert.equal(dialogoAbierto(contenedor), true, "el cuadro es visible");
  assert.equal(porClase(contenedor, "av-historia").getAttribute("role"), "dialog");
  cerrarHistoria(contenedor);
  estado = gancho.estado();
  assert.equal(estado.modo, "juego");
  assert.deepEqual(plano(estado.historia), ["inicio", "zona:1"], "las claves quedan guardadas");
  // Mismas zonas, otra entrada: nada de cuadros.
  gancho.entrarSala("Z1.2");
  assert.equal(gancho.estado().modo, "juego");
  control.destruir();
  // Una partida que ya tiene la clave no abre el cuadro al montar.
  const otra = montarEn(contexto, {});
  assert.equal(contexto.CENIZA_TEST.estado().modo, "juego");
  otra.control.destruir();
});

test("historia: Enter, Espacio y E pasan la línea (Enter y Espacio no pasan dos veces sobre el botón)", () => {
  const contexto = cargar(CON_PRUEBA);
  const { doc, contenedor, control } = montarEn(contexto, { sinZona1: true });
  const gancho = contexto.CENIZA_TEST;
  assert.equal(gancho.estado().dialogo.pagina, 1);
  // Sin botón enfocado, Enter y Espacio son del cuadro.
  doc.activeElement = null;
  doc.dispatch("keydown", { key: "Enter" });
  assert.equal(gancho.estado().dialogo.pagina, 2, "Enter pasa a la segunda línea");
  doc.activeElement = null;
  doc.dispatch("keydown", { key: " " });
  assert.equal(gancho.estado().modo, "juego", "Espacio cierra la última línea");
  assert.equal(dialogoAbierto(contenedor), false);
  // Con el botón Continuar enfocado, Enter lo activa el navegador (clic): el teclado no suma otro paso.
  const ctx2 = cargar(CON_PRUEBA);
  const otra = montarEn(ctx2, { sinZona1: true });
  const boton = botonPorTexto(otra.contenedor, "Continuar");
  otra.doc.dispatch("keydown", { key: "Enter", target: boton });
  assert.equal(ctx2.CENIZA_TEST.estado().dialogo.pagina, 1, "Enter sobre el botón lo deja al clic");
  pulsar(boton);
  assert.equal(ctx2.CENIZA_TEST.estado().dialogo.pagina, 2, "el clic pasa una sola línea");
  otra.doc.dispatch("keydown", { key: "e" });
  assert.equal(ctx2.CENIZA_TEST.estado().modo, "juego", "E cierra el cuadro desde el botón");
  control.destruir();
  otra.control.destruir();
});

test("armas bloqueadas: teclas 1 a 4 sin compra no cambian el arma; el HUD marca las bloqueadas", () => {
  const contexto = cargar(CON_PRUEBA);
  const { doc, contenedor, control } = montarEn(contexto);
  const gancho = contexto.CENIZA_TEST;
  assert.deepEqual(plano(gancho.estado().armas), ["hoja"], "solo la hoja al empezar");
  doc.dispatch("keydown", { key: "2" });
  gancho.avanzar(1 / 60);
  assert.equal(gancho.estado().arma, "hoja", "el arco sin comprar no se equipa");
  assert.ok(gancho.estado().aviso.includes("bloqueada"), "el aviso explica el bloqueo");
  doc.dispatch("keydown", { key: "4" });
  gancho.avanzar(1 / 60);
  assert.equal(gancho.estado().arma, "hoja");
  // El HUD se actualiza en cada fotograma de pantalla: aquí se fuerza con un fotograma de dibujo (cuadro).
  const botonArco = botonPorEtiqueta(contenedor, "Arma 2: Arco, bloqueada");
  assert.ok(botonArco, "el botón del arco aparece como bloqueado");
  assert.equal(botonArco.disabled, true, "el botón del arco está deshabilitado");
  control.destruir();
});

test("compra en la fogata: descuenta núcleos consolidados, guarda y desbloquea el arma", () => {
  const contexto = cargar(CON_PRUEBA);
  const { doc, contenedor, control, registro } = montarEn(contexto, { nucleos: 150 });
  const gancho = contexto.CENIZA_TEST;
  // E junto a la fogata de Z1.1: primero el cuadro de su momento (fogata:1), luego el panel.
  doc.dispatch("keydown", { key: "e" });
  gancho.avanzar(1 / 60);
  assert.equal(gancho.estado().modo, "historia", "la primera fogata abre su cuadro");
  assert.equal(gancho.estado().dialogo.titulo, "Fogata · Duna tibia");
  cerrarHistoria(contenedor);
  assert.equal(gancho.estado().modo, "fogata", "tras el cuadro se abre el panel");
  // Arco: 100 núcleos, con 150 consolidados se puede comprar.
  const comprar = botonPorEtiqueta(contenedor, "Arco: Comprar");
  assert.ok(comprar, "el botón de compra del arco existe");
  assert.equal(comprar.disabled, false);
  const guardadosAntes = registro.onGuardar;
  pulsar(comprar);
  const estado = gancho.estado();
  assert.ok(estado.armas.includes("arco"), "el arco queda comprado");
  assert.equal(estado.nucleos, 50, "se descuentan 100 núcleos");
  assert.ok(registro.onGuardar > guardadosAntes, "la compra guarda la partida");
  assert.equal(botonPorEtiqueta(contenedor, "Arco: Comprada").disabled, true);
  assert.equal(botonPorEtiqueta(contenedor, "Martillo: Faltan núcleos").disabled, true, "220 > 50");
  // Cerrar la fogata y equipar el arco con su tecla.
  pulsar(botonPorEtiqueta(contenedor, "Cerrar la fogata"));
  assert.equal(gancho.estado().modo, "juego");
  doc.dispatch("keydown", { key: "2" });
  gancho.avanzar(1 / 60);
  assert.equal(gancho.estado().arma, "arco", "con el arco comprado, la tecla 2 lo equipa");
  control.destruir();
});

test("la maestría sube con los usos: 30 por nivel, máximo 3", () => {
  const contexto = cargar(CON_PRUEBA);
  const { control } = montarEn(contexto, { usos: { arco: 30, martillo: 90, lanza: 500 } });
  const m = contexto.CENIZA_TEST.estado().maestria;
  assert.equal(m.arco, 1, "30 usos dan maestría 1");
  assert.equal(m.martillo, 3, "90 usos dan maestría 3");
  assert.equal(m.lanza, 3, "el tope es 3");
  assert.equal(m.hoja, 0, "sin usos, maestría 0");
  control.destruir();
});

test("un secreto se recoge una vez: da su recompensa y deja de aparecer", () => {
  const contexto = cargar(CON_PRUEBA);
  const { doc, control, registro } = montarEn(contexto);
  const gancho = contexto.CENIZA_TEST;
  // Z1.3 tiene el secreto de pieza (mundo.js) en (560, 250).
  assert.equal(gancho.entrarSala("Z1.2").ok, true);
  assert.equal(gancho.entrarSala("Z1.3").ok, true);
  assert.ok(gancho.secretosDisponibles().includes("Z1.3"), "el secreto de Z1.3 está disponible");
  gancho.colocar(560, 250);
  doc.dispatch("keydown", { key: "e" });
  gancho.avanzar(1 / 60);
  const estado = gancho.estado();
  assert.equal(estado.aviso, "Secreto: pieza", "el aviso anuncia la pieza");
  assert.deepEqual(plano(estado.secretos), ["Z1.3"]);
  assert.ok(!gancho.secretosDisponibles().includes("Z1.3"), "ya no aparece como disponible");
  // Otra vez con E: no se repite.
  doc.dispatch("keydown", { key: "e" });
  gancho.avanzar(1 / 60);
  assert.deepEqual(plano(gancho.estado().secretos), ["Z1.3"], "no se repite");
  assert.ok(registro.onGuardar >= 1, "el secreto se guarda");
  control.destruir();
});

test("enemigos() y secretosDisponibles() responden (solo lectura)", () => {
  const contexto = cargar(CON_PRUEBA);
  const { control } = montarEn(contexto);
  const gancho = contexto.CENIZA_TEST;
  const vivos = gancho.enemigos();
  assert.ok(Array.isArray(vivos), "enemigos() devuelve una lista");
  assert.equal(vivos.length, 2, "Z1.1 tiene dos areneros");
  for (const e of vivos) {
    assert.equal(e.tipo, "arenero");
    assert.equal(typeof e.x, "number");
    assert.equal(typeof e.y, "number");
    assert.equal(typeof e.vida, "number");
  }
  vivos.push({ tipo: "falso" });
  assert.equal(gancho.enemigos().length, 2, "la lista devuelta es una copia");
  assert.deepEqual(plano(gancho.secretosDisponibles()), ["Z1.3", "Z2.2", "Z3.1", "Z4.2"], "los cuatro secretos del mundo");
  control.destruir();
});

test("fase 3D: cuadros de sector y del Coloso al cambiar, con pausa y reanudación; la victoria abre el final", () => {
  const contexto = cargar(CON_PRUEBA);
  const f = con3DFalso(contexto);
  const { contenedor, control, registro } = montarEn(contexto);
  const gancho = contexto.CENIZA_TEST;
  gancho.vencerJefe("guardian-chatarra");
  cerrarHistoria(contenedor);   // caída
  cerrarHistoria(contenedor);   // entrada y S1
  assert.equal(gancho.estado().modo, "tres_d", "la fase 3D está activa");
  assert.ok(f.op, "Ceniza3D.start recibió sus opciones");
  assert.equal(f.op.sectorInicial, undefined, "el arranque es S1 por defecto");
  // Cambio a S2 en mitad de la fase: se pausa, sale el cuadro y al cerrar se reanuda.
  f.sector = "S2";
  gancho.avanzar(1 / 60);
  assert.equal(gancho.estado().modo, "historia");
  assert.equal(f.pausas, 1, "la fase 3D se pausa mientras hay cuadro");
  assert.equal(gancho.estado().dialogo.titulo, "Fase 3D · " + "Taller de drones");
  cerrarHistoria(contenedor);
  assert.equal(f.reanudas, 1, "al cerrar, la fase 3D se reanuda");
  assert.equal(gancho.estado().modo, "tres_d");
  // Sin cambio de sector, ningún cuadro nuevo.
  gancho.avanzar(1);
  assert.equal(gancho.estado().modo, "tres_d");
  // Coloso: fase 1 (Ojo expuesto) y fase 2 (Brazos).
  f.sector = "COLOSO";
  f.fase = 1;
  gancho.avanzar(1 / 60);
  assert.equal(gancho.estado().dialogo.titulo, "Fase 3D · Coloso final: Ojo expuesto");
  cerrarHistoria(contenedor);
  f.fase = 2;
  gancho.avanzar(1 / 60);
  assert.ok(gancho.estado().dialogo.titulo.includes("Brazos"), "la fase 2 del Coloso se llama Brazos");
  cerrarHistoria(contenedor);
  // Victoria: el final sale antes de cerrar la fase 3D y de avisar a la página.
  f.op.onVictoria({ resultado: "victoria" });
  assert.equal(gancho.estado().modo, "historia", "el final abre su cuadro");
  assert.equal(gancho.estado().dialogo.total, 3, "dos líneas del final y la pregunta");
  assert.equal(registro.onVictoria, 0, "onVictoria va después del cuadro");
  cerrarHistoria(contenedor);
  assert.equal(f.destruidos, 1, "al cerrar el final se destruye la fase 3D");
  assert.equal(registro.onVictoria, 1, "onVictoria se llama una vez");
  assert.equal(gancho.estado().modo, "victoria");
  control.destruir();
});

test("botón Arma táctil: salta las armas bloqueadas", () => {
  const contexto = cargar(CON_PRUEBA, { tactil: true });
  const { contenedor, control } = montarEn(contexto, { armas: ["hoja", "martillo"] });
  const gancho = contexto.CENIZA_TEST;
  const cambiar = botonPorEtiqueta(contenedor, "Cambiar de arma");
  assert.ok(cambiar, "en pantalla táctil aparece el botón Arma");
  pulsar(cambiar);
  gancho.avanzar(1 / 60);
  assert.equal(gancho.estado().arma, "martillo", "el arco (bloqueado) se salta");
  pulsar(cambiar);
  gancho.avanzar(1 / 60);
  assert.equal(gancho.estado().arma, "hoja", "vuelve a la hoja");
  control.destruir();
});

test("un enemigo vencido con la hoja cuenta usos de la hoja (arma del último golpe)", () => {
  const contexto = cargar(CON_PRUEBA);
  // 29 usos de la hoja: el siguiente enemigo vencido con ella sube la maestría a 1 (umbral 30).
  const { doc, control } = montarEn(contexto, { usos: { hoja: 29 } });
  const gancho = contexto.CENIZA_TEST;
  assert.equal(gancho.estado().maestria.hoja, 0);
  const vivosAntes = gancho.enemigos().length;
  gancho.colocar(400, 440);
  for (let i = 0; i < 12 && gancho.enemigos().length === vivosAntes; i++) {
    doc.dispatch("keydown", { key: "j" });
    gancho.avanzar(0.3);
  }
  assert.equal(gancho.enemigos().length, vivosAntes - 1, "la hoja vence al arenero");
  assert.equal(gancho.estado().maestria.hoja, 1, "la muerte cuenta un uso de la hoja");
  control.destruir();
});

test("guardado: cada guardado lleva sala = última fogata (guardarProgreso); la partida en memoria sigue en su sala", () => {
  const contexto = cargar(CON_PRUEBA);
  const { doc, control, registro } = montarEn(contexto);
  const gancho = contexto.CENIZA_TEST;
  assert.equal(gancho.entrarSala("Z1.2").ok, true);
  assert.equal(gancho.entrarSala("Z1.3").ok, true);
  // El secreto de Z1.3 se guarda desde Z1.3, pero la fogata encendida es la de Z1.1.
  gancho.colocar(560, 250);
  doc.dispatch("keydown", { key: "e" });
  gancho.avanzar(1 / 60);
  assert.deepEqual(plano(gancho.estado().secretos), ["Z1.3"], "el secreto queda recogido");
  const guardado = plano(registro.guardados[registro.guardados.length - 1]);
  assert.equal(guardado.sala, "Z1.1", "el guardado va a la última fogata, no a Z1.3");
  assert.equal(guardado.ultimaFogata, "Z1.1");
  assert.deepEqual(guardado.secretos, ["Z1.3"], "el guardado ya incluye el secreto");
  assert.equal(gancho.estado().sala, "Z1.3", "la partida en memoria no cambia de sala");
  control.destruir();
});

test("recarga: tras cuadros de historia en otra sala, la partida vuelve a la última fogata con historia y secretos marcados", () => {
  const contexto = cargar(CON_PRUEBA);
  const { doc, contenedor, control, registro } = montarEn(contexto);
  const gancho = contexto.CENIZA_TEST;
  gancho.entrarSala("Z1.2");
  gancho.entrarSala("Z1.3");
  gancho.colocar(560, 250);
  doc.dispatch("keydown", { key: "e" });
  gancho.avanzar(1 / 60);
  gancho.entrarSala("Z1.JEFE");          // cuadro del jefe antes del combate (jefe:guardian-duna)
  cerrarHistoria(contenedor);
  gancho.vencerJefe("guardian-duna");    // cuadro de la caída (jefe:guardian-duna:caida)
  cerrarHistoria(contenedor);
  const ultimo = plano(registro.guardados[registro.guardados.length - 1]);
  assert.equal(ultimo.sala, "Z1.1", "el último guardado apunta a la fogata");
  control.destruir();

  // Recarga de la página con ese guardado.
  const recarga = cargar(CON_PRUEBA);
  const otra = montarCon(recarga, ultimo);
  const estado = recarga.CENIZA_TEST.estado();
  assert.equal(estado.sala, "Z1.1", "vuelve a la última fogata, no a Z1.JEFE");
  assert.equal(estado.jugador.x, 96, "de pie junto a la fogata");
  assert.equal(estado.modo, "juego", "no repite cuadros ya vistos");
  for (const clave of ["inicio", "zona:1", "jefe:guardian-duna", "jefe:guardian-duna:caida"]) {
    assert.ok(estado.historia.includes(clave), `la historia guarda ${clave}`);
  }
  assert.deepEqual(estado.secretos, ["Z1.3"], "el secreto sigue marcado");
  assert.deepEqual(estado.jefesVencidos, ["guardian-duna"], "el jefe sigue vencido");
  otra.control.destruir();
});

test("inicio: una partida nueva abre el despertar antes de moverse, lo marca con su guardado y no lo repite", () => {
  const contexto = cargar(CON_PRUEBA);
  const { contenedor, control, registro } = montarEn(contexto, { sinInicio: true });
  const gancho = contexto.CENIZA_TEST;
  let estado = gancho.estado();
  assert.equal(estado.modo, "historia", "el despertar pausa la aventura al empezar");
  assert.equal(estado.dialogo.titulo, "Acto I · Despertar");
  assert.equal(estado.dialogo.total, 3, "el despertar tiene tres líneas");
  assert.ok(estado.dialogo.texto.includes("«viajero»"), "sin nombre escrito, {nombre} sale como viajero");
  const x = estado.jugador.x;
  gancho.avanzar(1);
  assert.equal(gancho.estado().jugador.x, x, "con el cuadro abierto el viajero no se mueve");
  cerrarHistoria(contenedor);
  estado = gancho.estado();
  assert.equal(estado.modo, "juego", "al cerrar, la aventura sigue");
  assert.ok(estado.historia.includes("inicio"), "la clave queda marcada");
  const guardado = plano(registro.guardados[registro.guardados.length - 1]);
  assert.ok(guardado.historia.includes("inicio"), "el guardado incluye el despertar");
  assert.equal(guardado.sala, "Z1.1");
  control.destruir();
  // Una partida que ya tiene el despertar no lo vuelve a mostrar.
  const ctx2 = cargar(CON_PRUEBA);
  const otra = montarCon(ctx2, guardado);
  assert.equal(ctx2.CENIZA_TEST.estado().modo, "juego", "el despertar visto no se repite");
  otra.control.destruir();
});

test("muerte: al volver a la fogata sale su cuadro (fogata:morir) y el viajero recupera la vida", () => {
  const contexto = cargar(CON_PRUEBA);
  // Con una sola vida, el contacto con el arenero de Z1.1 (450, 440) deja al viajero caído.
  const { contenedor, control } = montarEn(contexto, { vida: 1 });
  const gancho = contexto.CENIZA_TEST;
  gancho.colocar(450, 440);
  for (let i = 0; i < 60 && !gancho.estado().muerto; i++) gancho.avanzar(0.1);
  assert.equal(gancho.estado().muerto, true, "el contacto con el arenero mata al viajero");
  // Pantalla de caída (1,5 s) y vuelta a la última fogata: el cuadro sale al volver.
  gancho.avanzar(2);
  let estado = gancho.estado();
  assert.equal(estado.modo, "historia", "al volver sale el cuadro de la fogata");
  assert.equal(estado.dialogo.titulo, "Fogata · De vuelta");
  assert.equal(estado.sala, "Z1.1", "vuelve a la fogata encendida");
  cerrarHistoria(contenedor);
  estado = gancho.estado();
  assert.equal(estado.muerto, false);
  assert.equal(estado.vida, estado.vidaMax, "vuelve con la vida al máximo");
  assert.ok(estado.historia.includes("fogata:morir"), "el cuadro queda marcado");
  control.destruir();
});

test("fogata: encender una fogata en otra zona guarda esa sala; el guardado al entrar en la zona va a la fogata anterior", () => {
  const contexto = cargar(CON_PRUEBA);
  const { doc, contenedor, control, registro } = montarEn(contexto);
  const gancho = contexto.CENIZA_TEST;
  // Ruta: Z1.1 (fogata) → Z1.2 → Z1.3 → Z1.JEFE (vencer al guardián) → Z2.1 (fogata de la zona 2).
  gancho.entrarSala("Z1.2");
  gancho.entrarSala("Z1.3");
  gancho.entrarSala("Z1.JEFE");
  cerrarHistoria(contenedor);
  gancho.vencerJefe("guardian-duna");
  cerrarHistoria(contenedor);
  assert.equal(gancho.entrarSala("Z2.1").ok, true, "la puerta se abre con el jefe vencido");
  cerrarHistoria(contenedor);   // cuadro de la zona 2
  const alEntrar = plano(registro.guardados.find((g) => g.historia.includes("zona:2")));
  assert.equal(alEntrar.sala, "Z1.1", "el guardado de la entrada en Z2 apunta a la fogata de Z1");
  // Junto a la fogata de Z2.1: E abre su cuadro (fogata:2) y luego el panel.
  gancho.colocar(96, 440);
  doc.dispatch("keydown", { key: "e" });
  gancho.avanzar(1 / 60);
  assert.equal(gancho.estado().dialogo.titulo, "Fogata · Ciudad de cristal");
  cerrarHistoria(contenedor);
  assert.equal(gancho.estado().modo, "fogata");
  pulsar(botonPorEtiqueta(contenedor, "Descansar en la fogata y guardar"));
  const encendido = plano(registro.guardados[registro.guardados.length - 1]);
  assert.equal(encendido.sala, "Z2.1", "encender la fogata guarda la sala real");
  assert.equal(encendido.ultimaFogata, "Z2.1");
  assert.equal(gancho.estado().sala, "Z2.1");
  control.destruir();
});

// CA-03 con el juego real (docs 7.5). Cada fotograma se pulsa J y se avanza 1/60 s. Un ataque se reconoce
// porque el cooldown del viajero (cooldownArma) salta hacia arriba: el valor tras un ataque es el nuevo cooldown.
const FOTOGRAMAS_DE_PRUEBA = 600; // 10 s a 60 Hz
function fotogramasDeAtaque(gancho, doc, tecla) {
  const ataques = [];
  let previo = gancho.cooldownArma();
  for (let f = 0; f < FOTOGRAMAS_DE_PRUEBA; f++) {
    doc.dispatch("keydown", { key: tecla });
    gancho.avanzar(1 / 60);
    const ahora = gancho.cooldownArma();
    if (ahora > previo) ataques.push(f);
    previo = ahora;
  }
  return ataques;
}

test("CA-03 con el juego real a 60 Hz: el arco nunca supera el 95 % de la hoja con maestría 0 a 3", () => {
  const cuadros = { hoja: [], arco: [] };
  for (let m = 0; m <= 3; m++) {
    const contexto = cargar(CON_PRUEBA);
    const D = contexto.CenizaDatos;
    const { doc, control } = montarEn(contexto, { armas: ["hoja", "arco"], usos: { hoja: 30 * m, arco: 30 * m }, vida: 1e6 });
    const gancho = contexto.CENIZA_TEST;
    assert.equal(gancho.estado().maestria.hoja, m, `maestría de la hoja ${m}`);
    // Hoja: los golpes de la combinación, de tres en tres. Ciclo medido entre el primero y el último completo.
    const ataquesHoja = fotogramasDeAtaque(gancho, doc, "j");
    const k = Math.floor((ataquesHoja.length - 1) / 3);
    assert.ok(k >= 3, "se miden al menos tres ciclos de la hoja");
    const cicloHoja = (ataquesHoja[3 * k] - ataquesHoja[0]) / k;
    // Arco: el espaciado medio entre ráfagas.
    doc.dispatch("keydown", { key: "2" });
    gancho.avanzar(1 / 60);
    assert.equal(gancho.estado().arma, "arco", "el arco está equipado");
    const ataquesArco = fotogramasDeAtaque(gancho, doc, "j");
    assert.ok(ataquesArco.length >= 10, "se miden al menos diez ráfagas del arco");
    const espaciadoArco = (ataquesArco[ataquesArco.length - 1] - ataquesArco[0]) / (ataquesArco.length - 1);
    assert.equal(cicloHoja, 56, `ciclo de la hoja a 60 Hz, maestría ${m}`);
    assert.equal(espaciadoArco, [14, 18, 26, 26][m], `espaciado de la ráfaga a 60 Hz, maestría ${m}`);
    const d = plano(D.danoHoja(m));
    const dpsHoja = (d.golpes.reduce((s, x) => s + x, 0) + d.onda) / (cicloHoja / 60);
    const dpsArco = (D.MULTIDISPARO_ARCO[m] * D.danoPorGolpe("arco", m)) / (espaciadoArco / 60);
    const porcentaje = (100 * dpsArco) / dpsHoja;
    cuadros.hoja.push(Math.round(dpsHoja * 100) / 100);
    cuadros.arco.push(Math.round(dpsArco * 100) / 100);
    assert.ok(porcentaje <= 95, `maestría ${m}: el arco llega al ${porcentaje.toFixed(2)} % de la hoja`);
    assert.equal(gancho.estado().maestria.arco, m, `maestría del arco ${m}`);
    control.destruir();
  }
  assert.deepEqual(cuadros.hoja, [67.5, 72.86, 81.43, 87.86], "DPS de la hoja a 60 Hz (docs 7.5)");
  assert.deepEqual(cuadros.arco, [38.57, 66.67, 76.15, 83.08], "DPS del arco a 60 Hz (docs 7.5)");
});

// Escape y P con un cuadro de sector abierto en la fase 3D. shooter3d.js escucha Escape y P en window y alterna
// su pausa (y reanuda si estaba pausada). Aquí ese oyente se simula: recibe la tecla solo si la capa 2D no la
// detuvo con stopPropagation, que es lo que hace el documento real al bajar desde el elemento hasta window.
test("fase 3D: Escape y P con un cuadro de sector abierto no reanudan la fase 3D; al cerrar el cuadro sí", () => {
  const contexto = cargar(CON_PRUEBA);
  const f = { sector: "S1", fase: null, terminado: false, pausado: false, reanudas: 0, alternadasPorTecla: 0 };
  contexto.Ceniza3D = {
    start() {
      return {
        estado: () => ({ sector: f.sector, fase: f.fase, terminado: f.terminado }),
        pausar() { f.pausado = true; },
        reanudar() { f.pausado = false; f.reanudas += 1; },
        destruir() {},
      };
    },
  };
  const { doc, contenedor, control } = montarEn(contexto);
  const gancho = contexto.CENIZA_TEST;
  // Documento con su oyente de window (shooter3d): el mismo orden de llamadas que el navegador.
  doc.dispatch = (tipo, datos) => {
    let detenida = false;
    const e = { key: "", repeat: false, target: doc.activeElement, preventDefault() {}, stopPropagation() { detenida = true; }, ...datos };
    for (const fn of doc.oyentes[tipo] || []) fn(e);
    const esPausa = e.code === "Escape" || e.code === "KeyP";
    if (tipo === "keydown" && esPausa && !detenida && !e.repeat) {
      f.alternadasPorTecla += 1;
      if (f.pausado) { f.pausado = false; f.reanudas += 1; } else f.pausado = true;
    }
  };
  gancho.vencerJefe("guardian-chatarra");
  cerrarHistoria(contenedor);   // caída
  cerrarHistoria(contenedor);   // entrada y S1
  assert.equal(gancho.estado().modo, "tres_d");
  // Cambio a S2: la fase 3D se pausa con el cuadro abierto.
  f.sector = "S2";
  gancho.avanzar(1 / 60);
  assert.equal(gancho.estado().modo, "historia");
  assert.equal(f.pausado, true, "la fase 3D está pausada mientras hay cuadro");
  for (const tecla of [{ key: "Escape", code: "Escape" }, { key: "p", code: "KeyP" }]) {
    doc.dispatch("keydown", tecla);
    gancho.avanzar(1 / 60);
    assert.equal(gancho.estado().modo, "historia", `${tecla.key}: el cuadro sigue abierto`);
    assert.equal(f.pausado, true, `${tecla.key}: la fase 3D sigue pausada`);
  }
  assert.equal(f.alternadasPorTecla, 0, "con el cuadro abierto, Escape y P no llegan a la fase 3D");
  assert.equal(f.reanudas, 0, "ninguna reanudación antes de cerrar el cuadro");
  cerrarHistoria(contenedor);
  assert.equal(f.reanudas, 1, "al cerrar el cuadro, la fase 3D se reanuda una vez");
  assert.equal(f.pausado, false);
  assert.equal(gancho.estado().modo, "tres_d");
  // Sin cuadro, Escape sigue pausando la fase 3D como antes.
  doc.dispatch("keydown", { key: "Escape", code: "Escape" });
  gancho.avanzar(1 / 60);
  assert.equal(f.pausado, true, "Escape en la fase 3D pausa");
  assert.equal(f.alternadasPorTecla, 1);
  assert.equal(gancho.estado().modo, "tres_d", "la capa 2D sigue en la fase 3D");
  control.destruir();
});
