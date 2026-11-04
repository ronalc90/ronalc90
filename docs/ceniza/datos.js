// Ceniza · datos y funciones puras del juego.
// Script clásico (sin módulos ES): define globalThis.CenizaDatos.
// Sin DOM, sin red y sin dependencias. Sirve en el navegador
// (<script src="ceniza/datos.js">) y en node:vm (ver scripts/ceniza-tests/).
// Las funciones aleatorias aceptan un rng opcional: una función que devuelve
// un número en [0, 1). Si no se pasa, se usa Math.random.
// Fuente de verdad: docs/ceniza-diseno.md. Reconciliado con el documento en la ronda 3.
(function () {
  "use strict";

  // ----------------------------------------------------------------- constantes
  const NIVEL_MAX = 30;
  const PUNTOS_POR_NIVEL = 3;
  const FORJA_MAX = 5;
  const FORJA_POR_NIVEL = 0.10;        // la forja multiplica TODOS los modificadores por 1 + 0,10 * nivel (5.5, D8)
  const COSTO_RESPEC = 200;            // núcleos para reasignar atributos en la fogata
  const LIMITE_ARCO = 0.95;            // el arco nunca supera el 95 % del DPS de la hoja
  const CRECIMIENTO_MAESTRIA = 0.10;   // +10 % de daño por nivel de maestría (0 a 3)
  const ESCALA_ZONA = 0.2;             // los rangos de modificadores suben un 20 % por zona (5.3)
  const BONO_SUERTE_RAREZA = 0.03;     // cada punto de suerte sube un 3 % relativo la rareza alta (8.3)
  const INDICE_RAREZA_ALTA = 2;        // desde "raro" (índice 2 de equipoRarezas) la rareza es alta
  const VERSION_PERSONAJE = 1;         // clave v del personaje y del código de exportación (9.2 y 9.3)
  const PREFIJO_CODIGO = "CENIZA1";    // prefijo del código de exportación (9.3)
  const SEPARADOR_CODIGO = ".";        // separa prefijo, base64 y suma de control (9.3)
  const ALFABETO_B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

  // ----------------------------------------------------------------- utilidades
  const tiene = (obj, clave) => Object.prototype.hasOwnProperty.call(obj, clave);
  const esObjeto = (x) => typeof x === "object" && x !== null && !Array.isArray(x);
  const esEntero = (x, min, max) => Number.isInteger(x) && x >= min && x <= max;
  const esPaso = (x, min, max, paso) => esEntero(x, min, max) && x % paso === 0;
  const esOpcion = (opciones, valor) => typeof valor === "string" &&
    (Array.isArray(opciones) ? opciones.indexOf(valor) >= 0 : tiene(opciones, valor));

  // Congela un dato y sus anidados para que la interfaz no altere las tablas.
  function congelar(obj) {
    for (const v of Object.values(obj)) if (typeof v === "object" && v !== null) congelar(v);
    return Object.freeze(obj);
  }

  // rng: función que devuelve un número en [0, 1). Sin argumento usa Math.random.
  function obtenerRng(rng) {
    if (rng === undefined) return Math.random;
    if (typeof rng !== "function") throw new TypeError("rng debe ser una función");
    return rng;
  }

  // Índice en [0, n - 1]; el mínimo evita salirse si rng() devuelve 1.
  const elegirIndice = (n, r) => Math.min(n - 1, Math.floor(r() * n));

  // Entero en [min, max], con rango = [min, max].
  function enRango(rango, r) {
    const span = rango[1] - rango[0];
    return rango[0] + Math.min(span, Math.floor(r() * (span + 1)));
  }

  function validarNivel(nivel) {
    if (!esEntero(nivel, 1, NIVEL_MAX)) throw new RangeError("El nivel va de 1 a " + NIVEL_MAX);
  }

  function validarMaestria(maestria) {
    if (!esEntero(maestria, 0, 3)) throw new RangeError("La maestría va de 0 a 3");
  }

  // La suerte se mide en puntos (docs 4.2, 5.3 y 8.3): cada punto sube un 3 % relativo la rareza alta.
  function validarSuerte(suerte) {
    if (typeof suerte !== "number" || !Number.isFinite(suerte) || suerte < 0 || suerte > 100) {
      throw new RangeError("La suerte va de 0 a 100 puntos");
    }
  }

  // ----------------------------------------------------------------- atributos y XP
  // Cada punto de atributo da el bono de su campo porPunto (vida en HP, el resto en %).
  const ATRIBUTOS = congelar({
    vida: { nombre: "Vida", porPunto: 8, unidad: "HP" },
    dano: { nombre: "Daño", porPunto: 3, unidad: "%" },
    armadura: { nombre: "Armadura", porPunto: 2, unidad: "%" },
    velocidad: { nombre: "Velocidad", porPunto: 2, unidad: "%" },
    suerte: { nombre: "Suerte", porPunto: 3, unidad: "%" },
  });

  // Enemigo común 5, élite 10, jefe de zona 150 a 400 (ver ZONAS.xpJefe), Coloso final 1000.
  const XP_FUENTES = congelar({
    enemigoComun: 5,
    elite: 10,
    jefeZona: { min: 150, max: 400 },
    coloso: 1000,
  });

  // XP total necesaria para llegar al nivel n: round(40 * n^1,6) (docs 4.1, total acumulado).
  function xpParaNivel(n) {
    validarNivel(n);
    return Math.round(40 * Math.pow(n, 1.6));
  }

  // Puntos de atributo acumulados al llegar al nivel n (3 por nivel; el nivel 1 no da puntos).
  function atributosDeNivel(nivel) {
    validarNivel(nivel);
    return { nivel, puntos: PUNTOS_POR_NIVEL * (nivel - 1) };
  }

  // Bono total de cada atributo según los puntos invertidos en él.
  function bonoDeAtributos(puntos) {
    if (!esObjeto(puntos)) throw new TypeError("Se esperaba un objeto con los puntos por atributo");
    const bono = {};
    for (const id of Object.keys(ATRIBUTOS)) {
      const p = tiene(puntos, id) ? puntos[id] : 0;
      if (!esEntero(p, 0, NIVEL_MAX * PUNTOS_POR_NIVEL)) throw new RangeError("Puntos no válidos en " + id);
      bono[id] = p * ATRIBUTOS[id].porPunto;
    }
    return bono;
  }

  // ----------------------------------------------------------------- rarezas y piezas
  // Orden de menor a mayor. modificadores: cuántos modificadores tiene cada pieza (docs 5.2).
  // Colores de docs 5.2. El épico cambió de #9b59b6 a #a35bbf: #9b59b6 da 4,28:1 sobre el fondo
  // #0b0807 y el mínimo es 4,5:1; #a35bbf da 4,57:1 (ver docs 5.2 y la prueba de contraste).
  const equipoRarezas = congelar([
    { id: "comun", nombre: "Común", color: "#8a8a8a", modificadores: 1 },
    { id: "poco_comun", nombre: "Poco común", color: "#5cb85c", modificadores: 2 },
    { id: "raro", nombre: "Raro", color: "#4a90d9", modificadores: 2 },
    { id: "epico", nombre: "Épico", color: "#a35bbf", modificadores: 3 },
    { id: "legendario", nombre: "Legendario", color: "#e67e22", modificadores: 3 },
  ]);

  function indiceRareza(id) {
    const i = equipoRarezas.findIndex((r) => r.id === id);
    if (i < 0) throw new RangeError("Rareza desconocida: " + id);
    return i;
  }

  const RANURAS = congelar(["arma", "casco", "pecho", "piernas", "botas", "accesorio1", "accesorio2"]);

  // Rango base (min, max) de cada modificador, en zona 1. Las zonas 2 a 4 escalan el rango (docs 5.3).
  // unidad: "%" (porcentaje), "HP" o "puntos" (la suerte, que sube la rareza alta de 8.3).
  const MODIFICADORES = congelar({
    dano: { nombre: "Daño", unidad: "%", min: 2, max: 6 },
    suerte: { nombre: "Suerte", unidad: "puntos", min: 1, max: 3 },
    velocidad: { nombre: "Velocidad", unidad: "%", min: 1, max: 4 },
    armadura: { nombre: "Armadura", unidad: "%", min: 1, max: 4 },
    vida: { nombre: "Vida", unidad: "HP", min: 2, max: 6 },
    nucleos: { nombre: "Núcleos encontrados", unidad: "%", min: 5, max: 15 },
    chatarra: { nombre: "Chatarra encontrada", unidad: "%", min: 5, max: 15 },
  });

  // Modificadores posibles por ranura (docs 5.1: el documento no fija el grupo de cada ranura).
  const MODIFICADORES_POR_RANURA = congelar({
    arma: ["dano", "suerte", "nucleos"],
    casco: ["vida", "suerte", "armadura"],
    pecho: ["vida", "armadura", "dano"],
    piernas: ["velocidad", "armadura", "vida"],
    botas: ["velocidad", "suerte", "armadura"],
    accesorio1: ["dano", "suerte", "vida", "nucleos", "chatarra"],
    accesorio2: ["dano", "suerte", "vida", "nucleos", "chatarra"],
  });

  // Set activo con 3 piezas del mismo set equipadas. bono: en % (dano) o HP (vida).
  const SETS = congelar({
    chatarra: { nombre: "Set Chatarra", piezas: 3, bono: { dano: 10 } },
    cristal: { nombre: "Set Cristal", piezas: 3, bono: { vida: 15 } },
  });

  // ----------------------------------------------------------------- zonas y tiempos
  // set: set que aporta la zona (null si ninguno). xpJefe: XP del jefe de la zona (docs 2.4 y 4.1).
  // La rareza mínima por zona que tenía el código se eliminó: la tabla 8.2 fija la distribución.
  const ZONAS = congelar([
    { id: 1, nombre: "Duna tibia", jefe: "Guardián de duna", minutos: 16, xpJefe: 150, set: null },
    { id: 2, nombre: "Ciudad de cristal", jefe: "Centinela de cristal", minutos: 20, xpJefe: 200, set: "cristal" },
    { id: 3, nombre: "Fundición de lava", jefe: "El Forjador", minutos: 22, xpJefe: 300, set: null },
    { id: 4, nombre: "Bosque de chatarra", jefe: "Guardián de chatarra", minutos: 24, xpJefe: 400, set: "chatarra", desbloquea: "FASE 2" },
  ]);

  const SECTORES = congelar([
    { id: "S1", nombre: "Pasillo de hielo", minutos: 12, arma: "rifle" },
    { id: "S2", nombre: "Taller de drones", minutos: 14, arma: "escopeta" },
    { id: "S3", nombre: "Cabina del coloso", minutos: 12, arma: "plasma" },
    { id: "COLOSO", nombre: "Coloso final", minutos: 10, arma: null },
  ]);

  // Minutos de referencia a velocidad 1.0. Mínimo exigido 120; lo opcional va aparte.
  const TIEMPOS_OBJETIVO = congelar({ fase2D: 82, fase3D: 48, total: 130, minimoExigido: 120 });

  // ----------------------------------------------------------------- armas y maestría
  // Valores de docs/ceniza-diseno.md, secciones 6.1 y 6.2 (maestría 0, sin filo ni crítico).
  // cadencia: segundos entre golpes o disparos (en el documento, "Cadencia (s)").
  // hoja: combo de 3 golpes; cadencias[k] es la espera tras el golpe k. onda: daño de la onda del golpe 3.
  // arco: cadencia es el cooldown base de la ráfaga; cooldownArco le aplica el tope del 95 %.
  // escopeta: dano es por perdigón y perdigones por disparo.
  // plasma: danoArea y radioArea no entran en el DPS directo.
  // rango: píxeles en 2D (alcance del juego actual) o metros en 3D.
  // MULTIDISPARO_ARCO: flechas por ráfaga = 1 + min(maestría, 2). El tope recorta el espaciado, no este número.
  const MULTIDISPARO_ARCO = congelar([1, 2, 3, 3]);
  const ARMAS = congelar({
    hoja: { nombre: "Hoja", tipo: "2d", golpes: [14, 14, 22], cadencias: [0.25, 0.25, 0.42], onda: 13, rango: 86 },
    arco: { nombre: "Arco", tipo: "2d", dano: 9, cadencia: 0.23, rango: 640, multidisparo: true },
    martillo: { nombre: "Martillo", tipo: "2d", dano: 28, cadencia: 0.72, rango: 84 },
    lanza: { nombre: "Lanza", tipo: "2d", dano: 16, cadencia: 0.46, rango: 240 },
    rifle: { nombre: "Rifle", tipo: "3d", dano: 18, cadencia: 0.2, rango: 60, sector: "S1" },
    escopeta: { nombre: "Escopeta", tipo: "3d", dano: 10, perdigones: 8, cadencia: 0.9, rango: 14, sector: "S2" },
    plasma: { nombre: "Plasma", tipo: "3d", dano: 45, danoArea: 20, radioArea: 2, cadencia: 0.6, rango: 50, sector: "S3" },
  });
  // Duración del ciclo completo de la hoja: 0,25 + 0,25 + 0,42 = 0,92 s.
  const CICLO_HOJA = ARMAS.hoja.cadencias.reduce((s, c) => s + c, 0);

  // Multiplicador de daño por maestría: P(m) = 1 + 0,10 * m (docs 7.2).
  const multiplicadorDano = (maestria) => 1 + CRECIMIENTO_MAESTRIA * maestria;

  // Daño de un golpe ya redondeado, igual que strike() del juego: Math.round por golpe.
  const danoGolpe = (base, maestria) => Math.round(base * multiplicadorDano(maestria));

  function validarArma(nombre) {
    if (typeof nombre !== "string" || !tiene(ARMAS, nombre)) throw new RangeError("Arma desconocida: " + nombre);
  }

  // Daño de cada golpe de la hoja con maestría m: los tres golpes del combo y la onda (tabla 7.3).
  function danoHoja(maestria) {
    validarMaestria(maestria);
    return {
      golpes: ARMAS.hoja.golpes.map((b) => danoGolpe(b, maestria)),
      onda: danoGolpe(ARMAS.hoja.onda, maestria),
    };
  }

  // Daño de un golpe o flecha ya redondeado. La hoja no tiene uno solo: usa danoHoja.
  function danoPorGolpe(nombre, maestria) {
    validarArma(nombre);
    validarMaestria(maestria);
    if (!tiene(ARMAS[nombre], "dano")) throw new RangeError(nombre + " no tiene daño por golpe; usa danoHoja");
    return danoGolpe(ARMAS[nombre].dano, maestria);
  }

  // DPS de la hoja: golpes y onda redondeados, sumados y divididos entre el ciclo de 0,92 s.
  function dpsHoja(maestria) {
    const d = danoHoja(maestria);
    return (d.golpes.reduce((s, x) => s + x, 0) + d.onda) / CICLO_HOJA;
  }

  // Techo a 3 decimales. La tolerancia de 1e-9 evita que un cociente exacto suba una milésima por coma flotante.
  const techo3 = (x) => Math.ceil(x * 1000 - 1e-9) / 1000;

  // Cooldown de la ráfaga del arco (docs 7.2). No baja de la cadencia base (0,23 s). El tope lo sube hasta
  // que la ráfaga no supere el 95 % del DPS de la hoja con la misma maestría. Se limita el espaciado
  // y no el número de flechas: MULTIDISPARO_ARCO se conserva.
  function cooldownArco(maestria) {
    validarMaestria(maestria);
    const rafaga = MULTIDISPARO_ARCO[maestria] * danoPorGolpe("arco", maestria);
    return Math.max(ARMAS.arco.cadencia, techo3(rafaga / (LIMITE_ARCO * dpsHoja(maestria))));
  }

  // DPS de un arma con su maestría. Arco: con el tope de cooldownArco. Escopeta: suma de sus perdigones.
  // Plasma: solo impacto directo.
  function dpsArma(nombre, maestria) {
    validarArma(nombre);
    validarMaestria(maestria);
    if (nombre === "hoja") return dpsHoja(maestria);
    if (nombre === "arco") return MULTIDISPARO_ARCO[maestria] * danoPorGolpe("arco", maestria) / cooldownArco(maestria);
    const arma = ARMAS[nombre];
    return danoPorGolpe(nombre, maestria) * (arma.perdigones || 1) / arma.cadencia;
  }

  // ----------------------------------------------------------------- forja
  // Costo en chatarra para subir la forja de nivelActual a nivelActual + 1: round(5 * (nivelActual + 1)^1,5).
  function costoForja(nivelActual) {
    if (!esEntero(nivelActual, 0, FORJA_MAX - 1)) throw new RangeError("La forja va de +0 a +" + FORJA_MAX);
    return Math.round(5 * Math.pow(nivelActual + 1, 1.5));
  }

  // ----------------------------------------------------------------- rangos por zona
  // Factor de escala de la zona: 1 + 0,2 * (zona - 1). Zona 4 da 1,6 (docs 5.3).
  function escalaZona(zona) {
    return 1 + ESCALA_ZONA * (zonaPorId(zona).id - 1);
  }

  // Rango [min, max] de un modificador en una zona: los límites base por la escala, redondeados.
  // Ejemplo: vida en Z4 va de round(2 * 1,6) = 3 a round(6 * 1,6) = 10 HP.
  function rangoModificador(id, zona) {
    if (typeof id !== "string" || !tiene(MODIFICADORES, id)) throw new RangeError("Modificador desconocido: " + id);
    const e = escalaZona(zona);
    return [Math.round(MODIFICADORES[id].min * e), Math.round(MODIFICADORES[id].max * e)];
  }

  // ----------------------------------------------------------------- cofres: rareza
  // Pesos en porcentaje por tipo de cofre, zona (Z1 a Z4) y rareza en el orden de equipoRarezas (docs 8.2).
  const PESOS_RAREZA_COFRE = congelar({
    comun: [[70, 25, 5, 0, 0], [50, 36, 11, 3, 0], [35, 40, 19, 5, 1], [25, 40, 25, 8, 2]],
    raro: [[40, 40, 16, 4, 0], [25, 40, 27, 7, 1], [15, 35, 33, 13, 4], [10, 30, 35, 18, 7]],
    jefe: [[0, 60, 32, 7, 1], [0, 40, 42, 15, 3], [0, 25, 44, 23, 8], [0, 15, 40, 30, 15]],
  });

  // Probabilidad (0 a 1) de cada rareza para un cofre, con la suerte de 8.3: los pesos de raro,
  // épico y legendario se multiplican por 1 + 0,03 * suerte, y después se normalizan.
  function probabilidadesRareza(tipo, zona, suerte = 0) {
    if (typeof tipo !== "string" || !tiene(PESOS_RAREZA_COFRE, tipo)) {
      throw new RangeError("Tipo de cofre desconocido: " + tipo);
    }
    const base = PESOS_RAREZA_COFRE[tipo][zonaPorId(zona).id - 1];
    validarSuerte(suerte);
    const factor = 1 + BONO_SUERTE_RAREZA * suerte;
    const pesos = base.map((p, i) => (i >= INDICE_RAREZA_ALTA ? p * factor : p));
    const total = pesos.reduce((s, p) => s + p, 0);
    const probs = {};
    equipoRarezas.forEach((rar, i) => { probs[rar.id] = pesos[i] / total; });
    return probs;
  }

  // Probabilidad de rareza alta (raro, épico o legendario). Nombre conservado por contrato:
  // en la versión de la ronda 3 ya no es una "subida" de escalón, sino la suma de la rareza alta de 8.2 y 8.3.
  function probabilidadSubidaRareza(tipo, zona, suerte = 0) {
    const probs = probabilidadesRareza(tipo, zona, suerte);
    return equipoRarezas.slice(INDICE_RAREZA_ALTA).reduce((s, rar) => s + probs[rar.id], 0);
  }

  // Elige una rareza según la tabla del cofre. r() en [0, 1) decide; la última con peso gana si r() queda al final.
  function tirarRareza(tipo, zona, suerte, r) {
    const probs = probabilidadesRareza(tipo, zona, suerte);
    const u = r();
    let acumulado = 0;
    let ultima = null;
    for (const rar of equipoRarezas) {
      const p = probs[rar.id];
      if (p <= 0) continue;
      ultima = rar.id;
      acumulado += p;
      if (u < acumulado) return rar.id;
    }
    return ultima;
  }

  function zonaPorId(id) {
    const z = ZONAS.find((x) => x.id === id);
    if (!z) throw new RangeError("Zona desconocida: " + id);
    return z;
  }

  // ----------------------------------------------------------------- generación de piezas
  // Genera una pieza nueva con forja +0 que sale de un cofre.
  // zona: 1 a 4. tipoCofre: "comun", "raro" o "jefe" (docs 8.1). Su rareza sale de la tabla 8.2 con la suerte.
  // suerte: puntos de suerte (docs 8.3). Los modificadores usan el rango de la zona (docs 5.3).
  function generarPieza(zona, tipoCofre, suerte = 0, rng) {
    const r = obtenerRng(rng);
    const z = zonaPorId(zona);
    const rareza = equipoRarezas[indiceRareza(tirarRareza(tipoCofre, z.id, suerte, r))];
    const ranura = RANURAS[elegirIndice(RANURAS.length, r)];
    const pool = MODIFICADORES_POR_RANURA[ranura].slice();
    const modificadores = [];
    for (let k = 0; k < rareza.modificadores; k++) {
      const id = pool.splice(elegirIndice(pool.length, r), 1)[0];
      modificadores.push({ id, valor: enRango(rangoModificador(id, z.id), r) });
    }
    return { ranura, rareza: rareza.id, zona: z.id, forja: 0, set: z.set, modificadores };
  }

  // Valores finales de una pieza. La forja (+0 a +5) multiplica TODOS los modificadores por 1 + 0,10 * nivel,
  // redondeado a 2 decimales (docs 5.5, D8). forja: si no se pasa, se usa pieza.forja.
  function statsDePieza(pieza, forja) {
    if (!esObjeto(pieza) || !Array.isArray(pieza.modificadores) || pieza.modificadores.length === 0) {
      throw new TypeError("Pieza no válida");
    }
    const nivel = forja === undefined ? pieza.forja : forja;
    if (!esEntero(nivel, 0, FORJA_MAX)) throw new RangeError("La forja va de +0 a +" + FORJA_MAX);
    const factor = 1 + FORJA_POR_NIVEL * nivel;
    return pieza.modificadores.map((m) => {
      if (!esObjeto(m) || !tiene(MODIFICADORES, m.id) || typeof m.valor !== "number") {
        throw new TypeError("Modificador no válido");
      }
      const def = MODIFICADORES[m.id];
      const valor = Math.round(m.valor * factor * 100) / 100;
      return { id: m.id, nombre: def.nombre, unidad: def.unidad, valor };
    });
  }

  // Bonos de los sets activos. piezas: piezas equipadas (ranuras vacías como null).
  function bonosDeSet(piezas) {
    if (!Array.isArray(piezas)) throw new TypeError("Se esperaba un arreglo de piezas");
    const conteo = {};
    for (const p of piezas) {
      if (esObjeto(p) && typeof p.set === "string" && tiene(SETS, p.set)) {
        conteo[p.set] = (conteo[p.set] || 0) + 1;
      }
    }
    const bonos = { dano: 0, vida: 0, activos: [] };
    for (const id of Object.keys(SETS)) {
      const set = SETS[id];
      if ((conteo[id] || 0) < set.piezas) continue;
      for (const k of Object.keys(set.bono)) bonos[k] += set.bono[k];
      bonos.activos.push(id);
    }
    return bonos;
  }

  // ----------------------------------------------------------------- cofres y consumibles
  // Docs 8.1. Cada tipo tiene la XP, la probabilidad de pieza y de consumible, y los rangos de núcleos y chatarra
  // (iguales en todas las zonas). probEquipo y probConsumible son fracciones de 0 a 1.
  const tablaDeCofres = congelar({
    comun: { nombre: "Cofre común", xp: 30, probEquipo: 0.40, probConsumible: 0.25, nucleos: [20, 40], chatarra: [10, 20] },
    raro: { nombre: "Cofre raro", xp: 75, probEquipo: 0.75, probConsumible: 0.40, nucleos: [60, 100], chatarra: [30, 50] },
    jefe: { nombre: "Cofre de jefe", xp: 120, probEquipo: 1, probConsumible: 1, nucleos: [150, 250], chatarra: [60, 100] },
  });

  // curaFraccion: fracción del HP máximo (docs 8.1: +40 %). Bomba: daño y radio en 2D (px) y 3D (u).
  const CONSUMIBLES = congelar({
    curacion: { nombre: "Vendaje de ceniza", curaFraccion: 0.40 },
    bomba: { nombre: "Bomba de ceniza", dano: 60, radioPx: 96, radioU: 2 },
  });

  // Abre un cofre: XP, núcleos, chatarra, pieza y consumible opcionales, según el tipo, la zona y la suerte.
  function abrirCofre(tipo, zona, suerte = 0, rng) {
    if (typeof tipo !== "string" || !tiene(tablaDeCofres, tipo)) throw new RangeError("Tipo de cofre desconocido: " + tipo);
    const tabla = tablaDeCofres[tipo];
    const z = zonaPorId(zona);
    validarSuerte(suerte);
    const r = obtenerRng(rng);
    const nucleos = enRango(tabla.nucleos, r);
    const chatarra = enRango(tabla.chatarra, r);
    const equipo = r() < tabla.probEquipo ? generarPieza(z.id, tipo, suerte, r) : null;
    const consumible = r() < tabla.probConsumible ? (r() < 0.5 ? "curacion" : "bomba") : null;
    return { tipo, xp: tabla.xp, nucleos, chatarra, equipo, consumible };
  }

  // ----------------------------------------------------------------- utf-8 y base64
  // Texto UTF-8 como cadena de bytes (cada carácter vale de 0 a 255). Usa encodeURIComponent y decodeURIComponent,
  // que existen en todos los entornos y lanzan URIError si el texto o los bytes no son UTF-8 válidos.
  function codificarUtf8(texto) {
    return encodeURIComponent(texto).replace(/%([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  }

  function decodificarUtf8(bytes) {
    let porcentual = "";
    for (let i = 0; i < bytes.length; i++) {
      porcentual += "%" + ("0" + bytes.charCodeAt(i).toString(16)).slice(-2).toUpperCase();
    }
    return decodeURIComponent(porcentual);
  }

  // Base64 de una cadena de bytes (sin depender de btoa, que no existe en todos los entornos).
  function codificarBase64(bytes) {
    let salida = "";
    for (let i = 0; i < bytes.length; i += 3) {
      const a = bytes.charCodeAt(i);
      const b = i + 1 < bytes.length ? bytes.charCodeAt(i + 1) : 0;
      const c = i + 2 < bytes.length ? bytes.charCodeAt(i + 2) : 0;
      const n = (a << 16) | (b << 8) | c;
      salida += ALFABETO_B64[(n >> 18) & 63] + ALFABETO_B64[(n >> 12) & 63];
      salida += i + 1 < bytes.length ? ALFABETO_B64[(n >> 6) & 63] : "=";
      salida += i + 2 < bytes.length ? ALFABETO_B64[n & 63] : "=";
    }
    return salida;
  }

  // Devuelve la cadena de bytes o null si el base64 no es válido.
  function decodificarBase64(texto) {
    if (texto.length === 0 || texto.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(texto)) return null;
    const limpio = texto.replace(/=+$/, "");
    let acumulado = 0;
    let bits = 0;
    let salida = "";
    for (const ch of limpio) {
      acumulado = ((acumulado << 6) | ALFABETO_B64.indexOf(ch)) & 0xffff;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        salida += String.fromCharCode((acumulado >> bits) & 0xff);
      }
    }
    return salida;
  }

  // Suma de control FNV-1a de 32 bits en hexadecimal (8 dígitos). Detecta códigos alterados.
  function hashTexto(texto) {
    let h = 0x811c9dc5;
    for (let i = 0; i < texto.length; i++) {
      h ^= texto.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return ("00000000" + h.toString(16)).slice(-8);
  }

  // ----------------------------------------------------------------- personaje
  // Docs 9.1. Solo visual: no cambia atributos ni estadísticas.
  const COLORES_TRAJE = congelar({
    ceniza: "#7d7a78",
    arena: "#c9a66b",
    oxido: "#a4502f",
    cobalto: "#2f5f8f",
    musgo: "#5b6b3a",
    cristal: "#9fc9d8",
    carmesi: "#8c1d2c",
    ambar: "#c98a1b",
  });
  const COLORES_VISOR = congelar({
    ambar: "#ffb24a",
    cian: "#35d0e0",
    carmesi: "#e0403a",
    violeta: "#b07cff",
    blanco: "#f2efe9",
  });
  const ESTILOS_CASCO = congelar(["sencillo", "cerrado", "cresta", "rastreador"]);
  const ICONOS_EMBLEMA = congelar(["sol", "luna", "ala", "rayo", "espiral", "gota", "estrella", "ancla"]);
  const PATRONES_TRAJE = congelar(["liso", "rayas", "celdas"]);
  const NOMBRE_MAX = 12;
  // Letras (incluidas tildes y ñ), dígitos y espacios. Tras normalizar no quedan espacios dobles ni en los extremos.
  const PATRON_NOMBRE = /^[\p{L}\p{Nd} ]+$/u;
  // Tono en pasos de 15 de 0 a 345; brillo en pasos de 5 de -20 a +20 (docs 9.1).
  const TONO_RANGO = [0, 345];
  const TONO_PASO = 15;
  const BRILLO_RANGO = [-20, 20];
  const BRILLO_PASO = 5;

  const opcionesPersonaje = congelar({
    traje: {
      colores: COLORES_TRAJE,
      tono: TONO_RANGO,
      pasoTono: TONO_PASO,
      brillo: BRILLO_RANGO,
      pasoBrillo: BRILLO_PASO,
      patrones: PATRONES_TRAJE,
    },
    visor: { colores: COLORES_VISOR },
    casco: { estilos: ESTILOS_CASCO },
    capa: { colores: COLORES_TRAJE, on: [true, false] },
    emblema: { iconos: ICONOS_EMBLEMA },
    nombre: { min: 1, max: NOMBRE_MAX, permitido: "letras, números y espacios; se recortan los extremos y se colapsan los dobles" },
  });

  // Recorta los espacios de los extremos, colapsa los dobles y pasa a NFC (docs 9.1). Espera una cadena.
  function normalizarNombre(nombre) {
    return nombre.normalize("NFC").replace(/ {2,}/g, " ").trim();
  }

  function nombreValido(nombre) {
    if (typeof nombre !== "string") return false;
    const n = normalizarNombre(nombre);
    const largo = Array.from(n).length;
    return largo >= opcionesPersonaje.nombre.min && largo <= NOMBRE_MAX && PATRON_NOMBRE.test(n);
  }

  // Devuelve { ok, errores }. Rechaza cualquier valor fuera de las opciones.
  function validarPersonaje(obj) {
    const errores = [];
    if (!esObjeto(obj)) return { ok: false, errores: ["el personaje debe ser un objeto"] };
    if (obj.v !== VERSION_PERSONAJE) errores.push("v debe ser " + VERSION_PERSONAJE);
    if (!nombreValido(obj.nombre)) errores.push("nombre: 1 a 12 letras, números o espacios");
    const traje = esObjeto(obj.traje) ? obj.traje : {};
    if (!esOpcion(COLORES_TRAJE, traje.color)) errores.push("traje.color no existe");
    if (!esPaso(traje.tono, TONO_RANGO[0], TONO_RANGO[1], TONO_PASO)) errores.push("traje.tono debe ser de 0 a 345 en pasos de 15");
    if (!esPaso(traje.brillo, BRILLO_RANGO[0], BRILLO_RANGO[1], BRILLO_PASO)) errores.push("traje.brillo debe ser de -20 a 20 en pasos de 5");
    if (!esOpcion(PATRONES_TRAJE, obj.patron)) errores.push("patron no existe");
    const visor = esObjeto(obj.visor) ? obj.visor : {};
    if (!esOpcion(COLORES_VISOR, visor.color)) errores.push("visor.color no existe");
    const casco = esObjeto(obj.casco) ? obj.casco : {};
    if (!esOpcion(ESTILOS_CASCO, casco.estilo)) errores.push("casco.estilo no existe");
    const capa = esObjeto(obj.capa) ? obj.capa : {};
    if (!esOpcion(COLORES_TRAJE, capa.color)) errores.push("capa.color no existe");
    if (typeof capa.on !== "boolean") errores.push("capa.on debe ser sí o no");
    const emblema = esObjeto(obj.emblema) ? obj.emblema : {};
    if (!esOpcion(ICONOS_EMBLEMA, emblema.icono)) errores.push("emblema.icono no existe");
    return { ok: errores.length === 0, errores };
  }

  // Copia solo con los campos conocidos y en el orden del documento (9.3): sin claves extra y con el nombre normalizado.
  function normalizarPersonaje(obj) {
    return {
      v: VERSION_PERSONAJE,
      traje: { color: obj.traje.color, tono: obj.traje.tono, brillo: obj.traje.brillo },
      visor: { color: obj.visor.color },
      casco: { estilo: obj.casco.estilo },
      capa: { color: obj.capa.color, on: obj.capa.on },
      emblema: { icono: obj.emblema.icono },
      patron: obj.patron,
      nombre: normalizarNombre(obj.nombre),
    };
  }

  function personajePorDefecto() {
    return normalizarPersonaje({
      v: VERSION_PERSONAJE,
      nombre: "Viajero",
      traje: { color: "ceniza", tono: 0, brillo: 0 },
      visor: { color: "ambar" },
      casco: { estilo: "sencillo" },
      capa: { color: "ceniza", on: true },
      emblema: { icono: "sol" },
      patron: "liso",
    });
  }

  // Formato (docs 9.3): CENIZA1.<base64 del JSON en UTF-8>.<suma de control de la parte base64>.
  // Lanza TypeError si el personaje no es válido.
  function exportarPersonaje(obj) {
    const v = validarPersonaje(obj);
    if (!v.ok) throw new TypeError("No se puede exportar el personaje: " + v.errores.join("; "));
    const base = codificarBase64(codificarUtf8(JSON.stringify(normalizarPersonaje(obj))));
    return PREFIJO_CODIGO + SEPARADOR_CODIGO + base + SEPARADOR_CODIGO + hashTexto(base);
  }

  // Devuelve { ok: true, personaje } o { ok: false, error }. Nunca lanza.
  // Orden de validación (docs 9.3): prefijo, suma de control, base64, UTF-8, JSON, versión, rangos, tipos y nombre.
  function importarPersonaje(codigo) {
    const fallo = (error) => ({ ok: false, error });
    try {
      if (typeof codigo !== "string") return fallo("El código debe ser texto");
      const partes = codigo.trim().split(SEPARADOR_CODIGO);
      if (partes.length !== 3 || partes[0] !== PREFIJO_CODIGO) return fallo("Formato de código no reconocido");
      const base = partes[1];
      if (hashTexto(base) !== partes[2]) return fallo("Código corrupto: la suma de control no coincide");
      const bytes = decodificarBase64(base);
      if (bytes === null) return fallo("Código corrupto: base64 no válido");
      const json = decodificarUtf8(bytes);
      const obj = JSON.parse(json);
      const v = validarPersonaje(obj);
      if (!v.ok) return fallo("Personaje no válido: " + v.errores[0]);
      return { ok: true, personaje: normalizarPersonaje(obj) };
    } catch (e) {
      return fallo("Código corrupto: no se pudo leer");
    }
  }

  globalThis.CenizaDatos = congelar({
    NIVEL_MAX,
    PUNTOS_POR_NIVEL,
    FORJA_MAX,
    COSTO_RESPEC,
    LIMITE_ARCO,
    CRECIMIENTO_MAESTRIA,
    ATRIBUTOS,
    XP_FUENTES,
    xpParaNivel,
    atributosDeNivel,
    bonoDeAtributos,
    equipoRarezas,
    RANURAS,
    MODIFICADORES,
    MODIFICADORES_POR_RANURA,
    SETS,
    generarPieza,
    statsDePieza,
    bonosDeSet,
    costoForja,
    escalaZona,
    rangoModificador,
    probabilidadesRareza,
    probabilidadSubidaRareza,
    ZONAS,
    SECTORES,
    TIEMPOS_OBJETIVO,
    tablaDeCofres,
    CONSUMIBLES,
    abrirCofre,
    armas: ARMAS,
    MULTIDISPARO_ARCO,
    cicloHoja: CICLO_HOJA,
    danoHoja,
    danoPorGolpe,
    dpsArma,
    cooldownArco,
    opcionesPersonaje,
    normalizarNombre,
    personajePorDefecto,
    validarPersonaje,
    exportarPersonaje,
    importarPersonaje,
  });
})();
