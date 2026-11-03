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

// Suma de control igual a la de datos.js, para fabricar códigos con checksum válido.
function fnv(texto) {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return ("00000000" + h.toString(16)).slice(-8);
}
const codigoManual = (texto) => `CENIZA1-${Buffer.from(texto, "latin1").toString("base64")}-${fnv(texto)}`;

test("curva de XP: monótona y con la fórmula del contrato", () => {
  let previo = 0;
  for (let n = 1; n <= 30; n++) {
    const xp = D.xpParaNivel(n);
    assert.ok(xp > previo, `nivel ${n} debe pedir más XP que el anterior`);
    previo = xp;
  }
  assert.equal(D.xpParaNivel(1), 40);
  assert.equal(D.xpParaNivel(2), 121); // 40 * 2^1,6 = 121,26
  assert.throws(() => D.xpParaNivel(0), esError("RangeError"));
  assert.throws(() => D.xpParaNivel(31), esError("RangeError"));
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

test("costos de forja crecientes y con la fórmula del contrato", () => {
  const costos = [0, 1, 2, 3, 4].map((n) => D.costoForja(n));
  assert.deepEqual(costos, [5, 14, 26, 40, 56]);
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
  assert.equal(con(" Ana"), false);
  assert.equal(con("   "), false);
  assert.equal(con(""), false);
});

test("opciones del personaje: 8 colores, 5 visores, 4 cascos, 8 emblemas, 3 patrones", () => {
  assert.equal(Object.keys(D.opcionesPersonaje.traje.colores).length, 8);
  assert.equal(Object.keys(D.opcionesPersonaje.visor.colores).length, 5);
  assert.equal(D.opcionesPersonaje.casco.estilos.length, 4);
  assert.equal(D.opcionesPersonaje.emblema.iconos.length, 8);
  assert.equal(D.opcionesPersonaje.traje.patrones.length, 3);
});

test("exportar e importar devuelve el mismo personaje", () => {
  const p = plano(D.personajePorDefecto());
  p.nombre = "Ñandú 2 Lu";
  p.traje = { color: "carmesi", tono: 210, brillo: 72, patron: "placas" };
  p.visor.color = "cian";
  p.capa.activa = false;
  p.emblema.icono = "espiral";
  const codigo = D.exportarPersonaje(p);
  assert.match(codigo, /^CENIZA1-[A-Za-z0-9+/]+=*-[0-9a-f]{8}$/);
  const r = D.importarPersonaje(codigo);
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(plano(r.personaje), p);
  // Los espacios alrededor del código no afectan la lectura.
  assert.deepEqual(plano(D.importarPersonaje(`  ${codigo}\n`).personaje), p);
});

test("exportar un personaje inválido lanza TypeError", () => {
  const p = plano(D.personajePorDefecto());
  p.nombre = "x".repeat(13);
  assert.throws(() => D.exportarPersonaje(p), esError("TypeError"));
});

test("importar un código corrupto falla de forma controlada", () => {
  const p = plano(D.personajePorDefecto());
  const codigo = D.exportarPersonaje(p);
  const i = 12; // dentro de la parte base64
  const alterado = codigo.slice(0, i) + (codigo[i] === "A" ? "B" : "A") + codigo.slice(i + 1);
  const malos = [
    "",
    "   ",
    "CENIZA1-",
    "CENIZA1-@@@@-00000000",
    "otra-cosa-00000000",
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

test("importar nunca lanza, aunque reciba texto aleatorio", () => {
  const r = rngSemilla(21);
  const alfabeto = "CENIZA1-=+/abcXYZ019 {}\"";
  for (let i = 0; i < 300; i++) {
    let texto = "CENIZA1-";
    const largo = Math.floor(r() * 60);
    for (let k = 0; k < largo; k++) texto += alfabeto[Math.floor(r() * alfabeto.length)];
    assert.doesNotThrow(() => D.importarPersonaje(texto));
  }
});

test("codigoManual con JSON válido y checksum correcto sí se importa", () => {
  const p = plano(D.personajePorDefecto());
  const r = D.importarPersonaje(codigoManual(JSON.stringify(p)));
  assert.equal(r.ok, true, r.error);
});

test("generarPieza: modificadores según rareza, sin repetir y con forja +0", () => {
  const r = rngSemilla(11);
  const bases = ["comun", "raro", "epico"];
  for (let i = 0; i < 2000; i++) {
    const zona = 1 + Math.floor(r() * 4);
    const base = bases[Math.floor(r() * bases.length)];
    const pieza = plano(D.generarPieza(zona, base, r() * 40, r));
    const rareza = D.equipoRarezas.find((x) => x.id === pieza.rareza);
    assert.equal(pieza.modificadores.length, rareza.modificadores);
    assert.equal(pieza.forja, 0);
    assert.ok(D.RANURAS.includes(pieza.ranura));
    const ids = pieza.modificadores.map((m) => m.id);
    assert.equal(new Set(ids).size, ids.length, "modificadores repetidos");
    for (const m of pieza.modificadores) {
      assert.ok(D.MODIFICADORES_POR_RANURA[pieza.ranura].includes(m.id), `${m.id} no existe en ${pieza.ranura}`);
      const def = D.MODIFICADORES[m.id];
      assert.ok(m.valor >= def.min && m.valor <= def.max, `${m.id}=${m.valor}`);
    }
  }
});

test("generarPieza: la rareza nunca baja de la base ni del mínimo de la zona", () => {
  const orden = plano(D.equipoRarezas).map((x) => x.id);
  const r = rngSemilla(3);
  for (let i = 0; i < 1000; i++) {
    const zona = 1 + Math.floor(r() * 4);
    const base = orden[Math.floor(r() * orden.length)];
    const pieza = plano(D.generarPieza(zona, base, 0, r));
    const minimo = Math.max(orden.indexOf(base), orden.indexOf(D.ZONAS[zona - 1].rarezaMinima));
    assert.ok(orden.indexOf(pieza.rareza) >= minimo, `zona ${zona} base ${base} -> ${pieza.rareza}`);
  }
});

test("generarPieza: la suerte sube la proporción de rareza legendaria", () => {
  const proporcion = (suerte) => {
    const r = rngSemilla(99);
    let legendarias = 0;
    for (let i = 0; i < 4000; i++) {
      if (D.generarPieza(4, "epico", suerte, r).rareza === "legendario") legendarias++;
    }
    return legendarias / 4000;
  };
  assert.ok(proporcion(0) < 0.12, `suerte 0: ${proporcion(0)}`);
  assert.ok(proporcion(100) > 0.9, `suerte 100: ${proporcion(100)}`);
});

test("generarPieza sin rng usa Math.random; un rng que no es función lanza TypeError", () => {
  const pieza = plano(D.generarPieza(1, "comun", 0));
  assert.ok(pieza.modificadores.length >= 1);
  assert.throws(() => D.generarPieza(1, "comun", 0, 5), esError("TypeError"));
});

test("statsDePieza: la forja sube +1 % por nivel solo al modificador principal", () => {
  const pieza = {
    ranura: "casco", rareza: "raro", zona: 2, forja: 0, set: "cristal",
    modificadores: [{ id: "vida", valor: 10 }, { id: "suerte", valor: 5 }],
  };
  assert.deepEqual(plano(D.statsDePieza(pieza)).map((s) => s.valor), [10, 5]);
  const s3 = plano(D.statsDePieza(pieza, 3));
  assert.deepEqual(s3.map((s) => s.valor), [10.3, 5]);
  assert.equal(s3[0].principal, true);
  assert.equal(s3[1].principal, false);
  assert.equal(plano(D.statsDePieza(pieza, 5))[0].valor, 10.5);
  assert.throws(() => D.statsDePieza(pieza, 6), esError("RangeError"));
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

test("abrirCofre: XP por tipo y núcleos dentro del rango de la zona", () => {
  const r = rngSemilla(5);
  for (const tipo of ["comun", "raro", "jefe"]) {
    for (let zona = 1; zona <= 4; zona++) {
      const cofre = plano(D.abrirCofre(tipo, zona, 10, r));
      const tabla = plano(D.tablaDeCofres[tipo]);
      assert.equal(cofre.xp, tabla.xp);
      const [min, max] = tabla.nucleos[zona - 1];
      assert.ok(cofre.nucleos >= min && cofre.nucleos <= max, `${tipo} z${zona}: ${cofre.nucleos}`);
      assert.ok(cofre.equipo === null || D.RANURAS.includes(cofre.equipo.ranura));
    }
  }
  assert.ok(plano(D.abrirCofre("jefe", 2, 0, r)).equipo !== null, "el cofre de jefe siempre trae pieza");
  assert.throws(() => D.abrirCofre("secreto", 1, 0, r), esError("RangeError"));
});

test("ZONAS: cada zona tiene su jefe y el orden es Z1 a Z4", () => {
  assert.deepEqual(plano(D.ZONAS.map((z) => z.jefe)), [
    "Guardián de duna", "Centinela de cristal", "El Forjador", "Guardián de chatarra",
  ]);
});
