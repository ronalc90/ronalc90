// Pruebas de docs/ceniza/historia.js (Ceniza, textos de la historia).
// Ejecutar desde la raíz del repo: node --test scripts/ceniza-tests/historia.test.mjs
// Los archivos se cargan con vm.runInNewContext, como scripts clásicos del navegador.
// Los objetos creados dentro del contexto son de otro realm: se copian con JSON.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function cargar(archivo, global) {
  const contexto = {};
  vm.runInNewContext(
    fs.readFileSync(path.join(RAIZ, "docs", "ceniza", archivo), "utf8"),
    contexto,
    { filename: archivo },
  );
  return contexto[global];
}

const H = cargar("historia.js", "CenizaHistoria");
const D = cargar("datos.js", "CenizaDatos");
const M = cargar("mundo.js", "CenizaMundo");

// Copia en JSON para sacar los datos del realm del contexto (quita las funciones).
const plano = (x) => JSON.parse(JSON.stringify(x));
const HIST = plano(H);

const LIMITE = 140;
const MARCADORES = ["nombre", "traje", "visor"];
const EMOJI = /\p{Extended_Pictographic}/u;
const esTipoError = (nombre) => (e) => e && e.name === nombre;

// Nombre de 12 caracteres (el máximo del docs 9.1) y el color más largo de las opciones de personalización.
const NOMBRE_LARGO = "Ximena Ortíz";
const COLOR_LARGO = "carmesí";

const ZONAS_IDS = [1, 2, 3, 4];
const JEFE_DE_ZONA = { 1: "guardian-duna", 2: "centinela-cristal", 3: "forjador", 4: "guardian-chatarra" };
const JEFES = Object.values(JEFE_DE_ZONA);

// Rutas de todos los textos (cadenas) de la historia, en forma "zonas.1.entrada.0".
function rutasDeTextos(obj, ruta = []) {
  if (typeof obj === "string") return [ruta.join(".")];
  if (obj && typeof obj === "object") {
    return Object.keys(obj).flatMap((k) => rutasDeTextos(obj[k], [...ruta, k]));
  }
  return [];
}
const RUTAS = rutasDeTextos(HIST);
const textoPlano = (ruta) => ruta.split(".").reduce((obj, parte) => obj[parte], HIST);

// Textos que deben existir: cada zona, jefe, fogata, sector, fase y final.
const REQUERIDAS = [
  ...ZONAS_IDS.flatMap((id) => [`zonas.${id}.entrada.0`, `zonas.${id}.entrada.1`, `zonas.${id}.trasJefe`]),
  ...JEFES.flatMap((j) => [`jefes.${j}.antesDelCombate`, `jefes.${j}.alCaer`]),
  ...[0, 1, 2, 3, 4].map((i) => `fogatas.${i}`),
  "fase3D.entrada",
  "fase3D.S1",
  "fase3D.S2",
  "fase3D.S3",
  "fase3D.coloso.0",
  "fase3D.coloso.1",
  "fase3D.coloso.2",
  "final.victoria.0",
  "final.victoria.1",
  "final.pregunta",
];

test("las zonas van de 1 a 4, cada una con dos líneas de entrada y un texto tras el jefe", () => {
  assert.deepEqual(Object.keys(HIST.zonas).sort(), ["1", "2", "3", "4"]);
  for (const id of ZONAS_IDS) {
    const zona = HIST.zonas[id];
    assert.ok(Array.isArray(zona.entrada), `zona ${id}: entrada debe ser una lista`);
    assert.equal(zona.entrada.length, 2, `zona ${id}: entrada debe tener dos líneas`);
    assert.equal(typeof zona.trasJefe, "string", `zona ${id}: trasJefe debe ser un texto`);
  }
});

test("cada jefe tiene texto antes del combate y al caer", () => {
  assert.deepEqual(Object.keys(HIST.jefes).sort(), [...JEFES].sort());
  for (const j of JEFES) {
    assert.equal(typeof HIST.jefes[j].antesDelCombate, "string", `${j}: antesDelCombate`);
    assert.equal(typeof HIST.jefes[j].alCaer, "string", `${j}: alCaer`);
  }
});

test("las fogatas son cinco líneas, una por acción", () => {
  assert.ok(Array.isArray(HIST.fogatas));
  assert.equal(HIST.fogatas.length, 5);
});

test("la fase 3D tiene entrada, S1, S2, S3 y el Coloso con sus tres fases", () => {
  assert.equal(typeof HIST.fase3D.entrada, "string");
  assert.equal(typeof HIST.fase3D.S1, "string");
  assert.equal(typeof HIST.fase3D.S2, "string");
  assert.equal(typeof HIST.fase3D.S3, "string");
  assert.ok(Array.isArray(HIST.fase3D.coloso));
  assert.equal(HIST.fase3D.coloso.length, 3);
});

test("el final tiene dos líneas de victoria y una pregunta", () => {
  assert.ok(Array.isArray(HIST.final.victoria));
  assert.equal(HIST.final.victoria.length, 2);
  assert.equal(typeof HIST.final.pregunta, "string");
  assert.ok(HIST.final.pregunta.endsWith("?"), "la pregunta debe terminar en interrogación");
});

test("cada zona, jefe, sector y fase tiene texto no vacío", () => {
  for (const ruta of REQUERIDAS) {
    const valor = textoPlano(ruta);
    assert.equal(typeof valor, "string", `${ruta} debe ser un texto`);
    assert.ok(valor.trim().length > 0, `${ruta} no puede estar vacío`);
  }
});

test("ninguna línea pasa de 140 caracteres, tal cual y con el nombre y colores más largos", () => {
  for (const ruta of RUTAS) {
    const linea = textoPlano(ruta);
    assert.ok(linea.length <= LIMITE, `${ruta}: ${linea.length} caracteres sin sustituir`);
    const renderizada = H.texto(ruta, { nombre: NOMBRE_LARGO, traje: COLOR_LARGO, visor: COLOR_LARGO });
    assert.ok(renderizada.length <= LIMITE, `${ruta}: ${renderizada.length} caracteres sustituidos`);
  }
});

test("ninguna línea contiene emojis", () => {
  for (const ruta of RUTAS) {
    assert.ok(!EMOJI.test(textoPlano(ruta)), `${ruta} contiene un emoji`);
  }
});

test("los marcadores son solo {nombre}, {traje} o {visor}", () => {
  for (const ruta of RUTAS) {
    const linea = textoPlano(ruta);
    const aperturas = (linea.match(/\{/g) || []).length;
    const cierres = (linea.match(/\}/g) || []).length;
    assert.equal(aperturas, cierres, `${ruta}: llaves sin cerrar`);
    for (const [, marca] of linea.matchAll(/\{([^{}]*)\}/g)) {
      assert.ok(MARCADORES.includes(marca), `${ruta}: marcador no permitido {${marca}}`);
    }
  }
});

test("las armas de cada sector 3D son las del docs 11.1 (rifle en S1, escopeta en S2, plasma en S3)", () => {
  assert.match(HIST.fase3D.S1, /rifle/i);
  assert.match(HIST.fase3D.S2, /escopeta/i);
  assert.match(HIST.fase3D.S3, /plasma/i);
});

test("los nombres de zonas, jefes y sectores coinciden con datos.js y mundo.js", () => {
  const zonasDatos = plano(D.ZONAS);
  const zonasMundo = plano(M.ZONAS);
  const enemigos = plano(M.TIPOS_ENEMIGO);
  const sectoresDatos = plano(D.SECTORES);

  for (const id of ZONAS_IDS) {
    const zonaDatos = zonasDatos.find((z) => z.id === id);
    const zonaMundo = zonasMundo.find((z) => z.id === id);
    assert.equal(HIST.nombres.zonas[id], zonaDatos.nombre, `zona ${id} en datos.js`);
    assert.equal(HIST.nombres.zonas[id], zonaMundo.nombre, `zona ${id} en mundo.js`);

    const jefe = JEFE_DE_ZONA[id];
    assert.equal(HIST.nombres.jefes[jefe], zonaDatos.jefe, `jefe de la zona ${id} en datos.js`);
    assert.equal(HIST.nombres.jefes[jefe], zonaMundo.jefe, `jefe de la zona ${id} en mundo.js`);
    assert.equal(enemigos[jefe].clase, "jefe", `${jefe} es jefe en mundo.js`);
    assert.equal(enemigos[jefe].zona, id, `${jefe} pertenece a la zona ${id}`);
  }

  assert.deepEqual(Object.keys(HIST.nombres.jefes).sort(), [...JEFES].sort());
  assert.deepEqual(
    Object.keys(HIST.nombres.sectores).sort(),
    sectoresDatos.map((s) => s.id).sort(),
  );
  for (const sector of sectoresDatos) {
    assert.equal(HIST.nombres.sectores[sector.id], sector.nombre, `sector ${sector.id} en datos.js`);
  }
});

test("el objeto está congelado, también los anidados", () => {
  const comprobar = (x) => {
    if (x && typeof x === "object") {
      assert.ok(Object.isFrozen(x), "un objeto anidado no está congelado");
      for (const v of Object.values(x)) comprobar(v);
    }
  };
  comprobar(H);
  // Error de otro realm: se identifica por nombre, no por instanceof.
  assert.throws(() => { H.fogatas[0] = "otro texto"; }, esTipoError("TypeError"));
  assert.throws(() => { H.zonas[1].entrada.push("otra línea"); }, esTipoError("TypeError"));
});

test("texto() sustituye {nombre}, {traje} y {visor} por los datos", () => {
  const datos = { nombre: "Ana", traje: "cobalto", visor: "cian" };
  assert.equal(
    H.texto("zonas.1.entrada.0", datos),
    HIST.zonas[1].entrada[0].replace("{traje}", "cobalto"),
  );
  assert.equal(
    H.texto("zonas.2.entrada.0", datos),
    HIST.zonas[2].entrada[0].replace("{visor}", "cian"),
  );
  assert.equal(
    H.texto("fogatas.3", datos),
    HIST.fogatas[3].replace("{nombre}", "Ana"),
  );
  assert.equal(H.texto("zonas.3.trasJefe", datos).includes("Ana"), true);
  assert.equal(H.texto("fogatas.0", datos), HIST.fogatas[0]);
});

test("texto() usa los valores por defecto si faltan datos", () => {
  assert.equal(
    H.texto("zonas.1.entrada.0"),
    HIST.zonas[1].entrada[0].replace("{traje}", "ceniza"),
  );
  assert.equal(
    H.texto("zonas.2.entrada.0", {}),
    HIST.zonas[2].entrada[0].replace("{visor}", "ámbar"),
  );
  assert.equal(
    H.texto("fogatas.3"),
    HIST.fogatas[3].replace("{nombre}", "viajero"),
  );
  assert.equal(
    H.texto("final.victoria.1", { traje: "cobalto" }),
    HIST.final.victoria[1].replace("{nombre}", "viajero"),
  );
});

test("texto() trata un dato vacío o no textual como ausente", () => {
  assert.equal(
    H.texto("fogatas.3", { nombre: "   " }),
    HIST.fogatas[3].replace("{nombre}", "viajero"),
  );
  assert.equal(
    H.texto("fogatas.3", { nombre: 42 }),
    HIST.fogatas[3].replace("{nombre}", "viajero"),
  );
});

test("texto() lanza RangeError con una ruta que no es un texto", () => {
  const esRango = (e) => e && e.name === "RangeError";
  assert.throws(() => H.texto("zonas.9.entrada.0"), esRango);
  assert.throws(() => H.texto("jefes.no-existe.alCaer"), esRango);
  assert.throws(() => H.texto("fogatas.5"), esRango);
  assert.throws(() => H.texto("zonas.1"), esRango);
  assert.throws(() => H.texto("__proto__"), esRango);
});

test("ningún marcador abre una frase ni va justo después de un punto", () => {
  for (const ruta of RUTAS) {
    const linea = textoPlano(ruta);
    assert.ok(!/^\s*\{/.test(linea), `${ruta}: la línea empieza por un marcador`);
    assert.ok(!/[.!?»]\s+\{(nombre|traje|visor)\}/.test(linea), `${ruta}: un marcador abre frase`);
  }
});

test("los colores se escriben con tilde, también cuando llega su id de datos.js", () => {
  const entrada = (zona, datos) => H.texto(`zonas.${zona}.entrada.0`, datos);
  assert.equal(entrada(1, { traje: "oxido" }), HIST.zonas[1].entrada[0].replace("{traje}", "óxido"));
  assert.equal(entrada(1, { traje: "carmesi" }), HIST.zonas[1].entrada[0].replace("{traje}", "carmesí"));
  assert.equal(entrada(1, { traje: "ambar" }), HIST.zonas[1].entrada[0].replace("{traje}", "ámbar"));
  assert.equal(H.texto("zonas.2.entrada.0", { visor: "ambar" }), HIST.zonas[2].entrada[0].replace("{visor}", "ámbar"));
  assert.equal(H.texto("zonas.2.entrada.0", { visor: "cian" }), HIST.zonas[2].entrada[0].replace("{visor}", "cian"));
  // Un nombre ya escrito con tilde no cambia.
  assert.equal(entrada(1, { traje: "óxido" }), HIST.zonas[1].entrada[0].replace("{traje}", "óxido"));
});

test("el nombre del viajero no se traduce aunque coincida con un id de color", () => {
  assert.equal(H.texto("fogatas.3", { nombre: "ambar" }), HIST.fogatas[3].replace("{nombre}", "ambar"));
});

test("los valores por defecto coinciden con el personaje por defecto de datos.js", () => {
  const defecto = plano(D.personajePorDefecto());
  assert.equal(defecto.traje.color, "ceniza");
  assert.equal(defecto.visor.color, "ambar");
  assert.equal(H.texto("zonas.1.entrada.0"), HIST.zonas[1].entrada[0].replace("{traje}", "ceniza"));
  assert.equal(H.texto("zonas.2.entrada.0"), HIST.zonas[2].entrada[0].replace("{visor}", "ámbar"));
});

test("la zona 4 desbloquea la FASE 3D, el mismo nombre que usan la historia y el diseño", () => {
  const zona4 = plano(D.ZONAS).find((z) => z.id === 4);
  assert.equal(zona4.desbloquea, "FASE 3D");
});

test("la línea final no empieza por el nombre del viajero, que puede ser el valor por defecto", () => {
  assert.ok(!HIST.final.victoria[1].startsWith("{nombre}"));
  assert.match(H.texto("final.victoria.1"), /^Sobre el metal queda la huella de viajero\./);
});
