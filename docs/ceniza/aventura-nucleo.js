// Ceniza · núcleo puro de la aventura (FASE 1 en 2D y FASE 2 en 3D).
// Script clásico (sin módulos ES): define globalThis.CenizaAventuraNucleo.
// Requiere cargar antes docs/ceniza/datos.js y docs/ceniza/mundo.js.
//
// Funciones puras: reciben la partida y devuelven una partida nueva (nunca
// modifican la que reciben). No tocan el DOM ni localStorage. Las funciones
// aleatorias aceptan un rng opcional: una función que devuelve un número en [0, 1).
// Sin rng usan Math.random.
//
// Los números fijos salen de docs/ceniza-diseno.md. Las tablas de datos.js se
// reutilizan donde el diseño no fija cifras (forja, rarezas, piezas y sets).
// Las discrepancias entre ambos están marcadas con "DISCREPANCIA" en el código.
//
// Forma de la partida (JSON serializable):
//   personaje, semilla, nivel, xp, puntosLibres, atributos {vida, dano, armadura,
//   velocidad, suerte}, vida, muerto, nucleos (consolidados), nucleosSala (sin
//   consolidar: se pierden al morir), chatarra, equipo {ranura: pieza | null},
//   inventario [pieza], consumibles {curacion, bomba}, contadorPiezas, sala,
//   ultimaFogata, jefesVencidos [jefeId], cofresAbiertos ["salaId#indice"],
//   muertes, faseActual ("2d" | "3d" | "victoria"), armas [arma 2D] (la hoja viene
//   desbloqueada), usos {arma: enemigos vencidos con ella}, secretos [salaId] e
//   historia [clave] (claves de historia ya vistas, sin repetir; ver marcarHistoria).
//   Un guardado v1 sin armas, usos, secretos ni historia se carga con sus valores por defecto.

(function () {
  "use strict";

  const D = globalThis.CenizaDatos;
  const M = globalThis.CenizaMundo;
  if (!D || !M) throw new Error("aventura-nucleo.js necesita datos.js y mundo.js cargados antes");

  // ----------------------------------------------------------------- constantes
  const VERSION = "ceniza.aventura.v1";
  const VIDA_BASE = 100;          // HP base (decisión D4 del diseño, propuesta)
  const ARMADURA_MAX = 0.6;       // tope de reducción de daño (decisión D2, propuesta)
  const FASES = Object.freeze(["2d", "3d", "victoria"]);
  const RANURAS = D.RANURAS;
  const ATRIBUTOS = Object.keys(D.ATRIBUTOS);
  const NIVEL_MAX = D.NIVEL_MAX;
  const PUNTOS_POR_NIVEL = D.PUNTOS_POR_NIVEL;
  const FORJA_MAX = D.FORJA_MAX;
  const COSTO_RESPEC = D.COSTO_RESPEC;

  // Armas 2D: las de tipo "2d" en datos.js (hoja, arco, martillo y lanza).
  const ARMAS_2D = congelar(Object.keys(D.armas).filter((a) => D.armas[a].tipo === "2d"));
  // Costo de compra en núcleos consolidados de cada arma 2D comprable (docs 2.4). La hoja no se compra.
  const COSTO_ARMA = congelar({ arco: 100, martillo: 220, lanza: 400 });
  // Maestría por arma (decisión D9, propuesta del coordinador; el diseño no fija su origen):
  // un nivel por cada UMBRAL_MAESTRIA enemigos vencidos con esa arma, hasta MAESTRIA_MAX.
  const UMBRAL_MAESTRIA = 30;
  const MAESTRIA_MAX = 3;
  // Recompensas de los secretos de sala (mundo.js). Las cifras son propuesta del coordinador:
  // docs/ceniza-diseno.md solo menciona los secretos (2.2 y 10.1) y no fija cantidades.
  // Son rangos enteros inclusivos.
  const SECRETO_NUCLEOS = congelar([20, 40]);
  const SECRETO_CHATARRA = congelar([10, 20]);

  // XP de enemigos (docs 4.1) y de jefes de zona (docs 2.4), tomadas de datos.js.
  const XP_ENEMIGO = Object.freeze({ comun: D.XP_FUENTES.enemigoComun, elite: D.XP_FUENTES.elite });
  const xpDeJefe = (zona) => D.ZONAS.find((z) => z.id === zona).xpJefe;

  // Los cofres salen de D.abrirCofre (datos.js), que aplica las tablas 8.1, 8.2 y 8.3.

  // Núcleos y chatarra por enemigo común o élite. DECISIÓN: se quedan en 0. Motivo:
  // docs/ceniza-diseno.md, sección 4.1, solo fija la XP de enemigos; los núcleos salen de los
  // cofres (8.1) y de los secretos de sala (recogerSecreto). Cambiarlo solo si el dueño fija cifras.
  const RECOMPENSA_ENEMIGO = Object.freeze({
    comun: { nucleos: 0, chatarra: 0 },
    elite: { nucleos: 0, chatarra: 0 },
  });

  // ----------------------------------------------------------------- utilidades
  const tiene = (obj, clave) => Object.prototype.hasOwnProperty.call(obj, clave);
  const esObjeto = (x) => typeof x === "object" && x !== null && !Array.isArray(x);
  const esEntero = (x, min, max) => Number.isInteger(x) && x >= min && x <= max;
  const clonar = (x) => JSON.parse(JSON.stringify(x));

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

  const fallo = (partida, error) => ({ ok: false, partida, error });
  const exito = (partida) => ({ ok: true, partida });

  // ----------------------------------------------------------------- XP y nivel
  // Umbral de XP total para llegar al nivel n. El nivel 1 empieza con 0 XP (docs 4.1).
  const umbralNivel = (n) => (n === 1 ? 0 : D.xpParaNivel(n));

  function nivelPorXp(xp) {
    let n = 1;
    while (n < NIVEL_MAX && xp >= umbralNivel(n + 1)) n++;
    return n;
  }

  // Suma XP. Cada nivel nuevo da 3 puntos de atributo. Nunca pasa del nivel 30.
  function ganarXp(partida, cantidad) {
    if (!esEntero(cantidad, 0, Number.MAX_SAFE_INTEGER)) throw new RangeError("La XP debe ser un entero no negativo");
    const p = clonar(partida);
    p.xp += cantidad;
    const nuevo = nivelPorXp(p.xp);
    const subidas = nuevo - p.nivel;
    if (subidas > 0) {
      p.nivel = nuevo;
      p.puntosLibres += subidas * PUNTOS_POR_NIVEL;
    }
    return p;
  }

  // ----------------------------------------------------------------- estadísticas
  // Suma por modificador de las piezas equipadas. Los valores ya incluyen la forja.
  function bonosDeEquipo(equipo) {
    const suma = { vida: 0, dano: 0, armadura: 0, velocidad: 0, suerte: 0 };
    for (const ranura of RANURAS) {
      const pieza = equipo[ranura];
      if (!pieza) continue;
      for (const s of D.statsDePieza(pieza)) {
        if (tiene(suma, s.id)) suma[s.id] += s.valor;
      }
    }
    return suma;
  }

  // Bonos totales. Dentro de una misma fuente se suman (atributos, piezas, sets). Entre
  // fuentes distintas se multiplican (docs 4.2). La armadura es reducción: 1 - Π(1 - r).
  function statsJugador(partida) {
    const attr = D.bonoDeAtributos(partida.atributos);
    const eq = bonosDeEquipo(partida.equipo);
    const sets = D.bonosDeSet(RANURAS.map((r) => partida.equipo[r]));
    const armadura = Math.min(ARMADURA_MAX, 1 - (1 - attr.armadura / 100) * (1 - eq.armadura / 100));
    return {
      vidaMax: Math.round(VIDA_BASE + attr.vida + eq.vida + sets.vida),
      multiplicadorDano: (1 + attr.dano / 100) * (1 + eq.dano / 100) * (1 + sets.dano / 100),
      armadura,
      multiplicadorVelocidad: (1 + attr.velocidad / 100) * (1 + eq.velocidad / 100),
      suerte: attr.suerte + eq.suerte,
      setsActivos: sets.activos.slice(),
    };
  }

  // Tras cambiar equipo o atributos, la vida actual no puede pasar del máximo.
  function ajustarVida(p) {
    const max = statsJugador(p).vidaMax;
    if (p.vida > max) p.vida = max;
    return p;
  }

  // ----------------------------------------------------------------- atributos
  // Gasta un punto libre en uno de los cinco atributos (docs 4.2).
  function invertirPunto(partida, atributo) {
    if (typeof atributo !== "string" || ATRIBUTOS.indexOf(atributo) < 0) {
      return fallo(partida, "Atributo desconocido: " + String(atributo));
    }
    if (partida.puntosLibres < 1) return fallo(partida, "No hay puntos libres");
    const p = clonar(partida);
    p.atributos[atributo] += 1;
    p.puntosLibres -= 1;
    return exito(ajustarVida(p));
  }

  // Devuelve todos los puntos invertidos. Cuesta COSTO_RESPEC núcleos consolidados (docs 4.3).
  // No cambia el nivel ni la XP.
  function reiniciarAtributos(partida) {
    if (partida.nucleos < COSTO_RESPEC) {
      return fallo(partida, "Faltan núcleos: el reinicio cuesta " + COSTO_RESPEC);
    }
    const p = clonar(partida);
    let devueltos = 0;
    for (const a of ATRIBUTOS) {
      devueltos += p.atributos[a];
      p.atributos[a] = 0;
    }
    p.nucleos -= COSTO_RESPEC;
    p.puntosLibres += devueltos;
    return exito(ajustarVida(p));
  }

  // ----------------------------------------------------------------- piezas y equipo
  // Una pieza es válida si tiene la forma que genera datos.js (generarPieza) y su
  // forja está en rango. statsDePieza valida los modificadores.
  function piezaValida(pieza) {
    if (!esObjeto(pieza) || !RANURAS.includes(pieza.ranura)) return false;
    const rareza = D.equipoRarezas.find((r) => r.id === pieza.rareza);
    if (!rareza || !esEntero(pieza.zona, 1, 4) || !esEntero(pieza.forja, 0, FORJA_MAX)) return false;
    if (pieza.set !== null && !(typeof pieza.set === "string" && tiene(D.SETS, pieza.set))) return false;
    if (!Array.isArray(pieza.modificadores) || pieza.modificadores.length !== rareza.modificadores) return false;
    try {
      D.statsDePieza(pieza);
      return true;
    } catch (e) {
      return false;
    }
  }

  // Busca una pieza por id en el inventario o en una ranura. Devuelve { pieza, ranura } con
  // ranura null si está en el inventario, o null si no existe.
  function buscarPieza(partida, piezaId) {
    const enInventario = partida.inventario.find((x) => x.id === piezaId);
    if (enInventario) return { pieza: enInventario, ranura: null };
    for (const ranura of RANURAS) {
      const pieza = partida.equipo[ranura];
      if (pieza && pieza.id === piezaId) return { pieza, ranura };
    }
    return null;
  }

  // Añade una pieza nueva (salida de D.generarPieza) al inventario con id propio.
  // Devuelve la partida nueva; el id de la pieza es el último del inventario.
  function anadirPieza(partida, pieza) {
    if (!piezaValida(pieza)) throw new TypeError("Pieza no válida");
    const p = clonar(partida);
    p.contadorPiezas += 1;
    p.inventario.push(Object.assign(clonar(pieza), { id: "p" + p.contadorPiezas }));
    return p;
  }

  // Pone la pieza en su ranura. La pieza que estaba en esa ranura vuelve al inventario.
  function equipar(partida, piezaId) {
    const hallada = buscarPieza(partida, piezaId);
    if (!hallada) return fallo(partida, "Pieza no encontrada: " + String(piezaId));
    if (hallada.ranura !== null) return fallo(partida, "La pieza ya está equipada");
    const p = clonar(partida);
    const pieza = p.inventario.find((x) => x.id === piezaId);
    p.inventario = p.inventario.filter((x) => x.id !== piezaId);
    const anterior = p.equipo[pieza.ranura];
    p.equipo[pieza.ranura] = pieza;
    if (anterior) p.inventario.push(anterior);
    return exito(ajustarVida(p));
  }

  // Saca la pieza de una ranura y la pasa al inventario.
  function desequipar(partida, ranura) {
    if (!RANURAS.includes(ranura)) return fallo(partida, "Ranura desconocida: " + String(ranura));
    if (!partida.equipo[ranura]) return fallo(partida, "La ranura está vacía");
    const p = clonar(partida);
    p.inventario.push(p.equipo[ranura]);
    p.equipo[ranura] = null;
    return exito(ajustarVida(p));
  }

  // Sube la forja de la pieza un nivel (de +0 a +5). Cuesta chatarra según costoForja (docs 5.5).
  function forjar(partida, piezaId) {
    const hallada = buscarPieza(partida, piezaId);
    if (!hallada) return fallo(partida, "Pieza no encontrada: " + String(piezaId));
    const nivel = hallada.pieza.forja;
    if (nivel >= FORJA_MAX) return fallo(partida, "La pieza ya está en +" + FORJA_MAX);
    const coste = D.costoForja(nivel);
    if (partida.chatarra < coste) return fallo(partida, "Faltan chatarra: hacen falta " + coste);
    const p = clonar(partida);
    buscarPieza(p, piezaId).pieza.forja += 1;
    p.chatarra -= coste;
    return exito(ajustarVida(p));
  }

  // ----------------------------------------------------------------- partida nueva
  // Usos a cero de cada arma 2D (base de la maestría, decisión D9).
  function usosIniciales() {
    return Object.fromEntries(ARMAS_2D.map((a) => [a, 0]));
  }

  // Copia del personaje solo con sus campos conocidos (sin claves extra).
  function normalizarPersonaje(o) {
    return {
      v: D.personajePorDefecto().v,
      nombre: o.nombre,
      traje: { color: o.traje.color, tono: o.traje.tono, brillo: o.traje.brillo },
      visor: { color: o.visor.color },
      casco: { estilo: o.casco.estilo },
      capa: { color: o.capa.color, on: o.capa.on },
      emblema: { icono: o.emblema.icono },
      patron: o.patron,
    };
  }

  // Partida nueva en la primera sala, con la fogata de la zona 1 como última fogata.
  // opciones: { personaje (por defecto, personajePorDefecto), semilla (entero 0 a 2^32 - 1) }.
  function crearPartida(opciones) {
    const op = opciones === undefined ? {} : opciones;
    if (!esObjeto(op)) throw new TypeError("crearPartida espera un objeto { personaje, semilla }");
    const personaje = op.personaje === undefined ? D.personajePorDefecto() : op.personaje;
    const v = D.validarPersonaje(personaje);
    if (!v.ok) throw new TypeError("Personaje no válido: " + v.errores[0]);
    const semilla = op.semilla === undefined ? 0 : op.semilla;
    if (!esEntero(semilla, 0, 4294967295)) throw new RangeError("La semilla es un entero de 0 a 4294967295");
    const equipo = {};
    for (const r of RANURAS) equipo[r] = null;
    const p = {
      personaje: normalizarPersonaje(personaje),
      semilla,
      nivel: 1,
      xp: 0,
      puntosLibres: 0,
      atributos: { vida: 0, dano: 0, armadura: 0, velocidad: 0, suerte: 0 },
      vida: 0,
      muerto: false,
      nucleos: 0,
      nucleosSala: 0,
      chatarra: 0,
      equipo,
      inventario: [],
      consumibles: { curacion: 0, bomba: 0 },
      contadorPiezas: 0,
      sala: M.SALA_INICIAL,
      ultimaFogata: M.SALA_INICIAL,
      jefesVencidos: [],
      cofresAbiertos: [],
      armas: ["hoja"],
      usos: usosIniciales(),
      secretos: [],
      historia: [],
      muertes: 0,
      faseActual: "2d",
    };
    p.vida = statsJugador(p).vidaMax;
    return p;
  }

  // Cofre por id "salaId#indice" (indice dentro de sala.cofres). null si no existe.
  function cofreDe(cofreId) {
    if (typeof cofreId !== "string") return null;
    const i = cofreId.lastIndexOf("#");
    if (i < 0) return null;
    const sala = M.salaPorId(cofreId.slice(0, i));
    const digitos = cofreId.slice(i + 1);
    if (!sala || !/^\d+$/.test(digitos)) return null;
    const indice = Number(digitos);
    if (indice >= sala.cofres.length) return null;
    return { salaId: sala.id, indice, cofre: sala.cofres[indice] };
  }

  // Primer problema de la forma de una partida, o null si es válida.
  function problemaPartida(p) {
    if (!esObjeto(p)) return "la partida debe ser un objeto";
    if (!D.validarPersonaje(p.personaje).ok) return "personaje no válido";
    if (!esEntero(p.semilla, 0, 4294967295)) return "semilla no válida";
    if (!esEntero(p.nivel, 1, NIVEL_MAX)) return "nivel no válido";
    if (!esEntero(p.xp, 0, Number.MAX_SAFE_INTEGER)) return "XP no válida";
    if (p.xp < umbralNivel(p.nivel) || (p.nivel < NIVEL_MAX && p.xp >= umbralNivel(p.nivel + 1))) {
      return "la XP no corresponde al nivel";
    }
    if (!esObjeto(p.atributos) || Object.keys(p.atributos).length !== ATRIBUTOS.length) return "atributos no válidos";
    let invertidos = 0;
    for (const a of ATRIBUTOS) {
      if (!esEntero(p.atributos[a], 0, NIVEL_MAX * PUNTOS_POR_NIVEL)) return "atributo no válido: " + a;
      invertidos += p.atributos[a];
    }
    if (!esEntero(p.puntosLibres, 0, NIVEL_MAX * PUNTOS_POR_NIVEL) ||
        p.puntosLibres + invertidos !== PUNTOS_POR_NIVEL * (p.nivel - 1)) {
      return "los puntos de atributo no cuadran con el nivel";
    }
    if (typeof p.vida !== "number" || !Number.isFinite(p.vida) || p.vida < 0) return "vida no válida";
    if (typeof p.muerto !== "boolean") return "muerto no válido";
    for (const k of ["nucleos", "nucleosSala", "chatarra", "muertes", "contadorPiezas"]) {
      if (!esEntero(p[k], 0, Number.MAX_SAFE_INTEGER)) return k + " no válido";
    }
    if (!esObjeto(p.equipo) || Object.keys(p.equipo).length !== RANURAS.length) return "equipo no válido";
    const ids = [];
    for (const r of RANURAS) {
      const pieza = p.equipo[r];
      if (pieza === null) continue;
      if (!piezaValida(pieza) || pieza.ranura !== r || typeof pieza.id !== "string") return "pieza equipada no válida: " + r;
      ids.push(pieza.id);
    }
    if (!Array.isArray(p.inventario)) return "inventario no válido";
    for (const pieza of p.inventario) {
      if (!piezaValida(pieza) || typeof pieza.id !== "string") return "pieza del inventario no válida";
      ids.push(pieza.id);
    }
    if (new Set(ids).size !== ids.length) return "hay piezas con el mismo id";
    if (!esObjeto(p.consumibles) || !esEntero(p.consumibles.curacion, 0, 9999) || !esEntero(p.consumibles.bomba, 0, 9999)) {
      return "consumibles no válidos";
    }
    if (!M.salaPorId(p.sala)) return "sala desconocida";
    const fogata = M.salaPorId(p.ultimaFogata);
    if (!fogata || fogata.fogata === null) return "última fogata no válida";
    if (!Array.isArray(p.jefesVencidos) ||
        !p.jefesVencidos.every((j) => typeof j === "string" && tiene(M.TIPOS_ENEMIGO, j) && M.TIPOS_ENEMIGO[j].clase === "jefe") ||
        new Set(p.jefesVencidos).size !== p.jefesVencidos.length) {
      return "jefes vencidos no válidos";
    }
    if (!Array.isArray(p.cofresAbiertos) || !p.cofresAbiertos.every((c) => cofreDe(c) !== null) ||
        new Set(p.cofresAbiertos).size !== p.cofresAbiertos.length) {
      return "cofres abiertos no válidos";
    }
    if (!Array.isArray(p.armas) || !p.armas.every((a) => ARMAS_2D.includes(a)) ||
        new Set(p.armas).size !== p.armas.length || !p.armas.includes("hoja")) {
      return "armas no válidas";
    }
    if (!esObjeto(p.usos) || Object.keys(p.usos).length !== ARMAS_2D.length ||
        !ARMAS_2D.every((a) => esEntero(p.usos[a], 0, Number.MAX_SAFE_INTEGER))) {
      return "usos no válidos";
    }
    if (!Array.isArray(p.secretos) || !p.secretos.every((s) => salaConSecreto(s)) ||
        new Set(p.secretos).size !== p.secretos.length) {
      return "secretos no válidos";
    }
    if (!Array.isArray(p.historia) || !p.historia.every((c) => typeof c === "string") ||
        new Set(p.historia).size !== p.historia.length) {
      return "historia no válida";
    }
    if (!FASES.includes(p.faseActual)) return "fase no válida";
    return null;
  }

  // ----------------------------------------------------------------- guardado
  // Texto JSON con la versión del formato. Partida ya validada por quien la creó.
  function serializar(partida) {
    return JSON.stringify({ version: VERSION, partida });
  }

  // Guardados v1 anteriores a las armas, los usos, los secretos y la historia: se completan con sus
  // valores por defecto. Devuelve una copia y no toca el objeto recibido.
  function completarGuardado(p) {
    if (!esObjeto(p)) return p;
    const c = { ...p };
    if (!tiene(c, "armas")) c.armas = ["hoja"];
    if (!tiene(c, "usos")) c.usos = usosIniciales();
    if (!tiene(c, "secretos")) c.secretos = [];
    if (!tiene(c, "historia")) c.historia = [];
    return c;
  }

  // { ok: true, partida } o { ok: false, error }. Nunca lanza.
  function deserializar(texto) {
    try {
      if (typeof texto !== "string") return { ok: false, error: "El guardado debe ser texto" };
      const obj = JSON.parse(texto);
      if (!esObjeto(obj) || obj.version !== VERSION) return { ok: false, error: "Versión de guardado no reconocida" };
      const partida = completarGuardado(obj.partida);
      const problema = problemaPartida(partida);
      if (problema !== null) return { ok: false, error: "Partida no válida: " + problema };
      return { ok: true, partida };
    } catch (e) {
      return { ok: false, error: "Guardado corrupto: no se pudo leer" };
    }
  }

  // ----------------------------------------------------------------- cofres
  // Abre un cofre de la sala actual. Da XP, núcleos (sin consolidar), chatarra, una pieza
  // y un consumible según la tabla 8.1. La suerte se acota a 100 (límite de datos.js).
  function abrirCofre(partida, cofreId, rng) {
    const r = obtenerRng(rng);
    if (partida.muerto) return fallo(partida, "El viajero está muerto");
    const hallado = cofreDe(cofreId);
    if (!hallado || hallado.salaId !== partida.sala) return fallo(partida, "Cofre no encontrado en esta sala");
    if (partida.cofresAbiertos.includes(cofreId)) return fallo(partida, "El cofre ya está abierto");
    const zona = M.salaPorId(hallado.salaId).zona;
    const suerte = Math.min(100, statsJugador(partida).suerte);
    // D.abrirCofre aplica las tablas 8.1 y 8.2 y el reparto de curación y bomba.
    const botin = D.abrirCofre(hallado.cofre.tipo, zona, suerte, r);

    let p = clonar(partida);
    p.cofresAbiertos.push(cofreId);
    p = ganarXp(p, botin.xp);
    p.nucleosSala += botin.nucleos;
    p.chatarra += botin.chatarra;
    if (botin.equipo) p = anadirPieza(p, botin.equipo);
    if (botin.consumible) p.consumibles[botin.consumible] += 1;
    return {
      ok: true,
      partida: p,
      recompensa: {
        tipo: botin.tipo,
        xp: botin.xp,
        nucleos: botin.nucleos,
        chatarra: botin.chatarra,
        pieza: botin.equipo ? clonar(p.inventario[p.inventario.length - 1]) : null,
        consumible: botin.consumible,
      },
    };
  }

  // ----------------------------------------------------------------- armas 2D y maestría
  // Compra un arma 2D en una fogata (docs 2.4). Cobra COSTO_ARMA de partida.nucleos (consolidados),
  // nunca de nucleosSala. La hoja viene desbloqueada y no se compra.
  function comprarArma(partida, arma) {
    if (typeof arma !== "string" || !tiene(COSTO_ARMA, arma)) {
      return fallo(partida, "Arma no comprable: " + String(arma));
    }
    if (partida.armas.includes(arma)) return fallo(partida, "Ya tienes el arma: " + arma);
    const costo = COSTO_ARMA[arma];
    if (partida.nucleos < costo) return fallo(partida, "Faltan núcleos: hacen falta " + costo);
    const p = clonar(partida);
    p.nucleos -= costo;
    p.armas.push(arma);
    return exito(p);
  }

  // Maestría de un arma 2D (decisión D9): un nivel por cada UMBRAL_MAESTRIA usos, hasta MAESTRIA_MAX.
  // Lanza RangeError si el arma no es 2D conocida.
  function maestriaDe(partida, arma) {
    if (!ARMAS_2D.includes(arma)) throw new RangeError("Arma 2D desconocida: " + String(arma));
    return Math.min(MAESTRIA_MAX, Math.floor(partida.usos[arma] / UMBRAL_MAESTRIA));
  }

  // ----------------------------------------------------------------- secretos de sala
  // Entero uniforme en el rango [min, max] inclusivo, a partir del rng recibido.
  const enteroEnRango = (rango, r) =>
    rango[0] + Math.min(rango[1] - rango[0], Math.floor(r() * (rango[1] - rango[0] + 1)));

  // true si la sala existe y tiene secreto (mundo.js).
  function salaConSecreto(salaId) {
    const sala = M.salaPorId(salaId);
    return sala !== null && sala.secreto !== null;
  }

  // Recoge el secreto de la sala actual, una sola vez por sala (docs 2.2 y 10.1). Recompensas
  // según mundo.js: "pieza" (pieza de la zona con tipo de cofre "comun" y la suerte del viajero,
  // con tope 100), "nucleos" (consolidados) o "chatarra". Devuelve
  // { ok, partida, recompensa: { tipo, pieza } } o { ok, partida, recompensa: { tipo, cantidad } }.
  function recogerSecreto(partida, salaId, rng) {
    const r = obtenerRng(rng);
    const sala = M.salaPorId(salaId);
    if (!sala || sala.secreto === null) return fallo(partida, "La sala no tiene secreto: " + String(salaId));
    if (partida.sala !== salaId) return fallo(partida, "El secreto de " + salaId + " no está en la sala actual");
    if (partida.secretos.includes(salaId)) return fallo(partida, "El secreto ya está recogido");
    if (partida.muerto) return fallo(partida, "El viajero está muerto");
    const p = clonar(partida);
    p.secretos.push(salaId);
    const tipo = sala.secreto.recompensa;
    if (tipo === "pieza") {
      const suerte = Math.min(100, statsJugador(partida).suerte);
      const conPieza = anadirPieza(p, D.generarPieza(sala.zona, "comun", suerte, r));
      const pieza = clonar(conPieza.inventario[conPieza.inventario.length - 1]);
      return { ok: true, partida: conPieza, recompensa: { tipo, pieza } };
    }
    if (tipo === "nucleos") {
      const cantidad = enteroEnRango(SECRETO_NUCLEOS, r);
      p.nucleos += cantidad;
      return { ok: true, partida: p, recompensa: { tipo, cantidad } };
    }
    if (tipo === "chatarra") {
      const cantidad = enteroEnRango(SECRETO_CHATARRA, r);
      p.chatarra += cantidad;
      return { ok: true, partida: p, recompensa: { tipo, cantidad } };
    }
    throw new RangeError("Recompensa de secreto desconocida: " + String(tipo));
  }

  // ----------------------------------------------------------------- historia vista
  // Marca una clave de historia (docs/ceniza/historia.js: "zona:1", "jefe:guardian-duna", "3d:S1",
  // "final", etc.) como vista. Devuelve una copia. Si la clave ya estaba, la copia sale sin cambios.
  // Lanza TypeError si la clave no es un texto no vacío.
  function marcarHistoria(partida, clave) {
    if (typeof clave !== "string" || clave.trim() === "") {
      throw new TypeError("La clave de historia debe ser un texto no vacío");
    }
    const p = clonar(partida);
    if (!Array.isArray(p.historia)) p.historia = [];
    if (!p.historia.includes(clave)) p.historia.push(clave);
    return p;
  }

  // ----------------------------------------------------------------- enemigos y jefes
  // XP y recompensas de un enemigo común o élite. Los jefes van por registrarJefeVencido.
  // arma (opcional): si es un arma 2D, suma 1 a usos[arma] (base de la maestría). Sin arma o con
  // otra arma no cuenta y no falla.
  function registrarEnemigoVencido(partida, tipo, arma) {
    if (!tiene(M.TIPOS_ENEMIGO, tipo) || M.TIPOS_ENEMIGO[tipo].clase === "jefe") {
      throw new RangeError("Enemigo común o élite desconocido: " + String(tipo));
    }
    const clase = M.TIPOS_ENEMIGO[tipo].clase;
    const p = ganarXp(partida, XP_ENEMIGO[clase]);
    p.nucleosSala += RECOMPENSA_ENEMIGO[clase].nucleos;
    p.chatarra += RECOMPENSA_ENEMIGO[clase].chatarra;
    if (ARMAS_2D.includes(arma)) p.usos[arma] += 1;
    return p;
  }

  // Derrota de un jefe: XP de su zona y desbloqueo de la siguiente zona (por jefesVencidos).
  // Si es el Guardián de chatarra (jefe X), la fase pasa a 3D. Repetir un jefe no da XP.
  function registrarJefeVencido(partida, jefeId) {
    if (!tiene(M.TIPOS_ENEMIGO, jefeId) || M.TIPOS_ENEMIGO[jefeId].clase !== "jefe") {
      throw new RangeError("Jefe desconocido: " + String(jefeId));
    }
    const jefe = M.TIPOS_ENEMIGO[jefeId];
    const p = clonar(partida);
    if (p.jefesVencidos.includes(jefeId)) return p;
    p.jefesVencidos.push(jefeId);
    const conXp = ganarXp(p, xpDeJefe(jefe.zona));
    if (jefe.jefeX === true) conXp.faseActual = "3d";
    return conXp;
  }

  // Derrota del Coloso final: la partida queda en victoria.
  function registrarVictoria(partida) {
    const p = clonar(partida);
    p.faseActual = "victoria";
    return p;
  }

  // ----------------------------------------------------------------- salas y puertas
  // Una puerta con condición de jefe solo se abre con ese jefe vencido en su zona.
  function puertaAbierta(partida, puerta) {
    if (!puerta.condicion) return true;
    if (puerta.condicion.tipo !== "jefe") return false;
    return partida.jefesVencidos.some((j) => M.TIPOS_ENEMIGO[j].zona === puerta.condicion.zona);
  }

  // Cruza una puerta de la sala actual. Consolida los núcleos de la sala al cruzarla.
  // Solo se entra por una puerta de la sala actual, y la sala debe ser alcanzable.
  function entrarSala(partida, salaId) {
    if (partida.muerto) return fallo(partida, "El viajero está muerto: vuelve a la fogata");
    if (!M.salaPorId(salaId)) return fallo(partida, "Sala desconocida: " + String(salaId));
    if (M.caminoHasta(salaId).length === 0) return fallo(partida, "Sala no alcanzable: " + salaId);
    const puerta = M.salaPorId(partida.sala).puertas.find((d) => d.destino === salaId);
    if (!puerta) return fallo(partida, "No hay puerta desde " + partida.sala + " hacia " + salaId);
    if (!puertaAbierta(partida, puerta)) {
      return fallo(partida, "La puerta está cerrada: derrota al jefe de la zona " + puerta.condicion.zona);
    }
    const p = clonar(partida);
    p.nucleos += p.nucleosSala;
    p.nucleosSala = 0;
    p.sala = salaId;
    return exito(p);
  }

  // ----------------------------------------------------------------- vida, fogata y muerte
  // Aplica la armadura y marca muerto al llegar la vida a 0. Cada muerte cuenta una vez.
  function danioAJugador(partida, cantidad) {
    if (typeof cantidad !== "number" || !Number.isFinite(cantidad) || cantidad < 0) {
      throw new RangeError("El daño debe ser un número no negativo");
    }
    const p = clonar(partida);
    if (p.muerto) return p;
    const efectivo = Math.round(cantidad * (1 - statsJugador(p).armadura));
    p.vida = Math.max(0, p.vida - efectivo);
    if (p.vida === 0) {
      p.muerto = true;
      p.muertes += 1;
    }
    return p;
  }

  // Tras morir: vuelve a la última fogata con la vida al máximo y pierde los núcleos
  // no consolidados de la sala actual. Los cofres, jefes y chatarra se mantienen.
  // Si el viajero no está muerto, no cambia nada.
  function alMorirVolverFogata(partida) {
    const p = clonar(partida);
    if (!p.muerto) return p;
    p.nucleosSala = 0;
    p.sala = p.ultimaFogata;
    p.muerto = false;
    p.vida = statsJugador(p).vidaMax;
    return p;
  }

  // Enciende la fogata de la sala actual: consolida núcleos, guarda la fogata y
  // restaura la vida. Lanza RangeError si la sala no tiene fogata o el viajero está muerto.
  function descansarEnFogata(partida) {
    const sala = M.salaPorId(partida.sala);
    if (!sala || sala.fogata === null) throw new RangeError("No hay fogata en " + partida.sala);
    if (partida.muerto) throw new RangeError("El viajero está muerto: usa alMorirVolverFogata");
    const p = clonar(partida);
    p.nucleos += p.nucleosSala;
    p.nucleosSala = 0;
    p.ultimaFogata = partida.sala;
    p.vida = statsJugador(p).vidaMax;
    return p;
  }

  // ----------------------------------------------------------------- HUD y exportación
  // Datos para la interfaz: nivel, XP, vida, núcleos, zona y fase. No cambia la partida.
  function resumen(partida) {
    const stats = statsJugador(partida);
    const sala = M.salaPorId(partida.sala);
    return {
      nivel: partida.nivel,
      xp: partida.xp,
      xpSiguiente: partida.nivel < NIVEL_MAX ? umbralNivel(partida.nivel + 1) : null,
      puntosLibres: partida.puntosLibres,
      vida: partida.vida,
      vidaMax: stats.vidaMax,
      muerto: partida.muerto,
      nucleos: partida.nucleos,
      nucleosSala: partida.nucleosSala,
      chatarra: partida.chatarra,
      sala: partida.sala,
      zona: sala.zona,
      fase: partida.faseActual,
      setsActivos: stats.setsActivos,
      consumibles: clonar(partida.consumibles),
      muertes: partida.muertes,
      jefesVencidos: partida.jefesVencidos.slice(),
    };
  }

  globalThis.CenizaAventuraNucleo = congelar({
    VERSION,
    VIDA_BASE,
    ARMADURA_MAX,
    FASES,
    COSTO_RESPEC,
    COSTO_ARMA,
    UMBRAL_MAESTRIA,
    MAESTRIA_MAX,
    XP_ENEMIGO,
    crearPartida,
    serializar,
    deserializar,
    statsJugador,
    nivelPorXp,
    umbralNivel,
    ganarXp,
    invertirPunto,
    reiniciarAtributos,
    anadirPieza,
    equipar,
    desequipar,
    forjar,
    abrirCofre,
    comprarArma,
    maestriaDe,
    recogerSecreto,
    marcarHistoria,
    registrarEnemigoVencido,
    registrarJefeVencido,
    registrarVictoria,
    entrarSala,
    danioAJugador,
    alMorirVolverFogata,
    descansarEnFogata,
    resumen,
  });
})();
