// Ceniza · interfaz 2D de la aventura (FASE 1): salas, plataformas, combate, cofres, fogatas y jefes.
// Script clásico (sin módulos ES): define globalThis.CenizaAventuraUI.
// Canvas de 960 x 540 con el suelo en y = 440 (docs/ceniza-diseno.md, secciones 2 y 6).
//
// Reparto de responsabilidades:
// - La lógica de partida (XP, núcleos, cofres, puertas, muerte, fogata, equipo) es de
//   CenizaAventuraNucleo (docs/ceniza/aventura-nucleo.js). Esta interfaz solo traduce
//   entradas a llamadas del núcleo y dibuja el resultado. Nunca cambia campos a mano,
//   salvo el personaje (ver sincronizarPanel).
// - Salas, plataformas, puertas, cofres y enemigos: CenizaMundo (docs/ceniza/mundo.js).
// - Panel de personaje, equipo y forja (en la fogata): CenizaPersonaje.
// - Armas, daños y cadencias: CenizaDatos. Fase 3D: Ceniza3D (docs/ceniza/shooter3d.js), si está cargado.
//
// Uso:
//   const control = CenizaAventuraUI.montar({
//     contenedor,           // HTMLElement obligatorio
//     partida,              // estado de CenizaAventuraNucleo (crearPartida o deserializar)
//     onGuardar(partida),   // al descansar en una fogata y tras cada cambio hecho en ella
//     onFase3D(partida),    // al entrar en la fase 3D, antes de arrancar Ceniza3D
//     onVictoria(partida),  // al derrotar al Coloso final
//     onSalir(),            // al elegir Salir en el menú de pausa
//   });
//   control.pausar(); control.reanudar(); control.destruir(); control.estado();
//
// Controles: A/D o flechas para moverse, W o espacio para saltar, J para atacar con el arma
// activa, K para esquivar, 1 a 4 para cambiar de arma (hoja, arco, martillo, lanza), E para
// interactuar (cofre, puerta, fogata), Escape o P para pausa. Los botones táctiles solo
// aparecen en pantallas táctiles.
//
// Gancho de pruebas: globalThis.CENIZA_TEST solo existe si la URL contiene "prueba=1".
// Expone estado(), avanzar(segundos), entrarSala(salaId), matarEnemigosDeSala() y vencerJefe(jefeId).
//
// Pausa y medición: la pausa (Escape o P) no avanza el tiempo de simulación. El tiempo se
// cuenta en fotogramas fijos de 1/60 s, así que avanzar(n) es determinista con la misma semilla.
//
// CALIBRACION (más abajo) recoge valores PROVISIONALES: el diseño no fija PV, daño ni ritmo
// de los enemigos ni de los jefes de FASE 1, ni la velocidad de esquiva. Hay que revisarlos en prototipo.

(function () {
  "use strict";

  const M = globalThis.CenizaMundo;
  const D = globalThis.CenizaDatos;
  const N = globalThis.CenizaAventuraNucleo;
  const PERSONAJE = globalThis.CenizaPersonaje;
  if (!M || !D || !N || !PERSONAJE) {
    throw new Error("aventura-ui.js necesita datos.js, mundo.js, personaje-ui.js y aventura-nucleo.js cargados antes");
  }

  const VERSION = "0.1.0";
  const W = M.W;
  const H = M.H;
  const SUELO = M.GROUND;           // y del suelo (440)
  const PASO = 1 / 60;              // fotograma de simulación (s), como en shooter3d.js
  const TOPE_FRAME = 0.1;           // s máximos que avanza un fotograma de pantalla

  // Colores del juego: tinta, hueso, ámbar y carmesí (como personaje-ui.js).
  const COLOR = Object.freeze({
    fondo: "#0b0807",
    piedra: "#2a201b",
    piedraClara: "#4a3b32",
    puerta: "#140f0c",
    texto: "#f3e9d8",
    suave: "#b9b2a6",
    acento: "#e06b2d",
    alerta: "#ff8a80",
    carmesi: "#b3262b",
    ambar: "#f2a541",
    cristal: "#9fc9d8",
    cofre: "#7a5238",
    cofreAbierto: "#3b2d26",
    enemigo: "#7a5a48",
    enemigoElite: "#c98a1b",
    disparo: "#ff8a80",
  });

  // Física del viajero y tiempos de la interfaz (px y segundos). No son valores del diseño.
  const FISICA = Object.freeze({
    gravedad: 2000,         // px/s²
    caidaMax: 1400,         // px/s
    saltoV: 680,            // velocidad inicial del salto: altura ≈ 116 px
    caidaGolpeV: 1100,      // caída del martillo en el aire
    andar: 220,             // px/s, antes de multiplicar por la velocidad del personaje
    esquivaV: 640,          // px/s durante la esquiva
    esquivaT: 0.16,         // duración de la esquiva
    esquivaCd: 0.8,         // espera entre esquivas
    empujeV: 260,           // px/s del empuje al recibir daño
    empujeT: 0.18,
    invulnerableT: 0.7,     // tras recibir daño
    cofreT: 0.6,            // animación de cofre: el mundo se detiene
    muerteT: 1.5,           // pantalla de caída antes de volver a la fogata
    avisoT: 3,              // permanencia de un mensaje en el HUD
    comboT: 0.6,            // ventana para encadenar golpes de la hoja
  });

  // Caja del viajero: x es el centro y y los pies (mismo criterio que mundo.js).
  const VIAJERO = Object.freeze({ ancho: 28, alto: 52, xMin: 14, xMax: W - 14 });

  const ARMAS_2D = Object.freeze(["hoja", "arco", "martillo", "lanza"]);
  const TECLA_ARMA = Object.freeze({ "1": "hoja", "2": "arco", "3": "martillo", "4": "lanza" });
  const NOMBRE_ARMA = Object.freeze({ hoja: "Hoja", arco: "Arco", martillo: "Martillo", lanza: "Lanza" });
  const NOMBRE_RANURA = Object.freeze({
    arma: "arma", casco: "casco", pecho: "pecho", piernas: "piernas", botas: "botas",
    accesorio1: "accesorio 1", accesorio2: "accesorio 2",
  });
  const NOMBRE_ATRIBUTO = Object.freeze({
    vida: "Vida", dano: "Daño", armadura: "Armadura", velocidad: "Velocidad", suerte: "Suerte",
  });

  // Geometría de las armas 2D (docs/ceniza-diseno.md, 6.1). Daños y cadencias salen de CenizaDatos.
  const ARMA = Object.freeze({
    hoja: Object.freeze({
      alcance: Object.freeze([70, 70, 86]),  // px por golpe (golpes 1, 2 y 3)
      aumentoAlcance: 0.2,                   // +20 % por maestría
      altura: 60,
      ondaV: 640,                            // px/s de la onda del golpe 3
      ondaT: 0.42,
      ondaAncho: 26,
      ondaAlto: 40,
    }),
    arco: Object.freeze({
      flechaV: 980,           // px/s (docs 6.1)
      flechaT: 0.8,           // s de vuelo: ≈784 px
      ancho: 18,
      separacion: 12,         // px verticales entre flechas de una ráfaga
    }),
    martillo: Object.freeze({
      radio: 84,              // px, en el suelo
      aumentoRadio: 0.25,     // +25 % por maestría
      radioCaida: 120,        // px, en la caída desde el aire
      ondaV: 470,             // px/s de las dos ondas de suelo
      ondaDano: 12,           // daño base de cada onda
      danoCaida: 42,          // daño base de la caída
      ondaCaidaDano: 18,      // daño base de cada onda de la caída
      cadenciaCaida: 0.9,     // s (docs 6.1)
      ondaAncho: 26,
      ondaAlto: 26,
      ondaVida: 1.2,
    }),
    lanza: Object.freeze({
      alcance: 240,           // px (docs 6.1)
      aumentoAlcance: 0.1,    // +10 % por maestría
      velocidad: 1100,        // px/s del proyectil
      cadenaRadio: 210,       // px entre saltos de la cadena
      cadenaFactor: 0.6,      // la cadena hace el 60 % del daño
      cadenaBase: 2,          // saltos base, más la maestría
    }),
  });

  // CALIBRACION PROVISIONAL. El diseño no fija PV, daño ni ritmo de los enemigos y jefes de FASE 1.
  // Estos valores son de la interfaz y deben revisarse en prototipo (ver las notas de la entrega).
  const CALIBRACION = Object.freeze({
    enemigos: Object.freeze({
      arenero: Object.freeze({ vida: 30, dano: 8, patron: "patrulla", velocidad: 60 }),
      escarabajo: Object.freeze({ vida: 70, dano: 14, patron: "embestida", velocidad: 70 }),
      reflejo: Object.freeze({
        vida: 26, dano: 8, patron: "patrulla", velocidad: 60,
        disparo: Object.freeze({ cada: 2.4, velocidad: 260, dano: 8 }),
      }),
      astilla: Object.freeze({ vida: 80, dano: 14, patron: "embestida", velocidad: 70 }),
      brasa: Object.freeze({ vida: 30, dano: 9, patron: "patrulla", velocidad: 60 }),
      crisol: Object.freeze({ vida: 85, dano: 15, patron: "embestida", velocidad: 70 }),
      oxidado: Object.freeze({ vida: 36, dano: 9, patron: "patrulla", velocidad: 60 }),
      carronero: Object.freeze({ vida: 90, dano: 15, patron: "embestida", velocidad: 70 }),
    }),
    enemigoAviso: 0.6,           // s de aviso antes de embestir
    enemigoEmbestidaV: 420,      // px/s de la embestida
    enemigoEmbestidaT: 0.45,
    enemigoEspera: 1.6,          // s entre embestidas
    enemigoDeteccion: 260,       // px horizontales para detectar al viajero
    jefes: Object.freeze({
      "guardian-duna": Object.freeze({ vida: 420, dano: 16, ataques: Object.freeze(["onda", "embestida", "disparos"]) }),
      "centinela-cristal": Object.freeze({ vida: 520, dano: 16, ataques: Object.freeze(["disparos", "embestida", "salto"]) }),
      forjador: Object.freeze({ vida: 640, dano: 18, ataques: Object.freeze(["onda", "salto", "disparos"]) }),
      "guardian-chatarra": Object.freeze({ vida: 760, dano: 18, ataques: Object.freeze(["embestida", "salto", "onda", "disparos"]) }),
    }),
    fasesJefe: Object.freeze([0.66, 0.33]),        // fracción de PV a la que empieza la fase 2 y la 3
    cdJefe: Object.freeze([1.6, 1.2, 0.9]),        // s de espera entre ataques en cada fase
    velocidadJefe: Object.freeze([1, 1.15, 1.3]),  // multiplicador de velocidad por fase
    telegrafo: 0.7,              // s aviso antes de cada ataque del jefe
    recuperacionJefe: 0.6,       // s de pausa tras cada ataque
    embestidaV: 380,             // px/s del jefe al embestir
    embestidaT: 0.6,
    ondaV: 340,                  // px/s de cada onda de suelo del jefe
    ondaAlto: 36,                // las ondas se saltan con el viajero en el aire
    danoAtaque: 14,              // daño de una onda
    disparoV: 300,               // px/s de los disparos dirigidos
    disparoDano: 10,
    disparoN: 3,                 // disparos por ráfaga
    saltoV: 760,                 // velocidad de subida del salto del jefe
    saltoRadio: 150,             // px del impacto al caer
    saltoDano: 18,
    jefeAncho: 110,
    jefeAlto: 130,
  });

  // ----------------------------------------------------------------- utilidades
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const clonar = (x) => JSON.parse(JSON.stringify(x));
  const redondear2 = (v) => Math.round(v * 100) / 100;
  const signo = (v) => (v < 0 ? -1 : 1);

  // Caja alineada con los ejes a partir del centro en x y de los pies en y.
  const caja = (x, y, ancho, alto) => ({ x0: x - ancho / 2, x1: x + ancho / 2, y0: y - alto, y1: y });
  const solapa = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
  const distancia = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

  // Daño base redondeado con la maestría, igual que danoGolpe de datos.js (docs 7.2).
  const danoConMaestria = (base, maestria) => Math.round(base * (1 + D.CRECIMIENTO_MAESTRIA * maestria));

  // Generador determinista (mulberry32). Solo lo usa abrirCofre, así una semilla reproduce la partida.
  function crearRng(semilla) {
    let s = (Number(semilla) >>> 0) || 0x9e3779b9;
    return function rng() {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Maestría por arma. El estado de partida del núcleo no guarda maestría todavía,
  // así que la interfaz usa 0 (ver las notas de la entrega).
  const maestriaDe = () => 0;

  // Pruebas: true solo si la URL contiene la cadena prueba=1.
  function pruebaActiva() {
    try {
      const href = globalThis.location && globalThis.location.href;
      return typeof href === "string" && href.includes("prueba=1");
    } catch (e) {
      return false;
    }
  }

  // Dispositivo táctil: se decide al montar. Sin pantalla táctil no se crean los botones.
  function esTactil() {
    const nav = globalThis.navigator;
    return Boolean((nav && nav.maxTouchPoints > 0) || "ontouchstart" in globalThis);
  }

  // ----------------------------------------------------------------- enemigos
  // Límites de patrulla: la plataforma sobre la que está el punto de apoyo (x, y).
  function limitesDe(sala, x, y) {
    for (const p of sala.plataformas) {
      if (Math.abs(p.y - y) <= 1 && x >= p.x && x <= p.x + p.w) {
        return { izq: p.x + 16, der: p.x + p.w - 16 };
      }
    }
    return { izq: 16, der: W - 16 };
  }

  function crearEnemigo(sala, tipo, x, y) {
    const clase = M.TIPOS_ENEMIGO[tipo].clase;
    const cal = CALIBRACION.enemigos[tipo];
    const elite = clase === "elite";
    return {
      tipo, clase, x, y,
      ancho: elite ? 44 : 34,
      alto: elite ? 52 : 40,
      vida: cal.vida,
      vidaMax: cal.vida,
      dano: cal.dano,
      patron: cal.patron,
      velocidad: cal.velocidad,
      disparo: cal.disparo || null,
      cdDisparo: cal.disparo ? cal.disparo.cada : 0,
      lim: limitesDe(sala, x, y),
      dir: 1,
      estado: "patrulla",   // patrulla | aviso | embestida | recuperacion
      t: 0,
      espera: 0,            // s hasta poder embestir otra vez
      flash: 0,
      muerto: false,
    };
  }

  // Un fotograma de enemigo común o élite: patrulla, embestida (élite) y disparo (reflejo).
  // Los proyectiles nuevos se añaden a `disparos`. El daño por contacto lo resuelve el motor.
  function actualizarEnemigo(e, viajero, dt, disparos) {
    e.flash = Math.max(0, e.flash - dt);
    e.espera = Math.max(0, e.espera - dt);
    if (e.disparo) e.cdDisparo = Math.max(0, e.cdDisparo - dt);
    const dx = viajero.x - e.x;
    const cerca = Math.abs(dx) < CALIBRACION.enemigoDeteccion && Math.abs(viajero.y - e.y) < 90;

    if (e.estado === "patrulla") {
      e.x += e.dir * e.velocidad * dt;
      if (e.x <= e.lim.izq) { e.x = e.lim.izq; e.dir = 1; }
      if (e.x >= e.lim.der) { e.x = e.lim.der; e.dir = -1; }
      if (e.patron === "embestida" && cerca && e.espera <= 0) {
        e.estado = "aviso";
        e.t = 0;
        e.dir = signo(dx);
      }
      if (e.disparo && e.cdDisparo <= 0 && Math.abs(dx) < 420) {
        e.cdDisparo = e.disparo.cada;
        disparos.push({
          origen: "enemigo", tipo: "disparo", x: e.x, y: e.y - 26,
          vx: signo(dx) * e.disparo.velocidad, vy: 0, ancho: 14, alto: 8,
          dano: e.disparo.dano, vida: 2.5, perfora: false, golpeados: [],
        });
      }
    } else if (e.estado === "aviso") {
      e.t += dt;
      if (e.t >= CALIBRACION.enemigoAviso) { e.estado = "embestida"; e.t = 0; }
    } else if (e.estado === "embestida") {
      e.x = clamp(e.x + e.dir * CALIBRACION.enemigoEmbestidaV * dt, e.lim.izq, e.lim.der);
      e.t += dt;
      if (e.t >= CALIBRACION.enemigoEmbestidaT) {
        e.estado = "recuperacion";
        e.t = 0;
        e.espera = CALIBRACION.enemigoEspera;
      }
    } else {
      e.t += dt;
      if (e.t >= 0.5) { e.estado = "patrulla"; e.t = 0; }
    }
  }

  // ----------------------------------------------------------------- jefes
  function crearJefe(tipo, x) {
    const cal = CALIBRACION.jefes[tipo];
    return {
      tipo,
      nombre: M.TIPOS_ENEMIGO[tipo].nombre,
      x, y: SUELO, vy: 0, enAire: false,
      ancho: CALIBRACION.jefeAncho,
      alto: CALIBRACION.jefeAlto,
      vida: cal.vida,
      vidaMax: cal.vida,
      dano: cal.dano,
      ataques: cal.ataques,
      indice: 0,            // próximo ataque de la lista (rota en orden)
      fase: 1,
      dir: -1,
      estado: "espera",     // espera | aviso | ataque | recuperacion
      ataque: null,         // nombre del ataque en curso
      t: 0,                 // s en el estado actual
      cd: 1.2,              // s de espera antes del primer ataque
      flash: 0,
      muerto: false,
    };
  }

  // Fase del jefe según sus PV relativos (CALIBRACION.fasesJefe).
  function faseDeJefe(j) {
    const f = j.vida / j.vidaMax;
    if (f <= CALIBRACION.fasesJefe[1]) return 3;
    if (f <= CALIBRACION.fasesJefe[0]) return 2;
    return 1;
  }

  // Dispara el ataque elegido al terminar el aviso. Los proyectiles nuevos van a `disparos`.
  function iniciarAtaque(j, viajero, vel, disparos) {
    j.estado = "ataque";
    j.t = 0;
    const dx = viajero.x - j.x;
    if (j.ataque === "embestida") {
      j.dir = signo(dx);
    } else if (j.ataque === "onda") {
      for (const d of [-1, 1]) {
        disparos.push({
          origen: "enemigo", tipo: "onda", x: j.x + d * 40, y: SUELO - CALIBRACION.ondaAlto / 2,
          vx: d * CALIBRACION.ondaV * vel, vy: 0,
          ancho: 26, alto: CALIBRACION.ondaAlto,
          dano: CALIBRACION.danoAtaque, vida: 3, perfora: false, golpeados: [],
        });
      }
    } else if (j.ataque === "disparos") {
      const bx = j.x;
      const by = j.y - 80;
      const base = Math.atan2(viajero.y - 26 - by, viajero.x - bx);
      const n = CALIBRACION.disparoN;
      for (let i = 0; i < n; i++) {
        const a = base + (i - (n - 1) / 2) * 0.2;
        disparos.push({
          origen: "enemigo", tipo: "bola", x: bx, y: by,
          vx: Math.cos(a) * CALIBRACION.disparoV * vel,
          vy: Math.sin(a) * CALIBRACION.disparoV * vel,
          ancho: 14, alto: 14, dano: CALIBRACION.disparoDano, vida: 3, perfora: false, golpeados: [],
        });
      }
    } else if (j.ataque === "salto") {
      j.enAire = true;
      j.vy = -CALIBRACION.saltoV * vel;
    }
  }

  function terminarAtaque(j) {
    j.estado = "recuperacion";
    j.t = 0;
    j.ataque = null;
  }

  // Un fotograma del jefe: fases, ataques en orden, salto con impacto y pausas.
  // Empuja a `eventos` los daños al viajero ({tipo:"dano"}), los cambios de fase ({tipo:"fase"})
  // y los efectos visuales ({tipo:"efecto"}). Los proyectiles nuevos van a `disparos`.
  function actualizarJefe(j, viajero, dt, disparos, eventos) {
    j.flash = Math.max(0, j.flash - dt);
    const fase = faseDeJefe(j);
    if (fase !== j.fase) {
      j.fase = fase;
      eventos.push({ tipo: "fase", fase });
    }
    const vel = CALIBRACION.velocidadJefe[j.fase - 1];

    if (j.enAire) {
      j.vy += FISICA.gravedad * dt;
      j.y += j.vy * dt;
      if (j.y >= SUELO) {
        j.y = SUELO;
        j.vy = 0;
        j.enAire = false;
        if (Math.abs(viajero.x - j.x) <= CALIBRACION.saltoRadio && viajero.enSuelo) {
          eventos.push({ tipo: "dano", cantidad: CALIBRACION.saltoDano, origenX: j.x });
        }
        eventos.push({ tipo: "efecto", x: j.x, y: SUELO, radio: CALIBRACION.saltoRadio });
        terminarAtaque(j);
      }
    }

    j.t += dt;
    if (j.estado === "espera") {
      j.cd -= dt;
      j.dir = signo(viajero.x - j.x);
      if (j.cd <= 0) {
        j.ataque = j.ataques[j.indice % j.ataques.length];
        j.indice += 1;
        j.estado = "aviso";
        j.t = 0;
      }
    } else if (j.estado === "aviso") {
      if (j.t >= CALIBRACION.telegrafo) iniciarAtaque(j, viajero, vel, disparos);
    } else if (j.estado === "ataque") {
      if (j.ataque === "embestida") {
        j.x = clamp(j.x + j.dir * CALIBRACION.embestidaV * vel * dt, 60, W - 60);
        if (j.t >= CALIBRACION.embestidaT) terminarAtaque(j);
      } else if (j.ataque !== "salto" && j.t >= 0.2) {
        terminarAtaque(j);
      }
    } else if (j.estado === "recuperacion") {
      if (j.t >= CALIBRACION.recuperacionJefe) {
        j.estado = "espera";
        j.t = 0;
        j.cd = CALIBRACION.cdJefe[j.fase - 1];
      }
    }
  }

  // ----------------------------------------------------------------- proyectiles
  // Avanza proyectiles (del viajero y de los enemigos) y descarta los que caducan o salen de la sala.
  function avanzarProyectiles(lista, dt) {
    for (const p of lista) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vida -= dt;
    }
    return lista.filter((p) => p.vida > 0 && p.x > -80 && p.x < W + 80 && p.y > -80 && p.y < H + 80);
  }

  // Caja de un proyectil: x e y son su centro.
  const cajaProyectil = (p) => ({
    x0: p.x - p.ancho / 2, x1: p.x + p.ancho / 2, y0: p.y - p.alto / 2, y1: p.y + p.alto / 2,
  });

  // ----------------------------------------------------------------- dibujo
  // Funciones sin estado: reciben el contexto 2D y dibujan. No cambian la partida.
  const COLOR_ARMA = Object.freeze({ hoja: COLOR.texto, arco: COLOR.ambar, martillo: COLOR.suave, lanza: COLOR.cristal });

  function rectangulo(ctx, x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  }

  function texto(ctx, cadena, x, y, color, tamano, alineacion) {
    ctx.fillStyle = color;
    ctx.font = (tamano || 14) + "px system-ui, sans-serif";
    ctx.textAlign = alineacion || "center";
    ctx.fillText(cadena, x, y);
  }

  function dibujarFondo(ctx, tiempo) {
    rectangulo(ctx, 0, 0, W, H, COLOR.fondo);
    ctx.globalAlpha = 0.12 + 0.03 * Math.sin(tiempo * 0.9);
    rectangulo(ctx, 0, SUELO - 160, W, 160, COLOR.acento);
    ctx.globalAlpha = 1;
  }

  function dibujarPlataformas(ctx, sala) {
    for (const p of sala.plataformas) {
      rectangulo(ctx, p.x, p.y, p.w, p.h, COLOR.piedra);
      rectangulo(ctx, p.x, p.y, p.w, 3, COLOR.piedraClara);
    }
  }

  // Las puertas bloqueadas por un jefe no vencido llevan borde carmesí y aviso.
  function dibujarPuertas(ctx, sala, bloqueada) {
    for (const d of sala.puertas) {
      const cerrada = bloqueada(d);
      rectangulo(ctx, d.x, d.y, d.ancho, d.alto, COLOR.puerta);
      ctx.strokeStyle = cerrada ? COLOR.carmesi : COLOR.piedraClara;
      ctx.lineWidth = 2;
      ctx.strokeRect(d.x + 1, d.y + 1, d.ancho - 2, d.alto - 2);
      if (cerrada) {
        const derecha = d.x > W / 2;
        texto(ctx, "CERRADA", derecha ? d.x + d.ancho : d.x, d.y - 8, COLOR.alerta, 13, derecha ? "right" : "left");
      }
    }
  }

  function dibujarFogata(ctx, f, encendida, tiempo) {
    rectangulo(ctx, f.x - 16, f.y - 8, 32, 8, COLOR.piedraClara);
    const alto = 26 + 4 * Math.sin(tiempo * 9 + f.x);
    ctx.fillStyle = COLOR.acento;
    ctx.beginPath();
    ctx.moveTo(f.x - 13, f.y - 8);
    ctx.lineTo(f.x, f.y - 8 - alto);
    ctx.lineTo(f.x + 13, f.y - 8);
    ctx.closePath();
    ctx.fill();
    if (encendida) {
      ctx.fillStyle = COLOR.ambar;
      ctx.beginPath();
      ctx.moveTo(f.x - 6, f.y - 8);
      ctx.lineTo(f.x, f.y - 8 - alto * 0.6);
      ctx.lineTo(f.x + 6, f.y - 8);
      ctx.closePath();
      ctx.fill();
    }
  }

  function dibujarCofre(ctx, c, abierto) {
    const color = abierto
      ? COLOR.cofreAbierto
      : c.tipo === "jefe" ? COLOR.ambar : c.tipo === "raro" ? COLOR.cristal : COLOR.cofre;
    rectangulo(ctx, c.x - 20, c.y - 28, 40, 28, color);
    rectangulo(ctx, c.x - 20, c.y - 28, 40, 4, COLOR.piedraClara);
    if (!abierto) rectangulo(ctx, c.x - 3, c.y - 16, 6, 6, COLOR.texto);
  }

  function dibujarEnemigo(ctx, e) {
    const x0 = e.x - e.ancho / 2;
    const y0 = e.y - e.alto;
    const color = e.clase === "elite" ? COLOR.enemigoElite : COLOR.enemigo;
    rectangulo(ctx, x0, y0, e.ancho, e.alto, e.flash > 0 ? COLOR.texto : color);
    if (e.estado === "aviso") {
      ctx.strokeStyle = COLOR.alerta;
      ctx.lineWidth = 2;
      ctx.strokeRect(x0 - 4, y0 - 4, e.ancho + 8, e.alto + 8);
    }
    rectangulo(ctx, e.x - 8, y0 + 12, 5, 5, COLOR.alerta);
    rectangulo(ctx, e.x + 3, y0 + 12, 5, 5, COLOR.alerta);
    if (e.vida < e.vidaMax) {
      rectangulo(ctx, e.x - 16, y0 - 8, 32, 3, COLOR.piedra);
      rectangulo(ctx, e.x - 16, y0 - 8, 32 * clamp(e.vida / e.vidaMax, 0, 1), 3, COLOR.alerta);
    }
  }

  function dibujarJefe(ctx, j) {
    const x0 = j.x - j.ancho / 2;
    const y0 = j.y - j.alto;
    const color = j.fase === 3 ? COLOR.alerta : j.fase === 2 ? COLOR.acento : COLOR.carmesi;
    rectangulo(ctx, x0, y0, j.ancho, j.alto, j.flash > 0 ? COLOR.texto : color);
    rectangulo(ctx, j.x - 12, y0 + 24, 24, 8, COLOR.ambar);
    if (j.estado === "aviso") {
      ctx.strokeStyle = COLOR.alerta;
      ctx.lineWidth = 3;
      ctx.strokeRect(x0 - 6, y0 - 6, j.ancho + 12, j.alto + 12);
      texto(ctx, "AVISO", j.x, y0 - 12, COLOR.alerta, 14);
    }
  }

  // Barra de PV del jefe en la parte superior de la escena.
  function dibujarBarraJefe(ctx, j) {
    rectangulo(ctx, 240, 22, 480, 10, COLOR.piedra);
    rectangulo(ctx, 240, 22, 480 * clamp(j.vida / j.vidaMax, 0, 1), 10, COLOR.carmesi);
    texto(ctx, j.nombre + " · fase " + j.fase, W / 2, 16, COLOR.texto, 14);
  }

  function dibujarProyectil(ctx, p) {
    let color = COLOR.texto;
    if (p.origen === "enemigo") color = p.tipo === "onda" ? COLOR.carmesi : COLOR.disparo;
    else if (p.tipo === "lanza") color = COLOR.ambar;
    else if (p.tipo === "suelo") color = COLOR.cristal;
    rectangulo(ctx, p.x - p.ancho / 2, p.y - p.alto / 2, p.ancho, p.alto, color);
  }

  function dibujarViajero(ctx, v, tiempo) {
    if (v.invT > 0 && Math.floor(tiempo * 20) % 2 === 0) return;
    const x0 = v.x - VIAJERO.ancho / 2;
    const y0 = v.y - VIAJERO.alto;
    rectangulo(ctx, x0, y0, VIAJERO.ancho, VIAJERO.alto, v.esquivaT > 0 ? COLOR.suave : COLOR.texto);
    rectangulo(ctx, x0 + (v.mirando > 0 ? 16 : 2), y0 + 12, 10, 6, COLOR.acento);
    ctx.strokeStyle = COLOR_ARMA[v.arma];
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(v.x, v.y - 30);
    ctx.lineTo(v.x + v.mirando * 24, v.y - 30);
    ctx.stroke();
  }

  function dibujarEfecto(ctx, ef) {
    const a = clamp(1 - ef.restante / ef.total, 0, 1);
    ctx.globalAlpha = 1 - a;
    ctx.strokeStyle = ef.color || COLOR.alerta;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(ef.x, ef.y, ef.radio * (0.4 + 0.6 * a), 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // Dibuja la escena entera. `vista` trae el estado de la sala y dos consultas:
  // puertaBloqueada(puerta) y cofreAbierto(id). `vista.pista` es el aviso de E junto al objeto cercano.
  function dibujarEscena(ctx, vista) {
    dibujarFondo(ctx, vista.tiempo);
    dibujarPlataformas(ctx, vista.sala);
    dibujarPuertas(ctx, vista.sala, vista.puertaBloqueada);
    vista.sala.cofres.forEach((c, i) => {
      dibujarCofre(ctx, c, vista.cofreAbierto(vista.sala.id + "#" + i));
    });
    if (vista.sala.fogata) dibujarFogata(ctx, vista.sala.fogata, vista.ultimaFogata === vista.sala.id, vista.tiempo);
    for (const e of vista.enemigos) dibujarEnemigo(ctx, e);
    if (vista.jefe) dibujarJefe(ctx, vista.jefe);
    for (const p of vista.proyectiles) dibujarProyectil(ctx, p);
    for (const ef of vista.efectos) dibujarEfecto(ctx, ef);
    dibujarViajero(ctx, vista.viajero, vista.tiempo);
    if (vista.jefe) dibujarBarraJefe(ctx, vista.jefe);
    if (vista.pista) texto(ctx, vista.pista.texto, vista.pista.x, vista.pista.y, COLOR.texto, 15);
    if (vista.muerte) {
      ctx.globalAlpha = 0.6;
      rectangulo(ctx, 0, 0, W, H, COLOR.fondo);
      ctx.globalAlpha = 1;
      texto(ctx, "Has caído. Vuelves a la última fogata.", W / 2, H / 2, COLOR.alerta, 20);
    }
  }

  // ----------------------------------------------------------------- motor
  // Estado de la partida en curso, reglas de sala y combate. Todo cambio de progreso
  // (XP, núcleos, cofres, puertas, muerte, fogata, equipo, jefes) pasa por CenizaAventuraNucleo.
  // `ui` recibe avisos de la capa de DOM: hud(), fogata(abierta), pausa(abierta), escena3d(activa),
  // contenedor3d(), refrescarPanel(). Montar los reemplaza por las funciones reales.
  function crearMotor(op, ui) {
    let partida = op.partida;
    const rng = crearRng(partida.semilla);
    let modo = "juego";          // juego | pausa | fogata | cofre | muerte | tres_d | victoria
    let modoT = 0;               // s restantes en los modos cofre y muerte
    let tiempo = 0;              // s de simulación (no cuenta la pausa)
    let escena = null;           // { sala, enemigos, jefe, proyectiles, efectos }
    let viajero = null;
    const cache = new Map();     // salaId -> { enemigos, jefe }: enemigos vivos de salas visitadas
    let aviso = { texto: "", t: 0, error: false };
    let control3d = null;
    const entrada = { izq: false, der: false, saltar: false, atacar: false, esquivar: false, interactuar: false, arma: null };

    function mostrar(texto, esError) {
      aviso = { texto, t: FISICA.avisoT, error: Boolean(esError) };
      ui.hud();
    }

    const stats = () => N.statsJugador(partida);

    // ----------------------------------------------------------------- salas
    // Enemigos y jefe de una sala tal como aparecen al entrar (los jefes vencidos no aparecen).
    function spawnSala(sala) {
      const enemigos = [];
      let jefe = null;
      for (const e of sala.enemigos) {
        if (M.TIPOS_ENEMIGO[e.tipo].clase === "jefe") {
          if (!partida.jefesVencidos.includes(e.tipo)) jefe = crearJefe(e.tipo, e.x);
        } else {
          enemigos.push(crearEnemigo(sala, e.tipo, e.x, e.y));
        }
      }
      return { enemigos, jefe };
    }

    // Coloca al viajero junto a la puerta de regreso, o en la fogata si no hay puerta de origen.
    function colocarViajero(sala, desdeSalaId) {
      let x = sala.fogata ? sala.fogata.x : 96;
      const puerta = desdeSalaId ? sala.puertas.find((d) => d.destino === desdeSalaId) : null;
      if (puerta) x = puerta.x === 0 ? 56 : W - 56;
      const base = viajero || { arma: "hoja", mirando: 1, combo: 0, comboT: 0 };
      viajero = Object.assign(base, {
        x, y: SUELO, vx: 0, vy: 0, enSuelo: true,
        invT: 0, esquivaT: 0, esquivaCd: 0, esquivaDir: 1,
        empujeT: 0, empujeVx: 0, caida: false, armaCd: 0,
      });
    }

    function cargarSala(salaId, desdeSalaId) {
      if (escena) cache.set(escena.sala.id, { enemigos: escena.enemigos, jefe: escena.jefe });
      const sala = M.salaPorId(salaId);
      const previa = cache.get(salaId);
      const { enemigos, jefe } = previa || spawnSala(sala);
      const jefeVivo = jefe && !partida.jefesVencidos.includes(jefe.tipo) ? jefe : null;
      escena = { sala, enemigos, jefe: jefeVivo, proyectiles: [], efectos: [] };
      colocarViajero(sala, desdeSalaId);
    }

    // Vuelve a crear enemigos y jefe de la sala actual (al descansar en la fogata).
    function repoblarSala() {
      const { enemigos, jefe } = spawnSala(escena.sala);
      escena.enemigos = enemigos;
      escena.jefe = jefe;
      escena.proyectiles = [];
    }

    // ----------------------------------------------------------------- física del viajero
    const pisa = (p, x) => x + VIAJERO.ancho / 2 > p.x && x - VIAJERO.ancho / 2 < p.x + p.w;

    // Un fotograma de movimiento: andar, esquiva, empuje, gravedad y aterrizaje en plataformas.
    // Las plataformas son de una sola cara: se aterriza al caer sobre ellas.
    function fisicaViajero(dirX, st) {
      const v = viajero;
      if (v.esquivaT > 0) {
        v.x += v.esquivaDir * FISICA.esquivaV * PASO;
        v.esquivaT -= PASO;
        v.vy = 0;
      } else {
        if (v.empujeT > 0) {
          v.x += v.empujeVx * PASO;
          v.empujeT -= PASO;
        } else {
          v.x += dirX * FISICA.andar * st.multiplicadorVelocidad * PASO;
        }
        v.vy = Math.min(FISICA.caidaMax, v.vy + FISICA.gravedad * PASO);
        const previoY = v.y;
        v.y += v.vy * PASO;
        v.enSuelo = false;
        if (v.vy >= 0) {
          let destino = null;
          for (const p of escena.sala.plataformas) {
            if (previoY <= p.y + 0.01 && v.y >= p.y && pisa(p, v.x)) {
              if (!destino || p.y < destino.y) destino = p;
            }
          }
          if (destino) {
            v.y = destino.y;
            v.vy = 0;
            v.enSuelo = true;
          }
        }
      }
      v.x = clamp(v.x, VIAJERO.xMin, VIAJERO.xMax);
    }

    // ----------------------------------------------------------------- blancos y daño
    const cajaDe = (obj) => caja(obj.x, obj.y, obj.ancho, obj.alto);
    const cajaViajero = () => caja(viajero.x, viajero.y, VIAJERO.ancho, VIAJERO.alto);
    const blancosVivos = () => {
      const lista = escena.enemigos.filter((e) => !e.muerto);
      if (escena.jefe && !escena.jefe.muerto) lista.push(escena.jefe);
      return lista;
    };

    // Daño a un enemigo o al jefe. Marca la muerte una sola vez y la deja en `eventos`.
    function herir(obj, dano, eventos) {
      if (obj.muerto) return;
      obj.vida -= dano;
      obj.flash = 0.08;
      if (obj.vida <= 0) {
        obj.vida = 0;
        obj.muerto = true;
        eventos.push({ tipo: obj === escena.jefe ? "jefe-muerto" : "enemigo-muerto", ref: obj });
      }
    }

    // Golpe de cuerpo a cuerpo: caja delante del viajero, de `alcance` px y `altura` px hacia arriba.
    function golpeCuerpo(alcance, altura, dano, eventos) {
      const v = viajero;
      const area = {
        x0: v.mirando > 0 ? v.x : v.x - alcance,
        x1: v.mirando > 0 ? v.x + alcance : v.x,
        y0: v.y - altura,
        y1: v.y + 8,
      };
      for (const obj of blancosVivos()) {
        if (solapa(area, cajaDe(obj))) herir(obj, dano, eventos);
      }
    }

    // Golpe de área centrado en (cx, cy): alcanza a los blancos a `radio` px en horizontal.
    function golpeArea(cx, cy, radio, dano, eventos) {
      for (const obj of blancosVivos()) {
        if (Math.abs(obj.x - cx) <= radio && Math.abs(obj.y - cy) <= 60) herir(obj, dano, eventos);
      }
    }

    function lanzar(p) {
      escena.proyectiles.push(p);
    }

    const dmgDe = (mul) => (base) => Math.round(base * mul);

    // ----------------------------------------------------------------- ataques
    // Ejecuta el ataque del arma activa. Usa la maestría 0 hasta que el núcleo la guarde (ver notas).
    function atacar(st, eventos) {
      const v = viajero;
      const m = maestriaDe(v.arma);
      const dmg = dmgDe(st.multiplicadorDano);

      if (v.arma === "hoja") {
        const k = v.combo;
        const d = D.danoHoja(m);
        const alcance = ARMA.hoja.alcance[k] * (1 + ARMA.hoja.aumentoAlcance * m);
        golpeCuerpo(alcance, ARMA.hoja.altura, dmg(d.golpes[k]), eventos);
        if (k === 2) {
          lanzar({
            origen: "jugador", tipo: "onda", x: v.x, y: v.y - 30,
            vx: v.mirando * ARMA.hoja.ondaV, vy: 0,
            ancho: ARMA.hoja.ondaAncho, alto: ARMA.hoja.ondaAlto,
            dano: dmg(d.onda), vida: ARMA.hoja.ondaT, perfora: true, golpeados: [], cadena: 0,
          });
        }
        v.armaCd = D.armas.hoja.cadencias[k];
        v.combo = (k + 1) % 3;
        v.comboT = FISICA.comboT;
        return;
      }

      if (v.arma === "arco") {
        const n = D.MULTIDISPARO_ARCO[m];
        const base = D.danoPorGolpe("arco", m);
        for (let i = 0; i < n; i++) {
          const dy = (i - (n - 1) / 2) * ARMA.arco.separacion;
          lanzar({
            origen: "jugador", tipo: "flecha", x: v.x, y: v.y - 30 + dy,
            vx: v.mirando * ARMA.arco.flechaV, vy: 0,
            ancho: ARMA.arco.ancho, alto: 3,
            dano: dmg(base), vida: ARMA.arco.flechaT, perfora: m >= 3, golpeados: [], cadena: 0,
          });
        }
        v.armaCd = D.cooldownArco(m);
        return;
      }

      if (v.arma === "martillo") {
        if (!v.enSuelo) {
          // Caída: el martillo cae en picado y golpea al aterrizar (impactoCaida).
          v.caida = true;
          v.vy = FISICA.caidaGolpeV;
          v.armaCd = ARMA.martillo.cadenciaCaida;
          return;
        }
        const radio = ARMA.martillo.radio * (1 + ARMA.martillo.aumentoRadio * m);
        golpeArea(v.x, v.y, radio, dmg(D.danoPorGolpe("martillo", m)), eventos);
        const onda = dmg(danoConMaestria(ARMA.martillo.ondaDano, m));
        for (const sentido of [-1, 1]) {
          lanzar({
            origen: "jugador", tipo: "suelo", x: v.x, y: SUELO - ARMA.martillo.ondaAlto / 2,
            vx: sentido * ARMA.martillo.ondaV, vy: 0,
            ancho: ARMA.martillo.ondaAncho, alto: ARMA.martillo.ondaAlto,
            dano: onda, vida: ARMA.martillo.ondaVida, perfora: true, golpeados: [], cadena: 0,
          });
        }
        v.armaCd = D.armas.martillo.cadencia;
        return;
      }

      // Lanza: proyectil que frena al primer blanco y encadena saltos (encadenar).
      const alcance = ARMA.lanza.alcance * (1 + ARMA.lanza.aumentoAlcance * m);
      lanzar({
        origen: "jugador", tipo: "lanza", x: v.x, y: v.y - 30,
        vx: v.mirando * ARMA.lanza.velocidad, vy: 0,
        ancho: 24, alto: 4,
        dano: dmg(D.danoPorGolpe("lanza", m)), vida: alcance / ARMA.lanza.velocidad,
        perfora: false, golpeados: [], cadena: ARMA.lanza.cadenaBase + m,
      });
      v.armaCd = D.armas.lanza.cadencia;
    }

    // Caída del martillo: al aterrizar, golpe de área y dos ondas (docs 6.1).
    function impactoCaida(eventos) {
      const v = viajero;
      const m = maestriaDe(v.arma);
      const dmg = dmgDe(stats().multiplicadorDano);
      golpeArea(v.x, v.y, ARMA.martillo.radioCaida, dmg(danoConMaestria(ARMA.martillo.danoCaida, m)), eventos);
      const onda = dmg(danoConMaestria(ARMA.martillo.ondaCaidaDano, m));
      for (const sentido of [-1, 1]) {
        lanzar({
          origen: "jugador", tipo: "suelo", x: v.x, y: SUELO - ARMA.martillo.ondaAlto / 2,
          vx: sentido * ARMA.martillo.ondaV, vy: 0,
          ancho: ARMA.martillo.ondaAncho, alto: ARMA.martillo.ondaAlto,
          dano: onda, vida: ARMA.martillo.ondaVida, perfora: true, golpeados: [], cadena: 0,
        });
      }
      v.caida = false;
      escena.efectos.push({ x: v.x, y: SUELO, radio: ARMA.martillo.radioCaida, restante: 0.35, total: 0.35, color: COLOR.ambar });
    }

    // Cadena de la lanza: salta al blanco más cercano no tocado, a ARMA.lanza.cadenaRadio px.
    function encadenar(p, desde, eventos) {
      let origen = desde;
      for (let k = p.cadena; k > 0; k--) {
        let mejor = null;
        let mejorDistancia = Infinity;
        for (const obj of blancosVivos()) {
          if (p.golpeados.includes(obj)) continue;
          const d = distancia(origen.x, origen.y, obj.x, obj.y);
          if (d <= ARMA.lanza.cadenaRadio && d < mejorDistancia) {
            mejor = obj;
            mejorDistancia = d;
          }
        }
        if (!mejor) break;
        p.golpeados.push(mejor);
        herir(mejor, Math.round(p.dano * ARMA.lanza.cadenaFactor), eventos);
        origen = mejor;
      }
      p.cadena = 0;
    }

    // ----------------------------------------------------------------- proyectiles, enemigos y contactos
    const puedeSerDanado = () => modo === "juego" && !partida.muerto && viajero.invT <= 0 && viajero.esquivaT <= 0;

    // Mueve los proyectiles y resuelve sus impactos. Los del viajero dañan a enemigos y jefe;
    // los de los enemigos dañan al viajero.
    function actualizarProyectilesEscena(eventos) {
      escena.proyectiles = avanzarProyectiles(escena.proyectiles, PASO);
      const vivos = [];
      for (const p of escena.proyectiles) {
        if (p.origen === "enemigo") {
          if (puedeSerDanado() && solapa(cajaProyectil(p), cajaViajero())) {
            eventos.push({ tipo: "dano", cantidad: p.dano, origenX: p.x });
          } else {
            vivos.push(p);
          }
          continue;
        }
        const c = cajaProyectil(p);
        let consumido = false;
        for (const obj of blancosVivos()) {
          if (p.golpeados.includes(obj) || !solapa(c, cajaDe(obj))) continue;
          p.golpeados.push(obj);
          herir(obj, p.dano, eventos);
          if (p.cadena > 0) encadenar(p, obj, eventos);
          if (!p.perfora) {
            consumido = true;
            break;
          }
        }
        if (!consumido) vivos.push(p);
      }
      escena.proyectiles = vivos;
    }

    function actualizarEnemigosEscena(eventos) {
      for (const e of escena.enemigos) {
        if (!e.muerto) actualizarEnemigo(e, viajero, PASO, escena.proyectiles);
      }
      if (escena.jefe && !escena.jefe.muerto) {
        actualizarJefe(escena.jefe, viajero, PASO, escena.proyectiles, eventos);
      }
    }

    // Daño por contacto con enemigos y con el jefe. La invulnerabilidad evita el daño repetido.
    function contactos(eventos) {
      if (!puedeSerDanado()) return;
      const cv = cajaViajero();
      for (const e of escena.enemigos) {
        if (!e.muerto && solapa(cv, cajaDe(e))) {
          eventos.push({ tipo: "dano", cantidad: e.dano, origenX: e.x });
          break;
        }
      }
      const j = escena.jefe;
      if (j && !j.muerto && solapa(cv, cajaDe(j))) {
        eventos.push({ tipo: "dano", cantidad: j.dano, origenX: j.x });
      }
    }

    // ----------------------------------------------------------------- eventos y muerte
    function recibirDano(cantidad, origenX) {
      if (!puedeSerDanado()) return;
      const v = viajero;
      partida = N.danioAJugador(partida, cantidad);
      v.invT = FISICA.invulnerableT;
      v.empujeT = FISICA.empujeT;
      v.empujeVx = (v.x >= origenX ? 1 : -1) * FISICA.empujeV;
      if (partida.muerto) iniciarMuerte();
    }

    function muereEnemigo(e) {
      escena.enemigos = escena.enemigos.filter((x) => x !== e);
      partida = N.registrarEnemigoVencido(partida, e.tipo);
    }

    function muereJefe(j) {
      escena.jefe = null;
      escena.efectos.push({ x: j.x, y: SUELO, radio: 160, restante: 0.6, total: 0.6, color: COLOR.carmesi });
      derrotarJefe(j.tipo);
    }

    // Los eventos del paso se aplican en orden. Si una acción cambia el modo (fase 3D, muerte), se corta.
    function aplicarEventos(eventos) {
      for (const ev of eventos) {
        if (modo !== "juego") break;
        if (ev.tipo === "dano") recibirDano(ev.cantidad, ev.origenX);
        else if (ev.tipo === "enemigo-muerto") muereEnemigo(ev.ref);
        else if (ev.tipo === "jefe-muerto") muereJefe(ev.ref);
        else if (ev.tipo === "fase") mostrar("El jefe entra en la fase " + ev.fase + ".");
        else if (ev.tipo === "efecto") {
          escena.efectos.push({ x: ev.x, y: ev.y, radio: ev.radio, restante: 0.35, total: 0.35, color: COLOR.alerta });
        }
      }
    }

    function iniciarMuerte() {
      modo = "muerte";
      modoT = FISICA.muerteT;
      limpiarEntrada();
      mostrar("Has caído. Vuelves a la última fogata.", true);
    }

    // Tras la pantalla de caída: vuelve a la última fogata con la vida al máximo.
    // Los enemigos vuelven a aparecer (ver cache en destinos de muerte).
    function terminarMuerte() {
      escena = null;
      cache.clear();
      partida = N.alMorirVolverFogata(partida);
      cargarSala(partida.sala, null);
      modo = "juego";
      mostrar("Vuelves a " + escena.sala.nombre + ".");
    }

    // ----------------------------------------------------------------- entrada y acciones del viajero
    function limpiarEntrada() {
      entrada.saltar = false;
      entrada.atacar = false;
      entrada.esquivar = false;
      entrada.interactuar = false;
      entrada.arma = null;
    }

    function procesarEntrada(eventos) {
      const v = viajero;
      if (entrada.arma) {
        v.arma = entrada.arma;
        entrada.arma = null;
        mostrar("Arma: " + NOMBRE_ARMA[v.arma] + ".");
      }
      if (entrada.interactuar) {
        entrada.interactuar = false;
        interactuar();
        if (modo !== "juego") return;
      }
      if (entrada.saltar) {
        entrada.saltar = false;
        if (v.enSuelo && v.esquivaT <= 0) {
          v.vy = -FISICA.saltoV;
          v.enSuelo = false;
        }
      }
      if (entrada.esquivar) {
        entrada.esquivar = false;
        if (v.esquivaCd <= 0 && v.esquivaT <= 0) {
          v.esquivaT = FISICA.esquivaT;
          v.esquivaCd = FISICA.esquivaCd;
          v.esquivaDir = v.mirando;
        }
      }
      if (entrada.atacar) {
        entrada.atacar = false;
        if (v.armaCd <= 0) atacar(stats(), eventos);
      }
    }

    // E: fogata, cofre o puerta, por ese orden. Si nada está al alcance, avisa.
    function interactuar() {
      const v = viajero;
      const area = caja(v.x, v.y, VIAJERO.ancho + 12, VIAJERO.alto);
      const sala = escena.sala;
      if (sala.fogata && solapa(area, caja(sala.fogata.x, sala.fogata.y, 36, 48))) {
        abrirFogata();
        return;
      }
      for (let i = 0; i < sala.cofres.length; i++) {
        const c = sala.cofres[i];
        if (solapa(area, { x0: c.x - 20, x1: c.x + 20, y0: c.y - 28, y1: c.y })) {
          abrirCofre(sala.id + "#" + i);
          return;
        }
      }
      for (const d of sala.puertas) {
        if (solapa(area, { x0: d.x, x1: d.x + d.ancho, y0: d.y, y1: d.y + d.alto })) {
          cruzar(d.destino);
          return;
        }
      }
      mostrar("No hay nada que usar aquí.");
    }

    // Cruza una puerta: el núcleo valida alcance, condición de jefe y consolida los núcleos.
    function intentarCruzar(salaId) {
      const res = N.entrarSala(partida, salaId);
      if (!res.ok) return { ok: false, error: res.error };
      const previa = escena.sala.id;
      partida = res.partida;
      cargarSala(partida.sala, previa);
      mostrar("Entras en " + escena.sala.nombre + ".");
      return { ok: true, sala: partida.sala };
    }

    function cruzar(salaId) {
      const r = intentarCruzar(salaId);
      if (!r.ok) mostrar(r.error, true);
    }

    function textoRecompensa(r) {
      const partes = [r.xp + " XP", r.nucleos + " núcleos", r.chatarra + " chatarra"];
      if (r.pieza) {
        const rareza = D.equipoRarezas.find((x) => x.id === r.pieza.rareza);
        partes.push("pieza " + (rareza ? rareza.nombre.toLowerCase() : r.pieza.rareza) + " de " + NOMBRE_RANURA[r.pieza.ranura]);
      }
      if (r.consumible) partes.push(r.consumible === "curacion" ? "curación" : "bomba");
      return "Cofre: " + partes.join(", ") + ".";
    }

    function abrirCofre(id) {
      if (partida.cofresAbiertos.includes(id)) {
        mostrar("Este cofre ya está abierto.");
        return;
      }
      const res = N.abrirCofre(partida, id, rng);
      if (!res.ok) {
        mostrar(res.error, true);
        return;
      }
      partida = res.partida;
      modo = "cofre";
      modoT = FISICA.cofreT;
      limpiarEntrada();
      mostrar(textoRecompensa(res.recompensa));
    }

    // ----------------------------------------------------------------- fogata
    const guardar = () => {
      if (typeof op.onGuardar === "function") op.onGuardar(clonar(partida));
    };

    function abrirFogata() {
      if (partida.muerto || modo !== "juego") return;
      modo = "fogata";
      limpiarEntrada();
      ui.fogata(true);
    }

    function cerrarFogata() {
      if (modo !== "fogata") return;
      modo = "juego";
      ui.fogata(false);
    }

    // Enciende la fogata: vida al máximo, consolida núcleos, guarda y repuebla la sala.
    function descansar() {
      if (!escena.sala.fogata || partida.muerto) return { ok: false, error: "No hay fogata aquí." };
      partida = N.descansarEnFogata(partida);
      cache.clear();
      repoblarSala();
      guardar();
      mostrar("Descansas: vida al máximo. Los enemigos han vuelto.");
      return { ok: true };
    }

    function invertirAtributo(atributo) {
      const res = N.invertirPunto(partida, atributo);
      if (!res.ok) {
        mostrar(res.error, true);
        return false;
      }
      partida = res.partida;
      guardar();
      return true;
    }

    function reiniciarAtributos() {
      const res = N.reiniciarAtributos(partida);
      if (!res.ok) {
        mostrar(res.error, true);
        return false;
      }
      partida = res.partida;
      guardar();
      mostrar("Atributos reiniciados.");
      return true;
    }

    const piezaPorId = (p, id) => {
      const enInventario = p.inventario.find((x) => x.id === id);
      if (enInventario) return enInventario;
      for (const r of D.RANURAS) {
        if (p.equipo[r] && p.equipo[r].id === id) return p.equipo[r];
      }
      return null;
    };

    // Traduce los cambios del panel a llamadas del núcleo: personaje (spread, ver notas),
    // equipar y desequipar por id, y forjar subida a subida. Si una operación falla, el panel
    // se vuelve a abrir con el estado real de la partida.
    function sincronizarPanel(estado) {
      if (modo !== "fogata") return;
      let p = partida;
      const fallos = [];
      if (D.validarPersonaje(estado.personaje).ok && JSON.stringify(estado.personaje) !== JSON.stringify(p.personaje)) {
        p = Object.assign({}, p, { personaje: clonar(estado.personaje) });
      }
      for (const r of D.RANURAS) {
        const previo = p.equipo[r] ? p.equipo[r].id : null;
        const nuevo = estado.equipadas[r] ? estado.equipadas[r].id : null;
        if (previo === nuevo) continue;
        const res = nuevo === null ? N.desequipar(p, r) : N.equipar(p, nuevo);
        if (res.ok) p = res.partida;
        else fallos.push(res.error);
      }
      const piezas = D.RANURAS.map((r) => estado.equipadas[r]).filter(Boolean).concat(estado.inventario);
      for (const pieza of piezas) {
        const real = piezaPorId(p, pieza.id);
        if (!real) continue;
        let faltan = pieza.forja - real.forja;
        while (faltan > 0) {
          const res = N.forjar(p, pieza.id);
          if (!res.ok) {
            fallos.push(res.error);
            break;
          }
          p = res.partida;
          faltan -= 1;
        }
      }
      if (p !== partida) {
        partida = p;
        guardar();
      }
      if (fallos.length > 0) {
        mostrar(fallos[0], true);
        ui.refrescarPanel();
      }
    }

    // ----------------------------------------------------------------- jefes y fase 3D
    function limpiarJefe(id) {
      if (escena && escena.jefe && escena.jefe.tipo === id) escena.jefe = null;
      for (const v of cache.values()) {
        if (v.jefe && v.jefe.tipo === id) v.jefe = null;
      }
    }

    // Derrota de un jefe. Si ya estaba vencido no hace nada (el núcleo no da XP dos veces).
    function derrotarJefe(id) {
      const antes = partida.jefesVencidos.length;
      partida = N.registrarJefeVencido(partida, id);
      limpiarJefe(id);
      if (partida.jefesVencidos.length === antes) return;
      mostrar("Derrotado: " + M.TIPOS_ENEMIGO[id].nombre + ".");
      if (partida.faseActual === "3d") entrar3D();
    }

    // Bonos del personaje para Ceniza3D (docs 4.2 y 5.4). La vida extra va en HP sobre la base.
    function bonosPara3D() {
      const st = stats();
      return {
        vida: st.vidaMax - N.VIDA_BASE,
        dano: redondear2((st.multiplicadorDano - 1) * 100),
        armadura: redondear2(st.armadura * 100),
        velocidad: redondear2((st.multiplicadorVelocidad - 1) * 100),
      };
    }

    function cerrar3d() {
      const c = control3d;
      control3d = null;
      if (c && typeof c.destruir === "function") {
        try {
          c.destruir();
        } catch (e) {
          // El escenario 3D ya no existe: se ignora para no bloquear el regreso a 2D.
        }
      }
      ui.escena3d(false);
    }

    function alVictoria3d() {
      cerrar3d();
      partida = N.registrarVictoria(partida);
      modo = "victoria";
      mostrar("Coloso derrotado. Victoria.");
      if (typeof op.onVictoria === "function") op.onVictoria(clonar(partida));
    }

    // Caída en 3D: cuenta como muerte del viajero y vuelve a la última fogata.
    function alCaida3d() {
      cerrar3d();
      partida = N.danioAJugador(partida, 1e6);
      partida = N.alMorirVolverFogata(partida);
      escena = null;
      cache.clear();
      cargarSala(partida.sala, null);
      modo = "juego";
      mostrar("Caíste en la fase 3D: vuelves a la última fogata.", true);
    }

    // Salida desde el menú de pausa de 3D: regresa a la pantalla de pausa de 2D sin penalización.
    function alSalir3d() {
      cerrar3d();
      modo = "pausa";
      ui.pausa(true);
    }

    function entrar3D() {
      modo = "tres_d";
      limpiarEntrada();
      ui.pausa(false);
      ui.fogata(false);
      if (typeof op.onFase3D === "function") op.onFase3D(clonar(partida));
      const C3 = globalThis.Ceniza3D;
      if (!C3 || typeof C3.start !== "function") {
        modo = "juego";
        mostrar("La fase 3D no está cargada en esta página.", true);
        return;
      }
      ui.escena3d(true);
      try {
        control3d = C3.start({
          contenedor: ui.contenedor3d(),
          bonos: bonosPara3D(),
          semilla: partida.semilla,
          onVictoria: alVictoria3d,
          onCaida: alCaida3d,
          onSalir: alSalir3d,
          onXP: (n) => {
            const cantidad = Math.round(Number(n));
            if (cantidad > 0) partida = N.ganarXp(partida, cantidad);
          },
        });
      } catch (e) {
        control3d = null;
        ui.escena3d(false);
        modo = "juego";
        mostrar("No se pudo iniciar la fase 3D: " + e.message, true);
      }
    }

    // ----------------------------------------------------------------- simulación
    function tickTimers() {
      const v = viajero;
      v.invT = Math.max(0, v.invT - PASO);
      v.esquivaCd = Math.max(0, v.esquivaCd - PASO);
      v.armaCd = Math.max(0, v.armaCd - PASO);
      if (v.comboT > 0) {
        v.comboT -= PASO;
        if (v.comboT <= 0) v.combo = 0;
      }
      avanzarEfectos();
      if (aviso.t > 0) {
        aviso.t -= PASO;
        if (aviso.t <= 0) aviso = { texto: "", t: 0, error: false };
      }
    }

    function avanzarEfectos() {
      for (const ef of escena.efectos) ef.restante -= PASO;
      escena.efectos = escena.efectos.filter((ef) => ef.restante > 0);
    }

    // Un fotograma fijo de 1/60 s. Durante la animación de cofre y la caída solo avanzan los tiempos.
    function paso() {
      if (modo === "cofre" || modo === "muerte") {
        tiempo += PASO;
        modoT -= PASO;
        avanzarEfectos();
        if (modoT <= 0) {
          if (modo === "muerte") terminarMuerte();
          else modo = "juego";
        }
        return;
      }
      if (modo !== "juego") return;
      tiempo += PASO;
      tickTimers();
      const v = viajero;
      const dirX = (entrada.der ? 1 : 0) - (entrada.izq ? 1 : 0);
      if (dirX !== 0 && v.esquivaT <= 0 && v.empujeT <= 0) v.mirando = dirX;
      const eventos = [];
      procesarEntrada(eventos);
      if (modo !== "juego") return;
      const eraAire = !v.enSuelo;
      fisicaViajero(dirX, stats());
      if (eraAire && v.enSuelo && v.caida) impactoCaida(eventos);
      actualizarProyectilesEscena(eventos);
      actualizarEnemigosEscena(eventos);
      contactos(eventos);
      aplicarEventos(eventos);
    }

    // avanzar(s) ignora la pantalla de carga de la escena: avanza s segundos de simulación
    // en fotogramas de 1/60 s. No avanza en pausa, en fogata, en 3D ni tras la victoria.
    function avanzar(segundos) {
      const s = Number(segundos);
      if (!Number.isFinite(s) || s < 0) throw new RangeError("avanzar necesita un número de segundos no negativo");
      const pasos = Math.round(s / PASO);
      for (let i = 0; i < pasos; i++) {
        if (modo === "pausa" || modo === "fogata" || modo === "tres_d" || modo === "victoria") break;
        paso();
      }
      ui.hud();
      return estado();
    }

    // ----------------------------------------------------------------- lecturas
    function estado() {
      const r = N.resumen(partida);
      const j = escena ? escena.jefe : null;
      return {
        version: VERSION,
        modo,
        tiempo: redondear2(tiempo),
        sala: partida.sala,
        zona: r.zona,
        fase: partida.faseActual,
        vida: partida.vida,
        vidaMax: r.vidaMax,
        muerto: partida.muerto,
        nivel: r.nivel,
        xp: r.xp,
        nucleos: partida.nucleos,
        nucleosSala: partida.nucleosSala,
        chatarra: partida.chatarra,
        arma: viajero ? viajero.arma : null,
        enemigosVivos: escena ? escena.enemigos.filter((e) => !e.muerto).length : 0,
        jefe: j ? { tipo: j.tipo, vida: j.vida, vidaMax: j.vidaMax, fase: j.fase } : null,
        jugador: viajero
          ? { x: redondear2(viajero.x), y: redondear2(viajero.y), enSuelo: viajero.enSuelo, invulnerable: viajero.invT > 0 }
          : null,
        cofresAbiertos: partida.cofresAbiertos.length,
        jefesVencidos: partida.jefesVencidos.slice(),
        aviso: aviso.texto,
      };
    }

    // Aviso de E junto al objeto más cercano al alcance del viajero.
    function pistaCercana() {
      if (!escena || modo !== "juego") return null;
      const v = viajero;
      const area = caja(v.x, v.y, VIAJERO.ancho + 12, VIAJERO.alto);
      const sala = escena.sala;
      if (sala.fogata && solapa(area, caja(sala.fogata.x, sala.fogata.y, 36, 48))) {
        return { texto: "E: encender fogata", x: sala.fogata.x, y: sala.fogata.y - 60 };
      }
      for (let i = 0; i < sala.cofres.length; i++) {
        const c = sala.cofres[i];
        if (solapa(area, { x0: c.x - 20, x1: c.x + 20, y0: c.y - 28, y1: c.y })) {
          const abierto = partida.cofresAbiertos.includes(sala.id + "#" + i);
          return { texto: abierto ? "Cofre abierto" : "E: abrir cofre", x: c.x, y: c.y - 40 };
        }
      }
      for (const d of sala.puertas) {
        if (solapa(area, { x0: d.x, x1: d.x + d.ancho, y0: d.y, y1: d.y + d.alto })) {
          const bloqueada = d.condicion && !partida.jefesVencidos.some((j) => M.TIPOS_ENEMIGO[j].zona === d.condicion.zona);
          return { texto: bloqueada ? "Puerta cerrada" : "E: cruzar", x: d.x + d.ancho / 2, y: d.y - 20 };
        }
      }
      return null;
    }

    // Puerta bloqueada por jefe no vencido (misma regla que el núcleo, solo para mostrarla).
    const puertaBloqueada = (d) =>
      Boolean(d.condicion) && !partida.jefesVencidos.some((j) => M.TIPOS_ENEMIGO[j].zona === d.condicion.zona);

    function vista() {
      return {
        sala: escena.sala,
        enemigos: escena.enemigos,
        jefe: escena.jefe,
        proyectiles: escena.proyectiles,
        efectos: escena.efectos,
        viajero,
        tiempo,
        ultimaFogata: partida.ultimaFogata,
        muerte: modo === "muerte",
        puertaBloqueada,
        cofreAbierto: (id) => partida.cofresAbiertos.includes(id),
        pista: pistaCercana(),
      };
    }

    // Ruta de uso de los cuatro botones de pruebas: sin efectos fuera de la sala actual.
    function matarEnemigosDeSala() {
      const vivos = escena.enemigos.filter((e) => !e.muerto);
      for (const e of vivos) {
        e.muerto = true;
        partida = N.registrarEnemigoVencido(partida, e.tipo);
      }
      escena.enemigos = [];
      return vivos.length;
    }

    function iniciar() {
      cargarSala(partida.sala, null);
      mostrar("Entras en " + escena.sala.nombre + ".");
    }

    function ponerPausa(activa) {
      if (activa && modo === "juego") {
        modo = "pausa";
        limpiarEntrada();
      } else if (!activa && modo === "pausa") {
        modo = "juego";
      }
      ui.pausa(modo === "pausa");
    }

    function destruir() {
      if (control3d) cerrar3d();
    }

    return {
      iniciar,
      paso,
      avanzar,
      estado,
      vista,
      aviso: () => aviso,
      entrada,
      modo: () => modo,
      partida: () => partida,
      ponerPausa,
      abrirFogata,
      cerrarFogata,
      descansar,
      invertirAtributo,
      reiniciarAtributos,
      sincronizarPanel,
      intentarCruzar,
      matarEnemigosDeSala,
      derrotarJefe,
      entrar3D,
      avisar: mostrar,
      destruir,
    };
  }

  // ----------------------------------------------------------------- DOM
  // Estilos de la interfaz. Colores del juego; el aviso y la pantalla son de una columna en móvil.
  const ESTILO = `
.av-raiz{box-sizing:border-box;width:100%;max-width:960px;margin:0 auto;padding:12px 16px;background:#0b0807;color:#f3e9d8;font:15px/1.4 system-ui,sans-serif;overflow-wrap:anywhere}
.av-raiz *{box-sizing:border-box}
.av-escena{position:relative;width:100%}
.av-canvas{display:block;width:100%;height:auto;aspect-ratio:16/9;background:#0b0807;border:1px solid #4a3b32;border-radius:6px;touch-action:none}
.av-hud{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center;margin:10px 0}
.av-barra{width:160px;max-width:100%;height:14px;background:#2a201b;border:1px solid #4a3b32;border-radius:4px;overflow:hidden}
.av-barra-relleno{height:100%;width:100%;background:#b3262b}
.av-grupo{display:flex;flex-wrap:wrap;gap:8px}
.av-boton{min-height:44px;min-width:44px;padding:8px 12px;border:1px solid #4a3b32;border-radius:6px;background:#1c1714;color:#f3e9d8;font:inherit;cursor:pointer}
.av-boton[aria-pressed="true"]{border-color:#e06b2d;background:#3a1f12}
.av-boton:disabled{opacity:.45;cursor:not-allowed}
.av-boton:focus-visible,.av-canvas:focus-visible{outline:3px solid #e06b2d;outline-offset:2px}
.av-mensaje{min-height:24px;margin:6px 0;color:#f3e9d8}
.av-mensaje[data-error="true"]{color:#ff8a80}
.av-panel{display:none;margin-top:12px;padding:12px;border:1px solid #4a3b32;border-radius:8px;background:#1c1714}
.av-h{margin:0 0 8px;font-size:18px}
.av-fila{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid #4a3b32}
.av-tactil{display:flex;flex-wrap:wrap;gap:8px;justify-content:space-between;margin-top:10px}
.av-personaje{margin-top:10px}
.av-3d{display:none;width:100%;min-height:360px}
`;

  function crearEl(doc, tag, clase, texto) {
    const el = doc.createElement(tag);
    if (clase) el.setAttribute("class", clase);
    if (texto !== undefined) el.textContent = texto;
    return el;
  }

  function boton(doc, texto, etiqueta, alPulsar) {
    const b = crearEl(doc, "button", "av-boton", texto);
    b.setAttribute("type", "button");
    b.setAttribute("aria-label", etiqueta || texto);
    b.addEventListener("click", alPulsar);
    return b;
  }

  // Monta la aventura en `contenedor`. Ver el uso al principio del archivo.
  function montar(opciones) {
    const op = opciones && typeof opciones === "object" ? opciones : {};
    if (!op.contenedor || typeof op.contenedor.appendChild !== "function") {
      throw new TypeError("montar necesita un contenedor del DOM");
    }
    if (!op.partida || typeof op.partida !== "object") {
      throw new TypeError("montar necesita una partida de CenizaAventuraNucleo");
    }
    const doc = op.contenedor.ownerDocument || globalThis.document;

    // Ganchos que el motor llama. Se reemplazan abajo, antes de iniciar la partida.
    const ui = {
      hud: () => {},
      fogata: () => {},
      pausa: () => {},
      escena3d: () => {},
      contenedor3d: () => null,
      refrescarPanel: () => {},
    };
    const motor = crearMotor(op, ui);

    // ----------------------------------------------------------------- escenario 2D
    const raiz = crearEl(doc, "div", "av-raiz");
    raiz.appendChild(crearEl(doc, "style", null, ESTILO));
    const escenario = crearEl(doc, "div", "av-escena");

    const canvas = doc.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    canvas.setAttribute("class", "av-canvas");
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", "Escena de Ceniza: sala de la aventura");
    canvas.setAttribute("tabindex", "0");
    const ctx = typeof canvas.getContext === "function" ? canvas.getContext("2d") : null;
    escenario.appendChild(canvas);

    // HUD: vida, nivel, núcleos, chatarra, zona y armas. Texto en español, sin emojis.
    const hud = crearEl(doc, "div", "av-hud");
    const vidaBarra = crearEl(doc, "div", "av-barra");
    const vidaRelleno = crearEl(doc, "div", "av-barra-relleno");
    vidaBarra.appendChild(vidaRelleno);
    const vidaTexto = crearEl(doc, "span", null, "");
    const nivelTexto = crearEl(doc, "span", null, "");
    const nucleosTexto = crearEl(doc, "span", null, "");
    const chatarraTexto = crearEl(doc, "span", null, "");
    const zonaTexto = crearEl(doc, "span", null, "");
    for (const el of [vidaBarra, vidaTexto, nivelTexto, nucleosTexto, chatarraTexto, zonaTexto]) hud.appendChild(el);

    const grupoArmas = crearEl(doc, "div", "av-grupo");
    const botonesArma = {};
    ARMAS_2D.forEach((arma, i) => {
      const nombre = NOMBRE_ARMA[arma];
      const b = boton(doc, (i + 1) + " " + nombre, "Arma " + (i + 1) + ": " + nombre, () => {
        motor.entrada.arma = arma;
      });
      botonesArma[arma] = b;
      grupoArmas.appendChild(b);
    });
    hud.appendChild(grupoArmas);
    escenario.appendChild(hud);

    const mensaje = crearEl(doc, "div", "av-mensaje", "");
    mensaje.setAttribute("aria-live", "polite");
    escenario.appendChild(mensaje);

    // Controles táctiles: solo en pantallas táctiles.
    if (esTactil()) {
      const tactil = crearEl(doc, "div", "av-tactil");
      const mantener = (texto, etiqueta, clave) => {
        const b = boton(doc, texto, etiqueta, () => {});
        b.addEventListener("pointerdown", () => { motor.entrada[clave] = true; });
        for (const ev of ["pointerup", "pointercancel", "pointerleave"]) {
          b.addEventListener(ev, () => { motor.entrada[clave] = false; });
        }
        return b;
      };
      const pulsar = (texto, etiqueta, clave) => {
        const b = boton(doc, texto, etiqueta, () => {});
        b.addEventListener("pointerdown", () => { motor.entrada[clave] = true; });
        return b;
      };
      tactil.appendChild(mantener("Izquierda", "Moverse a la izquierda", "izq"));
      tactil.appendChild(mantener("Derecha", "Moverse a la derecha", "der"));
      tactil.appendChild(pulsar("Saltar", "Saltar", "saltar"));
      tactil.appendChild(pulsar("Atacar", "Atacar con el arma activa", "atacar"));
      tactil.appendChild(pulsar("Esquivar", "Esquivar", "esquivar"));
      tactil.appendChild(pulsar("E", "Interactuar", "interactuar"));
      const cambiarArma = boton(doc, "Arma", "Cambiar de arma", () => {
        const i = ARMAS_2D.indexOf(motor.estado().arma);
        motor.entrada.arma = ARMAS_2D[(i + 1) % ARMAS_2D.length];
      });
      tactil.appendChild(cambiarArma);
      tactil.appendChild(boton(doc, "||", "Pausa", () => manejarPausa()));
      escenario.appendChild(tactil);
    }

    // Panel de pausa.
    const panelPausa = crearEl(doc, "div", "av-panel");
    panelPausa.appendChild(crearEl(doc, "h2", "av-h", "Pausa"));
    const grupoPausa = crearEl(doc, "div", "av-grupo");
    grupoPausa.appendChild(boton(doc, "Reanudar", "Reanudar la partida", () => motor.ponerPausa(false)));
    grupoPausa.appendChild(boton(doc, "Salir", "Salir de la aventura", () => {
      if (typeof op.onSalir === "function") op.onSalir();
    }));
    panelPausa.appendChild(grupoPausa);
    escenario.appendChild(panelPausa);

    // Panel de fogata: descanso, personaje y equipo (CenizaPersonaje), atributos y respec.
    const panelFogata = crearEl(doc, "div", "av-panel");
    panelFogata.appendChild(crearEl(doc, "h2", "av-h", "Fogata"));
    const grupoFogata = crearEl(doc, "div", "av-grupo");
    grupoFogata.appendChild(boton(doc, "Descansar y guardar", "Descansar en la fogata y guardar", () => {
      motor.descansar();
      refrescarFogata();
    }));
    grupoFogata.appendChild(boton(doc, "Personaje y equipo", "Abrir personaje, equipo y forja", () => abrirPersonaje()));
    const boton3d = boton(doc, "Volver a la fase 3D", "Volver a la fase 3D", () => motor.entrar3D());
    boton3d.style.display = "none";
    grupoFogata.appendChild(boton3d);
    grupoFogata.appendChild(boton(doc, "Cerrar", "Cerrar la fogata", () => motor.cerrarFogata()));
    panelFogata.appendChild(grupoFogata);

    const panelPersonaje = crearEl(doc, "div", "av-personaje");
    panelPersonaje.style.display = "none";
    panelFogata.appendChild(panelPersonaje);

    panelFogata.appendChild(crearEl(doc, "h3", "av-h", "Atributos"));
    const puntosTexto = crearEl(doc, "p", null, "");
    panelFogata.appendChild(puntosTexto);
    const filasAtributo = {};
    for (const atr of Object.keys(NOMBRE_ATRIBUTO)) {
      const fila = crearEl(doc, "div", "av-fila");
      const etiqueta = crearEl(doc, "span", null, NOMBRE_ATRIBUTO[atr]);
      const valor = crearEl(doc, "span", null, "0");
      const subir = boton(doc, "+1", "Subir " + NOMBRE_ATRIBUTO[atr], () => {
        motor.invertirAtributo(atr);
        refrescarFogata();
      });
      fila.appendChild(etiqueta);
      fila.appendChild(valor);
      fila.appendChild(subir);
      panelFogata.appendChild(fila);
      filasAtributo[atr] = { valor, boton: subir };
    }
    const btnRespec = boton(doc, "Reiniciar atributos (" + N.COSTO_RESPEC + " núcleos)",
      "Reiniciar atributos por " + N.COSTO_RESPEC + " núcleos", () => {
        motor.reiniciarAtributos();
        refrescarFogata();
      });
    panelFogata.appendChild(btnRespec);
    escenario.appendChild(panelFogata);
    raiz.appendChild(escenario);

    // Contenedor de la fase 3D (Ceniza3D se monta aquí; el escenario 2D se oculta).
    const host3d = crearEl(doc, "div", "av-3d");
    raiz.appendChild(host3d);
    op.contenedor.appendChild(raiz);

    // ----------------------------------------------------------------- actualización de la interfaz
    let personajeAbierto = false;

    function actualizarHud() {
      const p = motor.partida();
      const r = N.resumen(p);
      const st = N.statsJugador(p);
      vidaRelleno.style.width = (clamp(p.vida / st.vidaMax, 0, 1) * 100).toFixed(1) + "%";
      vidaTexto.textContent = "Vida " + p.vida + " / " + st.vidaMax;
      nivelTexto.textContent = "Nivel " + r.nivel + " · XP " + r.xp +
        (r.xpSiguiente !== null ? " / " + r.xpSiguiente : "");
      nucleosTexto.textContent = "Núcleos " + p.nucleos +
        (p.nucleosSala > 0 ? " (+" + p.nucleosSala + " sin consolidar)" : "");
      chatarraTexto.textContent = "Chatarra " + p.chatarra;
      zonaTexto.textContent = "Zona " + r.zona + " · " + M.salaPorId(p.sala).nombre;
      const arma = motor.estado().arma;
      for (const a of ARMAS_2D) botonesArma[a].setAttribute("aria-pressed", String(arma === a));
      const av = motor.aviso();
      mensaje.textContent = av.texto;
      mensaje.setAttribute("data-error", String(av.error));
    }

    function refrescarFogata() {
      const p = motor.partida();
      btnRespec.disabled = p.nucleos < N.COSTO_RESPEC;
      puntosTexto.textContent = "Puntos libres: " + p.puntosLibres + ". Núcleos: " + p.nucleos + ".";
      for (const atr of Object.keys(filasAtributo)) {
        filasAtributo[atr].valor.textContent = String(p.atributos[atr]);
        filasAtributo[atr].boton.disabled = p.puntosLibres < 1;
      }
      boton3d.style.display = p.faseActual === "3d" ? "inline-block" : "none";
    }

    // Si CenizaPersonaje no puede abrirse (hoy lanza al validar el personaje, ver las notas de la
    // entrega), la fogata sigue funcionando y se avisa en el HUD.
    function abrirPersonaje() {
      const p = motor.partida();
      panelPersonaje.style.display = "block";
      try {
        PERSONAJE.abrir(panelPersonaje, {
          personaje: p.personaje,
          inventario: p.inventario,
          equipadas: p.equipo,
          forja: { chatarra: p.chatarra },
          onCambio: (estado) => {
            motor.sincronizarPanel(estado);
            refrescarFogata();
          },
        });
        personajeAbierto = true;
      } catch (e) {
        personajeAbierto = false;
        panelPersonaje.style.display = "none";
        motor.avisar("No se pudo abrir el panel de personaje: " + e.message, true);
      }
    }

    function cerrarPersonaje() {
      if (personajeAbierto) PERSONAJE.cerrar();
      personajeAbierto = false;
      panelPersonaje.style.display = "none";
    }

    ui.hud = actualizarHud;
    ui.fogata = (abierta) => {
      panelFogata.style.display = abierta ? "block" : "none";
      if (abierta) refrescarFogata();
      else cerrarPersonaje();
    };
    ui.pausa = (abierta) => {
      panelPausa.style.display = abierta ? "block" : "none";
    };
    ui.escena3d = (activa) => {
      escenario.style.display = activa ? "none" : "block";
      host3d.style.display = activa ? "block" : "none";
    };
    ui.contenedor3d = () => host3d;
    ui.refrescarPanel = () => {
      if (personajeAbierto) abrirPersonaje();
    };

    // ----------------------------------------------------------------- teclado
    // Las teclas se ignoran dentro de campos de texto (el nombre del personaje, por ejemplo).
    function claveDe(e) {
      const k = String(e.key || "");
      return k === " " ? " " : k.toLowerCase();
    }

    function manejarPausa() {
      const m = motor.modo();
      if (m === "fogata") motor.cerrarFogata();
      else if (m === "juego" || m === "pausa") motor.ponerPausa(m === "juego");
    }

    function esCampoDeTexto(e) {
      const tag = e.target && e.target.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
    }

    function alTeclaBajar(e) {
      if (esCampoDeTexto(e)) return;
      const k = claveDe(e);
      const prevenir = () => { if (typeof e.preventDefault === "function") e.preventDefault(); };
      if (k === "escape" || k === "p") {
        if (!e.repeat) manejarPausa();
        prevenir();
        return;
      }
      if (motor.modo() !== "juego") return;
      const en = motor.entrada;
      if (k === "a" || k === "arrowleft") { en.izq = true; prevenir(); }
      else if (k === "d" || k === "arrowright") { en.der = true; prevenir(); }
      else if (k === "w" || k === " ") { if (!e.repeat) en.saltar = true; prevenir(); }
      else if (k === "j") { if (!e.repeat) en.atacar = true; prevenir(); }
      else if (k === "k") { if (!e.repeat) en.esquivar = true; prevenir(); }
      else if (k === "e") { if (!e.repeat) en.interactuar = true; prevenir(); }
      else if (TECLA_ARMA[k]) en.arma = TECLA_ARMA[k];
    }

    function alTeclaSubir(e) {
      const k = claveDe(e);
      if (k === "a" || k === "arrowleft") motor.entrada.izq = false;
      else if (k === "d" || k === "arrowright") motor.entrada.der = false;
    }

    if (typeof doc.addEventListener === "function") {
      doc.addEventListener("keydown", alTeclaBajar);
      doc.addEventListener("keyup", alTeclaSubir);
    }

    // ----------------------------------------------------------------- bucle de pantalla
    let destruido = false;
    let rafId = null;
    let ultimo = null;
    let acumulado = 0;
    const hayRaf = typeof globalThis.requestAnimationFrame === "function";

    function dibujar() {
      if (!ctx || motor.modo() === "tres_d") return;
      dibujarEscena(ctx, motor.vista());
    }

    // Fotogramas de 1/60 s: el tiempo de pantalla se convierte en pasos fijos del motor.
    function cuadro(t) {
      if (destruido) return;
      if (ultimo === null) ultimo = t;
      acumulado += clamp((t - ultimo) / 1000, 0, TOPE_FRAME);
      ultimo = t;
      while (acumulado >= PASO) {
        const m = motor.modo();
        if (m === "pausa" || m === "fogata" || m === "tres_d" || m === "victoria") {
          acumulado = 0;
          break;
        }
        motor.paso();
        acumulado -= PASO;
      }
      dibujar();
      actualizarHud();
      rafId = globalThis.requestAnimationFrame(cuadro);
    }

    // ----------------------------------------------------------------- arranque
    motor.iniciar();
    actualizarHud();
    dibujar();
    if (hayRaf) rafId = globalThis.requestAnimationFrame(cuadro);

    // ----------------------------------------------------------------- gancho de pruebas
    const pruebas = Object.freeze({
      estado: () => motor.estado(),
      avanzar: (segundos) => motor.avanzar(segundos),
      entrarSala: (salaId) => motor.intentarCruzar(salaId),
      matarEnemigosDeSala: () => motor.matarEnemigosDeSala(),
      vencerJefe: (jefeId) => {
        try {
          motor.derrotarJefe(jefeId);
          return { ok: true, faseActual: motor.partida().faseActual };
        } catch (e) {
          return { ok: false, error: e.message };
        }
      },
    });
    const pruebaOn = pruebaActiva();
    if (pruebaOn) globalThis.CENIZA_TEST = pruebas;

    // ----------------------------------------------------------------- controlador
    const control = {
      pausar() {
        motor.ponerPausa(true);
      },
      reanudar() {
        motor.ponerPausa(false);
      },
      destruir() {
        if (destruido) return;
        destruido = true;
        if (rafId !== null && typeof globalThis.cancelAnimationFrame === "function") {
          globalThis.cancelAnimationFrame(rafId);
        }
        if (typeof doc.removeEventListener === "function") {
          doc.removeEventListener("keydown", alTeclaBajar);
          doc.removeEventListener("keyup", alTeclaSubir);
        }
        cerrarPersonaje();
        motor.destruir();
        try {
          op.contenedor.removeChild(raiz);
        } catch (e) {
          // El contenedor ya no contiene la interfaz: nada que quitar.
        }
        if (pruebaOn && globalThis.CENIZA_TEST === pruebas) delete globalThis.CENIZA_TEST;
      },
      estado() {
        return motor.estado();
      },
    };
    return control;
  }

  globalThis.CenizaAventuraUI = Object.freeze({ montar, VERSION });
})();
