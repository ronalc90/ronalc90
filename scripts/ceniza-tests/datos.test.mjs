// Pruebas de docs/ceniza/datos.js (Ceniza).
// Ejecutar desde la raíz del repo: node --test scripts/ceniza-tests/
// El archivo se carga con vm.runInNewContext, como un script clásico del navegador.
// Los objetos creados dentro del contexto son de otro realm: se comparan con JSON.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const contexto = {};
vm.runInNewContext(
  fs.readFileSync(path.join(RAIZ, "docs", "ceniza", "datos.js"), "utf8"),
  contexto,
  { filename: "datos.js" },
);
const D = contexto.CenizaDatos;

// Generador pseudoaleatorio determinista (LCG) para que las pruebas se repitan igual.
function rngSemilla(semilla) {
  let x = semilla >>> 0;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 4294967296;
  };
}

// Copia en JSON para sacar los objetos del realm del contexto.
const plano = (x) => JSON.parse(JSON.stringify(x));

// Error de otro realm: se identifica por nombre, no por instanceof.
const esError = (nombre) => (e) => e && e.name === nombre;

// Suma de control FNV-1a igual a la de datos.js (32 bits, 8 hex), para fabricar códigos con checksum válido.
function fnv(texto) {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return ("00000000" + h.toString(16)).slice(-8);
}
// Código con el formato de docs 9.3: prefijo, base64 del JSON en UTF-8 y suma de control de la parte base64.
const codigoManual = (texto) => {
  const base = Buffer.from(texto, "utf8").toString("base64");
  return `CENIZA1.${base}.${fnv(base)}`;
};

// Contraste WCAG entre dos colores #rrggbb (docs 5.2, criterio de 4,5:1).
function luminancia(hex) {
  const canales = [0, 2, 4].map((i) => parseInt(hex.slice(1 + i, 3 + i), 16) / 255);
  const lineal = canales.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lineal[0] + 0.7152 * lineal[1] + 0.0722 * lineal[2];
}
function contraste(a, b) {
  const [claro, oscuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (claro + 0.05) / (oscuro + 0.05);
}
const FONDO_JUEGO = "#0b0807";

test("curva de XP: el nivel 1 empieza con 0 XP y desde el nivel 2 sube con la fórmula del contrato", () => {
  assert.equal(D.xpParaNivel(1), 0, "tabla 4.1: el nivel 1 empieza con 0 XP");
  let previo = D.xpParaNivel(1);
  for (let n = 2; n <= 30; n++) {
    const xp = D.xpParaNivel(n);
    assert.ok(xp > previo, `nivel ${n} debe pedir más XP que el anterior`);
    previo = xp;
  }
  assert.equal(D.xpParaNivel(2), 121); // 40 * 2^1,6 = 121,26
  assert.throws(() => D.xpParaNivel(0), esError("RangeError"));
  assert.throws(() => D.xpParaNivel(31), esError("RangeError"));
});

test("curva de XP exacta contra la tabla 4.1 de docs/ceniza-diseno.md (CA-07, niveles 1 a 30)", () => {
  const tabla4_1 = [
    [1, 0], [2, 121], [3, 232], [4, 368], [5, 525], [6, 703], [7, 900], [8, 1114], [9, 1345], [10, 1592],
    [11, 1855], [12, 2132], [13, 2423], [14, 2728], [15, 3047], [16, 3378], [17, 3722], [18, 4078],
    [19, 4447], [20, 4827], [21, 5219], [22, 5623], [23, 6037], [24, 6462], [25, 6899], [26, 7345],
    [27, 7803], [28, 8270], [29, 8748], [30, 9235],
  ];
  for (const [nivel, xp] of tabla4_1) assert.equal(D.xpParaNivel(nivel), xp, `nivel ${nivel}`);
});

test("3 puntos de atributo por nivel", () => {
  assert.equal(D.atributosDeNivel(1).puntos, 0);
  for (let n = 1; n < 30; n++) {
    assert.equal(D.atributosDeNivel(n + 1).puntos - D.atributosDeNivel(n).puntos, 3, `paso al nivel ${n + 1}`);
  }
  assert.equal(D.atributosDeNivel(30).puntos, 87);
});

test("bono por atributo: vida 8 HP, daño 3 %, armadura 2 %, velocidad 2 %, suerte 3 %", () => {
  const bono = plano(D.bonoDeAtributos({ vida: 2, dano: 1, armadura: 3, velocidad: 0, suerte: 4 }));
  assert.deepEqual(bono, { vida: 16, dano: 3, armadura: 6, velocidad: 0, suerte: 12 });
});

test("costos de forja crecientes y con la fórmula del contrato (CA-08)", () => {
  const costos = [0, 1, 2, 3, 4].map((n) => D.costoForja(n));
  assert.deepEqual(costos, [5, 14, 26, 40, 56]);
  assert.equal(costos.reduce((s, c) => s + c, 0), 141, "total de +0 a +5 por pieza");
  for (let i = 1; i < costos.length; i++) assert.ok(costos[i] > costos[i - 1]);
  assert.throws(() => D.costoForja(5), esError("RangeError"));
});

// Tabla 7.3 de docs/ceniza-diseno.md (maestría 0 a 3), con los decimales del documento.
const redondear = (x, decimales) => Math.round(x * 10 ** decimales) / 10 ** decimales;
const porcentaje = (parte, total) => redondear((100 * parte) / total, 1);
const TABLA_7_3 = {
  golpes: [[14, 14, 22], [15, 15, 24], [17, 17, 26], [18, 18, 29]],
  onda: [13, 14, 16, 17],
  cicloDano: [63, 68, 76, 82],
  dpsHoja: [68.48, 73.91, 82.61, 89.13],
  topeArco: [65.05, 70.22, 78.48, 84.67],
  arcoSinTopeDps: [39.13, 86.96, 143.48, 156.52],
  arcoSinTopePorc: [57.1, 117.6, 173.7, 175.6],
  cooldownTope: [0.23, 0.285, 0.421, 0.426],
  arcoTopeDps: [39.13, 70.18, 78.38, 84.51],
  arcoTopePorc: [57.1, 94.9, 94.9, 94.8],
};

test("hoja (tabla 7.3): combo 14, 14, 22 y onda 13 con maestría; ciclo de 0,92 s", () => {
  assert.equal(redondear(D.cicloHoja, 2), 0.92);
  for (let m = 0; m <= 3; m++) {
    const d = plano(D.danoHoja(m));
    assert.deepEqual(d.golpes, TABLA_7_3.golpes[m], `golpes con maestría ${m}`);
    assert.equal(d.onda, TABLA_7_3.onda[m], `onda con maestría ${m}`);
    assert.equal(d.golpes.reduce((s, x) => s + x, 0) + d.onda, TABLA_7_3.cicloDano[m], `daño por ciclo ${m}`);
    assert.equal(redondear(D.dpsArma("hoja", m), 2), TABLA_7_3.dpsHoja[m], `DPS de la hoja con maestría ${m}`);
  }
});

test("arco sin tope (tabla 7.3, columnas actuales): supera el 95 % desde maestría 1", () => {
  for (let m = 0; m <= 3; m++) {
    const dps = (D.MULTIDISPARO_ARCO[m] * D.danoPorGolpe("arco", m)) / D.armas.arco.cadencia;
    assert.equal(redondear(dps, 2), TABLA_7_3.arcoSinTopeDps[m], `DPS sin tope, maestría ${m}`);
    assert.equal(porcentaje(dps, D.dpsArma("hoja", m)), TABLA_7_3.arcoSinTopePorc[m], `% sin tope, maestría ${m}`);
  }
});

test("arco con tope (tabla 7.3): cooldown 0,230 / 0,285 / 0,421 / 0,426 (CA-04)", () => {
  const cooldowns = [0, 1, 2, 3].map((m) => redondear(D.cooldownArco(m), 3));
  assert.deepEqual(cooldowns, TABLA_7_3.cooldownTope);
});

test("arco con tope (tabla 7.3): DPS 39,13 / 70,18 / 78,38 / 84,51 y 57,1 / 94,9 / 94,9 / 94,8 % de la hoja", () => {
  for (let m = 0; m <= 3; m++) {
    const arco = D.dpsArma("arco", m);
    assert.equal(redondear(arco, 2), TABLA_7_3.arcoTopeDps[m], `DPS con tope, maestría ${m}`);
    assert.equal(porcentaje(arco, D.dpsArma("hoja", m)), TABLA_7_3.arcoTopePorc[m], `% con tope, maestría ${m}`);
  }
});

test("tope del 95 %: el DPS del arco nunca supera el 95 % de la hoja con la misma maestría (CA-03)", () => {
  for (let m = 0; m <= 3; m++) {
    const hoja = D.dpsArma("hoja", m);
    const arco = D.dpsArma("arco", m);
    assert.ok(arco <= 0.95 * hoja + 1e-9, `maestría ${m}: arco ${arco} frente a hoja ${hoja}`);
    assert.equal(redondear(0.95 * hoja, 2), TABLA_7_3.topeArco[m], `tope de la hoja con maestría ${m}`);
  }
});

// Cada duración se redondea hacia arriba al fotograma (docs 7.5).
const alCuadro = (segundos, hz) => Math.ceil(segundos * hz - 1e-9) / hz;

test("tope a 60 y 120 Hz (docs 7.5): el arco sigue por debajo del 95 % de la hoja", () => {
  const esperado = {
    60: { hoja: [67.5, 72.86, 81.43, 87.86], arco: [57.1, 91.5, 93.5, 94.6] },
    120: { hoja: [68.11, 73.51, 82.16, 88.65], arco: [56.6, 93.3, 94.5, 93.7] },
  };
  for (const hz of [60, 120]) {
    const cicloHz = D.armas.hoja.cadencias.reduce((s, c) => s + alCuadro(c, hz), 0);
    for (let m = 0; m <= 3; m++) {
      const d = plano(D.danoHoja(m));
      const hoja = (d.golpes.reduce((s, x) => s + x, 0) + d.onda) / cicloHz;
      const arco = (D.MULTIDISPARO_ARCO[m] * D.danoPorGolpe("arco", m)) / alCuadro(D.cooldownArco(m), hz);
      assert.equal(redondear(hoja, 2), esperado[hz].hoja[m], `hoja a ${hz} Hz, maestría ${m}`);
      assert.equal(porcentaje(arco, hoja), esperado[hz].arco[m], `arco a ${hz} Hz, maestría ${m}`);
      assert.ok(porcentaje(arco, hoja) <= 95, `arco a ${hz} Hz, maestría ${m}`);
    }
  }
});

test("el tope recorta el espaciado de la ráfaga: flechas y daño por flecha no cambian", () => {
  assert.deepEqual(plano(D.MULTIDISPARO_ARCO), [1, 2, 3, 3]);
  assert.deepEqual([0, 1, 2, 3].map((m) => D.danoPorGolpe("arco", m)), [9, 10, 11, 12]);
  for (let m = 0; m <= 3; m++) assert.ok(D.cooldownArco(m) >= D.armas.arco.cadencia);
  assert.equal(D.cooldownArco(0), D.armas.arco.cadencia, "sin tope activo a maestría 0");
});

// Cuenta atrás de un cooldown por fotogramas, como en el juego (tickTimers): se resta un paso hasta
// llegar a 0 o menos. Usa restarFotograma, la misma función que el juego.
const fotogramasHastaCero = (cooldown, paso) => {
  let restante = cooldown;
  let n = 0;
  do {
    restante = D.restarFotograma(restante, paso);
    n++;
  } while (restante > 0);
  return n;
};

test("restarFotograma: 0,25 s son 15 fotogramas a 60 Hz (sin el umbral serían 16 por coma flotante)", () => {
  const paso = 1 / 60;
  assert.equal(fotogramasHastaCero(0.25, paso), 15);
  assert.equal(fotogramasHastaCero(0.25, 1 / 120), 30);
  let restante = 0.25;
  for (let i = 0; i < 14; i++) restante = D.restarFotograma(restante, paso);
  assert.ok(restante > 0, "tras 14 fotogramas aún queda cooldown");
  assert.equal(D.restarFotograma(restante, paso), 0, "el fotograma 15 llega a cero y no queda residuo");
  assert.equal(D.restarFotograma(0, paso), 0, "sin cooldown no baja de cero");
  assert.equal(D.restarFotograma(0.5, paso), 0.5 - paso, "un descuento normal no cambia");
  assert.throws(() => D.restarFotograma(-0.1, paso), esError("RangeError"));
  assert.throws(() => D.restarFotograma(Number.NaN, paso), esError("RangeError"));
  assert.throws(() => D.restarFotograma(0.1, 0), esError("RangeError"));
});

test("CA-03 a 60 Hz con los fotogramas del juego (docs 7.5): hoja 56 fotogramas y arco 14, 18, 26, 26", () => {
  const paso = 1 / 60;
  const cicloHoja = D.armas.hoja.cadencias.reduce((s, c) => s + fotogramasHastaCero(c, paso), 0);
  assert.equal(cicloHoja, 56, "ciclo de la hoja: 15 + 15 + 26 fotogramas");
  const framesArco = [0, 1, 2, 3].map((m) => fotogramasHastaCero(D.cooldownArco(m), paso));
  assert.deepEqual(framesArco, [14, 18, 26, 26]);
  for (let m = 0; m <= 3; m++) {
    const d = plano(D.danoHoja(m));
    const dpsHoja = (d.golpes.reduce((s, x) => s + x, 0) + d.onda) / (cicloHoja * paso);
    const dpsArco = (D.MULTIDISPARO_ARCO[m] * D.danoPorGolpe("arco", m)) / (framesArco[m] * paso);
    assert.equal(porcentaje(dpsArco, dpsHoja), [57.1, 91.5, 93.5, 94.6][m], `arco a 60 Hz, maestría ${m}`);
    assert.ok(dpsArco <= 0.95 * dpsHoja, `CA-03 a 60 Hz, maestría ${m}`);
  }
});

test("CA-03 a 60 y 120 Hz con restarFotograma (docs 7.5): el arco queda por debajo del 95 % de la hoja", () => {
  for (const hz of [60, 120]) {
    const paso = 1 / hz;
    const cicloHoja = D.armas.hoja.cadencias.reduce((s, c) => s + fotogramasHastaCero(c, paso), 0);
    for (let m = 0; m <= 3; m++) {
      const d = plano(D.danoHoja(m));
      const dpsHoja = (d.golpes.reduce((s, x) => s + x, 0) + d.onda) / (cicloHoja * paso);
      const framesArco = fotogramasHastaCero(D.cooldownArco(m), paso);
      const dpsArco = (D.MULTIDISPARO_ARCO[m] * D.danoPorGolpe("arco", m)) / (framesArco * paso);
      assert.ok(dpsArco <= 0.95 * dpsHoja, `arco a ${hz} Hz, maestría ${m}: ${porcentaje(dpsArco, dpsHoja)} %`);
    }
  }
});

test("armas 2D y 3D (tablas 6.1 y 6.2): DPS de referencia y datos de cada arma", () => {
  assert.equal(redondear(D.dpsArma("arco", 0), 1), 39.1);
  assert.equal(redondear(D.dpsArma("martillo", 0), 1), 38.9);
  assert.equal(redondear(D.dpsArma("lanza", 0), 1), 34.8);
  // 3D: rifle 18 a 0,20 s; escopeta 8 perdigones de 10 a 0,90 s; plasma 45 directo y 20 de área a 0,60 s.
  assert.equal(D.armas.rifle.dano, 18);
  assert.equal(D.armas.rifle.cadencia, 0.2);
  assert.equal(D.armas.rifle.rango, 60);
  assert.equal(D.armas.escopeta.perdigones, 8);
  assert.equal(D.armas.escopeta.dano, 10);
  assert.equal(D.armas.escopeta.cadencia, 0.9);
  assert.equal(D.armas.escopeta.rango, 14);
  assert.equal(D.armas.plasma.dano, 45);
  assert.equal(D.armas.plasma.danoArea, 20);
  assert.equal(D.armas.plasma.radioArea, 2);
  assert.equal(D.armas.plasma.cadencia, 0.6);
  assert.equal(D.armas.plasma.rango, 50);
  assert.equal(redondear(D.dpsArma("rifle", 0), 1), 90);
  assert.equal(redondear(D.dpsArma("escopeta", 0), 1), 88.9);
  assert.equal(redondear(D.dpsArma("plasma", 0), 1), 75);
});

test("armas: nombres, maestrías y daño por golpe inválidos lanzan RangeError", () => {
  assert.throws(() => D.dpsArma("constructor", 0), esError("RangeError"));
  assert.throws(() => D.dpsArma("arco", 4), esError("RangeError"));
  assert.throws(() => D.danoPorGolpe("hoja", 0), esError("RangeError"));
  assert.throws(() => D.cooldownArco(-1), esError("RangeError"));
});

test("rarezas: colores de docs 5.2 y el épico con 4,5:1 o más sobre el fondo del juego", () => {
  const colores = Object.fromEntries(plano(D.equipoRarezas).map((r) => [r.id, r.color]));
  assert.deepEqual(colores, {
    comun: "#8a8a8a",
    poco_comun: "#5cb85c",
    raro: "#4a90d9",
    epico: "#a35bbf",
    legendario: "#e67e22",
  });
  for (const r of plano(D.equipoRarezas)) {
    assert.ok(contraste(r.color, FONDO_JUEGO) >= 4.5, `${r.id} ${r.color}: ${contraste(r.color, FONDO_JUEGO).toFixed(2)}:1`);
  }
  // El morado de docs 5.2 (#9b59b6) y el del código anterior (#8e24aa) no llegan a 4,5:1.
  assert.ok(contraste("#9b59b6", FONDO_JUEGO) < 4.5);
  assert.ok(contraste("#8e24aa", FONDO_JUEGO) < 3);
  assert.equal(Math.round(contraste("#a35bbf", FONDO_JUEGO) * 100) / 100, 4.57);
});

test("rarezas: modificadores por rareza 1, 2, 2, 3 y 3", () => {
  assert.deepEqual(plano(D.equipoRarezas).map((r) => r.modificadores), [1, 2, 2, 3, 3]);
});

test("rangos base de modificadores (docs 5.3)", () => {
  const base = plano(D.MODIFICADORES);
  const min = Object.fromEntries(Object.entries(base).map(([id, m]) => [id, m.min]));
  const max = Object.fromEntries(Object.entries(base).map(([id, m]) => [id, m.max]));
  assert.deepEqual(min, { dano: 2, suerte: 1, velocidad: 1, armadura: 1, vida: 2, nucleos: 5, chatarra: 5 });
  assert.deepEqual(max, { dano: 6, suerte: 3, velocidad: 4, armadura: 4, vida: 6, nucleos: 15, chatarra: 15 });
  assert.equal(base.vida.unidad, "HP");
  assert.equal(base.suerte.unidad, "puntos");
  assert.equal(base.dano.unidad, "%");
});

test("escala por zona (docs 5.3): round(rango * (1 + 0,2 * (zona - 1))); en Z4 la vida va de 3 a 10 HP", () => {
  assert.deepEqual([1, 2, 3, 4].map((z) => Math.round(D.escalaZona(z) * 100) / 100), [1, 1.2, 1.4, 1.6]);
  assert.deepEqual(plano(D.rangoModificador("vida", 4)), [3, 10]);
  assert.deepEqual(plano(D.rangoModificador("vida", 1)), [2, 6]);
  assert.deepEqual(plano(D.rangoModificador("vida", 2)), [2, 7]);
  assert.deepEqual(plano(D.rangoModificador("armadura", 3)), [1, 6]);
  assert.deepEqual(plano(D.rangoModificador("suerte", 4)), [2, 5]);
  for (const id of ["dano", "suerte", "velocidad", "armadura", "vida", "nucleos", "chatarra"]) {
    assert.deepEqual(plano(D.rangoModificador(id, 4)), [
      Math.round(D.MODIFICADORES[id].min * 1.6),
      Math.round(D.MODIFICADORES[id].max * 1.6),
    ], `zona 4, ${id}`);
  }
  assert.throws(() => D.rangoModificador("vida", 5), esError("RangeError"));
  assert.throws(() => D.rangoModificador("oro", 1), esError("RangeError"));
});

test("forja (docs 5.5 y D8): cada nivel multiplica TODOS los modificadores por 1 + 0,10 * nivel", () => {
  const pieza = {
    ranura: "casco", rareza: "raro", zona: 2, forja: 0, set: "cristal",
    modificadores: [{ id: "vida", valor: 10 }, { id: "suerte", valor: 5 }],
  };
  assert.deepEqual(plano(D.statsDePieza(pieza)).map((s) => s.valor), [10, 5]);
  assert.deepEqual(plano(D.statsDePieza(pieza, 3)).map((s) => s.valor), [13, 6.5]);
  assert.deepEqual(plano(D.statsDePieza(pieza, 5)).map((s) => s.valor), [15, 7.5], "+5 da x1,5 en todos");
  assert.deepEqual(plano(D.statsDePieza(pieza, 2)).map((s) => s.valor), [12, 6]);
  assert.throws(() => D.statsDePieza(pieza, 6), esError("RangeError"));
  assert.throws(() => D.statsDePieza(pieza, -1), esError("RangeError"));
});

test("bonos de set: 3 piezas del mismo set activan el bono", () => {
  const chat = { set: "chatarra" };
  const cri = { set: "cristal" };
  assert.deepEqual(plano(D.bonosDeSet([chat, chat, null])), { dano: 0, vida: 0, activos: [] });
  assert.deepEqual(plano(D.bonosDeSet([chat, chat, chat, null])), { dano: 10, vida: 0, activos: ["chatarra"] });
  assert.deepEqual(plano(D.bonosDeSet([cri, cri, cri])), { dano: 0, vida: 15, activos: ["cristal"] });
  assert.deepEqual(
    plano(D.bonosDeSet([chat, chat, cri, cri, cri, chat])),
    { dano: 10, vida: 15, activos: ["chatarra", "cristal"] },
  );
});

test("tiempos objetivo: 2D 82, 3D 48, total 130", () => {
  const t2d = D.ZONAS.reduce((s, z) => s + z.minutos, 0);
  const t3d = D.SECTORES.reduce((s, z) => s + z.minutos, 0);
  assert.equal(t2d, D.TIEMPOS_OBJETIVO.fase2D);
  assert.equal(t3d, D.TIEMPOS_OBJETIVO.fase3D);
  assert.equal(t2d + t3d, D.TIEMPOS_OBJETIVO.total);
  assert.equal(D.TIEMPOS_OBJETIVO.total, 130);
  assert.equal(D.ZONAS.length, 4);
  assert.equal(D.ZONAS[3].jefe, "Guardián de chatarra");
});

test("XP de jefe por zona (docs 2.4 y 4.1): 150, 200, 300 y 400 (Z2 corregido de 220 a 200)", () => {
  assert.deepEqual(plano(D.ZONAS.map((z) => z.xpJefe)), [150, 200, 300, 400]);
});

test("ZONAS: sin rareza mínima por zona; la tabla 8.2 fija la distribución", () => {
  for (const z of plano(D.ZONAS)) assert.equal("rarezaMinima" in z, false, `zona ${z.id}`);
});

// Tabla 8.2 de docs/ceniza-diseno.md: pesos en porcentaje por tipo, zona y rareza (común a legendario).
const TABLA_8_2 = {
  comun: [[70, 25, 5, 0, 0], [50, 36, 11, 3, 0], [35, 40, 19, 5, 1], [25, 40, 25, 8, 2]],
  raro: [[40, 40, 16, 4, 0], [25, 40, 27, 7, 1], [15, 35, 33, 13, 4], [10, 30, 35, 18, 7]],
  jefe: [[0, 60, 32, 7, 1], [0, 40, 42, 15, 3], [0, 25, 44, 23, 8], [0, 15, 40, 30, 15]],
};
const ORDEN_RAREZAS = ["comun", "poco_comun", "raro", "epico", "legendario"];

test("probabilidades de rareza por cofre y zona coinciden con la tabla 8.2 (suerte 0)", () => {
  for (const tipo of Object.keys(TABLA_8_2)) {
    for (let zona = 1; zona <= 4; zona++) {
      const probs = plano(D.probabilidadesRareza(tipo, zona, 0));
      const pesos = ORDEN_RAREZAS.map((id) => Math.round(probs[id] * 100 * 1000) / 1000);
      assert.deepEqual(pesos, TABLA_8_2[tipo][zona - 1], `${tipo} zona ${zona}`);
      const suma = Object.values(probs).reduce((s, p) => s + p, 0);
      assert.ok(Math.abs(suma - 1) < 1e-9, `${tipo} zona ${zona}: suma ${suma}`);
    }
  }
  assert.throws(() => D.probabilidadesRareza("epico", 1, 0), esError("RangeError"));
  assert.throws(() => D.probabilidadesRareza("comun", 5, 0), esError("RangeError"));
});

// Probabilidad de rareza alta de docs 8.3, en porcentaje con un decimal.
test("suerte (docs 8.3): probabilidad de rareza alta con suerte 0 y 10", () => {
  const alta = (tipo, zona, suerte) => redondear(D.probabilidadSubidaRareza(tipo, zona, suerte) * 100, 1);
  assert.equal(alta("comun", 4, 0), 35.0);
  assert.equal(alta("comun", 4, 10), 41.2);
  assert.equal(alta("raro", 1, 0), 20.0);
  assert.equal(alta("raro", 1, 10), 24.5);
  assert.equal(alta("raro", 4, 0), 60.0);
  assert.equal(alta("raro", 4, 10), 66.1);
  assert.equal(alta("jefe", 1, 0), 40.0);
  assert.equal(alta("jefe", 1, 10), 46.4);
  assert.equal(alta("jefe", 4, 0), 85.0);
  assert.equal(alta("jefe", 4, 10), 88.0);
});

test("suerte: sube la rareza alta en todos los cofres y baja la común y la poco común", () => {
  for (const tipo of ["comun", "raro", "jefe"]) {
    for (let zona = 1; zona <= 4; zona++) {
      let previo = -1;
      for (const suerte of [0, 10, 40, 100]) {
        const p = D.probabilidadSubidaRareza(tipo, zona, suerte);
        assert.ok(p >= previo, `${tipo} zona ${zona}: la suerte ${suerte} debe subir la rareza alta`);
        previo = p;
      }
    }
  }
  const sinSuerte = plano(D.probabilidadesRareza("comun", 4, 0));
  const conSuerte = plano(D.probabilidadesRareza("comun", 4, 100));
  assert.ok(conSuerte.comun < sinSuerte.comun, "la común baja con la suerte");
  assert.ok(conSuerte.poco_comun < sinSuerte.poco_comun, "la poco común baja con la suerte");
});

test("suerte fuera de 0 a 100 puntos lanza RangeError", () => {
  assert.throws(() => D.probabilidadSubidaRareza("comun", 1, 101), esError("RangeError"));
  assert.throws(() => D.probabilidadSubidaRareza("comun", 1, -1), esError("RangeError"));
  assert.throws(() => D.abrirCofre("comun", 1, 101), esError("RangeError"));
});

test("generarPieza: modificadores según rareza, sin repetir, con rango de zona y forja +0", () => {
  const r = rngSemilla(11);
  const tipos = ["comun", "raro", "jefe"];
  for (let i = 0; i < 2000; i++) {
    const zona = 1 + Math.floor(r() * 4);
    const tipo = tipos[Math.floor(r() * tipos.length)];
    const pieza = plano(D.generarPieza(zona, tipo, r() * 40, r));
    const rareza = D.equipoRarezas.find((x) => x.id === pieza.rareza);
    assert.equal(pieza.modificadores.length, rareza.modificadores);
    assert.equal(pieza.forja, 0);
    assert.equal(pieza.zona, zona);
    assert.ok(D.RANURAS.includes(pieza.ranura));
    const ids = pieza.modificadores.map((m) => m.id);
    assert.equal(new Set(ids).size, ids.length, "modificadores repetidos");
    for (const m of pieza.modificadores) {
      assert.ok(D.MODIFICADORES_POR_RANURA[pieza.ranura].includes(m.id), `${m.id} no existe en ${pieza.ranura}`);
      const [min, max] = plano(D.rangoModificador(m.id, zona));
      assert.ok(m.valor >= min && m.valor <= max, `${m.id}=${m.valor} fuera de ${min}..${max} en zona ${zona}`);
    }
  }
});

test("generarPieza: la rareza sigue la tabla 8.2 (muestra grande, tolerancia de 2 puntos)", () => {
  const r = rngSemilla(7);
  const muestras = 20000;
  for (const [tipo, zona] of [["comun", 4], ["raro", 1], ["jefe", 2]]) {
    const cuentas = Object.fromEntries(ORDEN_RAREZAS.map((id) => [id, 0]));
    for (let i = 0; i < muestras; i++) cuentas[D.generarPieza(zona, tipo, 0, r).rareza] += 1;
    const esperadas = plano(D.probabilidadesRareza(tipo, zona, 0));
    for (const id of ORDEN_RAREZAS) {
      const frecuencia = cuentas[id] / muestras;
      assert.ok(Math.abs(frecuencia - esperadas[id]) < 0.02, `${tipo} z${zona} ${id}: ${frecuencia} frente a ${esperadas[id]}`);
    }
  }
});

test("generarPieza: un cofre de jefe nunca da rareza común", () => {
  const r = rngSemilla(17);
  for (let i = 0; i < 3000; i++) {
    const zona = 1 + Math.floor(r() * 4);
    assert.notEqual(D.generarPieza(zona, "jefe", 0, r).rareza, "comun");
  }
});

test("generarPieza sin rng usa Math.random; un rng que no es función lanza TypeError; tipo inválido, RangeError", () => {
  const pieza = plano(D.generarPieza(1, "comun", 0));
  assert.ok(pieza.modificadores.length >= 1);
  assert.throws(() => D.generarPieza(1, "comun", 0, 5), esError("TypeError"));
  assert.throws(() => D.generarPieza(1, "epico", 0, rngSemilla(1)), esError("RangeError"));
});

test("abrirCofre: XP, núcleos y chatarra según docs 8.1 (rangos iguales en todas las zonas)", () => {
  const r = rngSemilla(5);
  const tablas = {
    comun: { xp: 30, nucleos: [20, 40], chatarra: [10, 20] },
    raro: { xp: 75, nucleos: [60, 100], chatarra: [30, 50] },
    jefe: { xp: 120, nucleos: [150, 250], chatarra: [60, 100] },
  };
  for (const tipo of Object.keys(tablas)) {
    for (let zona = 1; zona <= 4; zona++) {
      for (let i = 0; i < 200; i++) {
        const cofre = plano(D.abrirCofre(tipo, zona, 10, r));
        const t = tablas[tipo];
        assert.equal(cofre.xp, t.xp, `${tipo} xp`);
        assert.ok(cofre.nucleos >= t.nucleos[0] && cofre.nucleos <= t.nucleos[1], `${tipo} z${zona}: ${cofre.nucleos}`);
        assert.ok(cofre.chatarra >= t.chatarra[0] && cofre.chatarra <= t.chatarra[1], `${tipo} z${zona}: ${cofre.chatarra}`);
        assert.ok(cofre.equipo === null || D.RANURAS.includes(cofre.equipo.ranura));
      }
    }
  }
  assert.equal(plano(D.tablaDeCofres.raro).xp, 75, "el cofre raro da 75 de XP (no 60)");
  assert.throws(() => D.abrirCofre("secreto", 1, 0, r), esError("RangeError"));
});

test("abrirCofre: probabilidad de pieza y de consumible según docs 8.1 (muestra grande)", () => {
  const r = rngSemilla(31);
  const muestras = 20000;
  const medir = (tipo) => {
    let piezas = 0;
    let consumibles = 0;
    for (let i = 0; i < muestras; i++) {
      const cofre = D.abrirCofre(tipo, 2, 0, r);
      if (cofre.equipo !== null) piezas += 1;
      if (cofre.consumible !== null) consumibles += 1;
    }
    return [piezas / muestras, consumibles / muestras];
  };
  const [pComun, cComun] = medir("comun");
  assert.ok(Math.abs(pComun - 0.40) < 0.02, `pieza común ${pComun}`);
  assert.ok(Math.abs(cComun - 0.25) < 0.02, `consumible común ${cComun}`);
  const [pRaro, cRaro] = medir("raro");
  assert.ok(Math.abs(pRaro - 0.75) < 0.02, `pieza rara ${pRaro}`);
  assert.ok(Math.abs(cRaro - 0.40) < 0.02, `consumible raro ${cRaro}`);
  const [pJefe, cJefe] = medir("jefe");
  assert.equal(pJefe, 1, "el cofre de jefe siempre trae pieza");
  assert.equal(cJefe, 1, "el cofre de jefe siempre trae consumible");
});

test("consumibles (docs 8.1): curación +40 % del HP máximo; bomba de 60 de daño en 96 px (2D) o 2 u (3D)", () => {
  assert.equal(D.CONSUMIBLES.curacion.curaFraccion, 0.40);
  assert.equal(D.CONSUMIBLES.curacion.nombre, "Curación");
  assert.equal(D.CONSUMIBLES.bomba.dano, 60);
  assert.equal(D.CONSUMIBLES.bomba.nombre, "Bomba");
  assert.equal(D.CONSUMIBLES.bomba.radioPx, 96);
  assert.equal(D.CONSUMIBLES.bomba.radioU, 2);
});

test("personaje por defecto: válido, con v 1, tono 0 y un brillo dentro de -20 a 20", () => {
  const base = plano(D.personajePorDefecto());
  assert.equal(D.validarPersonaje(base).ok, true);
  assert.equal(base.v, 1);
  const [minBrillo, maxBrillo] = plano(D.opcionesPersonaje.traje.brillo);
  assert.ok(base.traje.brillo >= minBrillo && base.traje.brillo <= maxBrillo, `brillo ${base.traje.brillo}`);
  assert.equal(base.traje.brillo, 0);
  assert.equal(base.traje.tono, 0);
});

test("validarPersonaje acepta el personaje por defecto y rechaza un color inventado", () => {
  const base = plano(D.personajePorDefecto());
  assert.equal(D.validarPersonaje(base).ok, true);
  const inventado = plano(base);
  inventado.traje.color = "fucsia-galactico";
  const r = D.validarPersonaje(inventado);
  assert.equal(r.ok, false);
  assert.ok(r.errores.length >= 1);
});

test("validarPersonaje rechaza claves heredadas como si fueran opciones", () => {
  const p = plano(D.personajePorDefecto());
  p.visor.color = "constructor";
  assert.equal(D.validarPersonaje(p).ok, false);
});

test("validarPersonaje exige v 1", () => {
  const p = plano(D.personajePorDefecto());
  delete p.v;
  assert.equal(D.validarPersonaje(p).ok, false);
  p.v = 2;
  assert.equal(D.validarPersonaje(p).ok, false);
});

test("validarPersonaje: la capa usa on (sí o no), no activa", () => {
  const p = plano(D.personajePorDefecto());
  assert.equal(p.capa.on, true);
  assert.equal("activa" in p.capa, false);
  p.capa.on = "sí";
  assert.equal(D.validarPersonaje(p).ok, false);
  p.capa = { color: "ceniza", activa: false };
  assert.equal(D.validarPersonaje(p).ok, false);
});

test("tono: de 0 a 345 en pasos de 15 (docs 9.1)", () => {
  const con = (tono) => {
    const p = plano(D.personajePorDefecto());
    p.traje.tono = tono;
    return D.validarPersonaje(p).ok;
  };
  for (const ok of [0, 15, 210, 345]) assert.equal(con(ok), true, `tono ${ok}`);
  for (const mal of [-15, 7, 10, 350, 360, 345.5, "15", null]) assert.equal(con(mal), false, `tono ${mal}`);
});

test("brillo: de -20 a +20 en pasos de 5 (docs 9.1)", () => {
  const con = (brillo) => {
    const p = plano(D.personajePorDefecto());
    p.traje.brillo = brillo;
    return D.validarPersonaje(p).ok;
  };
  for (const ok of [-20, -5, 0, 5, 20]) assert.equal(con(ok), true, `brillo ${ok}`);
  for (const mal of [-25, -22, 3, 25, 50, 100]) assert.equal(con(mal), false, `brillo ${mal}`);
  assert.deepEqual(plano(D.opcionesPersonaje.traje.tono), [0, 345]);
  assert.deepEqual(plano(D.opcionesPersonaje.traje.brillo), [-20, 20]);
  assert.equal(D.opcionesPersonaje.traje.pasoTono, 15);
  assert.equal(D.opcionesPersonaje.traje.pasoBrillo, 5);
});

test("nombre de viajero: máximo 12 caracteres, letras, números y espacios", () => {
  const con = (nombre) => {
    const p = plano(D.personajePorDefecto());
    p.nombre = nombre;
    return D.validarPersonaje(p).ok;
  };
  assert.equal(con("ABCDEFGHIJKL"), true); // 12
  assert.equal(con("ABCDEFGHIJKLM"), false); // 13
  assert.equal(con("Ñandú 2 Lu"), true);
  assert.equal(con("Ana_99"), false);
  assert.equal(con("Ana!"), false);
  assert.equal(con("   "), false);
  assert.equal(con(""), false);
});

test("nombre: recorta los espacios de los extremos y colapsa los dobles (docs 9.1), no los rechaza", () => {
  const con = (nombre) => {
    const p = plano(D.personajePorDefecto());
    p.nombre = nombre;
    return D.validarPersonaje(p).ok;
  };
  assert.equal(con(" Ana"), true);
  assert.equal(con("Ana  "), true);
  assert.equal(con("Ana    Lu"), true);
  assert.equal(D.normalizarNombre("  Ana    Lu  "), "Ana Lu");
  assert.equal(con("ABCDEFGHIJKL "), true, "12 caracteres más un espacio final se recortan a 12");
  assert.equal(con(" ABCDEFGHIJKLM "), false, "13 caracteres tras recortar");
  assert.equal(con("José"), true, "la tilde combinada se normaliza a NFC");
  assert.equal(D.normalizarNombre("José"), "José");
});

test("opciones del personaje: 8 colores, 5 visores, 4 cascos, 8 emblemas y 3 patrones (docs 9.1)", () => {
  assert.deepEqual(Object.keys(D.opcionesPersonaje.traje.colores), [
    "ceniza", "arena", "oxido", "cobalto", "musgo", "cristal", "carmesi", "ambar",
  ]);
  assert.deepEqual(Object.keys(D.opcionesPersonaje.visor.colores), ["ambar", "cian", "carmesi", "violeta", "blanco"]);
  assert.equal(D.opcionesPersonaje.casco.estilos.length, 4);
  assert.equal(D.opcionesPersonaje.emblema.iconos.length, 8);
  assert.deepEqual(plano(D.opcionesPersonaje.traje.patrones), ["liso", "rayas", "celdas"]);
  assert.equal(D.opcionesPersonaje.nombre.max, 12);
  assert.deepEqual(plano(D.opcionesPersonaje.capa.on), [true, false]);
});

test("exportar e importar devuelve el mismo personaje", () => {
  const p = plano(D.personajePorDefecto());
  p.nombre = "Ñandú 2 Lu";
  p.traje = { color: "carmesi", tono: 210, brillo: 15, };
  p.patron = "celdas";
  p.visor.color = "cian";
  p.capa.on = false;
  p.emblema.icono = "espiral";
  const codigo = D.exportarPersonaje(p);
  assert.match(codigo, /^CENIZA1\.[A-Za-z0-9+/]+=*\.[0-9a-f]{8}$/);
  const r = D.importarPersonaje(codigo);
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(plano(r.personaje), p);
  // Los espacios alrededor del código no afectan la lectura.
  assert.deepEqual(plano(D.importarPersonaje(`  ${codigo}\n`).personaje), p);
});

test("formato (docs 9.3): CENIZA1.<base64 del JSON en UTF-8>.<suma de control de la parte base64>", () => {
  const p = plano(D.personajePorDefecto());
  p.nombre = "Ñandú";
  const codigo = D.exportarPersonaje(p);
  const [prefijo, base, suma] = codigo.split(".");
  assert.equal(prefijo, "CENIZA1");
  assert.equal(codigo.split(".").length, 3, "separador punto");
  assert.equal(codigo.includes("-"), false, "ya no se usa guion");
  assert.equal(suma, fnv(base), "la suma de control va sobre la parte base64");
  const bytes = Buffer.from(base, "base64");
  assert.ok(bytes.includes(Buffer.from("Ñ", "utf8")), "el nombre va en UTF-8");
  const json = bytes.toString("utf8");
  assert.deepEqual(Object.keys(JSON.parse(json)), ["v", "traje", "visor", "casco", "capa", "emblema", "patron", "nombre"]);
  assert.deepEqual(Object.keys(JSON.parse(json).traje), ["color", "tono", "brillo"]);
  assert.deepEqual(Object.keys(JSON.parse(json).capa), ["color", "on"]);
  assert.equal(JSON.parse(json).v, 1);
});

test("suma de control FNV-1a: vectores fijos, y datos.js los cumple sin depender de la copia de esta prueba", () => {
  assert.equal(fnv("a"), "e40c292c");
  assert.equal(fnv(""), "811c9dc5");
  // Si la suma del código coincide con la de la base, el error llega después: a la lectura del base64.
  // "a" no es base64 válido (longitud 1), y "" tampoco. Así la prueba fija la suma de datos.js con vectores conocidos.
  const conSuma = (base, suma) => D.importarPersonaje(`CENIZA1.${base}.${suma}`).error;
  assert.equal(conSuma("a", "e40c292c"), "Código corrupto: base64 no válido");
  assert.equal(conSuma("", "811c9dc5"), "Código corrupto: base64 no válido");
  assert.equal(conSuma("a", "00000000"), "Código corrupto: la suma de control no coincide");
});

test("suma de control: un checksum calculado sobre el JSON se rechaza", () => {
  const json = JSON.stringify(D.personajePorDefecto());
  const base = Buffer.from(json, "utf8").toString("base64");
  const r = D.importarPersonaje(`CENIZA1.${base}.${fnv(json)}`);
  assert.equal(r.ok, false);
  assert.match(r.error, /suma de control/);
  assert.equal(D.importarPersonaje(`CENIZA1.${base}.${fnv(base)}`).ok, true, "con la suma sobre base64 sí");
});

test("el formato anterior con guiones se rechaza", () => {
  const p = plano(D.personajePorDefecto());
  const base = Buffer.from(JSON.stringify(p), "utf8").toString("base64");
  assert.equal(D.importarPersonaje(`CENIZA1-${base}-${fnv(base)}`).ok, false);
});

test("exportar un personaje inválido lanza TypeError", () => {
  const p = plano(D.personajePorDefecto());
  p.nombre = "x".repeat(13);
  assert.throws(() => D.exportarPersonaje(p), esError("TypeError"));
  const q = plano(D.personajePorDefecto());
  q.traje.brillo = 25;
  assert.throws(() => D.exportarPersonaje(q), esError("TypeError"));
});

test("importar: rechaza v distinto de 1, tono, brillo, nombre largo, patrón inventado y capa sin on", () => {
  const base = plano(D.personajePorDefecto());
  const variantes = [
    { ...base, v: 2 },
    { ...base, traje: { ...base.traje, tono: 10 } },
    { ...base, traje: { ...base.traje, brillo: 25 } },
    { ...base, nombre: "x".repeat(13) },
    { ...base, patron: "placas" },
    { ...base, capa: { color: "ceniza", activa: true } },
  ];
  for (const v of variantes) {
    const r = D.importarPersonaje(codigoManual(JSON.stringify(v)));
    assert.equal(r.ok, false, JSON.stringify(v).slice(0, 60));
    assert.equal(typeof r.error, "string");
  }
});

test("importar: el error de un campo inválido se explica en español, sin nombres internos", () => {
  const p = plano(D.personajePorDefecto());
  const r = D.importarPersonaje(codigoManual(JSON.stringify({ ...p, traje: { ...p.traje, color: "inventado" } })));
  assert.equal(r.ok, false);
  assert.equal(r.error, "Personaje no válido: el color del traje no existe");
  assert.doesNotMatch(r.error, /traje\.color/);
});

test("importar rechaza un código de más de 1024 caracteres sin decodificarlo; uno normal sigue entrando", () => {
  const enorme = "CENIZA1." + "A".repeat(2_000_000) + ".00000000";
  const r = D.importarPersonaje(enorme);
  assert.equal(r.ok, false);
  assert.match(r.error, /demasiado largo/);
  assert.equal(D.importarPersonaje(D.exportarPersonaje(plano(D.personajePorDefecto()))).ok, true);
});

test("importar: el nombre se recorta al importar", () => {
  const base = plano(D.personajePorDefecto());
  const r = D.importarPersonaje(codigoManual(JSON.stringify({ ...base, nombre: "  Ana   Lu " })));
  assert.equal(r.ok, true, r.error);
  assert.equal(r.personaje.nombre, "Ana Lu");
});

test("importar un código corrupto falla de forma controlada", () => {
  const p = plano(D.personajePorDefecto());
  const codigo = D.exportarPersonaje(p);
  const i = 12; // dentro de la parte base64
  const alterado = codigo.slice(0, i) + (codigo[i] === "A" ? "B" : "A") + codigo.slice(i + 1);
  const malos = [
    "",
    "   ",
    "CENIZA1.",
    "CENIZA1..",
    "CENIZA1.@@@@.00000000",
    "otra.cosa.00000000",
    alterado,
    codigo.slice(0, 20),
    codigo + "x",
    codigoManual('{"nombre":'),
    codigoManual(JSON.stringify({ ...p, traje: { ...p.traje, color: "inventado" } })),
    42,
    null,
    undefined,
    {},
  ];
  for (const m of malos) {
    const r = D.importarPersonaje(m);
    assert.equal(r.ok, false, `debería fallar: ${String(m).slice(0, 40)}`);
    assert.equal(typeof r.error, "string");
  }
});

test("importar: una parte base64 que no es UTF-8 válido falla sin lanzar", () => {
  const base = Buffer.from([0xff, 0xfe, 0x41]).toString("base64");
  const r = D.importarPersonaje(`CENIZA1.${base}.${fnv(base)}`);
  assert.equal(r.ok, false);
  assert.equal(typeof r.error, "string");
});

test("importar nunca lanza, aunque reciba texto aleatorio", () => {
  const r = rngSemilla(21);
  const alfabeto = "CENIZA1.=+/abcXYZ019 {}\"";
  for (let i = 0; i < 300; i++) {
    let texto = "CENIZA1.";
    const largo = Math.floor(r() * 60);
    for (let k = 0; k < largo; k++) texto += alfabeto[Math.floor(r() * alfabeto.length)];
    assert.doesNotThrow(() => D.importarPersonaje(texto));
  }
});

test("codigoManual con JSON válido (v 1) y checksum correcto sí se importa", () => {
  const p = plano(D.personajePorDefecto());
  const r = D.importarPersonaje(codigoManual(JSON.stringify(p)));
  assert.equal(r.ok, true, r.error);
});

test("statsDePieza sin argumento usa la forja de la pieza; con argumento usa ese nivel", () => {
  const pieza = {
    ranura: "casco", rareza: "raro", zona: 2, forja: 0, set: "cristal",
    modificadores: [{ id: "vida", valor: 10 }, { id: "suerte", valor: 5 }],
  };
  const sinForja = plano(D.statsDePieza(pieza));
  assert.deepEqual(sinForja.map((s) => s.valor), [10, 5]);
  assert.equal(sinForja[0].unidad, "HP");
  assert.equal(sinForja[1].unidad, "puntos");
  assert.deepEqual(plano(D.statsDePieza({ ...pieza, forja: 2 })).map((s) => s.valor), [12, 6], "forja de la pieza +2");
  assert.deepEqual(plano(D.statsDePieza(pieza, 5)).map((s) => s.valor), [15, 7.5], "argumento +5 sobre una pieza +0");
});
