// Ceniza · mundo 2D: zonas, salas, plataformas, puertas y contenido de FASE 1.
// Script clásico (sin módulos ES): define globalThis.CenizaMundo.
// Datos puros, sin DOM, sin red y sin dependencias. Sigue la sección 2 de
// docs/ceniza-diseno.md. Sirve en el navegador (<script src="ceniza/mundo.js">)
// y en node:vm (ver scripts/ceniza-tests/mundo.test.mjs).
//
// Convenciones:
// - Pantalla de cada sala: W x H = 960 x 540. El suelo es la plataforma base en
//   y = GROUND (440) y llega hasta el borde inferior de la pantalla.
// - Plataformas y puertas: x, y es la esquina superior izquierda.
// - Fogata, cofres, enemigos y secreto: x, y es el punto de apoyo (los pies),
//   sobre el suelo o sobre la parte superior de una plataforma.
// - Puertas: apoyadas en el suelo, así que y + alto = GROUND. Son bidireccionales:
//   si A tiene una puerta a B, B tiene otra a A con la misma condición.
// - condicion (opcional): { tipo: "jefe", zona: n } exige haber derrotado al jefe
//   de la zona n. caminoHasta ignora las condiciones: describe la topología.
// - Cada zona tiene 3 salas normales y la sala de jefe al final (4 salas por zona,
//   16 en total). La sección 2.1 del diseño cuenta 12 salas normales; las salas
//   de jefe se suman aparte.
// - La sala de jefe de cada zona enlaza con la primera sala de la siguiente. El
//   Guardián de chatarra (Z4) no enlaza con ninguna sala 2D: su derrota es JEFE X
//   y desbloquea la FASE 3D (esJefeX).

(function () {
  "use strict";

  // ----------------------------------------------------------------- constantes
  const W = 960;
  const H = 540;
  const GROUND = 440;
  const SALA_INICIAL = "Z1.1";

  // Suelo de cada sala: plataforma base desde y = 440 hasta el borde inferior.
  const SUELO = { x: 0, y: GROUND, w: W, h: H - GROUND };

  // ----------------------------------------------------------------- utilidades
  // Congela un dato y sus anidados para que la interfaz no altere las tablas.
  function congelar(obj) {
    for (const v of Object.values(obj)) if (typeof v === "object" && v !== null) congelar(v);
    return Object.freeze(obj);
  }

  // ----------------------------------------------------------------- zonas
  // Orden de recorrido y nombres. El id coincide con el de datos.js.
  const ZONAS = congelar([
    { id: 1, orden: 1, nombre: "Duna tibia", jefe: "Guardián de duna" },
    { id: 2, orden: 2, nombre: "Ciudad de cristal", jefe: "Centinela de cristal" },
    { id: 3, orden: 3, nombre: "Fundición de lava", jefe: "El Forjador" },
    { id: 4, orden: 4, nombre: "Bosque de chatarra", jefe: "Guardián de chatarra" },
  ]);

  // ----------------------------------------------------------------- tablas de contenido
  // clase: "comun" (5 XP), "elite" (10 XP) o "jefe". jefeX marca la derrota que
  // desbloquea la FASE 3D. Los valores de daño van en el juego, no aquí.
  const TIPOS_ENEMIGO = congelar({
    "arenero": { nombre: "Arenero", clase: "comun", zona: 1 },
    "escarabajo": { nombre: "Escarabajo de duna", clase: "elite", zona: 1 },
    "reflejo": { nombre: "Reflejo de cristal", clase: "comun", zona: 2 },
    "astilla": { nombre: "Astilla viva", clase: "elite", zona: 2 },
    "brasa": { nombre: "Brasa errante", clase: "comun", zona: 3 },
    "crisol": { nombre: "Crisol ardiente", clase: "elite", zona: 3 },
    "oxidado": { nombre: "Oxidado", clase: "comun", zona: 4 },
    "carronero": { nombre: "Carroñero de chatarra", clase: "elite", zona: 4 },
    "guardian-duna": { nombre: "Guardián de duna", clase: "jefe", zona: 1 },
    "centinela-cristal": { nombre: "Centinela de cristal", clase: "jefe", zona: 2 },
    "forjador": { nombre: "El Forjador", clase: "jefe", zona: 3 },
    "guardian-chatarra": { nombre: "Guardián de chatarra", clase: "jefe", zona: 4, jefeX: true },
  });

  // Los tipos de cofre (comun, raro, jefe) son los de CenizaDatos.tablaDeCofres: no se repiten aquí.

  // Propuesta: el tipo de recompensa del secreto aún no está cerrado en el diseño.
  const RECOMPENSAS_SECRETO = congelar(["pieza", "nucleos", "chatarra"]);

  // ----------------------------------------------------------------- salas
  // Puertas de 32 x 96 apoyadas en el suelo (y = 344). Izquierda en x = 0,
  // derecha en x = 928. Cada zona va de la sala 1 a la sala de jefe.
  const SALAS = congelar([
    // ---- Z1 Duna tibia
    {
      id: "Z1.1", zona: 1, orden: 1, nombre: "Mar de arena",
      plataformas: [SUELO, { x: 180, y: 360, w: 160, h: 20 }, { x: 560, y: 280, w: 200, h: 20 }],
      puertas: [{ x: 928, y: 344, ancho: 32, alto: 96, destino: "Z1.2" }],
      fogata: { x: 96, y: 440 },
      cofres: [{ x: 330, y: 440, tipo: "comun" }],
      enemigos: [{ tipo: "arenero", x: 450, y: 440 }, { tipo: "arenero", x: 620, y: 280 }],
      secreto: null,
    },
    {
      id: "Z1.2", zona: 1, orden: 2, nombre: "Cresta del viento",
      plataformas: [SUELO, { x: 300, y: 320, w: 180, h: 20 }, { x: 620, y: 240, w: 200, h: 20 }],
      puertas: [
        { x: 0, y: 344, ancho: 32, alto: 96, destino: "Z1.1" },
        { x: 928, y: 344, ancho: 32, alto: 96, destino: "Z1.3" },
      ],
      fogata: null,
      cofres: [{ x: 760, y: 440, tipo: "raro" }],
      enemigos: [{ tipo: "escarabajo", x: 520, y: 440 }, { tipo: "arenero", x: 380, y: 320 }],
      secreto: null,
    },
    {
      id: "Z1.3", zona: 1, orden: 3, nombre: "Refugio hundido",
      plataformas: [
        SUELO,
        { x: 150, y: 330, w: 200, h: 20 },
        { x: 480, y: 250, w: 220, h: 20 },
        { x: 760, y: 340, w: 120, h: 20 },
      ],
      puertas: [
        { x: 0, y: 344, ancho: 32, alto: 96, destino: "Z1.2" },
        { x: 928, y: 344, ancho: 32, alto: 96, destino: "Z1.JEFE" },
      ],
      fogata: null,
      cofres: [],
      enemigos: [{ tipo: "arenero", x: 260, y: 330 }, { tipo: "arenero", x: 820, y: 340 }],
      secreto: { x: 560, y: 250, recompensa: "pieza" },
    },
    {
      id: "Z1.JEFE", zona: 1, orden: 4, nombre: "Cuenca del guardián",
      plataformas: [SUELO, { x: 200, y: 340, w: 140, h: 20 }, { x: 620, y: 340, w: 140, h: 20 }],
      puertas: [
        { x: 0, y: 344, ancho: 32, alto: 96, destino: "Z1.3" },
        { x: 928, y: 344, ancho: 32, alto: 96, destino: "Z2.1", condicion: { tipo: "jefe", zona: 1 } },
      ],
      fogata: null,
      cofres: [{ x: 780, y: 440, tipo: "jefe" }],
      enemigos: [{ tipo: "guardian-duna", x: 480, y: 440 }],
      secreto: null,
    },

    // ---- Z2 Ciudad de cristal
    {
      id: "Z2.1", zona: 2, orden: 1, nombre: "Calles de vidrio",
      plataformas: [SUELO, { x: 200, y: 330, w: 160, h: 20 }, { x: 520, y: 270, w: 200, h: 20 }],
      puertas: [
        { x: 0, y: 344, ancho: 32, alto: 96, destino: "Z1.JEFE", condicion: { tipo: "jefe", zona: 1 } },
        { x: 928, y: 344, ancho: 32, alto: 96, destino: "Z2.2" },
      ],
      fogata: { x: 96, y: 440 },
      cofres: [{ x: 400, y: 440, tipo: "comun" }],
      enemigos: [{ tipo: "reflejo", x: 300, y: 440 }, { tipo: "reflejo", x: 600, y: 270 }],
      secreto: null,
    },
    {
      id: "Z2.2", zona: 2, orden: 2, nombre: "Mirador de espejos",
      plataformas: [
        SUELO,
        { x: 140, y: 300, w: 180, h: 20 },
        { x: 460, y: 360, w: 120, h: 20 },
        { x: 640, y: 240, w: 200, h: 20 },
      ],
      puertas: [
        { x: 0, y: 344, ancho: 32, alto: 96, destino: "Z2.1" },
        { x: 928, y: 344, ancho: 32, alto: 96, destino: "Z2.3" },
      ],
      fogata: null,
      cofres: [{ x: 820, y: 440, tipo: "comun" }],
      enemigos: [{ tipo: "reflejo", x: 250, y: 300 }, { tipo: "astilla", x: 500, y: 360 }],
      secreto: { x: 720, y: 240, recompensa: "nucleos" },
    },
    {
      id: "Z2.3", zona: 2, orden: 3, nombre: "Catedral rota",
      plataformas: [SUELO, { x: 220, y: 340, w: 160, h: 20 }, { x: 520, y: 300, w: 200, h: 20 }],
      puertas: [
        { x: 0, y: 344, ancho: 32, alto: 96, destino: "Z2.2" },
        { x: 928, y: 344, ancho: 32, alto: 96, destino: "Z2.JEFE" },
      ],
      fogata: null,
      cofres: [{ x: 600, y: 300, tipo: "raro" }],
      enemigos: [{ tipo: "astilla", x: 280, y: 340 }, { tipo: "reflejo", x: 820, y: 440 }],
      secreto: null,
    },
    {
      id: "Z2.JEFE", zona: 2, orden: 4, nombre: "Corazón de cristal",
      plataformas: [SUELO, { x: 160, y: 330, w: 160, h: 20 }, { x: 640, y: 330, w: 160, h: 20 }],
      puertas: [
        { x: 0, y: 344, ancho: 32, alto: 96, destino: "Z2.3" },
        { x: 928, y: 344, ancho: 32, alto: 96, destino: "Z3.1", condicion: { tipo: "jefe", zona: 2 } },
      ],
      fogata: null,
      cofres: [{ x: 820, y: 440, tipo: "jefe" }],
      enemigos: [{ tipo: "centinela-cristal", x: 480, y: 440 }],
      secreto: null,
    },

    // ---- Z3 Fundición de lava
    {
      id: "Z3.1", zona: 3, orden: 1, nombre: "Puente de escoria",
      plataformas: [SUELO, { x: 200, y: 340, w: 180, h: 20 }, { x: 520, y: 280, w: 180, h: 20 }],
      puertas: [
        { x: 0, y: 344, ancho: 32, alto: 96, destino: "Z2.JEFE", condicion: { tipo: "jefe", zona: 2 } },
        { x: 928, y: 344, ancho: 32, alto: 96, destino: "Z3.2" },
      ],
      fogata: { x: 96, y: 440 },
      cofres: [{ x: 300, y: 340, tipo: "comun" }],
      enemigos: [{ tipo: "brasa", x: 660, y: 280 }, { tipo: "brasa", x: 700, y: 440 }],
      secreto: { x: 560, y: 280, recompensa: "chatarra" },
    },
    {
      id: "Z3.2", zona: 3, orden: 2, nombre: "Galería de crisol",
      plataformas: [
        SUELO,
        { x: 140, y: 300, w: 200, h: 20 },
        { x: 420, y: 360, w: 140, h: 20 },
        { x: 640, y: 250, w: 220, h: 20 },
      ],
      puertas: [
        { x: 0, y: 344, ancho: 32, alto: 96, destino: "Z3.1" },
        { x: 928, y: 344, ancho: 32, alto: 96, destino: "Z3.3" },
      ],
      fogata: null,
      cofres: [{ x: 700, y: 250, tipo: "raro" }],
      enemigos: [{ tipo: "brasa", x: 240, y: 300 }, { tipo: "crisol", x: 480, y: 360 }],
      secreto: null,
    },
    {
      id: "Z3.3", zona: 3, orden: 3, nombre: "Colada de magma",
      plataformas: [
        SUELO,
        { x: 180, y: 340, w: 160, h: 20 },
        { x: 500, y: 330, w: 160, h: 20 },
        { x: 720, y: 260, w: 140, h: 20 },
      ],
      puertas: [
        { x: 0, y: 344, ancho: 32, alto: 96, destino: "Z3.2" },
        { x: 928, y: 344, ancho: 32, alto: 96, destino: "Z3.JEFE" },
      ],
      fogata: null,
      cofres: [{ x: 560, y: 330, tipo: "comun" }],
      enemigos: [{ tipo: "brasa", x: 260, y: 340 }, { tipo: "crisol", x: 760, y: 260 }],
      secreto: null,
    },
    {
      id: "Z3.JEFE", zona: 3, orden: 4, nombre: "Horno mayor",
      plataformas: [SUELO, { x: 200, y: 330, w: 160, h: 20 }, { x: 640, y: 330, w: 160, h: 20 }],
      puertas: [
        { x: 0, y: 344, ancho: 32, alto: 96, destino: "Z3.3" },
        { x: 928, y: 344, ancho: 32, alto: 96, destino: "Z4.1", condicion: { tipo: "jefe", zona: 3 } },
      ],
      fogata: null,
      cofres: [{ x: 820, y: 440, tipo: "jefe" }],
      enemigos: [{ tipo: "forjador", x: 480, y: 440 }],
      secreto: null,
    },

    // ---- Z4 Bosque de chatarra
    {
      id: "Z4.1", zona: 4, orden: 1, nombre: "Claro de chatarra",
      plataformas: [SUELO, { x: 220, y: 340, w: 160, h: 20 }, { x: 520, y: 280, w: 200, h: 20 }],
      puertas: [
        { x: 0, y: 344, ancho: 32, alto: 96, destino: "Z3.JEFE", condicion: { tipo: "jefe", zona: 3 } },
        { x: 928, y: 344, ancho: 32, alto: 96, destino: "Z4.2" },
      ],
      fogata: { x: 96, y: 440 },
      cofres: [{ x: 300, y: 340, tipo: "comun" }],
      enemigos: [{ tipo: "oxidado", x: 440, y: 440 }, { tipo: "oxidado", x: 620, y: 280 }],
      secreto: null,
    },
    {
      id: "Z4.2", zona: 4, orden: 2, nombre: "Raíces de metal",
      plataformas: [
        SUELO,
        { x: 140, y: 300, w: 200, h: 20 },
        { x: 420, y: 360, w: 160, h: 20 },
        { x: 660, y: 260, w: 200, h: 20 },
      ],
      puertas: [
        { x: 0, y: 344, ancho: 32, alto: 96, destino: "Z4.1" },
        { x: 928, y: 344, ancho: 32, alto: 96, destino: "Z4.3" },
      ],
      fogata: null,
      cofres: [{ x: 740, y: 260, tipo: "raro" }],
      enemigos: [{ tipo: "oxidado", x: 300, y: 300 }, { tipo: "carronero", x: 500, y: 360 }],
      secreto: { x: 240, y: 300, recompensa: "pieza" },
    },
    {
      id: "Z4.3", zona: 4, orden: 3, nombre: "Cañada de cables",
      plataformas: [
        SUELO,
        { x: 200, y: 340, w: 180, h: 20 },
        { x: 500, y: 300, w: 180, h: 20 },
        { x: 740, y: 360, w: 120, h: 20 },
      ],
      puertas: [
        { x: 0, y: 344, ancho: 32, alto: 96, destino: "Z4.2" },
        { x: 928, y: 344, ancho: 32, alto: 96, destino: "Z4.JEFE" },
      ],
      fogata: null,
      cofres: [{ x: 260, y: 340, tipo: "comun" }, { x: 800, y: 360, tipo: "raro" }],
      enemigos: [{ tipo: "carronero", x: 580, y: 300 }, { tipo: "oxidado", x: 400, y: 440 }],
      secreto: null,
    },
    {
      id: "Z4.JEFE", zona: 4, orden: 4, nombre: "Corazón del bosque",
      plataformas: [SUELO, { x: 160, y: 330, w: 160, h: 20 }, { x: 640, y: 330, w: 160, h: 20 }],
      puertas: [{ x: 0, y: 344, ancho: 32, alto: 96, destino: "Z4.3" }],
      fogata: null,
      cofres: [{ x: 820, y: 440, tipo: "jefe" }],
      enemigos: [{ tipo: "guardian-chatarra", x: 480, y: 440 }],
      secreto: null,
    },
  ]);

  // ----------------------------------------------------------------- consultas
  const indice = new Map(SALAS.map((sala) => [sala.id, sala]));

  // Sala con ese id, o null si no existe.
  function salaPorId(id) {
    return indice.get(id) || null;
  }

  // Lista de ids desde SALA_INICIAL hasta salaId, siguiendo las puertas (BFS).
  // Ignora las condiciones: describe la topología. Devuelve [] si la sala no
  // existe o no es alcanzable.
  function caminoHasta(salaId) {
    if (!indice.has(salaId)) return [];
    const previa = new Map([[SALA_INICIAL, null]]);
    const cola = [SALA_INICIAL];
    for (let i = 0; i < cola.length; i++) {
      for (const puerta of indice.get(cola[i]).puertas) {
        if (!previa.has(puerta.destino)) {
          previa.set(puerta.destino, cola[i]);
          cola.push(puerta.destino);
        }
      }
    }
    if (!previa.has(salaId)) return [];
    const camino = [];
    for (let s = salaId; s !== null; s = previa.get(s)) camino.unshift(s);
    return camino;
  }

  // Todos los cofres de las salas de la zona, incluido el cofre de jefe.
  function cofresDeZona(zonaId) {
    const cofres = [];
    for (const sala of SALAS) {
      if (sala.zona !== zonaId) continue;
      for (const c of sala.cofres) cofres.push({ salaId: sala.id, x: c.x, y: c.y, tipo: c.tipo });
    }
    return cofres;
  }

  // true solo en la sala de jefe cuyo enemigo está marcado como JEFE X.
  function esJefeX(salaId) {
    const sala = salaPorId(salaId);
    return sala !== null && sala.enemigos.some((e) => TIPOS_ENEMIGO[e.tipo].jefeX === true);
  }

  globalThis.CenizaMundo = congelar({
    W,
    H,
    GROUND,
    SALA_INICIAL,
    ZONAS,
    TIPOS_ENEMIGO,
    RECOMPENSAS_SECRETO,
    SALAS,
    salaPorId,
    caminoHasta,
    cofresDeZona,
    esJefeX,
  });
})();
