// Ceniza · datos y funciones puras del juego.
// Script clásico (sin módulos ES): define globalThis.CenizaDatos.
// Sin DOM, sin red y sin dependencias. Sirve en el navegador
// (<script src="ceniza/datos.js">) y en node:vm (ver scripts/ceniza-tests/).
// Las funciones aleatorias aceptan un rng opcional: una función que devuelve
// un número en [0, 1). Si no se pasa, se usa Math.random.
(function () {
  "use strict";

  // ----------------------------------------------------------------- constantes
  const NIVEL_MAX = 30;
  const PUNTOS_POR_NIVEL = 3;
  const FORJA_MAX = 5;
  const COSTO_RESPEC = 200;            // núcleos para reasignar atributos en la fogata
  const LIMITE_ARCO = 0.95;            // el arco nunca supera el 95 % del DPS de la hoja
  const PROB_SUBIDA_BASE = 5;          // % base de subir un escalón de rareza al generar una pieza
  const CRECIMIENTO_MAESTRIA = 0.10;   // +10 % de daño por nivel de maestría (0 a 3)
  const PREFIJO_CODIGO = "CENIZA1";
  const ALFABETO_B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

  // ----------------------------------------------------------------- utilidades
  const tiene = (obj, clave) => Object.prototype.hasOwnProperty.call(obj, clave);
  const esObjeto = (x) => typeof x === "object" && x !== null && !Array.isArray(x);
  const esEntero = (x, min, max) => Number.isInteger(x) && x >= min && x <= max;
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

  function validarSuerte(suerte) {
    if (typeof suerte !== "number" || !Number.isFinite(suerte) || suerte < 0 || suerte > 100) {
      throw new RangeError("La suerte va de 0 a 100 (%)");
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

  // Enemigo común 5, élite 10, jefe de zona 150 a 400, Coloso final 1000.
  const XP_FUENTES = congelar({
    enemigoComun: 5,
    elite: 10,
    jefeZona: { min: 150, max: 400 },
    coloso: 1000,
  });

  // XP necesaria para subir al nivel n: 40 * n^1,6 redondeado.
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
  // Orden de menor a mayor. modificadores: cuántos modificadores tiene cada pieza.
  const equipoRarezas = congelar([
    { id: "comun", nombre: "Común", color: "#9e9e9e", modificadores: 1 },
    { id: "poco_comun", nombre: "Poco común", color: "#43a047", modificadores: 2 },
    { id: "raro", nombre: "Raro", color: "#1e88e5", modificadores: 2 },
    { id: "epico", nombre: "Épico", color: "#8e24aa", modificadores: 3 },
    { id: "legendario", nombre: "Legendario", color: "#fb8c00", modificadores: 3 },
  ]);
  const RAREZA_ULTIMA = equipoRarezas.length - 1;

  function indiceRareza(id) {
    const i = equipoRarezas.findIndex((r) => r.id === id);
    if (i < 0) throw new RangeError("Rareza desconocida: " + id);
    return i;
  }

  const RANURAS = congelar(["arma", "casco", "pecho", "piernas", "botas", "accesorio1", "accesorio2"]);

  // Rango (min, max) del valor base de cada modificador.
  const MODIFICADORES = congelar({
    dano: { nombre: "Daño", unidad: "%", min: 3, max: 8 },
    suerte: { nombre: "Suerte", unidad: "%", min: 3, max: 9 },
    velocidad: { nombre: "Velocidad", unidad: "%", min: 2, max: 6 },
    armadura: { nombre: "Armadura", unidad: "%", min: 2, max: 6 },
    vida: { nombre: "Vida", unidad: "HP", min: 6, max: 14 },
    nucleos: { nombre: "Núcleos encontrados", unidad: "%", min: 5, max: 15 },
    chatarra: { nombre: "Chatarra encontrada", unidad: "%", min: 5, max: 15 },
  });

  // Modificadores posibles por ranura. El primero de cada pieza es el principal (lo sube la forja).
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
  // rarezaMinima: la rareza mínima de las piezas que sueltan los cofres de la zona.
  // set: set que aporta la zona (null si ninguno).
  const ZONAS = congelar([
    { id: 1, nombre: "Duna tibia", jefe: "Guardián de duna", minutos: 16, xpJefe: 150, set: null, rarezaMinima: "comun" },
    { id: 2, nombre: "Ciudad de cristal", jefe: "Centinela de cristal", minutos: 20, xpJefe: 220, set: "cristal", rarezaMinima: "poco_comun" },
    { id: 3, nombre: "Fundición de lava", jefe: "El Forjador", minutos: 22, xpJefe: 300, set: null, rarezaMinima: "raro" },
    { id: 4, nombre: "Bosque de chatarra", jefe: "Guardián de chatarra", minutos: 24, xpJefe: 400, set: "chatarra", rarezaMinima: "epico", desbloquea: "FASE 2" },
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
  // Costo en chatarra para subir la forja de nivelActual a nivelActual + 1: 5 * (nivelActual + 1)^1,5.
  function costoForja(nivelActual) {
    if (!esEntero(nivelActual, 0, FORJA_MAX - 1)) throw new RangeError("La forja va de +0 a +" + FORJA_MAX);
    return Math.round(5 * Math.pow(nivelActual + 1, 1.5));
  }

  // ----------------------------------------------------------------- generación de piezas
  // Probabilidad de subir un escalón de rareza: 5 % base más la suerte (en %), con tope de 95 %.
  function probabilidadSubidaRareza(suerte) {
    validarSuerte(suerte);
    return Math.min(0.95, (PROB_SUBIDA_BASE + suerte) / 100);
  }

  function zonaPorId(id) {
    const z = ZONAS.find((x) => x.id === id);
    if (!z) throw new RangeError("Zona desconocida: " + id);
    return z;
  }

  // Genera una pieza nueva con forja +0.
  // zona: 1 a 4. rarezaBase: id de rareza que da el cofre. suerte: % de suerte total.
  // La rareza empieza en el máximo entre la base y la mínima de la zona, y puede subir un escalón.
  function generarPieza(zona, rarezaBase, suerte = 0, rng) {
    const r = obtenerRng(rng);
    const z = zonaPorId(zona);
    validarSuerte(suerte);
    let indice = Math.max(indiceRareza(rarezaBase), indiceRareza(z.rarezaMinima));
    if (indice < RAREZA_ULTIMA && r() < probabilidadSubidaRareza(suerte)) indice += 1;
    const rareza = equipoRarezas[indice];
    const ranura = RANURAS[elegirIndice(RANURAS.length, r)];
    const pool = MODIFICADORES_POR_RANURA[ranura].slice();
    const modificadores = [];
    for (let k = 0; k < rareza.modificadores; k++) {
      const id = pool.splice(elegirIndice(pool.length, r), 1)[0];
      modificadores.push({ id, valor: enRango([MODIFICADORES[id].min, MODIFICADORES[id].max], r) });
    }
    return { ranura, rareza: rareza.id, zona: z.id, forja: 0, set: z.set, modificadores };
  }

  // Valores finales de una pieza. La forja (+0 a +5) sube el modificador principal +1 % por nivel.
  // forja: si no se pasa, se usa pieza.forja.
  function statsDePieza(pieza, forja) {
    if (!esObjeto(pieza) || !Array.isArray(pieza.modificadores) || pieza.modificadores.length === 0) {
      throw new TypeError("Pieza no válida");
    }
    const nivel = forja === undefined ? pieza.forja : forja;
    if (!esEntero(nivel, 0, FORJA_MAX)) throw new RangeError("La forja va de +0 a +" + FORJA_MAX);
    return pieza.modificadores.map((m, i) => {
      if (!esObjeto(m) || !tiene(MODIFICADORES, m.id) || typeof m.valor !== "number") {
        throw new TypeError("Modificador no válido");
      }
      const def = MODIFICADORES[m.id];
      const principal = i === 0;
      // valor * (100 + forja) / 100, redondeado a 2 decimales.
      const valor = principal ? Math.round(m.valor * (100 + nivel)) / 100 : m.valor;
      return { id: m.id, nombre: def.nombre, unidad: def.unidad, valor, principal };
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
  // Por zona (Z1 a Z4): probabilidad de pieza y de consumible, y rangos de núcleos y chatarra.
  const tablaDeCofres = congelar({
    comun: { nombre: "Cofre común", xp: 30, rarezaBase: "comun", probEquipo: [0.4, 0.5, 0.55, 0.6], probConsumible: [0.5, 0.5, 0.45, 0.45], nucleos: [[4, 8], [8, 14], [12, 20], [16, 26]], chatarra: [[2, 5], [4, 8], [6, 11], [8, 14]] },
    raro: { nombre: "Cofre raro", xp: 60, rarezaBase: "raro", probEquipo: [0.8, 0.85, 0.9, 0.95], probConsumible: [0.6, 0.6, 0.65, 0.65], nucleos: [[10, 18], [16, 26], [22, 34], [30, 44]], chatarra: [[6, 10], [9, 15], [12, 20], [16, 26]] },
    jefe: { nombre: "Cofre de jefe", xp: 120, rarezaBase: "epico", probEquipo: [1, 1, 1, 1], probConsumible: [1, 1, 1, 1], nucleos: [[30, 45], [45, 65], [60, 85], [80, 110]], chatarra: [[15, 25], [25, 35], [35, 50], [45, 65]] },
  });

  const CONSUMIBLES = congelar({
    curacion: { nombre: "Vendaje de ceniza", curaFraccion: 0.35 },
    bomba: { nombre: "Bomba de ceniza", dano: 60 },
  });

  // Abre un cofre: XP, núcleos, chatarra, pieza y consumible opcionales, según tipo y zona.
  function abrirCofre(tipo, zona, suerte = 0, rng) {
    if (!tiene(tablaDeCofres, tipo)) throw new RangeError("Tipo de cofre desconocido: " + tipo);
    const tabla = tablaDeCofres[tipo];
    const i = zonaPorId(zona).id - 1;
    const r = obtenerRng(rng);
    const nucleos = enRango(tabla.nucleos[i], r);
    const chatarra = enRango(tabla.chatarra[i], r);
    const equipo = r() < tabla.probEquipo[i] ? generarPieza(zona, tabla.rarezaBase, suerte, r) : null;
    const consumible = r() < tabla.probConsumible[i] ? (r() < 0.5 ? "curacion" : "bomba") : null;
    return { tipo, xp: tabla.xp, nucleos, chatarra, equipo, consumible };
  }

  // ----------------------------------------------------------------- personaje
  const COLORES_TRAJE = congelar({ ceniza: "#7d7a78", arena: "#c9a66b", oxido: "#a4502f", carmesi: "#8c1d2c", bronce: "#b08d57", musgo: "#5b6b3a", acero: "#4a6378", grafito: "#2e2e33" });
  const COLORES_VISOR = congelar({ ambar: "#ffb24a", cian: "#35d0e0", rojo: "#e0403a", verde: "#7fd16b", violeta: "#b07cff" });
  const ESTILOS_CASCO = congelar(["sencillo", "cerrado", "cresta", "rastreador"]);
  const ICONOS_EMBLEMA = congelar(["sol", "luna", "ala", "rayo", "espiral", "gota", "estrella", "ancla"]);
  const PATRONES_TRAJE = congelar(["liso", "rayas", "placas"]);
  const NOMBRE_MAX = 12;
  const PATRON_NOMBRE = /^[\p{L}\p{N} ]+$/u;

  const opcionesPersonaje = congelar({
    traje: { colores: COLORES_TRAJE, tono: [0, 359], brillo: [0, 100], patrones: PATRONES_TRAJE },
    visor: { colores: COLORES_VISOR },
    casco: { estilos: ESTILOS_CASCO },
    capa: { colores: COLORES_TRAJE, activa: [true, false] },
    emblema: { iconos: ICONOS_EMBLEMA },
    nombre: { min: 1, max: NOMBRE_MAX, permitido: "letras, números y espacios; sin espacios al inicio ni al final" },
  });

  function nombreValido(nombre) {
    if (typeof nombre !== "string") return false;
    const largo = Array.from(nombre).length;
    return largo >= opcionesPersonaje.nombre.min && largo <= NOMBRE_MAX &&
      nombre === nombre.trim() && PATRON_NOMBRE.test(nombre);
  }

  // Devuelve { ok, errores }. Rechaza cualquier valor fuera de las opciones.
  function validarPersonaje(obj) {
    const errores = [];
    if (!esObjeto(obj)) return { ok: false, errores: ["el personaje debe ser un objeto"] };
    if (!nombreValido(obj.nombre)) errores.push("nombre: 1 a 12 letras, números o espacios");
    const traje = esObjeto(obj.traje) ? obj.traje : {};
    if (!esOpcion(COLORES_TRAJE, traje.color)) errores.push("traje.color no existe");
    if (!esEntero(traje.tono, 0, 359)) errores.push("traje.tono fuera de 0 a 359");
    if (!esEntero(traje.brillo, 0, 100)) errores.push("traje.brillo fuera de 0 a 100");
    if (!esOpcion(PATRONES_TRAJE, traje.patron)) errores.push("traje.patron no existe");
    const visor = esObjeto(obj.visor) ? obj.visor : {};
    if (!esOpcion(COLORES_VISOR, visor.color)) errores.push("visor.color no existe");
    const casco = esObjeto(obj.casco) ? obj.casco : {};
    if (!esOpcion(ESTILOS_CASCO, casco.estilo)) errores.push("casco.estilo no existe");
    const capa = esObjeto(obj.capa) ? obj.capa : {};
    if (!esOpcion(COLORES_TRAJE, capa.color)) errores.push("capa.color no existe");
    if (typeof capa.activa !== "boolean") errores.push("capa.activa debe ser sí o no");
    const emblema = esObjeto(obj.emblema) ? obj.emblema : {};
    if (!esOpcion(ICONOS_EMBLEMA, emblema.icono)) errores.push("emblema.icono no existe");
    return { ok: errores.length === 0, errores };
  }

  // Copia solo con los campos conocidos (sin claves extra).
  function normalizarPersonaje(obj) {
    return {
      nombre: obj.nombre,
      traje: { color: obj.traje.color, tono: obj.traje.tono, brillo: obj.traje.brillo, patron: obj.traje.patron },
      visor: { color: obj.visor.color },
      casco: { estilo: obj.casco.estilo },
      capa: { color: obj.capa.color, activa: obj.capa.activa },
      emblema: { icono: obj.emblema.icono },
    };
  }

  function personajePorDefecto() {
    return normalizarPersonaje({
      nombre: "Viajero",
      traje: { color: "ceniza", tono: 0, brillo: 50, patron: "liso" },
      visor: { color: "ambar" },
      casco: { estilo: "sencillo" },
      capa: { color: "ceniza", activa: true },
      emblema: { icono: "sol" },
    });
  }

  // Suma de control FNV-1a de 32 bits en hexadecimal; detecta códigos alterados.
  function hashTexto(texto) {
    let h = 0x811c9dc5;
    for (let i = 0; i < texto.length; i++) {
      h ^= texto.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return ("00000000" + h.toString(16)).slice(-8);
  }

  // JSON solo con ASCII: los caracteres no ASCII se escriben como \uXXXX.
  function jsonAscii(obj) {
    return JSON.stringify(obj).replace(/[\u007f-￿]/g, (c) => "\\u" + ("000" + c.charCodeAt(0).toString(16)).slice(-4));
  }

  // Base64 para texto ASCII (sin depender de btoa, que no existe en todos los entornos).
  function codificarBase64(texto) {
    let salida = "";
    for (let i = 0; i < texto.length; i += 3) {
      const a = texto.charCodeAt(i);
      const b = i + 1 < texto.length ? texto.charCodeAt(i + 1) : 0;
      const c = i + 2 < texto.length ? texto.charCodeAt(i + 2) : 0;
      const n = (a << 16) | (b << 8) | c;
      salida += ALFABETO_B64[(n >> 18) & 63] + ALFABETO_B64[(n >> 12) & 63];
      salida += i + 1 < texto.length ? ALFABETO_B64[(n >> 6) & 63] : "=";
      salida += i + 2 < texto.length ? ALFABETO_B64[n & 63] : "=";
    }
    return salida;
  }

  // Devuelve el texto decodificado o null si el base64 no es válido.
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

  // Formato: CENIZA1-<base64 del JSON>-<suma de control del JSON>.
  // Lanza TypeError si el personaje no es válido.
  function exportarPersonaje(obj) {
    const v = validarPersonaje(obj);
    if (!v.ok) throw new TypeError("No se puede exportar el personaje: " + v.errores.join("; "));
    const json = jsonAscii(normalizarPersonaje(obj));
    return PREFIJO_CODIGO + "-" + codificarBase64(json) + "-" + hashTexto(json);
  }

  // Devuelve { ok: true, personaje } o { ok: false, error }. Nunca lanza.
  function importarPersonaje(codigo) {
    const fallo = (error) => ({ ok: false, error });
    try {
      if (typeof codigo !== "string") return fallo("El código debe ser texto");
      const partes = codigo.trim().split("-");
      if (partes.length !== 3 || partes[0] !== PREFIJO_CODIGO) return fallo("Formato de código no reconocido");
      const json = decodificarBase64(partes[1]);
      if (json === null) return fallo("Código corrupto: base64 no válido");
      if (hashTexto(json) !== partes[2]) return fallo("Código corrupto: la suma de control no coincide");
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
    personajePorDefecto,
    validarPersonaje,
    exportarPersonaje,
    importarPersonaje,
  });
})();
