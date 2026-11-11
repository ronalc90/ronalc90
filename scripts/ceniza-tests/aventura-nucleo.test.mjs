// Pruebas de docs/ceniza/aventura-nucleo.js (Ceniza).
// Ejecutar desde la raíz del repo: node --test scripts/ceniza-tests/
// Los archivos se cargan con vm.runInNewContext, como scripts clásicos del navegador,
// en el orden datos.js, mundo.js y aventura-nucleo.js.
// Los objetos creados dentro del contexto son de otro realm: se comparan con JSON.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const contexto = {};
for (const archivo of ["datos.js", "mundo.js", "aventura-nucleo.js"]) {
  vm.runInNewContext(
    fs.readFileSync(path.join(RAIZ, "docs", "ceniza", archivo), "utf8"),
    contexto,
    { filename: archivo },
  );
}
const N = contexto.CenizaAventuraNucleo;

// Copia en JSON para sacar los objetos del realm del contexto.
const plano = (x) => JSON.parse(JSON.stringify(x));

// Error de otro realm: se identifica por nombre, no por instanceof.
const esError = (nombre) => (e) => e && e.name === nombre;

// Generador pseudoaleatorio determinista (LCG) para que las pruebas se repitan igual.
function rngSemilla(semilla) {
  let x = semilla >>> 0;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 4294967296;
  };
}

// Cuenta las llamadas a Math.random del contexto del núcleo (otro realm) mientras corre fn.
function contarLlamadasRandom(fn) {
  const mathCtx = vm.runInContext("Math", contexto);
  const original = mathCtx.random;
  let llamadas = 0;
  mathCtx.random = () => { llamadas++; return original(); };
  try {
    fn();
  } finally {
    mathCtx.random = original;
  }
  return llamadas;
}

// Pieza válida de la forma que genera datos.js (forja +0, rareza común con un modificador).
// La rareza sigue al número de modificadores: 1 común, 2 poco común y 3 épico (datos.js).
const RAREZA_POR_MODIFICADORES = { 1: "comun", 2: "poco_comun", 3: "epico" };
const pieza = (ranura, modificadores = [{ id: "vida", valor: 6 }], extra = {}) => ({
  ranura, rareza: RAREZA_POR_MODIFICADORES[modificadores.length], zona: 1, forja: 0, set: null, modificadores, ...extra,
});
const redondear3 = (x) => Math.round(x * 1000) / 1000;

// Partida nueva con XP suficiente para un nivel dado (sin tocar nada más).
const enNivel = (n) => N.ganarXp(N.crearPartida({ semilla: 7 }), N.umbralNivel(n));

test("crearPartida produce una partida válida y serializable", () => {
  const p = N.crearPartida({ semilla: 42 });
  assert.equal(p.nivel, 1);
  assert.equal(p.xp, 0);
  assert.equal(p.puntosLibres, 0);
  assert.equal(p.vida, 100);
  assert.equal(p.vida, N.statsJugador(p).vidaMax);
  assert.equal(p.sala, "Z1.1");
  assert.equal(p.ultimaFogata, "Z1.1");
  assert.equal(p.faseActual, "2d");
  assert.equal(p.muerto, false);
  assert.equal(p.semilla, 42);
  // Ningún valor del árbol es undefined ni NaN. (Comparar el JSON con plano(p) no lo demuestra:
  // plano hace la misma ida y vuelta y ambos lados salen iguales.)
  const revisar = (x, ruta) => {
    assert.notEqual(x, undefined, "undefined en " + ruta);
    if (typeof x === "number") assert.ok(!Number.isNaN(x), "NaN en " + ruta);
    if (x !== null && typeof x === "object") for (const k of Object.keys(x)) revisar(x[k], ruta + "." + k);
  };
  revisar(p, "p");
  // Control de serialización: el JSON ida y vuelta conserva la partida.
  assert.deepEqual(JSON.parse(JSON.stringify(p)), plano(p));
  const r = N.deserializar(N.serializar(p));
  assert.equal(r.ok, true, r.error);
  assert.throws(() => N.crearPartida({ semilla: -1 }), esError("RangeError"));
  assert.throws(() => N.crearPartida({ personaje: { nombre: "" } }), esError("TypeError"));
});

test("serializar y deserializar devuelven una partida idéntica", () => {
  let p = N.crearPartida({ semilla: 3 });
  p = N.ganarXp(p, 700);
  p = N.invertirPunto(p, "vida").partida;
  p = N.anadirPieza(p, pieza("casco", [{ id: "vida", valor: 6 }, { id: "suerte", valor: 3 }]));
  p = N.equipar(p, "p1").partida;
  p.nucleos = 55;
  p.nucleosSala = 12;
  p.chatarra = 80;
  const texto = N.serializar(p);
  assert.match(texto, /"version":"ceniza\.aventura\.v1"/);
  const r = N.deserializar(texto);
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(plano(r.partida), plano(p));
  assert.equal(N.serializar(r.partida), texto);
});

test("deserializar de texto corrupto devuelve ok false sin lanzar", () => {
  const valido = N.serializar(N.crearPartida({ semilla: 1 }));
  const copia = JSON.parse(valido);
  const malos = [
    "",
    "{",
    "no es json",
    "null",
    "42",
    null,
    undefined,
    42,
    {},
    JSON.stringify({ version: "otra", partida: copia.partida }),
    JSON.stringify({ partida: copia.partida }),
    JSON.stringify({ version: "ceniza.aventura.v1" }),
    JSON.stringify({ version: "ceniza.aventura.v1", partida: { ...copia.partida, nivel: 99 } }),
    JSON.stringify({ version: "ceniza.aventura.v1", partida: { ...copia.partida, sala: "Z9.9" } }),
    JSON.stringify({ version: "ceniza.aventura.v1", partida: { ...copia.partida, puntosLibres: 5 } }),
    JSON.stringify({ version: "ceniza.aventura.v1", partida: { ...copia.partida, faseActual: "4d" } }),
    JSON.stringify({ version: "ceniza.aventura.v1", partida: { ...copia.partida, muerto: "si" } }),
  ];
  for (const m of malos) {
    let r;
    assert.doesNotThrow(() => { r = N.deserializar(m); }, `no debe lanzar: ${String(m).slice(0, 40)}`);
    assert.equal(r.ok, false, `debería fallar: ${String(m).slice(0, 40)}`);
    assert.equal(typeof r.error, "string");
  }
});

test("deserializar nunca lanza ante texto aleatorio", () => {
  const r = rngSemilla(21);
  const alfabeto = 'ceniza.aventura.v1{}[]":,0123456789 abc\\';
  const base = N.serializar(N.crearPartida({ semilla: 5 }));
  for (let i = 0; i < 300; i++) {
    let texto = "";
    const largo = Math.floor(r() * 80);
    for (let k = 0; k < largo; k++) texto += alfabeto[Math.floor(r() * alfabeto.length)];
    const mutado = base.slice(0, Math.floor(r() * base.length)) + texto;
    assert.doesNotThrow(() => N.deserializar(texto));
    assert.doesNotThrow(() => N.deserializar(mutado));
  }
});

test("curva de XP: sube de nivel en el umbral exacto y da 3 puntos por nivel", () => {
  assert.equal(N.umbralNivel(1), 0);
  assert.equal(N.umbralNivel(2), 121);
  assert.equal(N.umbralNivel(30), 9235);
  for (let n = 2; n <= 30; n++) {
    const umbral = N.umbralNivel(n);
    assert.equal(N.nivelPorXp(umbral), n, `en ${umbral} XP debe ser nivel ${n}`);
    assert.equal(N.nivelPorXp(umbral - 1), n - 1, `en ${umbral - 1} XP debe seguir en ${n - 1}`);
  }
  // Paso a paso: 120 XP sigue en nivel 1; 121 sube a nivel 2 con 3 puntos.
  let p = N.crearPartida({ semilla: 1 });
  p = N.ganarXp(p, 120);
  assert.equal(p.nivel, 1);
  assert.equal(p.puntosLibres, 0);
  p = N.ganarXp(p, 1);
  assert.equal(p.nivel, 2);
  assert.equal(p.puntosLibres, 3);
  // Subida de varios niveles de una vez: 3 puntos por cada nivel ganado.
  const salto = N.ganarXp(N.crearPartida({ semilla: 1 }), N.umbralNivel(6));
  assert.equal(salto.nivel, 6);
  assert.equal(salto.puntosLibres, 15);
});

test("nivel máximo 30 con 87 puntos totales, sin pasar del tope", () => {
  const p = N.ganarXp(N.crearPartida({ semilla: 1 }), 10 ** 6);
  assert.equal(p.nivel, 30);
  assert.equal(p.puntosLibres, 87);
  assert.equal(p.xp, 10 ** 6);
  assert.throws(() => N.ganarXp(p, -1), esError("RangeError"));
  assert.throws(() => N.ganarXp(p, 1.5), esError("RangeError"));
});

test("ganarXp no modifica la partida que recibe", () => {
  const p = N.crearPartida({ semilla: 1 });
  const antes = JSON.stringify(p);
  N.ganarXp(p, 500);
  assert.equal(JSON.stringify(p), antes);
});

test("invertirPunto: gasta un punto y rechaza atributos inventados", () => {
  const p = enNivel(2);
  const ok = N.invertirPunto(p, "vida");
  assert.equal(ok.ok, true, ok.error);
  assert.equal(ok.partida.atributos.vida, 1);
  assert.equal(ok.partida.puntosLibres, 2);
  assert.equal(N.statsJugador(ok.partida).vidaMax, 108);
  for (const malo of ["constructor", "inventado", "Vida", "__proto__", "", undefined, 3]) {
    const r = N.invertirPunto(p, malo);
    assert.equal(r.ok, false, `debería rechazar ${String(malo)}`);
    assert.equal(typeof r.error, "string");
    assert.deepEqual(plano(r.partida), plano(p), "la partida no cambia al fallar");
  }
  const sinPuntos = N.invertirPunto(N.crearPartida({ semilla: 1 }), "dano");
  assert.equal(sinPuntos.ok, false);
});

test("reiniciarAtributos cobra 200 núcleos, rechaza si no hay y devuelve los puntos", () => {
  let p = enNivel(2);
  p = N.invertirPunto(p, "vida").partida;
  p = N.invertirPunto(p, "suerte").partida;
  p.nucleos = 199;
  const corto = N.reiniciarAtributos(p);
  assert.equal(corto.ok, false);
  assert.equal(corto.partida.nucleos, 199);
  assert.equal(corto.partida.puntosLibres, 1);

  p.nucleos = 200;
  const r = N.reiniciarAtributos(p);
  assert.equal(r.ok, true, r.error);
  assert.equal(r.partida.nucleos, 0, "cobra exactamente 200");
  assert.equal(r.partida.puntosLibres, 3, "devuelve todos los puntos");
  assert.deepEqual(plano(r.partida.atributos), { vida: 0, dano: 0, armadura: 0, velocidad: 0, suerte: 0 });
  assert.equal(r.partida.nivel, 2, "no cambia el nivel");
  assert.equal(r.partida.xp, p.xp, "no cambia la XP");
});

test("bonos de atributos: vida 8 HP, daño 3 %, armadura 2 %, velocidad 2 %, suerte 3 %", () => {
  let p = enNivel(10);
  for (let i = 0; i < 2; i++) p = N.invertirPunto(p, "vida").partida;
  p = N.invertirPunto(p, "dano").partida;
  for (let i = 0; i < 3; i++) p = N.invertirPunto(p, "armadura").partida;
  p = N.invertirPunto(p, "velocidad").partida;
  for (let i = 0; i < 4; i++) p = N.invertirPunto(p, "suerte").partida;
  const s = plano(N.statsJugador(p));
  assert.equal(s.vidaMax, 116);
  assert.equal(redondear3(s.multiplicadorDano), 1.03);
  assert.equal(redondear3(s.armadura), 0.06);
  assert.equal(redondear3(s.multiplicadorVelocidad), 1.02);
  // La suerte de rareza va en puntos (docs 8.3): 4 puntos de atributo son 4, no el 12 % del bono.
  assert.equal(s.suerte, 4);
  assert.equal(contexto.CenizaDatos.bonoDeAtributos(p.atributos).suerte, 12, "la hoja del personaje sigue en %");
  assert.deepEqual(s.setsActivos, []);
});

// Id de la última pieza añadida al inventario (anadirPieza devuelve la partida).
const ultimoId = (p) => p.inventario[p.inventario.length - 1].id;

test("equipar pone la pieza en su ranura y devuelve la anterior al inventario", () => {
  let p = N.crearPartida({ semilla: 1 });
  p = N.anadirPieza(p, pieza("casco"));
  const primera = ultimoId(p);
  p = N.anadirPieza(p, pieza("casco", [{ id: "suerte", valor: 4 }]));
  const segunda = ultimoId(p);
  assert.notEqual(primera, segunda);

  const e1 = N.equipar(p, primera);
  assert.equal(e1.ok, true, e1.error);
  assert.equal(e1.partida.equipo.casco.id, primera);
  assert.deepEqual(plano(e1.partida.inventario).map((x) => x.id), [segunda]);

  // Cambiar de pieza en la misma ranura: la anterior vuelve al inventario.
  const e2 = N.equipar(e1.partida, segunda);
  assert.equal(e2.ok, true, e2.error);
  assert.equal(e2.partida.equipo.casco.id, segunda);
  assert.deepEqual(plano(e2.partida.inventario).map((x) => x.id), [primera]);

  // Una pieza ya equipada o inexistente no se puede equipar.
  assert.equal(N.equipar(e2.partida, segunda).ok, false);
  assert.equal(N.equipar(p, "p99").ok, false);

  // Una pieza de otra ranura va a su propia ranura sin tocar el casco.
  const botas = N.anadirPieza(e2.partida, pieza("botas", [{ id: "velocidad", valor: 3 }]));
  const e3 = N.equipar(botas, ultimoId(botas));
  assert.equal(e3.partida.equipo.botas.ranura, "botas");
  assert.equal(e3.partida.equipo.casco.id, segunda);

  // Desequipar pasa la pieza al inventario; una ranura vacía no se puede desequipar.
  const d = N.desequipar(e3.partida, "casco");
  assert.equal(d.ok, true, d.error);
  assert.equal(d.partida.equipo.casco, null);
  assert.ok(d.partida.inventario.some((x) => x.id === segunda));
  assert.equal(N.desequipar(d.partida, "casco").ok, false);
  assert.equal(N.desequipar(d.partida, "arma_inventada").ok, false);
});

test("armadura: las piezas suman y el total nunca pasa de 0,6", () => {
  let p = N.crearPartida({ semilla: 1 });
  p = N.anadirPieza(p, pieza("pecho", [{ id: "armadura", valor: 6 }]));
  p = N.equipar(p, ultimoId(p)).partida;
  assert.equal(Math.round(N.statsJugador(p).armadura * 1000) / 1000, 0.06);
  p = N.anadirPieza(p, pieza("piernas", [{ id: "armadura", valor: 70 }]));
  p = N.equipar(p, ultimoId(p)).partida;
  assert.equal(N.statsJugador(p).armadura, 0.6);
});

test("sets: 3 piezas del mismo set activan +15 HP; 2 piezas no", () => {
  const vida6 = [{ id: "vida", valor: 6 }];
  let p = N.crearPartida({ semilla: 1 });
  for (const ranura of ["casco", "pecho"]) {
    p = N.anadirPieza(p, pieza(ranura, vida6, { set: "cristal" }));
    p = N.equipar(p, ultimoId(p)).partida;
  }
  assert.deepEqual(plano(N.statsJugador(p).setsActivos), []);
  assert.equal(N.statsJugador(p).vidaMax, 112);
  p = N.anadirPieza(p, pieza("piernas", vida6, { set: "cristal" }));
  p = N.equipar(p, ultimoId(p)).partida;
  const s = plano(N.statsJugador(p));
  assert.deepEqual(s.setsActivos, ["cristal"]);
  assert.equal(s.vidaMax, 100 + 18 + 15);
});

test("forjar sube de +0 a +5 con los costos del diseño y rechaza más", () => {
  let p = N.crearPartida({ semilla: 1 });
  p.chatarra = 1000;
  p = N.anadirPieza(p, pieza("casco"));
  const id = ultimoId(p);
  const costos = [5, 14, 26, 40, 56];
  for (let nivel = 0; nivel < 5; nivel++) {
    const antes = p.chatarra;
    const r = N.forjar(p, id);
    assert.equal(r.ok, true, r.error);
    assert.equal(antes - r.partida.chatarra, costos[nivel], `costo de +${nivel} a +${nivel + 1}`);
    assert.equal(r.partida.inventario.find((x) => x.id === id).forja, nivel + 1);
    p = r.partida;
  }
  assert.equal(p.chatarra, 1000 - 141, "llevar una pieza a +5 cuesta 141");
  const tope = N.forjar(p, id);
  assert.equal(tope.ok, false);
  assert.equal(tope.partida.inventario.find((x) => x.id === id).forja, 5);

  // La forja multiplica todos los modificadores por 1 + 0,10 * nivel (docs 5.5): vida 6 a +5
  // da 9. Se ve en las estadísticas de la pieza equipada.
  const equipada = N.equipar(p, id);
  assert.equal(equipada.ok, true, equipada.error);
  assert.equal(N.statsJugador(equipada.partida).vidaMax, 100 + 9);

  // Sin chatarra suficiente no se forja, y la partida no cambia.
  let pobre = N.anadirPieza(N.crearPartida({ semilla: 1 }), pieza("casco"));
  pobre.chatarra = 4;
  const r = N.forjar(pobre, ultimoId(pobre));
  assert.equal(r.ok, false);
  assert.equal(r.partida.chatarra, 4);
  assert.equal(N.forjar(pobre, "p99").ok, false);
});

test("abrirCofre con rng fijo da recompensas deterministas", () => {
  const p = N.crearPartida({ semilla: 1 });
  const bajo = () => 0;
  const r1 = N.abrirCofre(p, "Z1.1#0", bajo);
  const r2 = N.abrirCofre(p, "Z1.1#0", bajo);
  assert.equal(r1.ok, true, r1.error);
  assert.deepEqual(plano(r1), plano(r2));
  assert.equal(r1.recompensa.tipo, "comun");
  assert.equal(r1.recompensa.xp, 30);
  assert.equal(r1.recompensa.nucleos, 20, "en rng 0, el mínimo del rango");
  assert.equal(r1.recompensa.chatarra, 10);
  assert.notEqual(r1.recompensa.pieza, null, "0 < 0,4: trae pieza");
  assert.equal(r1.recompensa.consumible, "curacion", "0 < 0,25 y 0 < 0,5");
  assert.equal(r1.partida.nucleosSala, 20, "los núcleos del cofre son de la sala, sin consolidar");
  assert.equal(r1.partida.nucleos, 0);
  assert.equal(r1.partida.chatarra, 10);
  assert.equal(r1.partida.xp, 30);
  assert.deepEqual(plano(r1.partida.cofresAbiertos), ["Z1.1#0"]);
  assert.equal(r1.partida.inventario.length, 1);

  const alto = N.abrirCofre(p, "Z1.1#0", () => 0.999);
  assert.equal(alto.recompensa.nucleos, 40, "en rng casi 1, el máximo del rango");
  assert.equal(alto.recompensa.pieza, null, "0,999 no es menor que 0,4");
  assert.equal(alto.recompensa.consumible, null);
  assert.equal(alto.partida.inventario.length, 0);
});

test("abrirCofre: un cofre se abre una sola vez y solo en la sala actual", () => {
  const p = N.crearPartida({ semilla: 1 });
  const r = N.abrirCofre(p, "Z1.1#0", rngSemilla(4));
  assert.equal(N.abrirCofre(r.partida, "Z1.1#0", rngSemilla(4)).ok, false, "ya abierto");
  assert.equal(N.abrirCofre(p, "Z1.2#0", rngSemilla(4)).ok, false, "cofre de otra sala");
  assert.equal(N.abrirCofre(p, "Z1.1#5", rngSemilla(4)).ok, false, "índice fuera de rango");
  assert.equal(N.abrirCofre(p, "Z1.1#x", rngSemilla(4)).ok, false, "índice no numérico");
  assert.equal(N.abrirCofre(p, "Z9.9#0", rngSemilla(4)).ok, false, "sala inexistente");
  assert.throws(() => N.abrirCofre(p, "Z1.1#0", 5), esError("TypeError"));
  let cualquiera;
  const llamadas = contarLlamadasRandom(() => { cualquiera = N.abrirCofre(p, "Z1.1#0"); });
  assert.equal(cualquiera.ok, true, cualquiera.error);
  assert.ok(llamadas > 0, "sin rng se llama a Math.random");
});

test("abrirCofre con semilla fija se repite igual", () => {
  const p = N.crearPartida({ semilla: 1 });
  const a = N.abrirCofre(p, "Z1.1#0", rngSemilla(77));
  const b = N.abrirCofre(p, "Z1.1#0", rngSemilla(77));
  assert.deepEqual(plano(a.partida), plano(b.partida));
});

test("danioAJugador aplica la armadura y marca muerto al llegar a 0", () => {
  let p = N.crearPartida({ semilla: 1 });
  p = N.anadirPieza(p, pieza("pecho", [{ id: "armadura", valor: 6 }]));
  p = N.equipar(p, ultimoId(p)).partida;
  const d1 = N.danioAJugador(p, 50);
  assert.equal(d1.vida, 53, "50 con 6 % de armadura hace 47");
  assert.equal(d1.muerto, false);
  const d2 = N.danioAJugador(d1, 60);
  assert.equal(d2.vida, 0, "la vida no baja de 0");
  assert.equal(d2.muerto, true);
  assert.equal(d2.muertes, 1, "la muerte cuenta una vez");
  assert.equal(N.danioAJugador(d2, 10).muertes, 1, "un muerto no vuelve a contar");
  assert.equal(N.danioAJugador(d2, 10).vida, 0);
  assert.throws(() => N.danioAJugador(p, -1), esError("RangeError"));
  assert.equal(N.danioAJugador(N.crearPartida({ semilla: 1 }), 100).muerto, true, "sin armadura, 100 mata");
});

test("alMorirVolverFogata pierde los núcleos de la sala actual y mantiene lo demás", () => {
  let p = N.crearPartida({ semilla: 1 });
  p = N.abrirCofre(p, "Z1.1#0", () => 0).partida;   // 20 núcleos y 10 chatarra en la sala actual
  p.nucleos = 30;
  const dentro = N.entrarSala(p, "Z1.2");
  assert.equal(dentro.ok, true, dentro.error);
  assert.equal(dentro.partida.nucleos, 30 + 20, "cruzar la puerta consolida los núcleos");
  assert.equal(dentro.partida.nucleosSala, 0);

  let q = dentro.partida;
  q = N.abrirCofre(q, "Z1.2#0", () => 0.999).partida;  // cofre raro: 100 núcleos y 50 de chatarra
  assert.equal(q.nucleosSala, 100);
  q = N.danioAJugador(q, 999);
  assert.equal(q.muerto, true);
  const vuelta = N.alMorirVolverFogata(q);
  assert.equal(vuelta.sala, "Z1.1", "vuelve a la última fogata");
  assert.equal(vuelta.nucleos, 50, "los consolidados se quedan");
  assert.equal(vuelta.nucleosSala, 0, "los núcleos de la sala actual se pierden");
  assert.equal(vuelta.chatarra, 60, "la chatarra no se pierde: 10 del comun y 50 del raro");
  assert.deepEqual(plano(vuelta.cofresAbiertos), ["Z1.1#0", "Z1.2#0"], "los cofres abiertos persisten");
  assert.equal(vuelta.vida, N.statsJugador(vuelta).vidaMax);
  assert.equal(vuelta.muerto, false);
  assert.equal(vuelta.muertes, 1);

  // Morir en la fogata sin cruzar puertas pierde los núcleos no consolidados.
  let f = N.crearPartida({ semilla: 1 });
  f.nucleosSala = 25;
  f = N.danioAJugador(f, 999);
  const enFogata = N.alMorirVolverFogata(f);
  assert.equal(enFogata.nucleos, 0);
  assert.equal(enFogata.nucleosSala, 0);

  // Si el viajero no ha muerto, la llamada no cambia nada.
  const vivo = N.alMorirVolverFogata({ ...plano(enFogata), nucleosSala: 5 });
  assert.equal(vivo.nucleosSala, 5, "un viajero vivo no pierde núcleos");
});

test("descansarEnFogata consolida núcleos y solo funciona en una sala con fogata", () => {
  let p = N.crearPartida({ semilla: 1 });
  p.nucleosSala = 10;
  p.vida = 40;
  const r = N.descansarEnFogata(p);
  assert.equal(r.nucleos, 10);
  assert.equal(r.nucleosSala, 0);
  assert.equal(r.vida, 100);
  assert.equal(r.ultimaFogata, "Z1.1");
  const sinFogata = N.entrarSala(p, "Z1.2").partida;
  assert.throws(() => N.descansarEnFogata(sinFogata), esError("RangeError"));
});

test("entrarSala: rechaza salas no alcanzables, puertas inexistentes y puertas de jefe cerradas", () => {
  const p = N.crearPartida({ semilla: 1 });
  assert.equal(N.entrarSala(p, "Z9.9").ok, false, "sala inexistente");
  assert.equal(N.entrarSala(p, "Z1.3").ok, false, "no hay puerta desde Z1.1 hacia Z1.3");
  assert.equal(N.entrarSala(p, "Z1.1").ok, false, "sin puerta a la misma sala");

  let q = p;
  for (const sala of ["Z1.2", "Z1.3", "Z1.JEFE"]) {
    const r = N.entrarSala(q, sala);
    assert.equal(r.ok, true, r.error);
    q = r.partida;
  }
  const cerrada = N.entrarSala(q, "Z2.1");
  assert.equal(cerrada.ok, false, "la puerta del jefe de Z1 sigue cerrada");
  assert.match(cerrada.error, /zona 1/);

  const abierta = N.registrarJefeVencido(q, "guardian-duna");
  const pasa = N.entrarSala(abierta, "Z2.1");
  assert.equal(pasa.ok, true, pasa.error);
  assert.equal(pasa.partida.sala, "Z2.1");

  // La puerta de Z2 exige al Centinela de cristal de su zona, no al de duna.
  let z2 = { ...plano(abierta), sala: "Z2.JEFE" };
  assert.equal(N.entrarSala(z2, "Z3.1").ok, false, "Guardián de duna no abre la puerta de Z2");
  z2 = N.registrarJefeVencido(z2, "centinela-cristal");
  z2 = { ...plano(z2), sala: "Z2.JEFE" };
  assert.equal(N.entrarSala(z2, "Z3.1").ok, true, "el Centinela de cristal sí abre Z3");

  const muerto = N.danioAJugador(N.crearPartida({ semilla: 1 }), 999);
  assert.equal(N.entrarSala(muerto, "Z1.2").ok, false, "un muerto no entra en salas");
});

test("registrarJefeVencido: guardian-chatarra pone faseActual 3d; las XP de zona son las del diseño", () => {
  const p = N.crearPartida({ semilla: 1 });
  const duna = N.registrarJefeVencido(p, "guardian-duna");
  assert.equal(duna.faseActual, "2d");
  assert.equal(duna.xp, 150);
  assert.deepEqual(plano(duna.jefesVencidos), ["guardian-duna"]);
  assert.equal(N.registrarJefeVencido(duna, "guardian-duna").xp, 150, "repetir un jefe no da XP");
  assert.equal(N.registrarJefeVencido(p, "centinela-cristal").xp, 200);
  assert.equal(N.registrarJefeVencido(p, "forjador").xp, 300);

  const chatarra = N.registrarJefeVencido(p, "guardian-chatarra");
  assert.equal(chatarra.faseActual, "3d");
  assert.equal(chatarra.xp, 400);
  assert.deepEqual(plano(chatarra.jefesVencidos), ["guardian-chatarra"]);
  assert.equal(p.faseActual, "2d", "la partida original no cambia");

  assert.throws(() => N.registrarJefeVencido(p, "arenero"), esError("RangeError"), "un enemigo común no es jefe");
  assert.throws(() => N.registrarJefeVencido(p, "inventado"), esError("RangeError"));
});

test("registrarVictoria pone faseActual victoria solo desde la fase 3D (CA-13)", () => {
  const p = N.crearPartida({ semilla: 1 });
  assert.equal(N.registrarVictoria(p).faseActual, "2d", "en 2D no hay victoria");
  const en3d = N.registrarJefeVencido(p, "guardian-chatarra");
  assert.equal(en3d.faseActual, "3d");
  const v = N.registrarVictoria(en3d);
  assert.equal(v.faseActual, "victoria");
  assert.equal(en3d.faseActual, "3d", "la partida recibida no cambia");
  assert.equal(p.faseActual, "2d");
});

test("registrarEnemigoVencido da 5 XP al común y 10 al élite; un jefe no entra aquí", () => {
  const p = N.crearPartida({ semilla: 1 });
  assert.equal(N.registrarEnemigoVencido(p, "arenero").xp, 5);
  assert.equal(N.registrarEnemigoVencido(p, "escarabajo").xp, 10);
  assert.throws(() => N.registrarEnemigoVencido(p, "guardian-duna"), esError("RangeError"));
  assert.throws(() => N.registrarEnemigoVencido(p, "constructor"), esError("RangeError"));
});

test("resumen expone los datos del HUD sin modificar la partida", () => {
  const p = N.crearPartida({ semilla: 1 });
  const antes = JSON.stringify(p);
  const r = plano(N.resumen(p));
  assert.equal(r.nivel, 1);
  assert.equal(r.xpSiguiente, 121);
  assert.equal(r.vidaMax, 100);
  assert.equal(r.zona, 1);
  assert.equal(r.fase, "2d");
  assert.equal(JSON.stringify(p), antes);
});

// ----------------------------------------------------------------- armas, maestría y secretos

// Partida nueva con el viajero en una sala concreta (copia JSON; no pasa por las puertas).
const enSala = (salaId) => ({ ...plano(N.crearPartida({ semilla: 1 })), sala: salaId });

test("crearPartida trae la hoja, los usos a cero y ningún secreto", () => {
  const p = N.crearPartida({ semilla: 1 });
  assert.deepEqual(plano(p.armas), ["hoja"]);
  assert.deepEqual(plano(p.usos), { hoja: 0, arco: 0, martillo: 0, lanza: 0 });
  assert.deepEqual(plano(p.secretos), []);
});

test("COSTO_ARMA es 100, 220 y 400 y está congelado; maestría con umbral 30 y tope 3", () => {
  assert.deepEqual(plano(N.COSTO_ARMA), { arco: 100, martillo: 220, lanza: 400 });
  assert.equal(Object.isFrozen(N.COSTO_ARMA), true);
  assert.equal(N.UMBRAL_MAESTRIA, 30);
  assert.equal(N.MAESTRIA_MAX, 3);
});

test("comprarArma cobra el costo exacto de núcleos consolidados y no toca nucleosSala", () => {
  for (const arma of ["arco", "martillo", "lanza"]) {
    const costo = N.COSTO_ARMA[arma];
    const p = N.crearPartida({ semilla: 1 });
    p.nucleos = costo;
    p.nucleosSala = 33;
    const r = N.comprarArma(p, arma);
    assert.equal(r.ok, true, r.error);
    assert.equal(r.partida.nucleos, 0, `${arma} cuesta exactamente ${costo}`);
    assert.equal(r.partida.nucleosSala, 33, "los núcleos sin consolidar no se gastan");
    assert.deepEqual(plano(r.partida.armas), ["hoja", arma]);
    assert.equal(p.nucleos, costo, "la partida original no cambia");
    assert.deepEqual(plano(p.armas), ["hoja"]);
  }
});

test("comprarArma sin núcleos consolidados suficientes deja la partida idéntica", () => {
  for (const arma of ["arco", "martillo", "lanza"]) {
    const p = N.crearPartida({ semilla: 1 });
    p.nucleos = N.COSTO_ARMA[arma] - 1;
    p.nucleosSala = 1000;   // los núcleos sin consolidar no cuentan para comprar
    const r = N.comprarArma(p, arma);
    assert.equal(r.ok, false, `${arma} sin núcleos suficientes`);
    assert.equal(typeof r.error, "string");
    assert.deepEqual(plano(r.partida), plano(p), `${arma} no cambia la partida`);
  }
});

test("comprarArma rechaza un arma repetida, la hoja, armas 3D y nombres inventados", () => {
  const p = N.crearPartida({ semilla: 1 });
  p.nucleos = 1000;
  const primera = N.comprarArma(p, "arco");
  assert.equal(primera.ok, true, primera.error);
  const repetida = N.comprarArma(primera.partida, "arco");
  assert.equal(repetida.ok, false, "ya comprada");
  assert.deepEqual(plano(repetida.partida), plano(primera.partida), "repetir no cobra");
  for (const malo of ["hoja", "rifle", "escopeta", "plasma", "inventada", "constructor", "__proto__", "", undefined, null, 3]) {
    const r = N.comprarArma(p, malo);
    assert.equal(r.ok, false, `debería rechazar ${String(malo)}`);
    assert.deepEqual(plano(r.partida), plano(p), `sin cambios con ${String(malo)}`);
  }
});

test("un guardado v1 sin armas, usos ni secretos se carga con valores por defecto", () => {
  const v1 = JSON.parse(N.serializar(N.crearPartida({ semilla: 9 })));
  delete v1.partida.armas;
  delete v1.partida.usos;
  delete v1.partida.secretos;
  const r = N.deserializar(JSON.stringify(v1));
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(plano(r.partida.armas), ["hoja"]);
  assert.deepEqual(plano(r.partida.usos), { hoja: 0, arco: 0, martillo: 0, lanza: 0 });
  assert.deepEqual(plano(r.partida.secretos), []);
  assert.deepEqual(plano(r.partida), plano(N.crearPartida({ semilla: 9 })), "igual que una partida nueva");
});

test("un guardado con armas pero sin usos ni secretos completa solo lo que falta", () => {
  const v1 = JSON.parse(N.serializar(N.crearPartida({ semilla: 9 })));
  v1.partida.armas = ["hoja", "arco"];
  delete v1.partida.usos;
  delete v1.partida.secretos;
  const r = N.deserializar(JSON.stringify(v1));
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(plano(r.partida.armas), ["hoja", "arco"]);
  assert.deepEqual(plano(r.partida.usos), { hoja: 0, arco: 0, martillo: 0, lanza: 0 });
});

test("deserializar rechaza armas, usos y secretos no válidos", () => {
  const base = N.serializar(N.crearPartida({ semilla: 9 }));
  const con = (cambios) => {
    const o = JSON.parse(base);
    Object.assign(o.partida, cambios);
    return JSON.stringify(o);
  };
  const malos = [
    { armas: ["arco"] },                                        // sin hoja
    { armas: ["hoja", "hoja"] },                                // repetida
    { armas: ["hoja", "rifle"] },                               // arma 3D
    { armas: "hoja" },                                          // no es arreglo
    { usos: { hoja: 0, arco: 0, martillo: 0 } },                // falta lanza
    { usos: { hoja: 0, arco: -1, martillo: 0, lanza: 0 } },     // negativo
    { usos: { hoja: 0, arco: 0, martillo: 0, lanza: 0, rifle: 0 } },
    { secretos: ["Z1.1"] },                                     // Z1.1 no tiene secreto
    { secretos: ["Z1.3", "Z1.3"] },                             // repetido
    { secretos: ["Z9.9"] },                                     // sala inexistente
  ];
  for (const m of malos) {
    const r = N.deserializar(con(m));
    assert.equal(r.ok, false, `debería rechazar ${JSON.stringify(m)}`);
  }
  const bien = N.deserializar(con({
    armas: ["hoja", "lanza"],
    usos: { hoja: 4, arco: 0, martillo: 0, lanza: 30 },
    secretos: ["Z1.3"],
  }));
  assert.equal(bien.ok, true, bien.error);
});

test("maestriaDe: un nivel por cada 30 usos, máximo 3; RangeError si el arma no es 2D", () => {
  const con = (n) => {
    const p = N.crearPartida({ semilla: 1 });
    p.usos.arco = n;
    return p;
  };
  assert.equal(N.maestriaDe(con(29), "arco"), 0);
  assert.equal(N.maestriaDe(con(30), "arco"), 1);
  assert.equal(N.maestriaDe(con(89), "arco"), 2);
  assert.equal(N.maestriaDe(con(90), "arco"), 3);
  assert.equal(N.maestriaDe(con(500), "arco"), 3);
  assert.equal(N.maestriaDe(con(0), "arco"), 0);
  assert.equal(N.maestriaDe(N.crearPartida({ semilla: 1 }), "hoja"), 0, "la hoja cuenta aparte");
  assert.throws(() => N.maestriaDe(con(0), "rifle"), esError("RangeError"));
  assert.throws(() => N.maestriaDe(con(0), "constructor"), esError("RangeError"));
  assert.throws(() => N.maestriaDe(con(0), undefined), esError("RangeError"));
});

test("registrarEnemigoVencido cuenta usos solo con un arma 2D y no cambia la recompensa", () => {
  const p = N.crearPartida({ semilla: 1 });
  const sin = N.registrarEnemigoVencido(p, "arenero");
  assert.equal(sin.xp, 5);
  assert.deepEqual(plano(sin.usos), plano(p.usos), "sin arma no cuenta");
  assert.equal(sin.nucleosSala, 0, "RECOMPENSA_ENEMIGO sigue en 0 núcleos");
  assert.equal(sin.chatarra, 0, "RECOMPENSA_ENEMIGO sigue en 0 chatarra");

  const conArco = N.registrarEnemigoVencido(p, "escarabajo", "arco");
  assert.equal(conArco.xp, 10);
  assert.equal(conArco.usos.arco, 1);
  assert.equal(conArco.usos.hoja, 0);
  assert.equal(N.registrarEnemigoVencido(conArco, "arenero", "arco").usos.arco, 2);

  const tresD = N.registrarEnemigoVencido(p, "arenero", "rifle");
  assert.deepEqual(plano(tresD.usos), plano(p.usos), "un arma 3D no cuenta");
  assert.equal(tresD.xp, 5, "y no falla");
  assert.equal(N.registrarEnemigoVencido(p, "arenero", "inventada").xp, 5);
  assert.equal(p.usos.arco, 0, "la partida original no cambia");
});

test("recogerSecreto da la pieza, los núcleos o la chatarra según la sala", () => {
  // Z1.3 da pieza (zona 1), Z2.2 núcleos y Z3.1 chatarra (mundo.js).
  const pieza = N.recogerSecreto(enSala("Z1.3"), "Z1.3", rngSemilla(9));
  assert.equal(pieza.ok, true, pieza.error);
  assert.equal(pieza.recompensa.tipo, "pieza");
  assert.equal(pieza.recompensa.pieza.zona, 1);
  assert.equal(pieza.recompensa.pieza.forja, 0);
  assert.equal(pieza.partida.inventario.length, 1);
  assert.equal(pieza.partida.inventario[0].id, pieza.recompensa.pieza.id);
  assert.ok(contexto.CenizaDatos.statsDePieza(pieza.recompensa.pieza).length > 0, "la pieza es válida");
  assert.deepEqual(plano(pieza.partida.secretos), ["Z1.3"]);

  const nucleos = enSala("Z2.2");
  nucleos.nucleos = 5;
  nucleos.nucleosSala = 7;
  const bajo = N.recogerSecreto(nucleos, "Z2.2", () => 0);
  assert.equal(bajo.recompensa.tipo, "nucleos");
  assert.equal(bajo.recompensa.cantidad, 20);
  assert.equal(bajo.partida.nucleos, 25, "se suma a los núcleos consolidados");
  assert.equal(bajo.partida.nucleosSala, 7, "no pasa por los núcleos sin consolidar");
  const alto = N.recogerSecreto(nucleos, "Z2.2", () => 0.999);
  assert.equal(alto.recompensa.cantidad, 40);
  assert.equal(alto.partida.nucleos, 45);
  assert.equal(alto.partida.inventario.length, 0);

  const chatarra = enSala("Z3.1");
  chatarra.chatarra = 3;
  const c1 = N.recogerSecreto(chatarra, "Z3.1", () => 0);
  assert.equal(c1.recompensa.tipo, "chatarra");
  assert.equal(c1.recompensa.cantidad, 10);
  assert.equal(c1.partida.chatarra, 13);
  const c2 = N.recogerSecreto(chatarra, "Z3.1", () => 0.999);
  assert.equal(c2.recompensa.cantidad, 20);
  assert.equal(c2.partida.chatarra, 23);
});

test("recogerSecreto: las cantidades quedan siempre entre 20 y 40 núcleos y 10 y 20 chatarra", () => {
  for (let semilla = 1; semilla <= 60; semilla++) {
    const n = N.recogerSecreto(enSala("Z2.2"), "Z2.2", rngSemilla(semilla));
    assert.ok(n.recompensa.cantidad >= 20 && n.recompensa.cantidad <= 40, `núcleos ${n.recompensa.cantidad}`);
    const c = N.recogerSecreto(enSala("Z3.1"), "Z3.1", rngSemilla(semilla));
    assert.ok(c.recompensa.cantidad >= 10 && c.recompensa.cantidad <= 20, `chatarra ${c.recompensa.cantidad}`);
  }
});

test("recogerSecreto: falla si ya se recogió, la sala no es la actual, no hay secreto, la sala no existe o el viajero murió", () => {
  const r = N.recogerSecreto(enSala("Z2.2"), "Z2.2", rngSemilla(3));
  assert.equal(r.ok, true, r.error);
  const otra = N.recogerSecreto(r.partida, "Z2.2", rngSemilla(3));
  assert.equal(otra.ok, false, "segunda vez");
  assert.deepEqual(plano(otra.partida), plano(r.partida));

  const distinta = N.recogerSecreto(enSala("Z1.1"), "Z1.3", rngSemilla(3));
  assert.equal(distinta.ok, false, "secreto de otra sala");
  assert.deepEqual(plano(distinta.partida), plano(enSala("Z1.1")));
  assert.equal(N.recogerSecreto(enSala("Z1.1"), "Z1.1", rngSemilla(3)).ok, false, "sala sin secreto");
  assert.equal(N.recogerSecreto(enSala("Z9.9"), "Z9.9", rngSemilla(3)).ok, false, "sala desconocida");

  const muerto = N.danioAJugador(enSala("Z1.3"), 999);
  const rm = N.recogerSecreto(muerto, "Z1.3", rngSemilla(3));
  assert.equal(rm.ok, false, "viajero muerto");
  assert.deepEqual(plano(rm.partida), plano(muerto));
});

test("recogerSecreto no muta la partida y con la misma semilla da el mismo resultado", () => {
  const p = enSala("Z1.3");
  const antes = JSON.stringify(p);
  const a = N.recogerSecreto(p, "Z1.3", rngSemilla(77));
  assert.equal(JSON.stringify(p), antes, "la partida recibida no cambia");
  const b = N.recogerSecreto(p, "Z1.3", rngSemilla(77));
  assert.deepEqual(plano(a), plano(b));
  let sinRng;
  const llamadasSecreto = contarLlamadasRandom(() => { sinRng = N.recogerSecreto(p, "Z1.3"); });
  assert.equal(sinRng.ok, true, sinRng.error);
  assert.ok(llamadasSecreto > 0, "sin rng se llama a Math.random");
  assert.throws(() => N.recogerSecreto(p, "Z1.3", 5), esError("TypeError"));
});

test("historia: crearPartida trae la lista vacía y marcarHistoria añade cada clave una sola vez", () => {
  const p = N.crearPartida({ semilla: 5 });
  assert.deepEqual(plano(p.historia), [], "partida nueva sin historia vista");
  const antes = JSON.stringify(p);
  const a = N.marcarHistoria(p, "zona:1");
  assert.equal(JSON.stringify(p), antes, "la partida recibida no cambia");
  assert.deepEqual(plano(a.historia), ["zona:1"]);
  const b = N.marcarHistoria(a, "jefe:guardian-duna");
  assert.deepEqual(plano(b.historia), ["zona:1", "jefe:guardian-duna"]);
  const repetida = N.marcarHistoria(b, "zona:1");
  assert.deepEqual(plano(repetida), plano(b), "repetir una clave deja la copia igual");
  assert.deepEqual(plano(repetida.historia), ["zona:1", "jefe:guardian-duna"], "sin duplicados");
  assert.throws(() => N.marcarHistoria(p, ""), esError("TypeError"));
  assert.throws(() => N.marcarHistoria(p, "   "), esError("TypeError"));
  assert.throws(() => N.marcarHistoria(p, 7), esError("TypeError"));
  assert.throws(() => N.marcarHistoria(p, undefined), esError("TypeError"));
});

test("historia: las claves de los jefes, fogatas, fase 3D y final se guardan y se leen igual", () => {
  const claves = [
    "zona:1", "zona:4", "jefe:guardian-duna", "jefe:guardian-duna:caida", "fogata:2",
    "3d:entrada", "3d:S1", "3d:S2", "3d:S3", "3d:coloso:1", "3d:coloso:2", "3d:coloso:3", "final",
  ];
  let p = N.crearPartida({ semilla: 6 });
  for (const c of claves) p = N.marcarHistoria(p, c);
  const r = N.deserializar(N.serializar(p));
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(plano(r.partida.historia), claves, "las claves sobreviven al guardado");
});

test("historia: un guardado v1 sin historia se completa con []", () => {
  const p = N.crearPartida({ semilla: 8 });
  const v1 = plano(p);
  delete v1.historia;
  const r = N.deserializar(JSON.stringify({ version: N.VERSION, partida: v1 }));
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(plano(r.partida.historia), []);
  // El guardado con historia de tipo incorrecto se rechaza sin lanzar.
  for (const malo of ["zona:1", [1], ["zona:1", "zona:1"], [null]]) {
    const copia = plano(p);
    copia.historia = malo;
    const m = N.deserializar(JSON.stringify({ version: N.VERSION, partida: copia }));
    assert.equal(m.ok, false, "historia no válida: " + JSON.stringify(malo));
    assert.match(m.error, /historia/);
  }
});

// ----------------------------------------------------------------- núcleos y chatarra encontrados

// Partida con una pieza equipada que lleva un modificador de recurso. accesorio1 admite "nucleos"
// y "chatarra" (MODIFICADORES_POR_RANURA en datos.js). valor va en % y ya incluye la forja.
const conRecurso = (id, valor, forja = 0) => {
  let p = N.crearPartida({ semilla: 1 });
  p = N.anadirPieza(p, pieza("accesorio1", [{ id, valor }], { forja }));
  return N.equipar(p, ultimoId(p)).partida;
};

test("abrirCofre: el modificador de núcleos encontrados suma su % a los núcleos del cofre", () => {
  const sin = N.crearPartida({ semilla: 1 });
  const con = conRecurso("nucleos", 10);
  const a = N.abrirCofre(sin, "Z1.1#0", () => 0);
  const b = N.abrirCofre(con, "Z1.1#0", () => 0);
  assert.equal(a.recompensa.nucleos, 20, "sin modificador: la base de la tabla 8.1");
  assert.equal(b.recompensa.nucleos, 22, "20 + floor(20 * 10 / 100) = 22");
  assert.equal(b.recompensa.nucleosBono, 2);
  assert.equal(b.partida.nucleosSala, 22, "el bono va a los núcleos de la sala, sin consolidar");
  assert.ok(b.partida.nucleosSala > a.partida.nucleosSala);
  // Cofre raro de Z1.2 (base 100 con rng casi 1): 100 + floor(100 * 10 / 100) = 110.
  const raro = N.abrirCofre({ ...con, sala: "Z1.2" }, "Z1.2#0", () => 0.999);
  assert.equal(raro.recompensa.nucleos, 110);
});

test("abrirCofre: el modificador de chatarra encontrada suma su % a la chatarra del cofre", () => {
  const con = conRecurso("chatarra", 15);
  const b = N.abrirCofre(con, "Z1.1#0", () => 0);
  assert.equal(b.recompensa.chatarra, 11, "10 + floor(10 * 15 / 100) = 11");
  assert.equal(b.recompensa.chatarraBono, 1);
  assert.equal(b.partida.chatarra, 11);
  assert.ok(b.partida.chatarra > N.abrirCofre(N.crearPartida({ semilla: 1 }), "Z1.1#0", () => 0).partida.chatarra);
  const alto = N.abrirCofre({ ...con, sala: "Z1.2" }, "Z1.2#0", () => 0.999);
  assert.equal(alto.recompensa.chatarra, 57, "50 + floor(50 * 15 / 100) = 57");
});

test("el bono de núcleos y chatarra se redondea hacia abajo, y la forja cuenta", () => {
  // Secreto de Z2.2 (núcleos) con rng 0: base 20.
  const secreto = (partida) => N.recogerSecreto({ ...partida, sala: "Z2.2" }, "Z2.2", () => 0);
  assert.equal(secreto(conRecurso("nucleos", 14)).recompensa.cantidad, 22, "floor(2,8) = 2");
  assert.equal(secreto(conRecurso("nucleos", 19)).recompensa.cantidad, 23, "floor(3,8) = 3");
  // Forja +1 multiplica por 1,1: 5 % pasa a 5,5 %, y 20 * 5,5 / 100 = 1,1 baja a 1.
  assert.equal(secreto(conRecurso("nucleos", 5, 1)).recompensa.cantidad, 21);
  // Forja +5 multiplica por 1,5: 10 % pasa a 15 %, y floor(3) = 3.
  assert.equal(secreto(conRecurso("nucleos", 10, 5)).recompensa.cantidad, 23);
  // Chatarra base 10 con 9 %: floor(0,9) = 0, así que no sube (redondear daría 11).
  const chatarra = N.recogerSecreto({ ...conRecurso("chatarra", 9), sala: "Z3.1" }, "Z3.1", () => 0);
  assert.equal(chatarra.recompensa.cantidad, 10, "se redondea hacia abajo");
  assert.equal(chatarra.recompensa.bono, 0);
});

test("los modificadores de núcleos suman entre piezas equipadas; el inventario no cuenta", () => {
  let p = N.crearPartida({ semilla: 1 });
  p = N.anadirPieza(p, pieza("accesorio1", [{ id: "nucleos", valor: 10 }]));
  p = N.equipar(p, ultimoId(p)).partida;
  p = N.anadirPieza(p, pieza("accesorio2", [{ id: "nucleos", valor: 5 }]));
  p = N.equipar(p, ultimoId(p)).partida;
  assert.equal(N.statsJugador(p).nucleosEncontrados, 15, "10 + 5 entre piezas equipadas");
  assert.equal(N.statsJugador(p).chatarraEncontrada, 0);
  assert.equal(N.abrirCofre(p, "Z1.1#0", () => 0).recompensa.nucleos, 23, "20 + floor(20 * 15 / 100) = 23");

  // Una pieza en el inventario, sin equipar, no suma.
  let q = N.crearPartida({ semilla: 1 });
  q = N.anadirPieza(q, pieza("accesorio1", [{ id: "nucleos", valor: 15 }]));
  assert.equal(N.statsJugador(q).nucleosEncontrados, 0);
  assert.equal(N.abrirCofre(q, "Z1.1#0", () => 0).recompensa.nucleos, 20);
});

test("otros modificadores no dan núcleos, y el bono no gasta rng: el resto del cofre sale igual", () => {
  const sinBono = N.crearPartida({ semilla: 1 });
  const dano = conRecurso("dano", 6);
  assert.equal(N.abrirCofre(dano, "Z1.1#0", () => 0).recompensa.nucleos, 20, "daño no suma núcleos");

  const con = conRecurso("nucleos", 10);
  for (let semilla = 1; semilla <= 20; semilla++) {
    const a = N.abrirCofre(sinBono, "Z1.1#0", rngSemilla(semilla)).recompensa;
    const b = N.abrirCofre(con, "Z1.1#0", rngSemilla(semilla)).recompensa;
    assert.equal(b.tipo, a.tipo);
    assert.equal(b.xp, a.xp);
    assert.equal(b.consumible, a.consumible, `consumible con semilla ${semilla}`);
    assert.equal(b.pieza === null, a.pieza === null, `pieza con semilla ${semilla}`);
    if (a.pieza) assert.deepEqual(plano(b.pieza.modificadores), plano(a.pieza.modificadores));
    assert.equal(b.nucleos, a.nucleos + Math.floor((a.nucleos * 10) / 100), `núcleos con semilla ${semilla}`);
  }
});

test("recoger un secreto con modificador de núcleos o chatarra suma el bono", () => {
  const nucleos = N.recogerSecreto({ ...conRecurso("nucleos", 15), sala: "Z2.2" }, "Z2.2", () => 0.999);
  assert.equal(nucleos.recompensa.cantidad, 46, "40 + floor(40 * 15 / 100) = 46");
  assert.equal(nucleos.recompensa.bono, 6);
  assert.equal(nucleos.partida.nucleos, 46, "el secreto de núcleos consolida el total");

  const sinMod = N.recogerSecreto({ ...N.crearPartida({ semilla: 1 }), sala: "Z2.2" }, "Z2.2", () => 0.999);
  assert.equal(sinMod.recompensa.cantidad, 40);

  const chatarra = N.recogerSecreto({ ...conRecurso("chatarra", 15), sala: "Z3.1" }, "Z3.1", () => 0);
  assert.equal(chatarra.recompensa.cantidad, 11, "10 + floor(10 * 15 / 100) = 11");
  assert.equal(chatarra.recompensa.bono, 1);
  assert.equal(chatarra.partida.chatarra, 11);
});

test("abrirCofre y recogerSecreto no cambian la partida que reciben, con modificadores", () => {
  const con = conRecurso("nucleos", 10);
  const antes = JSON.stringify(con);
  N.abrirCofre(con, "Z1.1#0", () => 0.5);
  N.recogerSecreto({ ...con, sala: "Z2.2" }, "Z2.2", () => 0.5);
  assert.equal(JSON.stringify(con), antes);
});

test("statsJugador expone los porcentajes de núcleos y chatarra encontrados de las piezas equipadas", () => {
  const s = N.statsJugador(conRecurso("chatarra", 15, 5));
  assert.equal(s.chatarraEncontrada, 22.5, "15 * 1,5 = 22,5 con forja +5");
  assert.equal(s.nucleosEncontrados, 0);
  assert.equal(N.statsJugador(N.crearPartida({ semilla: 1 })).nucleosEncontrados, 0);
});

// ----------------------------------------------------------------- revisión de la parte 1

// Guardado de una partida nueva con cambios aplicados a la copia JSON (para probar la validación).
const guardadoCon = (cambios, semilla = 5) => {
  const o = JSON.parse(N.serializar(N.crearPartida({ semilla })));
  Object.assign(o.partida, cambios);
  return JSON.stringify(o);
};

test("suerte: los puntos de atributo cuentan como puntos de rareza (docs 8.3), igual que puntos directos", () => {
  let p = enNivel(10);
  for (let i = 0; i < 10; i++) p = N.invertirPunto(p, "suerte").partida;
  const D = contexto.CenizaDatos;
  const puntos = N.statsJugador(p).suerte;
  assert.equal(puntos, 10);
  for (const tipo of ["comun", "raro", "jefe"]) {
    for (const zona of [1, 4]) {
      assert.equal(
        D.probabilidadSubidaRareza(tipo, zona, puntos),
        D.probabilidadSubidaRareza(tipo, zona, 10),
        tipo + " zona " + zona,
      );
    }
  }
});

test("cofres y secretos usan la suerte en puntos: con 20 puntos de atributo, la misma rareza que 20 directos", () => {
  let p = enNivel(10);
  for (let i = 0; i < 20; i++) p = N.invertirPunto(p, "suerte").partida;
  const D = contexto.CenizaDatos;
  assert.equal(N.statsJugador(p).suerte, 20);
  assert.equal(
    D.probabilidadSubidaRareza("comun", 1, N.statsJugador(p).suerte),
    D.probabilidadSubidaRareza("comun", 1, 20),
  );
});

test("guardado: fase 3D o victoria exigen el Guardián de chatarra vencido (CA-10)", () => {
  for (const fase of ["3d", "victoria"]) {
    const r = N.deserializar(guardadoCon({ faseActual: fase }));
    assert.equal(r.ok, false, fase);
    assert.match(r.error, /Guardián de chatarra/);
  }
  const final = N.deserializar(guardadoCon({
    faseActual: "3d",
    jefesVencidos: ["guardian-duna", "centinela-cristal", "forjador", "guardian-chatarra"],
    sala: "Z4.JEFE",
    ultimaFogata: "Z4.1",
  }));
  assert.equal(final.ok, true, final.error);
});

test("guardado: sala y fogata deben estar al alcance con los jefes vencidos (puertas con condición)", () => {
  // Z4.JEFE y Z4.1 solo se alcanzan tras el jefe de la zona 3 (forjador).
  const sinForjador = N.deserializar(guardadoCon({ sala: "Z4.JEFE", ultimaFogata: "Z4.1" }));
  assert.equal(sinForjador.ok, false);
  assert.match(sinForjador.error, /alcanzable/);
  const alcanzable = N.deserializar(guardadoCon({ jefesVencidos: ["guardian-duna"], sala: "Z2.1", ultimaFogata: "Z2.1" }));
  assert.equal(alcanzable.ok, true, alcanzable.error);
  const fogataLejana = N.deserializar(guardadoCon({ jefesVencidos: ["guardian-duna"], sala: "Z2.1", ultimaFogata: "Z4.1" }));
  assert.equal(fogataLejana.ok, false);
});

test("guardado: vida y muerte son coherentes (vida entera de 0 a la máxima; muerto solo con vida 0)", () => {
  const malos = {
    "vida por encima del máximo": { vida: 9999 },
    "vida fraccionaria": { vida: 12.5 },
    "muerto con vida mayor que 0": { muerto: true },
    "vida 0 sin estar muerto": { vida: 0, muerto: false },
  };
  for (const [nombre, cambios] of Object.entries(malos)) {
    assert.equal(N.deserializar(guardadoCon(cambios)).ok, false, nombre);
  }
  const muertoBien = N.deserializar(guardadoCon({ vida: 0, muerto: true }));
  assert.equal(muertoBien.ok, true, muertoBien.error);
});

test("guardado: un id de pieza debe ser p1 a p<contadorPiezas> (no se pierde ninguna pieza al equipar)", () => {
  const texto = N.serializar(N.anadirPieza(N.crearPartida({ semilla: 6 }), pieza("casco")));
  assert.equal(N.deserializar(texto).ok, true, "guardado normal");
  const contadorBajo = JSON.parse(texto);
  contadorBajo.partida.contadorPiezas = 0;
  const r = N.deserializar(JSON.stringify(contadorBajo));
  assert.equal(r.ok, false);
  assert.match(r.error, /id de pieza/);
});

test("equipar: un id repetido en el inventario no arrastra otras piezas", () => {
  let p = N.crearPartida({ semilla: 8 });
  p = N.anadirPieza(p, pieza("casco"));
  p = N.anadirPieza(p, pieza("pecho"));
  const dup = JSON.parse(JSON.stringify(p));
  dup.inventario[1].id = dup.inventario[0].id;
  const e = N.equipar(dup, dup.inventario[0].id);
  assert.equal(e.ok, true, e.error);
  assert.equal(e.partida.inventario.length, 1, "solo sale la pieza encontrada");
});

test("guardado: modificadores fuera del rango de la zona o de otra ranura se rechazan", () => {
  const fueraDeRango = N.anadirPieza(N.crearPartida({ semilla: 6 }), pieza("casco", [{ id: "vida", valor: 9 }]));
  const r = N.deserializar(N.serializar(fueraDeRango));
  assert.equal(r.ok, false);
  assert.match(r.error, /pieza del inventario/);
  const otraRanura = N.anadirPieza(N.crearPartida({ semilla: 6 }), pieza("casco", [{ id: "nucleos", valor: 10 }]));
  assert.equal(N.deserializar(N.serializar(otraRanura)).ok, false, "nucleos no sale en casco");
});

test("guardado: historia sin texto vacío, consumibles con solo sus claves y cofres con un solo id", () => {
  assert.equal(N.deserializar(guardadoCon({ historia: [""] })).ok, false, "historia vacía");
  assert.equal(N.deserializar(guardadoCon({ historia: ["   "] })).ok, false, "historia con solo espacios");
  assert.equal(N.deserializar(guardadoCon({ consumibles: { curacion: 0, bomba: 0, extra: 9 } })).ok, false);
  assert.equal(N.deserializar(guardadoCon({ cofresAbiertos: ["Z1.1#00"] })).ok, false, "cero a la izquierda");
  assert.equal(N.abrirCofre(N.crearPartida({ semilla: 4 }), "Z1.1#00", rngSemilla(4)).ok, false, "mismo cofre que #0");
  assert.equal(N.abrirCofre(N.crearPartida({ semilla: 4 }), "Z1.1#0", rngSemilla(4)).ok, true);
});

test("personaje: el nombre se normaliza al crear y al cargar, y las claves ajenas no sobreviven (docs 9.1)", () => {
  const D = contexto.CenizaDatos;
  const p = N.crearPartida({ personaje: { ...D.personajePorDefecto(), nombre: "  Ana   Luz  " }, semilla: 3 });
  assert.equal(p.personaje.nombre, "Ana Luz");
  const copia = JSON.parse(N.serializar(p));
  copia.partida.personaje.nombre = " Ana  Luz ";
  copia.partida.personaje.hack = true;
  const r = N.deserializar(JSON.stringify(copia));
  assert.equal(r.ok, true, r.error);
  assert.equal(r.partida.personaje.nombre, "Ana Luz");
  assert.equal(r.partida.personaje.hack, undefined, "clave ajena fuera");
});

test("danioAJugador cuenta una muerte solo al pasar de vida positiva a 0", () => {
  const p = N.crearPartida({ semilla: 1 });
  const golpe = N.danioAJugador(p, 1e6);
  assert.equal(golpe.muerto, true);
  assert.equal(golpe.muertes, 1);
  const sinVida = N.danioAJugador({ ...p, vida: 0 }, 0);
  assert.equal(sinVida.muertes, 0, "vida ya en 0 y daño 0: no es una muerte nueva");
});

test("forjar: el mensaje de chatarra insuficiente concuerda", () => {
  const p = N.anadirPieza(N.crearPartida({ semilla: 2 }), pieza("casco"));
  const r = N.forjar(p, "p1");
  assert.equal(r.ok, false);
  assert.match(r.error, /^Falta chatarra: hacen falta \d+$/);
});
