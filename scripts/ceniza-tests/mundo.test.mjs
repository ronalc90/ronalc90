// Pruebas de docs/ceniza/mundo.js (Ceniza, mundo 2D de FASE 1).
// Ejecutar desde la raíz del repo: node --test scripts/ceniza-tests/mundo.test.mjs
// El archivo se carga con vm.runInNewContext, como un script clásico del navegador.
// Los objetos creados dentro del contexto son de otro realm: se copian con JSON.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const contexto = {};
// datos.js va primero: los tipos de cofre salen de CenizaDatos.tablaDeCofres y no de una copia en mundo.js.
vm.runInNewContext(
  fs.readFileSync(path.join(RAIZ, "docs", "ceniza", "datos.js"), "utf8"),
  contexto,
  { filename: "datos.js" },
);
vm.runInNewContext(
  fs.readFileSync(path.join(RAIZ, "docs", "ceniza", "mundo.js"), "utf8"),
  contexto,
  { filename: "mundo.js" },
);
const M = contexto.CenizaMundo;

// Copia en JSON para sacar los datos del realm del contexto.
const plano = (x) => JSON.parse(JSON.stringify(x));
const SALAS = plano(M.SALAS);
const ZONAS = plano(M.ZONAS);
const TIPOS = plano(M.TIPOS_ENEMIGO);
const RECOMPENSAS = plano(M.RECOMPENSAS_SECRETO);
const TIPOS_COFRE = Object.keys(plano(contexto.CenizaDatos.tablaDeCofres));
const ZONAS_IDS = [1, 2, 3, 4];

const porId = new Map(SALAS.map((s) => [s.id, s]));
const esJefe = (sala) => sala.enemigos.some((e) => TIPOS[e.tipo].clase === "jefe");
const salasDeZona = (zona) => SALAS.filter((s) => s.zona === zona);
const salasNormales = (zona) => salasDeZona(zona).filter((s) => !esJefe(s));
const jefeDeZona = (zona) => salasDeZona(zona).find((s) => esJefe(s));

// Puntos de apoyo de una sala: fogata, cofres, enemigos y secreto.
function puntosDeSala(sala) {
  const puntos = [];
  if (sala.fogata) puntos.push({ tipo: "fogata", ...sala.fogata });
  for (const c of sala.cofres) puntos.push({ tipo: "cofre", ...c });
  for (const e of sala.enemigos) puntos.push({ tipo: "enemigo", ...e });
  if (sala.secreto) puntos.push({ tipo: "secreto", ...sala.secreto });
  return puntos;
}

test("constantes: pantalla de 960 x 540 con suelo en y 440", () => {
  assert.equal(M.W, 960);
  assert.equal(M.H, 540);
  assert.equal(M.GROUND, 440);
  assert.equal(M.SALA_INICIAL, "Z1.1");
});

test("zonas en orden, con nombres y jefes del contrato", () => {
  assert.deepEqual(ZONAS.map((z) => z.orden), [1, 2, 3, 4]);
  assert.deepEqual(ZONAS.map((z) => z.id), [1, 2, 3, 4]);
  assert.deepEqual(ZONAS.map((z) => z.nombre), [
    "Duna tibia",
    "Ciudad de cristal",
    "Fundición de lava",
    "Bosque de chatarra",
  ]);
  assert.deepEqual(ZONAS.map((z) => z.jefe), [
    "Guardián de duna",
    "Centinela de cristal",
    "El Forjador",
    "Guardián de chatarra",
  ]);
});

test("16 salas: 4 por zona, ids únicos y orden de 1 a 4", () => {
  assert.equal(SALAS.length, 16);
  assert.equal(new Set(SALAS.map((s) => s.id)).size, 16);
  for (const z of ZONAS_IDS) {
    assert.deepEqual(salasDeZona(z).map((s) => s.orden), [1, 2, 3, 4], `zona ${z}`);
  }
});

test("la sala de jefe es la última de su zona, y es la única con jefe", () => {
  for (const z of ZONAS_IDS) {
    const jefe = jefeDeZona(z);
    assert.ok(jefe, `zona ${z} sin sala de jefe`);
    assert.equal(jefe.orden, 4, `zona ${z}: la sala de jefe debe ser la 4`);
    assert.ok(jefe.id.endsWith(".JEFE"), `zona ${z}: id de sala de jefe`);
    // En el camino de la cadena, las salas de la zona aparecen en orden y el jefe va al final.
    const camino = plano(M.caminoHasta(jefe.id));
    const deLaZona = camino.filter((id) => porId.get(id).zona === z);
    assert.deepEqual(deLaZona, salasDeZona(z).map((s) => s.id), `zona ${z}`);
    assert.equal(deLaZona[deLaZona.length - 1], jefe.id, `zona ${z}: el jefe debe ser el último`);
  }
  assert.equal(SALAS.filter(esJefe).length, 4);
});

test("cada sala de jefe tiene un solo jefe, con el nombre de su zona", () => {
  for (const z of ZONAS_IDS) {
    const jefes = jefeDeZona(z).enemigos.filter((e) => TIPOS[e.tipo].clase === "jefe");
    assert.equal(jefes.length, 1, `zona ${z}`);
    assert.equal(TIPOS[jefes[0].tipo].nombre, ZONAS[z - 1].jefe, `zona ${z}`);
    assert.equal(TIPOS[jefes[0].tipo].zona, z, `zona ${z}`);
  }
});

test("la sala inicial es la primera de la zona 1 y tiene fogata", () => {
  const inicial = porId.get(M.SALA_INICIAL);
  assert.ok(inicial, "SALA_INICIAL debe existir");
  assert.equal(inicial.zona, 1);
  assert.equal(inicial.orden, 1);
  assert.notEqual(inicial.fogata, null);
});

test("todas las salas son alcanzables desde SALA_INICIAL", () => {
  for (const s of SALAS) {
    const camino = plano(M.caminoHasta(s.id));
    assert.ok(camino.length >= 1, `${s.id} no es alcanzable`);
    assert.equal(camino[0], M.SALA_INICIAL, `${s.id}: el camino debe empezar en SALA_INICIAL`);
    assert.equal(camino[camino.length - 1], s.id, `${s.id}: el camino debe terminar en la sala`);
  }
});

test("las puertas son bidireccionales, con la misma condición en ambos sentidos", () => {
  for (const s of SALAS) {
    for (const p of s.puertas) {
      assert.notEqual(p.destino, s.id, `${s.id}: puerta a sí misma`);
      const destino = porId.get(p.destino);
      assert.ok(destino, `${s.id} apunta a una sala inexistente: ${p.destino}`);
      const vuelta = destino.puertas.filter((q) => q.destino === s.id);
      assert.equal(vuelta.length, 1, `${destino.id} debe tener una puerta de vuelta a ${s.id}`);
      assert.deepEqual(vuelta[0].condicion ?? null, p.condicion ?? null,
        `condición distinta entre ${s.id} y ${destino.id}`);
    }
  }
});

test("las puertas entre zonas van de la sala de jefe a la primera sala y exigen su jefe", () => {
  for (const s of SALAS) {
    for (const p of s.puertas) {
      const destino = porId.get(p.destino);
      if (destino.zona === s.zona) {
        assert.equal(p.condicion, undefined, `${s.id} -> ${destino.id}: puerta interna sin condición`);
        continue;
      }
      assert.equal(Math.abs(destino.zona - s.zona), 1, `${s.id} -> ${destino.id}: zonas no contiguas`);
      const anterior = Math.min(s.zona, destino.zona);
      assert.deepEqual(p.condicion, { tipo: "jefe", zona: anterior }, `${s.id} -> ${destino.id}`);
      const salaDeJefe = s.zona < destino.zona ? s : destino;
      const primera = s.zona < destino.zona ? destino : s;
      assert.equal(salaDeJefe.orden, 4, `${salaDeJefe.id} debe ser sala de jefe`);
      assert.equal(primera.orden, 1, `${primera.id} debe ser la primera de su zona`);
    }
  }
  // Z4 no enlaza con otra zona 2D: su sala de jefe tiene solo la puerta de vuelta.
  assert.equal(porId.get("Z4.JEFE").puertas.length, 1);
});

test("cada zona tiene de 2 a 4 cofres sumados en sus salas normales", () => {
  for (const z of ZONAS_IDS) {
    const normales = salasNormales(z).reduce((n, s) => n + s.cofres.length, 0);
    assert.ok(normales >= 2 && normales <= 4, `zona ${z}: ${normales} cofres normales`);
  }
});

test("cofres: comun y raro solo en salas normales, y un cofre de jefe en cada sala de jefe", () => {
  for (const s of SALAS) {
    for (const c of s.cofres) {
      assert.ok(TIPOS_COFRE.includes(c.tipo), `${s.id}: tipo de cofre ${c.tipo}`);
    }
    if (esJefe(s)) {
      assert.equal(s.cofres.length, 1, `${s.id}: un cofre de jefe`);
      assert.equal(s.cofres[0].tipo, "jefe", `${s.id}`);
    } else {
      assert.ok(s.cofres.every((c) => c.tipo !== "jefe"), `${s.id}: cofre de jefe fuera del jefe`);
    }
  }
  for (const z of ZONAS_IDS) {
    const total = salasDeZona(z).reduce((n, s) => n + s.cofres.length, 0);
    assert.equal(plano(M.cofresDeZona(z)).length, total, `zona ${z}: cofresDeZona debe sumar todos`);
  }
});

test("cada zona tiene exactamente una fogata, en su primera sala", () => {
  for (const z of ZONAS_IDS) {
    const conFogata = salasDeZona(z).filter((s) => s.fogata !== null);
    assert.equal(conFogata.length, 1, `zona ${z}`);
    assert.equal(conFogata[0].orden, 1, `zona ${z}: la fogata va en la primera sala`);
  }
});

test("cada zona tiene un secreto opcional, en una sala normal", () => {
  for (const z of ZONAS_IDS) {
    const conSecreto = salasDeZona(z).filter((s) => s.secreto !== null);
    assert.equal(conSecreto.length, 1, `zona ${z}`);
    assert.ok(!esJefe(conSecreto[0]), `zona ${z}: el secreto no va en la sala de jefe`);
    assert.ok(RECOMPENSAS.includes(conSecreto[0].secreto.recompensa), `zona ${z}: recompensa`);
  }
});

test("JEFE X: solo el Guardián de chatarra, y esJefeX solo se cumple en Z4.JEFE", () => {
  const marcados = Object.entries(TIPOS).filter(([, t]) => t.jefeX === true);
  assert.deepEqual(marcados.map(([id]) => id), ["guardian-chatarra"]);
  assert.equal(TIPOS["guardian-chatarra"].nombre, "Guardián de chatarra");
  assert.equal(TIPOS["guardian-chatarra"].zona, 4);
  for (const s of SALAS) {
    assert.equal(M.esJefeX(s.id), s.id === "Z4.JEFE", `esJefeX(${s.id})`);
  }
  assert.equal(M.esJefeX("no-existe"), false);
  assert.equal(M.esJefeX(undefined), false);
});

test("el suelo es la plataforma base en y 440 en todas las salas", () => {
  for (const s of SALAS) {
    const suelo = s.plataformas.find((p) => p.y === M.GROUND && p.x <= 0 && p.x + p.w >= M.W);
    assert.ok(suelo, `${s.id}: falta el suelo en y ${M.GROUND}`);
    assert.equal(suelo.y + suelo.h, M.H, `${s.id}: el suelo llega al borde inferior`);
  }
});

test("ninguna plataforma queda fuera de la pantalla", () => {
  for (const s of SALAS) {
    for (const p of s.plataformas) {
      assert.ok(p.w > 0 && p.h > 0, `${s.id}: plataforma sin tamaño ${JSON.stringify(p)}`);
      assert.ok(
        p.x >= 0 && p.y >= 0 && p.x + p.w <= M.W && p.y + p.h <= M.H,
        `${s.id}: plataforma fuera de pantalla ${JSON.stringify(p)}`,
      );
    }
  }
});

test("ninguna puerta está debajo del suelo ni fuera de la pantalla", () => {
  for (const s of SALAS) {
    for (const p of s.puertas) {
      assert.ok(p.ancho > 0 && p.alto > 0, `${s.id}: puerta sin tamaño`);
      assert.ok(p.x >= 0 && p.x + p.ancho <= M.W, `${s.id}: puerta fuera del ancho`);
      assert.ok(p.y >= 0, `${s.id}: puerta por encima del borde`);
      assert.ok(p.y + p.alto <= M.GROUND, `${s.id}: puerta debajo del suelo`);
      assert.equal(p.y + p.alto, M.GROUND, `${s.id}: la puerta se apoya en el suelo`);
    }
  }
});

test("fogata, cofres, enemigos y secreto quedan en pantalla y apoyados en suelo o plataforma", () => {
  for (const s of SALAS) {
    for (const pt of puntosDeSala(s)) {
      const etiqueta = `${s.id} ${pt.tipo} (${pt.x}, ${pt.y})`;
      assert.ok(pt.x >= 0 && pt.x <= M.W, `${etiqueta}: x fuera de pantalla`);
      assert.ok(pt.y >= 0 && pt.y <= M.GROUND, `${etiqueta}: y debajo del suelo o fuera`);
      const apoyo = s.plataformas.some((p) => p.y === pt.y && pt.x >= p.x && pt.x <= p.x + p.w);
      assert.ok(apoyo, `${etiqueta}: no está sobre el suelo ni sobre una plataforma`);
    }
  }
});

test("los enemigos de las salas existen en TIPOS_ENEMIGO y su clase es válida", () => {
  for (const s of SALAS) {
    for (const e of s.enemigos) {
      assert.ok(Object.prototype.hasOwnProperty.call(TIPOS, e.tipo), `${s.id}: enemigo ${e.tipo}`);
    }
  }
  for (const t of Object.values(TIPOS)) {
    assert.ok(["comun", "elite", "jefe"].includes(t.clase), `clase ${t.clase}`);
  }
});

test("salaPorId, caminoHasta y cofresDeZona devuelven lo esperado", () => {
  assert.equal(M.salaPorId("Z9.9"), null);
  assert.equal(plano(M.salaPorId("Z4.JEFE")).zona, 4);

  assert.deepEqual(plano(M.caminoHasta("Z1.3")), ["Z1.1", "Z1.2", "Z1.3"]);
  assert.deepEqual(plano(M.caminoHasta("Z2.1")), ["Z1.1", "Z1.2", "Z1.3", "Z1.JEFE", "Z2.1"]);
  assert.equal(plano(M.caminoHasta("Z4.JEFE")).length, 16);
  assert.deepEqual(plano(M.caminoHasta("no-existe")), []);

  const cofres = plano(M.cofresDeZona(1));
  assert.equal(cofres.length, 3, "Z1: 2 normales y el de jefe");
  assert.ok(cofres.every((c) => porId.get(c.salaId).zona === 1));
  assert.deepEqual(plano(M.cofresDeZona(9)), []);
});
