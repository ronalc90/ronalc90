// Smoke de docs/ceniza/personaje-ui.js (CenizaPersonaje).
// Ejecutar desde la raíz del repo: node --test scripts/ceniza-tests/personaje-ui.smoke.mjs
// Sin jsdom: el repo no tiene node_modules, así que el DOM es mínimo y solo cubre lo que usa el panel.
// Los scripts se cargan con vm.runInContext en un mismo contexto, como scripts clásicos del navegador.
// El contexto trae un localStorage espía: el panel no debe escribir en él.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const leer = (rel) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

// Elemento del DOM mínimo: hijos, atributos, texto, value, style y oyentes.
class Elemento {
  constructor(tag, doc) {
    this.tagName = tag.toUpperCase();
    this.ownerDocument = doc;
    this.hijos = [];
    this.parentNode = null;
    this.atributos = {};
    this.oyentes = {};
    this.style = {};
    this.value = "";
    this.texto = "";
  }
  get firstChild() {
    return this.hijos[0] || null;
  }
  get textContent() {
    return this.texto + this.hijos.map((h) => h.textContent).join("");
  }
  set textContent(t) {
    for (const h of this.hijos) h.parentNode = null;
    this.hijos = [];
    this.texto = String(t);
  }
  appendChild(h) {
    if (h.parentNode) h.parentNode.removeChild(h);
    h.parentNode = this;
    this.hijos.push(h);
    return h;
  }
  removeChild(h) {
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
  focus() {
    this.ownerDocument.activeElement = this;
  }
  // Dispara el evento sin mirar "disabled": así se comprueba que el propio script rechaza la acción.
  disparar(tipo) {
    for (const fn of this.oyentes[tipo] || []) fn({ type: tipo, target: this });
  }
}

class Documento {
  constructor() {
    this.activeElement = null;
  }
  createElement(tag) {
    return new Elemento(tag, this);
  }
}

// Carga datos.js y personaje-ui.js en un mismo contexto.
// extra: globales opcionales del contexto (p. ej. navigator con portapapeles).
function cargar(extra = {}) {
  const escrituras = [];
  const espia = {
    setItem: (...a) => escrituras.push(a),
    getItem: () => null,
    removeItem: () => {},
    clear: () => {},
  };
  const contexto = vm.createContext({ localStorage: espia, ...extra });
  vm.runInContext(leer("docs/ceniza/datos.js"), contexto, { filename: "datos.js" });
  vm.runInContext(leer("docs/ceniza/personaje-ui.js"), contexto, { filename: "personaje-ui.js" });
  return { P: contexto.CenizaPersonaje, D: contexto.CenizaDatos, escrituras };
}

// Opciones mínimas. El personaje se copia en JSON para no compartir objetos con el contexto.
function opcionesBase(D, extra = {}) {
  return {
    personaje: JSON.parse(JSON.stringify(D.personajePorDefecto())),
    inventario: [],
    equipadas: {},
    forja: { chatarra: 0 },
    onCambio: () => {},
    ...extra,
  };
}

const plano = (x) => JSON.parse(JSON.stringify(x));

// Búsqueda en el árbol del DOM mínimo.
function todos(nodo, pred, acum = []) {
  if (pred(nodo)) acum.push(nodo);
  for (const h of nodo.hijos) todos(h, pred, acum);
  return acum;
}

const etiquetados = (raiz, etiqueta) => todos(raiz, (n) => n.atributos["aria-label"] === etiqueta);

function boton(raiz, etiqueta) {
  const r = etiquetados(raiz, etiqueta).filter((n) => n.tagName === "BUTTON");
  assert.equal(r.length, 1, `debe haber un botón con aria-label "${etiqueta}" (hay ${r.length})`);
  return r[0];
}

function botonQue(raiz, prefijo) {
  const r = todos(raiz, (n) => n.tagName === "BUTTON" && (n.atributos["aria-label"] || "").startsWith(prefijo));
  assert.equal(r.length, 1, `debe haber un botón cuyo aria-label empiece por "${prefijo}" (hay ${r.length})`);
  return r[0];
}

function control(raiz, etiqueta) {
  const r = etiquetados(raiz, etiqueta);
  assert.equal(r.length, 1, `debe haber un control con aria-label "${etiqueta}" (hay ${r.length})`);
  return r[0];
}

const avisoDelPanel = (raiz) => todos(raiz, (n) => n.atributos.role === "status")[0];

test("abrir crea el panel con sus pestañas, botones con aria-label y PERSONAJE activa", () => {
  const { P, D } = cargar();
  const contenedor = new Documento().createElement("div");
  P.abrir(contenedor, opcionesBase(D));

  assert.ok(contenedor.hijos.length > 0, "el contenedor debe tener el panel");
  assert.equal(todos(contenedor, (n) => n.atributos.class === "cp-panel").length, 1);
  assert.equal(boton(contenedor, "Pestaña PERSONAJE").getAttribute("aria-pressed"), "true");
  assert.equal(boton(contenedor, "Pestaña EQUIPO").getAttribute("aria-pressed"), "false");
  assert.equal(boton(contenedor, "Pestaña FORJA").getAttribute("aria-pressed"), "false");

  const sinEtiqueta = todos(contenedor, (n) => n.tagName === "BUTTON" && n.atributos["aria-label"] === undefined);
  assert.equal(sinEtiqueta.length, 0, "todos los botones deben tener aria-label");

  P.cerrar();
});

test("cambiar el color del traje llama a onCambio con el personaje validado", () => {
  const { P, D, escrituras } = cargar();
  const contenedor = new Documento().createElement("div");
  const llamadas = [];
  const base = opcionesBase(D, { onCambio: (estado) => llamadas.push(estado) });
  const personajeOriginal = plano(base.personaje);

  P.abrir(contenedor, base);
  boton(contenedor, "Color del traje: Arena").disparar("click");

  assert.equal(llamadas.length, 1, "un cambio, una llamada a onCambio");
  const estado = llamadas[0];
  assert.equal(estado.personaje.traje.color, "arena");
  assert.equal(D.validarPersonaje(plano(estado.personaje)).ok, true, "el personaje emitido debe ser válido");
  assert.equal(boton(contenedor, "Color del traje: Arena").getAttribute("aria-pressed"), "true");
  assert.equal(boton(contenedor, "Color del traje: Ceniza").getAttribute("aria-pressed"), "false");
  assert.deepEqual(plano(base.personaje), personajeOriginal, "las opciones de entrada no se modifican");
  assert.equal(escrituras.length, 0, "el panel no escribe en localStorage");

  P.cerrar();
});

test("la forja sube de +4 a +5 y no pasa de +5", () => {
  const { P, D } = cargar();
  const contenedor = new Documento().createElement("div");
  const llamadas = [];
  const pieza = {
    ranura: "casco",
    rareza: "raro",
    zona: 2,
    forja: 4,
    set: null,
    modificadores: [
      { id: "vida", valor: 10 },
      { id: "armadura", valor: 3 },
    ],
  };
  P.abrir(contenedor, opcionesBase(D, { inventario: [pieza], forja: { chatarra: 1000 }, onCambio: (e) => llamadas.push(e) }));
  boton(contenedor, "Pestaña FORJA").disparar("click");

  const subir = botonQue(contenedor, "Subir a +5");
  subir.disparar("click");
  assert.equal(llamadas.length, 1);
  assert.equal(llamadas[0].inventario[0].forja, 5);
  assert.equal(llamadas[0].forja.chatarra, 1000 - D.costoForja(4), "descuenta el costo de +4 a +5");

  // El botón antiguo sigue enlazado: el script debe rechazar la subida por sí mismo.
  subir.disparar("click");
  assert.equal(llamadas.length, 1, "no hay una segunda llamada a onCambio");
  assert.equal(botonQue(contenedor, "Forja al máximo").getAttribute("disabled") !== null, true);

  P.cerrar();
});

test("importar un código corrupto muestra un error sin lanzar y deja el foco en el campo", () => {
  const { P, D, escrituras } = cargar();
  const doc = new Documento();
  const contenedor = doc.createElement("div");
  const llamadas = [];
  const resultados = [];
  P.abrir(
    contenedor,
    opcionesBase(D, { onCambio: (e) => llamadas.push(e), onImportar: (r) => resultados.push(r) }),
  );

  control(contenedor, "Código para importar").value = "CENIZA1.@@@.00000000";
  assert.doesNotThrow(() => boton(contenedor, "IMPORTAR código pegado").disparar("click"));

  const aviso = avisoDelPanel(contenedor);
  assert.match(aviso.textContent, /No se importó nada\. Código corrupto/);
  assert.match(aviso.atributos.class, /cp-error/);
  assert.equal(llamadas.length, 0, "un código corrupto no cambia el estado");
  assert.equal(resultados.length, 1);
  assert.equal(resultados[0].ok, false);
  // El campo se vuelve a pintar: el foco debe estar en el campo nuevo, para corregir el código.
  assert.equal(doc.activeElement, control(contenedor, "Código para importar"));

  // Código con la suma de control alterada: también se rechaza sin lanzar.
  const valido = D.exportarPersonaje(JSON.parse(JSON.stringify(D.personajePorDefecto())));
  control(contenedor, "Código para importar").value = valido.slice(0, -1) + (valido.endsWith("0") ? "1" : "0");
  assert.doesNotThrow(() => boton(contenedor, "IMPORTAR código pegado").disparar("click"));
  assert.match(avisoDelPanel(contenedor).textContent, /suma de control/);
  assert.equal(llamadas.length, 0);
  assert.equal(escrituras.length, 0);

  P.cerrar();
});

test("un código válido se importa, cambia el personaje y avisa", () => {
  const { P, D } = cargar();
  const contenedor = new Documento().createElement("div");
  const llamadas = [];
  P.abrir(contenedor, opcionesBase(D, { onCambio: (e) => llamadas.push(e) }));

  const otro = JSON.parse(JSON.stringify(D.personajePorDefecto()));
  otro.nombre = "Ñandú 2";
  control(contenedor, "Código para importar").value = D.exportarPersonaje(otro);
  boton(contenedor, "IMPORTAR código pegado").disparar("click");

  assert.equal(llamadas.length, 1);
  assert.equal(llamadas[0].personaje.nombre, "Ñandú 2");
  assert.equal(avisoDelPanel(contenedor).textContent, "Personaje importado.");

  P.cerrar();
});

test("nombre de viajero: acepta 12 caracteres y rechaza 13 sin emitir cambio", () => {
  const { P, D } = cargar();
  const contenedor = new Documento().createElement("div");
  const llamadas = [];
  P.abrir(contenedor, opcionesBase(D, { onCambio: (e) => llamadas.push(e) }));

  const nombre = control(contenedor, "Nombre de viajero");
  nombre.value = "ABCDEFGHIJKLM";
  nombre.disparar("input");
  assert.equal(llamadas.length, 0);
  assert.equal(nombre.getAttribute("aria-invalid"), "true");

  nombre.value = "ABCDEFGHIJKL";
  nombre.disparar("input");
  assert.equal(llamadas.length, 1);
  assert.equal(llamadas[0].personaje.nombre, "ABCDEFGHIJKL");
  assert.equal(nombre.getAttribute("aria-invalid"), "false");

  P.cerrar();
});

test("equipar y desequipar mueven la pieza entre inventario y ranura", () => {
  const { P, D } = cargar();
  const contenedor = new Documento().createElement("div");
  const llamadas = [];
  const pieza = {
    ranura: "casco",
    rareza: "raro",
    zona: 2,
    forja: 0,
    set: "cristal",
    modificadores: [
      { id: "vida", valor: 9 },
      { id: "armadura", valor: 3 },
    ],
  };
  P.abrir(contenedor, opcionesBase(D, { inventario: [pieza], onCambio: (e) => llamadas.push(e) }));
  boton(contenedor, "Pestaña EQUIPO").disparar("click");

  botonQue(contenedor, "Equipar en Casco").disparar("click");
  assert.equal(llamadas[0].inventario.length, 0);
  assert.equal(llamadas[0].equipadas.casco.ranura, "casco");

  boton(contenedor, "Desequipar Casco").disparar("click");
  assert.equal(llamadas[1].inventario.length, 1);
  assert.equal(llamadas[1].equipadas.casco, null);

  P.cerrar();
});

test("tres piezas del mismo set activan el bono y el resumen lo muestra", () => {
  const { P, D } = cargar();
  const contenedor = new Documento().createElement("div");
  const pieza = (ranura) => ({
    ranura,
    rareza: "epico",
    zona: 4,
    forja: 0,
    set: "chatarra",
    modificadores: [{ id: "armadura", valor: 4 }],
  });
  P.abrir(
    contenedor,
    opcionesBase(D, {
      equipadas: { casco: pieza("casco"), pecho: pieza("pecho"), piernas: pieza("piernas") },
    }),
  );
  boton(contenedor, "Pestaña EQUIPO").disparar("click");

  const texto = contenedor.textContent;
  assert.match(texto, /Set Chatarra: 3 de 3 piezas\. Bono activo: Daño \+10 %/);
  assert.match(texto, /Daño: \+10 %/, "el bono de set suma al total de daño");
  assert.match(texto, /Armadura: \+12 %/, "tres piezas con armadura 4 suman 12");

  P.cerrar();
});

test("tono, brillo y capa cambian el personaje; la capa usa aria-pressed", () => {
  const { P, D } = cargar();
  const contenedor = new Documento().createElement("div");
  const llamadas = [];
  P.abrir(contenedor, opcionesBase(D, { onCambio: (e) => llamadas.push(e) }));

  control(contenedor, "Tono").value = "210";
  control(contenedor, "Tono").disparar("input");
  assert.equal(llamadas.at(-1).personaje.traje.tono, 210);

  control(contenedor, "Brillo").value = "15";
  control(contenedor, "Brillo").disparar("input");
  assert.equal(llamadas.at(-1).personaje.traje.brillo, 15);

  assert.equal(boton(contenedor, "Capa visible").getAttribute("aria-pressed"), "true");
  boton(contenedor, "Capa visible").disparar("click");
  assert.equal(llamadas.at(-1).personaje.capa.on, false);
  assert.equal(boton(contenedor, "Capa visible").getAttribute("aria-pressed"), "false");

  P.cerrar();
});

test("un accesorio va en accesorio 1 o 2; las piezas no válidas se descartan con aviso", () => {
  const { P, D } = cargar();
  const contenedor = new Documento().createElement("div");
  const llamadas = [];
  const accesorio = {
    ranura: "accesorio1",
    rareza: "raro",
    zona: 1,
    forja: 0,
    set: null,
    modificadores: [{ id: "suerte", valor: 5 }],
  };
  const noValida = { ranura: "casco", rareza: "inventada", zona: 1, forja: 0, set: null, modificadores: [] };
  P.abrir(contenedor, opcionesBase(D, { inventario: [accesorio, noValida], onCambio: (e) => llamadas.push(e) }));
  assert.match(avisoDelPanel(contenedor).textContent, /Se descartó 1 pieza no válida\./);

  boton(contenedor, "Pestaña EQUIPO").disparar("click");
  botonQue(contenedor, "Equipar en Accesorio 2").disparar("click");
  assert.equal(llamadas[0].equipadas.accesorio2.ranura, "accesorio1");
  assert.equal(llamadas[0].equipadas.accesorio1, null);
  assert.equal(llamadas[0].inventario.length, 0);

  P.cerrar();
});

test("cerrar vacía el contenedor", () => {
  const { P, D } = cargar();
  const contenedor = new Documento().createElement("div");
  P.abrir(contenedor, opcionesBase(D));
  assert.ok(contenedor.hijos.length > 0);

  P.cerrar();
  assert.equal(contenedor.hijos.length, 0);
  assert.equal(contenedor.textContent, "");
});

test("un nombre con espacios de sobra se muestra, se cuenta y se emite ya recortado (9.1)", () => {
  const { P, D } = cargar();
  const contenedor = new Documento().createElement("div");
  const llamadas = [];
  const base = opcionesBase(D, { onCambio: (e) => llamadas.push(e) });
  base.personaje.nombre = "   Ana   Lu   ";
  P.abrir(contenedor, base);

  const nombre = control(contenedor, "Nombre de viajero");
  assert.equal(nombre.value, "Ana Lu", "el campo muestra el nombre recortado");
  assert.equal(todos(contenedor, (n) => n.atributos.class === "cp-contador")[0].textContent, "6 de 12 caracteres");
  assert.equal(nombre.getAttribute("aria-invalid"), "false");

  boton(contenedor, "Color del traje: Arena").disparar("click");
  assert.equal(llamadas[0].personaje.nombre, "Ana Lu", "lo que sale del panel va sin relleno");

  nombre.value = "  Ana   Lu  ";
  nombre.disparar("input");
  assert.equal(llamadas.at(-1).personaje.nombre, "Ana Lu", "al escribir también se recorta");

  P.cerrar();
});

test("EXPORTAR entrega el código, avisa de la selección y el código sirve para importar", () => {
  const { P, D } = cargar();
  const contenedor = new Documento().createElement("div");
  const entregados = [];
  P.abrir(contenedor, opcionesBase(D, { onExportar: (c) => entregados.push(c) }));

  boton(contenedor, "EXPORTAR código del viajero").disparar("click");

  const codigo = control(contenedor, "Código de exportación").value;
  assert.equal(entregados.length, 1, "onExportar recibe el código una vez");
  assert.equal(entregados[0], codigo);
  assert.equal(D.importarPersonaje(codigo).ok, true, "el código exportado se puede importar");
  assert.equal(avisoDelPanel(contenedor).textContent, "Código seleccionado: cópialo con Ctrl+C.");

  P.cerrar();
});

test("EXPORTAR copia con el portapapeles del navegador y avisa al terminar", async () => {
  const copiados = [];
  const navegador = { clipboard: { writeText: async (t) => void copiados.push(t) } };
  const { P, D } = cargar({ navigator: navegador });
  const contenedor = new Documento().createElement("div");
  P.abrir(contenedor, opcionesBase(D));

  boton(contenedor, "EXPORTAR código del viajero").disparar("click");
  await new Promise((r) => setTimeout(r, 0));

  const codigo = control(contenedor, "Código de exportación").value;
  assert.deepEqual(copiados, [codigo], "se copia exactamente el código del campo");
  assert.equal(avisoDelPanel(contenedor).textContent, "Código copiado.");

  P.cerrar();
});

test("si el portapapeles rechaza la copia, EXPORTAR deja el código seleccionado y avisa", async () => {
  const navegador = { clipboard: { writeText: () => Promise.reject(new Error("denegado")) } };
  const { P, D } = cargar({ navigator: navegador });
  const contenedor = new Documento().createElement("div");
  P.abrir(contenedor, opcionesBase(D));

  assert.doesNotThrow(() => boton(contenedor, "EXPORTAR código del viajero").disparar("click"));
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(avisoDelPanel(contenedor).textContent, "Código seleccionado: cópialo con Ctrl+C.");

  P.cerrar();
});

test("la ficha de pieza muestra el set por su nombre, sin repetir la palabra Set", () => {
  const { P, D } = cargar();
  const contenedor = new Documento().createElement("div");
  const pieza = {
    ranura: "casco",
    rareza: "raro",
    zona: 2,
    forja: 0,
    set: "chatarra",
    modificadores: [{ id: "armadura", valor: 3 }],
  };
  P.abrir(contenedor, opcionesBase(D, { inventario: [pieza] }));
  boton(contenedor, "Pestaña EQUIPO").disparar("click");

  const sets = todos(contenedor, (n) => n.atributos.class === "cp-set").map((n) => n.textContent);
  assert.deepEqual(sets, ["Set Chatarra"]);

  P.cerrar();
});
