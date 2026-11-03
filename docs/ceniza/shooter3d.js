// Ceniza · FASE 2 (3D): disparos por sectores y Coloso final.
// Script clásico (sin módulos ES): define globalThis.Ceniza3D.
// Requiere three.js r160 cargado antes (global THREE): docs/ceniza/vendor/three.min.js.
// Sin otras dependencias ni red. Armas, oleadas y PV: docs/ceniza-diseno.md (secciones 6.2, 11.1, 11.2 y 11.3).
//
// ---------------------------------------------------------------- API
//
// Ceniza3D.start(opciones) -> control
//   opciones.contenedor        HTMLElement (obligatorio). Dentro se monta un <canvas> y el HUD.
//   opciones.bonos             { vida, dano, armadura, velocidad } del personaje (opcional, por defecto 0).
//                              vida: HP extra (+8 por punto de Vida). dano: % extra de daño.
//                              armadura: % de reducción del daño recibido (máximo 60). velocidad: % extra.
//   opciones.sectorInicial     "S1" (por defecto), "S2", "S3" o "COLOSO". Para pruebas: entrega las armas previas.
//   opciones.semilla           Entero. Repite la misma partida (aleatoriedad determinista).
//   opciones.onVictoria(r)     Al derrotar al Coloso final.
//   opciones.onCaida(r)        Al llegar la vida a 0.
//   opciones.onSalir(r)        Al elegir Salir en el menú de pausa.
//   opciones.onXP(n, origen)   Cada vez que se gana XP: dron 5, élite 10, torreta 10, Coloso final 1000.
//   r (resumen) = { resultado, sector, tiempo, xp, enemigosDerrotados, arma }
//                 resultado: "victoria" | "caida" | "salida". tiempo en segundos simulados.
//
// control.pausar() / control.reanudar() / control.destruir()
// control.step(n)    Avanza n fotogramas de 1/60 s sin pintar. Ignora la pausa. Para pruebas y medición de tiempos.
// control.estado()   { webgl, sector, sectorNombre, objetivo, vida, vidaMax, arma, armaNombre,
//                      municion: { cargador, reserva }, armas, enemigosVivos, enemigosDerrotados,
//                      xp, tiempo, fase, pausado, terminado, resultado }
//
// Ceniza3D.ORDEN      ["S1", "S2", "S3", "COLOSO"]
// Ceniza3D.SECTORES   { id, nombre, minutos, arma, oleadas } de cada sector
// Ceniza3D.ARMAS      rifle (tecla 1), escopeta (2) y plasma (3)
// Ceniza3D.version    "0.1.0"
//
// Controles: WASD o flechas (moverse), ratón con puntero bloqueado (mirar), clic izquierdo mantenido
// (disparar), Espacio (saltar), Shift (correr), 1, 2 y 3 (cambiar de arma), R (recargar),
// Escape o P (pausa). Táctil: pendiente, no está en esta versión.

(function () {
  "use strict";

  const VERSION = "0.1.0";
  const PASO = 1 / 60;               // fotograma de simulación (s)
  const TRAMO = 22;                  // metros por tramo de pasillo; cada tramo tiene una oleada
  const MEDIO_PASILLO = 7.5;         // el pasillo mide 15 m de ancho
  const INICIO_Z = 4;                // la línea de entrada del tramo 1 está en z = 0
  const VIDA_BASE = 100;
  const ARMADURA_MAX = 60;
  const GRAVEDAD = 22;
  const SALTO = 7;
  const ANDAR = 4.2;
  const CORRER = 6.5;
  const SENSIBILIDAD = 0.0022;
  const ALTURA_OJOS = 1.6;
  const RADIO_ARENA = 22;
  const COLOSO_Z = -16;
  const COLOSO_Y = 4.8;
  const PV_FASE = Object.freeze([0, 6000, 7000, 7000]);   // índice = fase del Coloso (1 a 3)
  const ARMAS_ORDEN = Object.freeze(["rifle", "escopeta", "plasma"]);
  const TECLAS_ARMA = Object.freeze({
    Digit1: "rifle", Digit2: "escopeta", Digit3: "plasma",
    Numpad1: "rifle", Numpad2: "escopeta", Numpad3: "plasma",
  });

  // Congela un dato y sus anidados para que nada lo altere.
  function congelar(obj) {
    for (const v of Object.values(obj)) if (typeof v === "object" && v !== null) congelar(v);
    return Object.freeze(obj);
  }

  // Armas 3D (docs/ceniza-diseno.md, 6.2). Daño por disparo, perdigón o impacto directo.
  // recogida: munición de reserva que aporta un pickup de munición.
  const ARMAS = congelar({
    rifle: {
      id: "rifle", nombre: "Rifle", tecla: "1", sector: "S1", tipo: "rayo",
      dano: 18, cadencia: 0.2, alcance: 60, cargador: 30, reserva: 90, recarga: 1.4, recogida: 24,
    },
    escopeta: {
      id: "escopeta", nombre: "Escopeta", tecla: "2", sector: "S2", tipo: "perdigones",
      perdigones: 8, dano: 10, cadencia: 0.9, alcance: 14, dispersion: 0.07,
      cargador: 6, reserva: 24, recarga: 1.8, recogida: 8,
    },
    plasma: {
      id: "plasma", nombre: "Plasma", tecla: "3", sector: "S3", tipo: "proyectil",
      dano: 45, danoArea: 20, radioArea: 2, cadencia: 0.6, alcance: 50, velocidad: 40,
      cargador: 20, reserva: 40, recarga: 1.6, recogida: 10,
    },
  });

  // Sectores y oleadas (11.1). oleadas[k] es la composición de la oleada del tramo k+1.
  const DEFINICION = congelar([
    {
      id: "S1", nombre: "Pasillo de hielo", minutos: 12, arma: "rifle",
      ambiente: { cielo: 0xbfdcee, suelo: 0x7f9bb3, niebla: 0xc6e2f2, piso: 0xdcecf5, pared: 0x9cc3dc, columna: 0xeaf6ff, acento: 0x7fd1ff },
      oleadas: [
        [{ tipo: "explorador", n: 4 }],
        [{ tipo: "explorador", n: 4 }, { tipo: "asalto", n: 2 }],
        [{ tipo: "asalto", n: 6 }, { tipo: "explorador", n: 2 }],
      ],
    },
    {
      id: "S2", nombre: "Taller de drones", minutos: 14, arma: "escopeta",
      ambiente: { cielo: 0x3c4150, suelo: 0x20232b, niebla: 0x3a3f4b, piso: 0x5a5e68, pared: 0x7b6a58, columna: 0xb07a3a, acento: 0xffb347 },
      oleadas: [
        [{ tipo: "explorador", n: 3 }, { tipo: "torreta", n: 1 }],
        [{ tipo: "asalto", n: 2 }, { tipo: "explorador", n: 2 }, { tipo: "torreta", n: 1 }],
        [{ tipo: "asalto", n: 4 }, { tipo: "explorador", n: 2 }],
      ],
    },
    {
      id: "S3", nombre: "Cabina del coloso", minutos: 12, arma: "plasma",
      ambiente: { cielo: 0x2a0e12, suelo: 0x1a0708, niebla: 0x2a0e12, piso: 0x3a1b1b, pared: 0x5a2a2a, columna: 0x8a2b2b, acento: 0xff5a3c },
      oleadas: [
        [{ tipo: "elite", n: 1 }, { tipo: "asalto", n: 3 }],
        [{ tipo: "elite", n: 2 }, { tipo: "asalto", n: 4 }],
      ],
    },
    {
      id: "COLOSO", nombre: "Coloso final", minutos: 10, arma: null,
      ambiente: { cielo: 0x140f1e, suelo: 0x2b2140, niebla: 0x140f1e, piso: 0x2b2140, pared: 0x2b2140, columna: 0x5a4a7a, acento: 0x9c7cff },
      oleadas: [],
    },
  ]);

  const ORDEN = congelar(["S1", "S2", "S3", "COLOSO"]);

  // Enemigos (11.2). altura: altura del centro de la figura; radio: esfera de impacto.
  const TIPOS = congelar({
    explorador: { nombre: "Dron explorador", vida: 40, xp: 5, radio: 0.7, altura: 2.2, color: 0x7fd1ff },
    asalto: { nombre: "Dron de asalto", vida: 90, xp: 5, radio: 0.9, altura: 0.9, color: 0xff8a4c },
    torreta: { nombre: "Torreta", vida: 150, xp: 10, radio: 1.0, altura: 1.6, color: 0x8a8f99 },
    elite: { nombre: "Guardián de cabina", vida: 400, escudo: 150, xp: 10, radio: 1.3, altura: 1.2, color: 0x9c6cff },
  });

  // Datos públicos de los sectores.
  const SECTORES_PUBLICOS = congelar(DEFINICION.map(function (d) {
    return { id: d.id, nombre: d.nombre, minutos: d.minutos, arma: d.arma, oleadas: d.oleadas.length };
  }));

  // ---------------------------------------------------------------- utilidades puras

  // Distancia a lo largo del rayo (o ∞) a una esfera. o y d: origen y dirección normalizada.
  function distanciaRayo(o, d, c, r) {
    const ox = c.x - o.x, oy = c.y - o.y, oz = c.z - o.z;
    const t = ox * d.x + oy * d.y + oz * d.z;
    if (t < 0) return Infinity;
    const q2 = ox * ox + oy * oy + oz * oz - t * t;
    if (q2 > r * r) return Infinity;
    return Math.max(0, t - Math.sqrt(r * r - q2));
  }

  // ¿El segmento a→b toca la esfera (c, r)?
  function segmentoToca(a, b, c, r) {
    const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
    const l2 = abx * abx + aby * aby + abz * abz;
    let t = l2 > 0 ? ((c.x - a.x) * abx + (c.y - a.y) * aby + (c.z - a.z) * abz) / l2 : 0;
    t = Math.min(1, Math.max(0, t));
    const px = a.x + abx * t - c.x, py = a.y + aby * t - c.y, pz = a.z + abz * t - c.z;
    return px * px + py * py + pz * pz <= r * r;
  }

  // Generador pseudoaleatorio (mulberry32). Sin semilla entera usa Math.random una vez.
  function crearRng(semilla) {
    let x = Number.isInteger(semilla) ? semilla >>> 0 : Math.floor(Math.random() * 4294967296) >>> 0;
    return function () {
      x = (x + 0x6d2b79f5) >>> 0;
      let t = x;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Bonos del personaje, saneados. La armadura queda entre 0 y ARMADURA_MAX.
  function normalizarBonos(b) {
    const o = b && typeof b === "object" ? b : {};
    const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
    return {
      vida: Math.max(0, num(o.vida)),
      dano: Math.max(0, num(o.dano)),
      armadura: Math.min(ARMADURA_MAX, Math.max(0, num(o.armadura))),
      velocidad: Math.max(0, num(o.velocidad)),
    };
  }

  // Crea un elemento del DOM con clase, texto y padre opcionales.
  function crearEl(tag, clase, padre, texto) {
    const el = document.createElement(tag);
    if (clase) el.className = clase;
    if (texto !== undefined) el.textContent = texto;
    if (padre) padre.appendChild(el);
    return el;
  }

  // Quita un objeto 3D de su padre y libera sus geometrías y materiales propios.
  // Los recursos marcados en el conjunto "compartidos" no se liberan aquí.
  const compartidos = new Set();
  function desmontar(obj) {
    if (!obj) return;
    if (obj.parent) obj.parent.remove(obj);
    obj.traverse(function (o) {
      if (o.geometry && !compartidos.has(o.geometry)) o.geometry.dispose();
      if (o.material) {
        (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) {
          if (!compartidos.has(m)) m.dispose();
        });
      }
    });
  }

  const CSS = [
    ".ceniza3d-raiz{position:relative;width:100%;height:100%;min-height:240px;overflow:hidden;background:#05060a;color:#eef3f8;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;user-select:none;-webkit-user-select:none}",
    ".ceniza3d-canvas{position:absolute;top:0;left:0;width:100%;height:100%;display:block;outline:none}",
    ".ceniza3d-hud{position:absolute;top:0;left:0;right:0;bottom:0;pointer-events:none}",
    ".ceniza3d-sup{position:absolute;top:10px;left:14px;right:120px;text-shadow:0 1px 3px #000;line-height:1.35}",
    ".ceniza3d-sector{font-size:14px;font-weight:700;letter-spacing:.04em}",
    ".ceniza3d-objetivo{font-size:13px;opacity:.92}",
    ".ceniza3d-enemigos{position:absolute;top:10px;right:14px;font-size:13px;text-shadow:0 1px 3px #000}",
    ".ceniza3d-vida{position:absolute;left:14px;bottom:14px;width:min(260px,45%)}",
    ".ceniza3d-vida-barra{height:10px;background:rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.35);border-radius:3px;overflow:hidden}",
    ".ceniza3d-vida-relleno{height:100%;width:100%;background:#e8604c;transition:width .15s linear}",
    ".ceniza3d-vida-texto{margin-top:4px;font-size:13px;text-shadow:0 1px 3px #000}",
    ".ceniza3d-arma{position:absolute;right:14px;bottom:44px;font-size:14px;font-weight:700;text-shadow:0 1px 3px #000;text-align:right}",
    ".ceniza3d-municion{position:absolute;right:14px;bottom:14px;font-size:22px;font-weight:700;text-shadow:0 1px 3px #000;font-variant-numeric:tabular-nums}",
    ".ceniza3d-mira{position:absolute;left:50%;top:50%;width:18px;height:18px;margin:-9px 0 0 -9px}",
    ".ceniza3d-mira::before,.ceniza3d-mira::after{content:'';position:absolute;background:rgba(255,255,255,.9);box-shadow:0 0 2px #000}",
    ".ceniza3d-mira::before{left:8px;top:0;width:2px;height:18px}",
    ".ceniza3d-mira::after{left:0;top:8px;width:18px;height:2px}",
    ".ceniza3d-mensaje{position:absolute;top:44px;left:50%;transform:translateX(-50%);font-size:16px;font-weight:600;text-shadow:0 1px 4px #000;white-space:nowrap;min-height:20px}",
    ".ceniza3d-destello{position:absolute;top:0;left:0;right:0;bottom:0;background:radial-gradient(ellipse at center,rgba(0,0,0,0) 40%,rgba(200,20,20,.9) 100%);opacity:0}",
    ".ceniza3d-aviso{display:none;position:absolute;left:14px;right:14px;top:50%;transform:translateY(-50%);text-align:center;font-size:15px;background:rgba(0,0,0,.7);padding:12px;border-radius:6px}",
    ".ceniza3d-pausa{display:none;position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(5,6,10,.78);align-items:center;justify-content:center;pointer-events:auto;padding:16px;box-sizing:border-box}",
    ".ceniza3d-pausa-caja{max-width:440px;width:100%;background:#12141c;border:1px solid #2c3140;border-radius:10px;padding:22px;text-align:center}",
    ".ceniza3d-pausa-caja h2{margin:0 0 10px;font-size:22px}",
    ".ceniza3d-pausa-caja p{margin:0 0 18px;font-size:14px;line-height:1.5;color:#c9d1de}",
    ".ceniza3d-botones{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}",
    ".ceniza3d-boton{font:inherit;font-size:15px;padding:9px 18px;border-radius:6px;border:1px solid #6c7490;background:#242a3a;color:#eef3f8;cursor:pointer}",
    ".ceniza3d-boton:focus-visible{outline:2px solid #ffd54a;outline-offset:2px}",
    ".ceniza3d-boton-2{background:transparent}",
  ].join("\n");

  // ---- FIN DEL BLOQUE 1: cabecera, constantes, datos y utilidades. Sigue start().

  // ---------------------------------------------------------------- partida

  function start(opciones) {
    if (!opciones || typeof opciones !== "object") throw new TypeError("Ceniza3D.start necesita un objeto de opciones");
    const contenedor = opciones.contenedor;
    if (!contenedor || typeof contenedor.appendChild !== "function") throw new TypeError("Falta opciones.contenedor (un elemento del DOM)");
    if (typeof THREE === "undefined") throw new Error("Falta three.js: carga vendor/three.min.js antes de shooter3d.js");
    const indiceInicial = ORDEN.indexOf(opciones.sectorInicial === undefined ? "S1" : opciones.sectorInicial);
    if (indiceInicial < 0) throw new RangeError("sectorInicial debe ser S1, S2, S3 o COLOSO");

    const bonos = normalizarBonos(opciones.bonos);
    const rng = crearRng(opciones.semilla);
    const cbs = {
      onVictoria: opciones.onVictoria, onCaida: opciones.onCaida,
      onSalir: opciones.onSalir, onXP: opciones.onXP,
    };
    const vidaMax = VIDA_BASE + bonos.vida;

    // ---- estado del viajero
    const jugador = {
      pos: new THREE.Vector3(0, 0, INICIO_Z), vy: 0, enSuelo: true,
      yaw: 0, pitch: 0, vida: vidaMax, destello: 0,
    };

    // ---- estado de la partida
    let indice = indiceInicial;
    let def = DEFINICION[indice];
    let arena = false;
    let escenario = null;
    let puertas = [];
    let segSiguiente = 0;
    let oleadaActiva = -1;
    let enemigos = [];
    let balas = [];
    let plasmas = [];
    let pickups = [];
    let efectos = [];
    let telegrafos = [];
    let coloso = null;
    let armasDesbloqueadas = [];
    let armaActual = null;
    let municion = {};
    let cadencia = 0;
    let recargaT = 0;
    let recargaArma = null;
    let disparando = false;
    let teclas = {};
    let pausado = true;
    let haJugado = false;
    let terminado = false;
    let resultado = null;
    let tiempo = 0;
    let xp = 0;
    let derrotados = 0;
    let mensajeTexto = "";
    let mensajeHasta = 0;
    let avisoBloqueoT = -10;
    let destruido = false;
    let frameId = null;
    let ultimoT = null;

    // ---- recursos de render
    const geo = {};
    const matBasico = {};
    const escuchas = [];
    const hudCache = {};
    let matLinea = null;
    let raiz = null, canvas = null, hud = null, estiloEl = null, observador = null;
    let renderer = null, escena = null, camara = null, luzHemi = null, luzSol = null;

    // ---- utilidades de la partida

    function llamar(fn) {
      if (typeof fn !== "function") return;
      const args = Array.prototype.slice.call(arguments, 1);
      try { fn.apply(null, args); } catch (err) { console.error("Ceniza3D: error en un callback", err); }
    }

    function escuchar(obj, tipo, fn) {
      obj.addEventListener(tipo, fn);
      escuchas.push([obj, tipo, fn]);
    }

    function prevenir(ev) {
      if (ev && typeof ev.preventDefault === "function") ev.preventDefault();
    }

    function mensaje(texto, dur) {
      mensajeTexto = texto;
      mensajeHasta = tiempo + (dur || 2.5);
    }

    function ganarXP(cantidad, origen) {
      xp += cantidad;
      llamar(cbs.onXP, cantidad, origen);
    }

    function matColor(hex) {
      if (!matBasico[hex]) {
        matBasico[hex] = new THREE.MeshBasicMaterial({ color: hex });
        compartidos.add(matBasico[hex]);
      }
      return matBasico[hex];
    }

    function formatoTiempo(seg) {
      const s = Math.floor(seg);
      return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
    }

    function torso() {
      return new THREE.Vector3(jugador.pos.x, jugador.pos.y + 1.0, jugador.pos.z);
    }

    function origenDe(e) {
      const p = e.grupo.position;
      return new THREE.Vector3(p.x, p.y, p.z);
    }

    // ---- DOM: raíz, canvas, HUD y menú de pausa

    function construirHUD() {
      raiz = crearEl("div", "ceniza3d-raiz", null);
      canvas = crearEl("canvas", "ceniza3d-canvas", raiz);
      canvas.tabIndex = 0;
      hud = crearEl("div", "ceniza3d-hud", raiz);
      const sup = crearEl("div", "ceniza3d-sup", hud);
      hud.sector = crearEl("div", "ceniza3d-sector", sup);
      hud.objetivo = crearEl("div", "ceniza3d-objetivo", sup);
      hud.objetivo.setAttribute("aria-live", "polite");
      hud.enemigos = crearEl("div", "ceniza3d-enemigos", hud);
      const vida = crearEl("div", "ceniza3d-vida", hud);
      hud.vidaRelleno = crearEl("div", "ceniza3d-vida-relleno", crearEl("div", "ceniza3d-vida-barra", vida));
      hud.vidaTexto = crearEl("div", "ceniza3d-vida-texto", vida);
      hud.arma = crearEl("div", "ceniza3d-arma", hud);
      hud.municion = crearEl("div", "ceniza3d-municion", hud);
      crearEl("div", "ceniza3d-mira", hud);
      hud.mensaje = crearEl("div", "ceniza3d-mensaje", hud);
      hud.mensaje.setAttribute("aria-live", "polite");
      hud.destello = crearEl("div", "ceniza3d-destello", hud);
      hud.aviso = crearEl("div", "ceniza3d-aviso", hud);
      hud.pausa = crearEl("div", "ceniza3d-pausa", raiz);
      const caja = crearEl("div", "ceniza3d-pausa-caja", hud.pausa);
      hud.pausaTitulo = crearEl("h2", null, caja);
      hud.pausaTexto = crearEl("p", null, caja);
      const botones = crearEl("div", "ceniza3d-botones", caja);
      hud.botonContinuar = crearEl("button", "ceniza3d-boton", botones, "Continuar");
      hud.botonSalir = crearEl("button", "ceniza3d-boton ceniza3d-boton-2", botones, "Salir");
      hud.botonContinuar.type = "button";
      hud.botonSalir.type = "button";
      escuchar(hud.botonContinuar, "click", reanudar);
      escuchar(hud.botonSalir, "click", salir);
      estiloEl = crearEl("style", null, null, CSS);
      (document.head || contenedor).appendChild(estiloEl);
      contenedor.appendChild(raiz);
    }

    function mostrarPausa() {
      hud.pausaTitulo.textContent = haJugado ? "Pausa" : "Ceniza · Fase 3D";
      hud.pausaTexto.textContent = "Clic para jugar · WASD mueve · Ratón mira · Clic dispara · 1, 2 y 3 cambian de arma · R recarga · Esc o P pausan";
      hud.botonContinuar.textContent = haJugado ? "Continuar" : "Empezar";
      hud.botonContinuar.style.display = "";
      hud.botonSalir.style.display = "";
      hud.pausa.style.display = "flex";
    }

    function ocultarPausa() {
      hud.pausa.style.display = "none";
    }

    function mostrarFin(res, r) {
      hud.pausaTitulo.textContent = res === "victoria" ? "Coloso derrotado" : "Has caído";
      hud.pausaTexto.textContent = "Tiempo: " + formatoTiempo(r.tiempo) + " · XP: " + r.xp +
        " · Enemigos derrotados: " + r.enemigosDerrotados;
      hud.botonContinuar.style.display = "none";
      hud.botonSalir.style.display = "none";
      hud.pausa.style.display = "flex";
    }

    function poner(el, clave, valor) {
      if (hudCache[clave] !== valor) {
        hudCache[clave] = valor;
        el.textContent = valor;
      }
    }

    // ---- render

    function ajustarTamano() {
      if (!camara) return;
      const w = contenedor.clientWidth || 960;
      const h = contenedor.clientHeight || 540;
      camara.aspect = w / h;
      camara.updateProjectionMatrix();
      if (renderer) renderer.setSize(w, h, false);
    }

    function iniciarRender() {
      geo.bala = new THREE.SphereGeometry(0.12, 8, 6);
      geo.plasma = new THREE.SphereGeometry(0.2, 10, 8);
      geo.pickup = new THREE.BoxGeometry(0.5, 0.5, 0.5);
      geo.esfera = new THREE.SphereGeometry(1, 12, 8);
      matLinea = new THREE.LineBasicMaterial({ color: 0xfff2a8 });
      Object.values(geo).forEach(function (g) { compartidos.add(g); });
      compartidos.add(matLinea);

      escena = new THREE.Scene();
      escena.background = new THREE.Color(0x05060a);
      escena.fog = new THREE.Fog(0x05060a, 14, 70);
      luzHemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.0);
      luzSol = new THREE.DirectionalLight(0xffffff, 0.7);
      luzSol.position.set(6, 14, 4);
      escena.add(luzHemi);
      escena.add(luzSol);
      camara = new THREE.PerspectiveCamera(72, 16 / 9, 0.1, 220);
      camara.rotation.order = "YXZ";
      try {
        renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        if (THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;
      } catch (err) {
        renderer = null;
        hud.aviso.textContent = "Tu navegador no admite WebGL: la fase 3D no se puede jugar aquí.";
        hud.aviso.style.display = "block";
      }
      ajustarTamano();
    }

    function actualizarCamara() {
      camara.position.set(jugador.pos.x, jugador.pos.y + ALTURA_OJOS, jugador.pos.z);
      camara.rotation.set(jugador.pitch, jugador.yaw, 0);
    }

    function aplicarAmbiente(a) {
      luzHemi.color.setHex(a.cielo);
      luzHemi.groundColor.setHex(a.suelo);
      escena.background.setHex(a.niebla);
      escena.fog.color.setHex(a.niebla);
      escena.fog.near = arena ? 30 : 14;
      escena.fog.far = arena ? 90 : 70;
    }

    // ---- escenarios

    function montarPasillo(d) {
      const n = d.oleadas.length;
      const largo = TRAMO * n + 14;
      const zIni = 12;
      const zFin = zIni - largo;
      const zMedio = (zIni + zFin) / 2;
      const g = new THREE.Group();
      const piso = new THREE.Mesh(
        new THREE.PlaneGeometry(2 * MEDIO_PASILLO, largo),
        new THREE.MeshStandardMaterial({ color: d.ambiente.piso, roughness: 0.9 }),
      );
      piso.rotation.x = -Math.PI / 2;
      piso.position.set(0, 0, zMedio);
      g.add(piso);
      const matPared = new THREE.MeshStandardMaterial({ color: d.ambiente.pared, roughness: 0.7 });
      const matCol = new THREE.MeshStandardMaterial({ color: d.ambiente.columna, roughness: 0.5, metalness: 0.2 });
      for (const lado of [-1, 1]) {
        const pared = new THREE.Mesh(new THREE.BoxGeometry(1, 6, largo), matPared);
        pared.position.set(lado * (MEDIO_PASILLO + 0.5), 3, zMedio);
        g.add(pared);
        for (let z = 6; z > zFin; z -= 11) {
          const col = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 5, 8), matCol);
          col.position.set(lado * (MEDIO_PASILLO - 1.2), 2.5, z);
          g.add(col);
        }
      }
      puertas = [];
      for (let k = 0; k < n; k++) {
        const z = -TRAMO * (k + 1);
        const malla = new THREE.Mesh(
          new THREE.BoxGeometry(2 * MEDIO_PASILLO, 4.5, 0.6),
          new THREE.MeshStandardMaterial({
            color: d.ambiente.acento, emissive: d.ambiente.acento, emissiveIntensity: 0.6,
            transparent: true, opacity: 0.55, depthWrite: false,
          }),
        );
        malla.position.set(0, 2.25, z);
        g.add(malla);
        puertas.push({ z: z, malla: malla, cerrada: false });
      }
      return g;
    }

    function montarArena() {
      const g = new THREE.Group();
      const suelo = new THREE.Mesh(
        new THREE.CircleGeometry(RADIO_ARENA + 2, 48),
        new THREE.MeshStandardMaterial({ color: def.ambiente.piso, roughness: 0.9 }),
      );
      suelo.rotation.x = -Math.PI / 2;
      g.add(suelo);
      const matCol = new THREE.MeshStandardMaterial({ color: def.ambiente.columna, roughness: 0.5 });
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 6, 10), matCol);
        col.position.set(Math.cos(a) * 12, 3, Math.sin(a) * 12);
        g.add(col);
      }
      return g;
    }

    // Coloso: cuerpo, ojo, núcleo (fase 3) y dos brazos (fase 2). Partes en coordenadas locales.
    function crearColoso() {
      const grupo = new THREE.Group();
      grupo.position.set(0, COLOSO_Y, COLOSO_Z);
      const matCuerpo = new THREE.MeshStandardMaterial({ color: 0x3a3f4d, roughness: 0.45, metalness: 0.5 });
      const cuerpo = new THREE.Mesh(new THREE.SphereGeometry(3.2, 24, 18), matCuerpo);
      grupo.add(cuerpo);
      const matOjo = new THREE.MeshStandardMaterial({ color: 0xff3b2e, emissive: 0xff3b2e, emissiveIntensity: 0.3, roughness: 0.3 });
      const ojo = new THREE.Mesh(new THREE.SphereGeometry(1.1, 20, 14), matOjo);
      ojo.position.set(0, 0.6, 2.9);
      grupo.add(ojo);
      const matNucleo = new THREE.MeshStandardMaterial({ color: 0xffd54a, emissive: 0xffd54a, emissiveIntensity: 1.2 });
      const nucleo = new THREE.Mesh(new THREE.SphereGeometry(1.5, 20, 14), matNucleo);
      nucleo.visible = false;
      grupo.add(nucleo);
      const matBrazo = new THREE.MeshStandardMaterial({ color: 0x555c6e, roughness: 0.6, metalness: 0.4 });
      const brazos = [-1, 1].map(function (lado) {
        const malla = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.6, 2.6), matBrazo);
        malla.position.set(lado * 1.1, 0.4, 2.9);
        malla.visible = false;
        grupo.add(malla);
        return { vida: 3500, vivo: false, malla: malla };
      });
      escenario.add(grupo);
      return {
        tipo: "coloso", grupo: grupo, cuerpo: cuerpo, ojoMat: matOjo, nucleo: nucleo,
        matCuerpo: matCuerpo, matBrazo: matBrazo, mats: [matCuerpo, matBrazo],
        brazos: brazos, fase: 1, pool: PV_FASE[1], ventana: 0, intro: 2,
        ataque: 3, pulso: 9, misil: 0, ciclo: 0, patron: 0,
        flash: 0, muerto: false,
      };
    }

    // Enemigos: figuras sencillas con material propio (para el destello al recibir impacto).
    function crearEnemigo(tipo, x, y, z, oleada, zona) {
      const T = TIPOS[tipo];
      const grupo = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: T.color, roughness: 0.5, metalness: 0.3 });
      const mats = [mat];
      let escudoMalla = null;
      if (tipo === "explorador") {
        grupo.add(new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 10), mat));
        const ala1 = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 0.25), mat);
        ala1.position.x = 0.6;
        const ala2 = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 0.25), mat);
        ala2.position.x = -0.6;
        grupo.add(ala1, ala2);
        const ojo = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
        ojo.position.z = -0.4;
        grupo.add(ojo);
      } else if (tipo === "asalto") {
        grupo.add(new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.7, 1.2), mat));
        [-0.4, 0.4].forEach(function (px) {
          const pincho = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.7, 6), mat);
          pincho.position.set(px, 0.6, 0);
          grupo.add(pincho);
        });
      } else if (tipo === "torreta") {
        grupo.add(new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, 0.8, 12), mat));
        const cañon = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.25, 0.25), mat);
        cañon.position.set(-0.6, 0.15, 0);
        grupo.add(cañon);
      } else {
        const cuerpo = new THREE.Mesh(new THREE.SphereGeometry(0.85, 16, 12), mat);
        cuerpo.scale.y = 1.2;
        grupo.add(cuerpo);
        [-0.9, 0.9].forEach(function (px) {
          const pinza = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.5, 0.9), mat);
          pinza.position.set(px, 0, 0.2);
          grupo.add(pinza);
        });
        escudoMalla = new THREE.Mesh(
          new THREE.TorusGeometry(1.5, 0.06, 8, 24),
          new THREE.MeshBasicMaterial({ color: 0x7fe9ff, transparent: true, opacity: 0.7 }),
        );
        grupo.add(escudoMalla);
      }
      grupo.position.set(x, y, z);
      escenario.add(grupo);
      const e = {
        tipo: tipo, grupo: grupo, mats: mats, escudoMalla: escudoMalla,
        vida: T.vida, escudo: T.escudo || 0, radio: T.radio, xp: T.xp,
        yBase: y, zona: zona, oleada: oleada, muerto: false, flash: 0,
        fase: rng() * 6, sentido: rng() < 0.5 ? -1 : 1,
        disparo: 0.8 + rng() * 1.2, golpe: 0, cargaT: 4 + rng() * 2,
        cargando: 0, dirX: 0, dirZ: 0, cargaHecha: false, rafaga: 0, rafagaT: 0,
      };
      enemigos.push(e);
      return e;
    }

    // ---- oleadas y puertas

    function actualizarPuerta(k) {
      const p = puertas[k];
      p.malla.material.opacity = p.cerrada ? 0.55 : 0.12;
      p.malla.material.emissiveIntensity = p.cerrada ? 0.6 : 0.15;
    }

    function contarOleada(k) {
      let n = 0;
      for (const e of enemigos) if (e.oleada === k && !e.muerto) n += 1;
      return n;
    }

    function activarOleada(k) {
      oleadaActiva = k;
      puertas[k].cerrada = true;
      actualizarPuerta(k);
      const zE = -TRAMO * k;
      const zG = -TRAMO * (k + 1);
      const zona = { zmin: zG + 3.5, zmax: zE - 6.5 };
      let lado = rng() < 0.5 ? -1 : 1;
      for (const grupo of def.oleadas[k]) {
        for (let i = 0; i < grupo.n; i++) {
          const z = zona.zmin + rng() * (zona.zmax - zona.zmin);
          if (grupo.tipo === "torreta") {
            lado = -lado;
            crearEnemigo("torreta", lado * (MEDIO_PASILLO - 0.9), TIPOS.torreta.altura, z, k, zona);
          } else {
            const x = (rng() * 2 - 1) * (MEDIO_PASILLO - 1.5);
            crearEnemigo(grupo.tipo, x, TIPOS[grupo.tipo].altura, z, k, zona);
          }
        }
      }
    }

    function completarOleada() {
      const k = oleadaActiva;
      oleadaActiva = -1;
      puertas[k].cerrada = false;
      actualizarPuerta(k);
      mensaje(k < def.oleadas.length - 1 ? "Puerta abierta" : "Sector limpio: sal por la última puerta", 2.5);
    }

    // ---- pickups

    function soltarPickupEn(tipo, x, z) {
      const color = tipo === "botiquin" ? 0x4cff8a : 0xffd54a;
      const malla = new THREE.Mesh(geo.pickup, matColor(color));
      malla.position.set(x, 0.6, z);
      escenario.add(malla);
      pickups.push({ tipo: tipo, malla: malla, fase: rng() * 6, tomado: false });
    }

    function recoger(p) {
      if (p.tipo === "botiquin") {
        const antes = jugador.vida;
        jugador.vida = Math.min(vidaMax, jugador.vida + 25);
        mensaje("Botiquín: +" + Math.round(jugador.vida - antes) + " de vida", 1.5);
      } else if (armaActual) {
        municion[armaActual].reserva += ARMAS[armaActual].recogida;
        mensaje("Munición: +" + ARMAS[armaActual].recogida, 1.5);
      }
    }

    function actualizarPickups(dt) {
      for (const p of pickups) {
        p.malla.rotation.y += dt * 2;
        p.malla.position.y = 0.6 + Math.sin(tiempo * 3 + p.fase) * 0.1;
        const dx = jugador.pos.x - p.malla.position.x;
        const dz = jugador.pos.z - p.malla.position.z;
        if (Math.hypot(dx, dz) < 1.3 && jugador.pos.y < 1.2) {
          recoger(p);
          p.tomado = true;
          desmontar(p.malla);
        }
      }
      pickups = pickups.filter(function (p) { return !p.tomado; });
    }

  // ---- FIN DEL BLOQUE 2: estado, DOM, render y escenarios. Sigue la lógica de juego.

    // ---------------------------------------------------------------- impactos y daño

    function todosLosEnemigos() {
      const lista = [];
      for (const e of enemigos) if (!e.muerto) lista.push(e);
      if (coloso && !coloso.muerto) lista.push(coloso);
      return lista;
    }

    // Partes golpeables. Un enemigo común tiene una sola parte, siempre activa.
    function partesColoso(c) {
      const p = c.grupo.position;
      const en = function (x, y, z) { return { x: p.x + x, y: p.y + y, z: p.z + z }; };
      const partes = [];
      if (c.fase === 1) {
        partes.push({ id: "ojo", centro: en(0, 0.6, 2.9), radio: 1.2, activa: c.ventana > 0 });
        partes.push({ id: "cuerpo", centro: p, radio: 3.2, activa: false });
      } else if (c.fase === 2) {
        c.brazos.forEach(function (b, i) {
          if (b.vivo) {
            partes.push({ id: i === 0 ? "brazoI" : "brazoD", centro: en(i === 0 ? -1.1 : 1.1, 0.4, 3.0), radio: 1.5, activa: true, brazo: b });
          }
        });
        partes.push({ id: "ojo", centro: en(0, 0.6, 2.9), radio: 1.2, activa: c.ventana > 0 });
        partes.push({ id: "cuerpo", centro: p, radio: 3.2, activa: c.ventana > 0 });
      } else {
        partes.push({ id: "nucleo", centro: p, radio: 1.5, activa: true });
      }
      return partes;
    }

    function partesDe(e) {
      if (e.tipo === "coloso") return partesColoso(e);
      return [{ id: "cuerpo", centro: e.grupo.position, radio: e.radio, activa: true }];
    }

    function avisoBloqueo() {
      if (tiempo - avisoBloqueoT > 1.5) {
        avisoBloqueoT = tiempo;
        mensaje("Impacto bloqueado: busca el punto expuesto", 1.2);
      }
    }

    function destello(e) {
      e.mats.forEach(function (m) { m.emissive.setHex(0x661111); });
      e.flash = 0.08;
    }

    function golpearEnemigo(e, dano) {
      if (e.escudo > 0) {
        const absorbido = Math.min(e.escudo, dano);
        e.escudo -= absorbido;
        dano -= absorbido;
        if (e.escudoMalla) e.escudoMalla.visible = e.escudo > 0;
      }
      if (dano > 0) e.vida -= dano;
      destello(e);
      if (e.vida <= 0) morirEnemigo(e);
    }

    function romperBrazo(c, b) {
      b.vivo = false;
      b.malla.visible = false;
      c.ventana = 6;
      const quedan = c.brazos.filter(function (x) { return x.vivo; }).length;
      mensaje(quedan > 0 ? "Brazo roto: el ojo queda expuesto" : "Ambos brazos rotos: ojo expuesto", 3);
    }

    function golpearColoso(c, parte, dano) {
      if (parte.brazo) {
        parte.brazo.vida -= dano;
        if (parte.brazo.vida <= 0 && parte.brazo.vivo) romperBrazo(c, parte.brazo);
      }
      c.pool -= dano;
      destello(c);
      if (c.pool <= 0) avanzarFaseColoso(c);
    }

    function aplicarImpacto(e, parte, dano) {
      if (!parte.activa) {
        avisoBloqueo();
        return false;
      }
      if (e.tipo === "coloso") golpearColoso(e, parte, dano);
      else golpearEnemigo(e, dano);
      return true;
    }

    // Primera parte que el rayo toca, dentro del alcance.
    function buscarImpacto(o, d, alcance) {
      let mejor = null;
      for (const e of todosLosEnemigos()) {
        for (const parte of partesDe(e)) {
          const t = distanciaRayo(o, d, parte.centro, parte.radio);
          if (t <= alcance && (!mejor || t < mejor.t)) mejor = { e: e, parte: parte, t: t };
        }
      }
      return mejor;
    }

    // Primera parte que toca el segmento a→b (para proyectiles de plasma).
    function buscarImpactoSegmento(a, b) {
      let mejor = null;
      let md = Infinity;
      for (const e of todosLosEnemigos()) {
        for (const parte of partesDe(e)) {
          if (!segmentoToca(a, b, parte.centro, parte.radio)) continue;
          const d = a.distanceTo(parte.centro);
          if (d < md) {
            md = d;
            mejor = { e: e, parte: parte };
          }
        }
      }
      return mejor;
    }

    function morirEnemigo(e) {
      if (e.muerto) return;
      e.muerto = true;
      derrotados += 1;
      const x = e.grupo.position.x, z = e.grupo.position.z;
      efectoEsfera(e.grupo.position.clone(), 0xffb36b, 1.4, 0.35);
      desmontar(e.grupo);
      ganarXP(e.xp, e.tipo);
      if (e.tipo === "elite") {
        soltarPickupEn("botiquin", x, z);
        soltarPickupEn("municion", x + 0.6, z);
      } else if (e.tipo === "torreta") {
        if (rng() < 0.4) soltarPickupEn("botiquin", x, z);
      } else {
        const r = rng();
        if (r < 0.12) soltarPickupEn("botiquin", x, z);
        else if (r < 0.27) soltarPickupEn("municion", x, z);
      }
    }

    function daniarJugador(d) {
      if (terminado || d <= 0) return;
      const reduccion = bonos.armadura / 100;
      jugador.vida = Math.max(0, jugador.vida - d * (1 - reduccion));
      jugador.destello = 0.25;
      if (jugador.vida <= 0) finalizar("caida");
    }

    // ---------------------------------------------------------------- efectos y proyectiles

    function efectoEsfera(punto, color, radio, dur) {
      const mat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.8, depthWrite: false });
      const malla = new THREE.Mesh(geo.esfera, mat);
      malla.position.copy(punto);
      malla.scale.setScalar(radio);
      escenario.add(malla);
      efectos.push({ obj: malla, t: dur, dur: dur, radio: radio, mat: mat });
    }

    function trazador(origen, punto) {
      const geometria = new THREE.BufferGeometry().setFromPoints([origen.clone(), punto.clone()]);
      const linea = new THREE.Line(geometria, matLinea);
      escenario.add(linea);
      efectos.push({ obj: linea, t: 0.06, dur: 0.06, radio: 0, mat: null });
    }

    function actualizarEfectos(dt) {
      for (const f of efectos) {
        f.t -= dt;
        if (f.mat) {
          const k = Math.max(0, f.t) / f.dur;
          f.mat.opacity = 0.8 * k;
          f.obj.scale.setScalar(f.radio * (1 + (1 - k) * 0.6));
        }
        if (f.t <= 0) {
          desmontar(f.obj);
          f.hecho = true;
        }
      }
      efectos = efectos.filter(function (f) { return !f.hecho; });
    }

    // Balas de enemigos. guiado: misil que gira hacia el viajero.
    function dispararEnemigo(origen, destino, velocidad, dano, color, guiado) {
      const vel = destino.clone().sub(origen).normalize().multiplyScalar(velocidad);
      const malla = new THREE.Mesh(geo.bala, matColor(color));
      malla.position.copy(origen);
      escenario.add(malla);
      balas.push({
        malla: malla, pos: origen.clone(), prev: origen.clone(), vel: vel,
        velocidad: velocidad, dano: dano, vida: 4, guiado: !!guiado, muerta: false,
      });
    }

    function actualizarBalas(dt) {
      const objetivo = torso();
      for (const b of balas) {
        if (b.muerta) continue;
        b.vida -= dt;
        if (b.guiado) {
          const deseado = objetivo.clone().sub(b.pos).normalize().multiplyScalar(b.velocidad);
          b.vel.lerp(deseado, Math.min(1, 1.2 * dt)).normalize().multiplyScalar(b.velocidad);
        }
        b.prev.copy(b.pos);
        b.pos.addScaledVector(b.vel, dt);
        b.malla.position.copy(b.pos);
        if (segmentoToca(b.prev, b.pos, objetivo, 0.55)) {
          b.muerta = true;
          daniarJugador(b.dano);
          continue;
        }
        if (b.vida <= 0 || b.pos.length() > 120) b.muerta = true;
      }
      for (const b of balas) if (b.muerta) escenario.remove(b.malla);
      balas = balas.filter(function (b) { return !b.muerta; });
    }

    // Pulso del Coloso: aviso de 1,2 s en el suelo y daño si el viajero sigue dentro del radio.
    function telegrafoPulso() {
      const x = jugador.pos.x, z = jugador.pos.z;
      const mat = new THREE.MeshBasicMaterial({ color: 0xff3b2e, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide });
      const malla = new THREE.Mesh(new THREE.RingGeometry(3.1, 3.5, 40), mat);
      malla.rotation.x = -Math.PI / 2;
      malla.position.set(x, 0.05, z);
      escenario.add(malla);
      telegrafos.push({ malla: malla, x: x, z: z, t: 1.2, hecho: false });
    }

    function actualizarTelegrafos(dt) {
      for (const t of telegrafos) {
        t.t -= dt;
        t.malla.material.opacity = 0.3 + 0.4 * (1 - Math.max(0, t.t) / 1.2);
        if (t.t <= 0) {
          t.hecho = true;
          if (Math.hypot(jugador.pos.x - t.x, jugador.pos.z - t.z) <= 3.5) daniarJugador(30);
          efectoEsfera(new THREE.Vector3(t.x, 0.8, t.z), 0xff3b2e, 3.5, 0.5);
          desmontar(t.malla);
        }
      }
      telegrafos = telegrafos.filter(function (t) { return !t.hecho; });
    }

    // Plasma del viajero: impacto directo y daño de área (radio 2 m) al resto de enemigos cercanos.
    function lanzarPlasma(origen, dir) {
      const A = ARMAS.plasma;
      const malla = new THREE.Mesh(geo.plasma, matColor(0x6ff2ff));
      malla.position.copy(origen);
      escenario.add(malla);
      plasmas.push({
        malla: malla, pos: origen.clone(), prev: origen.clone(),
        vel: dir.clone().multiplyScalar(A.velocidad), vida: A.alcance / A.velocidad, muerto: false,
      });
    }

    function explotarPlasma(punto, imp) {
      const A = ARMAS.plasma;
      const mult = 1 + bonos.dano / 100;
      if (imp) aplicarImpacto(imp.e, imp.parte, A.dano * mult);
      efectoEsfera(punto.clone(), 0x6ff2ff, A.radioArea, 0.35);
      for (const e of todosLosEnemigos()) {
        if (imp && e === imp.e) continue;
        for (const parte of partesDe(e)) {
          if (!parte.activa) continue;
          if (punto.distanceTo(parte.centro) - parte.radio <= A.radioArea) {
            aplicarImpacto(e, parte, A.danoArea * mult);
          }
        }
      }
    }

    function actualizarPlasmas(dt) {
      for (const p of plasmas) {
        if (p.muerto) continue;
        p.vida -= dt;
        p.prev.copy(p.pos);
        p.pos.addScaledVector(p.vel, dt);
        const imp = buscarImpactoSegmento(p.prev, p.pos);
        if (imp) {
          explotarPlasma(p.pos, imp);
          p.muerto = true;
        } else if (p.vida <= 0) {
          efectoEsfera(p.pos.clone(), 0x6ff2ff, 1.2, 0.3);
          p.muerto = true;
        } else {
          p.malla.position.copy(p.pos);
        }
        if (p.muerto) escenario.remove(p.malla);
      }
      plasmas = plasmas.filter(function (p) { return !p.muerto; });
    }

  // ---- FIN DEL BLOQUE 3: impactos, proyectiles y efectos. Sigue IA, armas y Coloso.

    // ---------------------------------------------------------------- IA de enemigos

    function moverEnemigo(e, dx, dz) {
      const p = e.grupo.position;
      p.x = Math.min(MEDIO_PASILLO - 0.8, Math.max(-(MEDIO_PASILLO - 0.8), p.x + dx));
      p.z = Math.min(e.zona.zmax, Math.max(e.zona.zmin, p.z + dz));
    }

    function actualizarEnemigo(e, dt) {
      if (e.flash > 0) {
        e.flash -= dt;
        if (e.flash <= 0) e.mats.forEach(function (m) { m.emissive.setHex(0); });
      }
      if (e.escudoMalla) e.escudoMalla.rotation.z += dt;
      const p = e.grupo.position;
      const dx = jugador.pos.x - p.x, dz = jugador.pos.z - p.z;
      const d = Math.hypot(dx, dz) || 0.0001;
      const ux = dx / d, uz = dz / d;

      if (e.tipo === "explorador") {
        // Mantiene distancia de 9 a 15 m y dispara cada 2,5 s.
        let vx = 0, vz = 0;
        if (d > 15) { vx = ux; vz = uz; }
        else if (d < 9) { vx = -ux; vz = -uz; }
        else { vx = -uz * e.sentido; vz = ux * e.sentido; }
        moverEnemigo(e, vx * 3.2 * dt, vz * 3.2 * dt);
        p.y = e.yBase + Math.sin(tiempo * 2.2 + e.fase) * 0.15;
        e.disparo -= dt;
        if (e.disparo <= 0) {
          e.disparo = 2.5;
          if (d < 34) dispararEnemigo(origenDe(e), torso(), 16, 8, 0xffb36b, false);
        }
      } else if (e.tipo === "asalto") {
        // Avanza y golpea a 1,8 m cada 2 s.
        if (d > 1.8) moverEnemigo(e, ux * 4.6 * dt, uz * 4.6 * dt);
        e.golpe -= dt;
        if (d < 1.8 && e.golpe <= 0) {
          e.golpe = 2.0;
          daniarJugador(15);
        }
      } else if (e.tipo === "torreta") {
        // Fija. Ráfaga de 3 disparos de 10 cada 2 s.
        e.grupo.rotation.y = Math.atan2(dz, -dx);
        if (e.rafaga > 0) {
          e.rafagaT -= dt;
          if (e.rafagaT <= 0) {
            e.rafaga -= 1;
            e.rafagaT = 0.25;
            if (d < 40) dispararEnemigo(origenDe(e), torso(), 22, 10, 0xff6b6b, false);
          }
        } else {
          e.disparo -= dt;
          if (e.disparo <= 0) {
            e.disparo = 2.0;
            e.rafaga = 3;
            e.rafagaT = 0;
          }
        }
      } else if (e.tipo === "elite") {
        // Golpe de 25 a 2,5 m; carga de 25 cada 6 s desde 5 a 16 m.
        if (e.cargando > 0) {
          e.cargando -= dt;
          moverEnemigo(e, e.dirX * 10 * dt, e.dirZ * 10 * dt);
          if (!e.cargaHecha && d < 2.0) {
            e.cargaHecha = true;
            daniarJugador(25);
          }
        } else {
          if (d > 2.2) moverEnemigo(e, ux * 2.6 * dt, uz * 2.6 * dt);
          e.golpe -= dt;
          if (d < 2.5 && e.golpe <= 0) {
            e.golpe = 1.6;
            daniarJugador(25);
          }
          e.cargaT -= dt;
          if (e.cargaT <= 0 && d > 5 && d < 16) {
            e.cargaT = 6;
            e.cargando = 0.8;
            e.cargaHecha = false;
            e.dirX = ux;
            e.dirZ = uz;
          }
        }
      }
    }

    // ---------------------------------------------------------------- Coloso final

    function disparoBarrido(c) {
      const origen = new THREE.Vector3(c.grupo.position.x, c.grupo.position.y, c.grupo.position.z + 2.5);
      const base = torso().sub(origen);
      for (const ang of [-0.17, 0, 0.17]) {
        const cos = Math.cos(ang), sin = Math.sin(ang);
        const d = new THREE.Vector3(base.x * cos + base.z * sin, base.y, -base.x * sin + base.z * cos);
        dispararEnemigo(origen, origen.clone().add(d), 18, 12, 0xff3b2e, false);
      }
    }

    function disparoMisiles(c) {
      const p = c.grupo.position;
      [-2.5, 2.5].forEach(function (dx) {
        dispararEnemigo(new THREE.Vector3(p.x + dx, p.y, p.z + 1), torso(), 9, 15, 0xffb84d, true);
      });
    }

    function avanzarFaseColoso(c) {
      if (c.fase >= 3) {
        victoria();
        return;
      }
      c.fase += 1;
      c.pool = PV_FASE[c.fase];
      c.ventana = 0;
      if (c.fase === 2) {
        c.brazos.forEach(function (b) { b.vida = 3500; b.vivo = true; b.malla.visible = true; });
        c.misil = 2.5;
        mensaje("Fase 2: rompe los brazos. El ojo se abre al romper uno", 3.5);
      } else {
        c.brazos.forEach(function (b) { b.vivo = false; b.malla.visible = false; });
        c.matCuerpo.transparent = true;
        c.matCuerpo.opacity = 0.25;
        c.matCuerpo.depthWrite = false;
        c.nucleo.visible = true;
        c.ciclo = 1.5;
        c.patron = 0;
        mensaje("Fase 3: núcleo expuesto. Velocidad máxima", 3.5);
      }
    }

    function actualizarColoso(dt) {
      const c = coloso;
      c.grupo.position.x = Math.sin(tiempo * 0.6) * 1.4;
      c.grupo.position.y = COLOSO_Y + Math.sin(tiempo * 1.3) * 0.25;
      c.ojoMat.emissiveIntensity = c.ventana > 0 ? 1.6 : 0.3;
      if (c.flash > 0) {
        c.flash -= dt;
        if (c.flash <= 0) c.mats.forEach(function (m) { m.emissive.setHex(0); });
      }
      if (c.intro > 0) {
        c.intro -= dt;
        return;
      }
      c.ventana = Math.max(0, c.ventana - dt);
      // Fase 3 va a 1,25 veces la velocidad de los temporizadores.
      const td = dt * (c.fase === 3 ? 1.25 : 1);
      if (c.fase === 1) {
        // Ráfaga cada 4 s; el ojo queda abierto 2 s después. Cañón de pulso cada 12 s.
        c.ataque -= td;
        if (c.ataque <= 0) {
          disparoBarrido(c);
          c.ataque = 4;
          c.ventana = 2;
        }
        c.pulso -= td;
        if (c.pulso <= 0) {
          telegrafoPulso();
          c.pulso = 12;
        }
      } else if (c.fase === 2) {
        c.misil -= td;
        if (c.misil <= 0) {
          disparoMisiles(c);
          c.misil = 3;
        }
      } else {
        c.ciclo -= td;
        if (c.ciclo <= 0) {
          if (c.patron === 0) disparoBarrido(c);
          else if (c.patron === 1) disparoMisiles(c);
          else telegrafoPulso();
          c.patron = (c.patron + 1) % 3;
          c.ciclo = 2.5;
        }
      }
    }

    function victoria() {
      if (!coloso || coloso.muerto) return;
      coloso.muerto = true;
      efectoEsfera(coloso.grupo.position.clone(), 0xffd54a, 9, 1.4);
      coloso.grupo.visible = false;
      derrotados += 1;
      ganarXP(1000, "coloso");
      finalizar("victoria");
    }

  // ---- FIN DEL BLOQUE 4: IA de enemigos y Coloso. Sigue sectores, jugador, armas y control.

    // ---------------------------------------------------------------- sectores

    function aplicarAmbiente(a) {
      luzHemi.color.setHex(a.cielo);
      luzHemi.groundColor.setHex(a.suelo);
      escena.background.setHex(a.niebla);
      escena.fog.color.setHex(a.niebla);
      escena.fog.near = arena ? 30 : 14;
      escena.fog.far = arena ? 90 : 70;
    }

    function concederArma(id) {
      if (armasDesbloqueadas.indexOf(id) < 0) {
        armasDesbloqueadas.push(id);
        municion[id] = { cargador: ARMAS[id].cargador, reserva: ARMAS[id].reserva };
      }
      armaActual = id;
      mensaje("Arma nueva: " + ARMAS[id].nombre, 3);
    }

    function montarSector(idx) {
      indice = idx;
      def = DEFINICION[idx];
      arena = def.id === "COLOSO";
      if (escenario) desmontar(escenario);
      escenario = new THREE.Group();
      escena.add(escenario);
      enemigos = [];
      balas = [];
      plasmas = [];
      pickups = [];
      efectos = [];
      telegrafos = [];
      coloso = null;
      puertas = [];
      segSiguiente = 0;
      oleadaActiva = -1;
      cadencia = 0;
      recargaT = 0;
      recargaArma = null;
      aplicarAmbiente(def.ambiente);
      if (arena) {
        escenario.add(montarArena());
        coloso = crearColoso();
        coloso.ventana = 0;
        jugador.pos.set(0, 0, 10);
      } else {
        escenario.add(montarPasillo(def));
        jugador.pos.set(0, 0, INICIO_Z);
        for (let k = 0; k < def.oleadas.length; k++) soltarPickupEn("botiquin", 0, -TRAMO * k - 11);
      }
      jugador.yaw = 0;
      jugador.pitch = 0;
      jugador.vy = 0;
      jugador.enSuelo = true;
      // Se entregan las armas del sector nuevo y de los anteriores (una por sector).
      const hasta = Math.min(idx, 2);
      for (let i = 0; i <= hasta; i++) {
        if (armasDesbloqueadas.indexOf(ARMAS_ORDEN[i]) < 0) concederArma(ARMAS_ORDEN[i]);
      }
      mensaje(def.nombre, 3);
    }

    function siguienteSector() {
      if (indice + 1 >= DEFINICION.length) return;
      montarSector(indice + 1);
    }

    // Oleadas: la de cada tramo nace al cruzar su línea de entrada. Su puerta se cierra hasta que termina.
    function actualizarSector() {
      const n = def.oleadas.length;
      const z = jugador.pos.z;
      if (segSiguiente < n && oleadaActiva < 0 && z < -TRAMO * segSiguiente - 2) {
        activarOleada(segSiguiente);
        segSiguiente += 1;
      }
      if (oleadaActiva >= 0 && contarOleada(oleadaActiva) === 0) completarOleada();
      if (segSiguiente >= n && oleadaActiva < 0 && z < -TRAMO * n - 1) siguienteSector();
    }

    function limitarJugador() {
      const p = jugador.pos;
      if (arena) {
        const d = Math.hypot(p.x, p.z);
        if (d > RADIO_ARENA) {
          p.x *= RADIO_ARENA / d;
          p.z *= RADIO_ARENA / d;
        }
        return;
      }
      p.x = Math.max(-(MEDIO_PASILLO - 0.7), Math.min(MEDIO_PASILLO - 0.7, p.x));
      if (oleadaActiva >= 0) {
        const zMin = puertas[oleadaActiva].z + 0.8;
        if (p.z < zMin) p.z = zMin;
      }
      if (p.z > 12) p.z = 12;
    }

    // ---------------------------------------------------------------- viajero

    function actualizarJugador(dt) {
      const correr = teclas.ShiftLeft || teclas.ShiftRight;
      const vel = (correr ? CORRER : ANDAR) * (1 + bonos.velocidad / 100);
      const f = (teclas.KeyW || teclas.ArrowUp ? 1 : 0) - (teclas.KeyS || teclas.ArrowDown ? 1 : 0);
      const r = (teclas.KeyD || teclas.ArrowRight ? 1 : 0) - (teclas.KeyA || teclas.ArrowLeft ? 1 : 0);
      if (f !== 0 || r !== 0) {
        const sy = Math.sin(jugador.yaw), cy = Math.cos(jugador.yaw);
        const dx = -sy * f + cy * r;
        const dz = -cy * f - sy * r;
        const l = Math.hypot(dx, dz) || 1;
        jugador.pos.x += (dx / l) * vel * dt;
        jugador.pos.z += (dz / l) * vel * dt;
      }
      if (teclas.Space && jugador.enSuelo) {
        jugador.vy = SALTO;
        jugador.enSuelo = false;
      }
      if (!jugador.enSuelo) {
        jugador.vy -= GRAVEDAD * dt;
        jugador.pos.y += jugador.vy * dt;
        if (jugador.pos.y <= 0) {
          jugador.pos.y = 0;
          jugador.vy = 0;
          jugador.enSuelo = true;
        }
      }
      limitarJugador();
    }

    function direccionMirada() {
      const cp = Math.cos(jugador.pitch);
      return new THREE.Vector3(-Math.sin(jugador.yaw) * cp, Math.sin(jugador.pitch), -Math.cos(jugador.yaw) * cp);
    }

    function origenDisparo() {
      return new THREE.Vector3(jugador.pos.x, jugador.pos.y + ALTURA_OJOS, jugador.pos.z);
    }

    // Desvía la dirección dentro de un disco de radio "amplitud" (escopeta).
    function dispersar(dir, amplitud) {
      const a = amplitud * Math.sqrt(rng());
      const b = rng() * Math.PI * 2;
      const derecha = new THREE.Vector3(Math.cos(jugador.yaw), 0, -Math.sin(jugador.yaw));
      const arriba = new THREE.Vector3(0, 1, 0);
      return dir.clone()
        .addScaledVector(derecha, a * Math.cos(b))
        .addScaledVector(arriba, a * Math.sin(b))
        .normalize();
    }

    // Rayo instantáneo: impacta en la primera parte tocada dentro del alcance.
    function disparoRayo(origen, dir, alcance, dano) {
      const m = buscarImpacto(origen, dir, alcance);
      const punto = origen.clone().addScaledVector(dir, m ? m.t : alcance);
      if (m) aplicarImpacto(m.e, m.parte, dano);
      return punto;
    }

    function intentarDisparo() {
      if (terminado || !armaActual || cadencia > 0 || recargaT > 0) return;
      const A = ARMAS[armaActual];
      const m = municion[armaActual];
      if (m.cargador <= 0) {
        cadencia = 0.3;
        mensaje(m.reserva > 0 ? "Sin cargador: pulsa R" : "Sin munición", 1.2);
        return;
      }
      m.cargador -= 1;
      cadencia = A.cadencia;
      const mult = 1 + bonos.dano / 100;
      const origen = origenDisparo();
      const dir = direccionMirada();
      if (A.tipo === "rayo") {
        const punto = disparoRayo(origen, dir, A.alcance, A.dano * mult);
        trazador(origen, punto);
      } else if (A.tipo === "perdigones") {
        for (let i = 0; i < A.perdigones; i++) {
          disparoRayo(origen, dispersar(dir, A.dispersion), A.alcance, A.dano * mult);
        }
      } else {
        lanzarPlasma(origen, dir);
      }
    }

    function terminarRecarga() {
      const id = recargaArma;
      recargaArma = null;
      if (!id) return;
      const A = ARMAS[id];
      const m = municion[id];
      const toma = Math.min(A.cargador - m.cargador, m.reserva);
      m.cargador += toma;
      m.reserva -= toma;
    }

    function recargar() {
      if (!armaActual || recargaT > 0 || terminado) return;
      const A = ARMAS[armaActual];
      const m = municion[armaActual];
      if (m.cargador >= A.cargador) return;
      if (m.reserva <= 0) {
        mensaje("Sin reserva de munición", 1.5);
        return;
      }
      recargaT = A.recarga;
      recargaArma = armaActual;
    }

    function cambiarArma(id) {
      if (armasDesbloqueadas.indexOf(id) < 0) {
        mensaje("Aún no tienes el " + ARMAS[id].nombre.toLowerCase(), 1.5);
        return;
      }
      if (id === armaActual) return;
      if (recargaT > 0) {
        recargaT = 0;
        recargaArma = null;
      }
      armaActual = id;
    }

    // ---------------------------------------------------------------- estado de la partida

    function textoObjetivo() {
      if (terminado) return resultado === "victoria" ? "Victoria" : resultado === "caida" ? "Caída" : "Salida";
      if (arena) {
        if (!coloso || coloso.muerto) return "Coloso derrotado";
        if (coloso.intro > 0) return "Prepárate: el Coloso se activa";
        if (coloso.fase === 1) return "Fase 1 · dispara al ojo cuando se abre";
        if (coloso.fase === 2) return "Fase 2 · rompe los brazos; el ojo se abre al romper uno";
        return "Fase 3 · dispara al núcleo";
      }
      const n = def.oleadas.length;
      if (oleadaActiva >= 0) return "Elimina a los enemigos: " + contarOleada(oleadaActiva);
      if (segSiguiente >= n) return "Sal por la última puerta";
      if (segSiguiente === 0) return "Avanza por el pasillo";
      return "Cruza la puerta abierta";
    }

    function finalizar(res) {
      if (terminado) return;
      terminado = true;
      resultado = res;
      disparando = false;
      teclas = {};
      if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
      const r = resumen(res);
      if (res === "salida") {
        llamar(cbs.onSalir, r);
        return;
      }
      mostrarFin(res, r);
      if (res === "victoria") llamar(cbs.onVictoria, r);
      else llamar(cbs.onCaida, r);
    }

    function resumen(res) {
      return {
        resultado: res, sector: ORDEN[indice], tiempo: Math.round(tiempo * 100) / 100,
        xp: xp, enemigosDerrotados: derrotados, arma: armaActual,
      };
    }

    function pausar() {
      if (destruido || terminado || pausado) return;
      pausado = true;
      teclas = {};
      disparando = false;
      if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
      mostrarPausa();
    }

    function reanudar() {
      if (destruido || terminado) return;
      haJugado = true;
      pausado = false;
      ocultarPausa();
      if (canvas && typeof canvas.requestPointerLock === "function") {
        try {
          const p = canvas.requestPointerLock();
          if (p && typeof p.catch === "function") p.catch(function () {});
        } catch (err) {
          // Sin puntero bloqueado: el juego sigue con teclado y clic.
        }
      }
    }

    function alternarPausa() {
      if (pausado) reanudar();
      else pausar();
    }

    function salir() {
      if (destruido || terminado) return;
      finalizar("salida");
    }

  // ---- FIN DEL BLOQUE 5: sectores, viajero, armas y estado. Sigue entrada, bucle y control.

    // ---------------------------------------------------------------- simulación y HUD

    function avanzar(dt) {
      if (terminado || destruido) return;
      tiempo += dt;
      actualizarJugador(dt);
      cadencia = Math.max(0, cadencia - dt);
      if (disparando && !pausado) intentarDisparo();
      if (recargaT > 0) {
        recargaT -= dt;
        if (recargaT <= 0) terminarRecarga();
      }
      for (const e of enemigos) {
        if (e.muerto) continue;
        actualizarEnemigo(e, dt);
        if (terminado) break;
      }
      if (!terminado && coloso && !coloso.muerto) actualizarColoso(dt);
      if (!terminado) {
        actualizarBalas(dt);
        actualizarPlasmas(dt);
        actualizarTelegrafos(dt);
        actualizarPickups(dt);
        actualizarEfectos(dt);
      }
      enemigos = enemigos.filter(function (e) { return !e.muerto; });
      if (!arena && !terminado) actualizarSector();
      if (jugador.destello > 0) jugador.destello = Math.max(0, jugador.destello - dt);
      actualizarHUD();
    }

    function actualizarHUD() {
      if (!hud) return;
      poner(hud.sector, "sector", arena ? "Coloso final" : def.id + " · " + def.nombre);
      poner(hud.objetivo, "objetivo", textoObjetivo());
      poner(hud.enemigos, "enemigos", "Enemigos: " + todosLosEnemigos().length);
      const pct = Math.max(0, Math.min(100, (jugador.vida / vidaMax) * 100)).toFixed(1);
      poner(hud.vidaTexto, "vida", "Vida " + Math.ceil(jugador.vida) + " / " + vidaMax);
      poner(hud.vidaRelleno, "vidaPct", pct);
      if (hud.vidaRelleno.style) hud.vidaRelleno.style.width = pct + "%";
      poner(hud.arma, "arma", armaActual ? ARMAS[armaActual].nombre : "Sin arma");
      const m = armaActual ? municion[armaActual] : null;
      poner(hud.municion, "municion", m ? (recargaT > 0 ? "Recargando..." : m.cargador + " / " + m.reserva) : "");
      poner(hud.mensaje, "mensaje", tiempo < mensajeHasta ? mensajeTexto : "");
      if (hud.destello.style) hud.destello.style.opacity = String(Math.min(0.45, jugador.destello * 1.6));
    }

    function estado() {
      const m = armaActual ? municion[armaActual] : null;
      return {
        webgl: renderer !== null,
        sector: ORDEN[indice],
        sectorNombre: def.nombre,
        objetivo: textoObjetivo(),
        vida: Math.ceil(jugador.vida),
        vidaMax: vidaMax,
        arma: armaActual,
        armaNombre: armaActual ? ARMAS[armaActual].nombre : null,
        municion: m ? { cargador: m.cargador, reserva: m.reserva } : null,
        armas: armasDesbloqueadas.slice(),
        enemigosVivos: todosLosEnemigos().length,
        enemigosDerrotados: derrotados,
        xp: xp,
        tiempo: tiempo,
        fase: arena && coloso && !coloso.muerto ? coloso.fase : null,
        pausado: pausado,
        terminado: terminado,
        resultado: resultado,
      };
    }

    function step(n) {
      const cuenta = Number.isInteger(n) && n > 0 ? n : 0;
      for (let i = 0; i < cuenta && !terminado && !destruido; i++) avanzar(PASO);
      return estado();
    }

    // ---------------------------------------------------------------- bucle, entrada y ciclo de vida

    function bucle(ahora) {
      if (destruido) return;
      const dt = ultimoT === null ? 0 : Math.min(0.05, Math.max(0, (ahora - ultimoT) / 1000));
      ultimoT = ahora;
      if (!pausado && !terminado) avanzar(dt);
      actualizarCamara();
      if (renderer) renderer.render(escena, camara);
      frameId = window.requestAnimationFrame(bucle);
    }

    const TECLAS_QUE_NO_DESPLAZAN = ["Space"];

    function alBajarTecla(ev) {
      if (destruido) return;
      const c = (ev && ev.code) || "";
      if (c === "Escape" || c === "KeyP") {
        if (!(ev && ev.repeat)) alternarPausa();
        prevenir(ev);
        return;
      }
      if (TECLAS_QUE_NO_DESPLAZAN.indexOf(c) >= 0 || c.indexOf("Arrow") === 0) prevenir(ev);
      if (pausado || terminado) return;
      teclas[c] = true;
      if (TECLAS_ARMA[c]) cambiarArma(TECLAS_ARMA[c]);
      else if (c === "KeyR") recargar();
    }

    function alSubirTecla(ev) {
      const c = (ev && ev.code) || "";
      teclas[c] = false;
    }

    function alMoverRaton(ev) {
      if (pausado || terminado || !document.pointerLockElement) return;
      jugador.yaw -= (ev.movementX || 0) * SENSIBILIDAD;
      jugador.pitch -= (ev.movementY || 0) * SENSIBILIDAD;
      jugador.pitch = Math.max(-1.25, Math.min(1.25, jugador.pitch));
    }

    function alPulsarRaton(ev) {
      if (destruido || terminado) return;
      if (pausado) {
        reanudar();
        return;
      }
      if (ev.button === 0) disparando = true;
    }

    function alSoltarRaton(ev) {
      if (ev.button === 0) disparando = false;
    }

    function alCambiarBloqueo() {
      if (!document.pointerLockElement && !pausado && !terminado && !destruido) pausar();
    }

    function ajustarAlCambiarTamano() {
      ajustarTamano();
    }

    function destruir() {
      if (destruido) return;
      destruido = true;
      if (frameId !== null && typeof window.cancelAnimationFrame === "function") window.cancelAnimationFrame(frameId);
      for (const par of escuchas) par[0].removeEventListener(par[1], par[2]);
      escuchas.length = 0;
      if (observador) observador.disconnect();
      // El escenario se conserva como objeto (desmontado) para que no falle un callback en curso.
      if (escenario) desmontar(escenario);
      enemigos = [];
      balas = [];
      plasmas = [];
      pickups = [];
      efectos = [];
      telegrafos = [];
      coloso = null;
      if (renderer) {
        renderer.dispose();
        renderer = null;
      }
      compartidos.forEach(function (r) { r.dispose(); });
      compartidos.clear();
      if (estiloEl && estiloEl.parentNode) estiloEl.parentNode.removeChild(estiloEl);
      if (raiz && raiz.parentNode) raiz.parentNode.removeChild(raiz);
    }

    // ---- arranque

    construirHUD();
    iniciarRender();
    montarSector(indiceInicial);
    mostrarPausa();

    escuchar(canvas, "mousedown", alPulsarRaton);
    escuchar(canvas, "contextmenu", prevenir);
    escuchar(window, "mouseup", alSoltarRaton);
    escuchar(window, "mousemove", alMoverRaton);
    escuchar(window, "keydown", alBajarTecla);
    escuchar(window, "keyup", alSubirTecla);
    escuchar(window, "blur", pausar);
    escuchar(window, "resize", ajustarAlCambiarTamano);
    escuchar(document, "pointerlockchange", alCambiarBloqueo);
    if (typeof ResizeObserver === "function") {
      observador = new ResizeObserver(ajustarAlCambiarTamano);
      observador.observe(contenedor);
    }

    actualizarHUD();
    if (typeof window.requestAnimationFrame === "function") {
      frameId = window.requestAnimationFrame(bucle);
    }

    return {
      pausar: pausar,
      reanudar: reanudar,
      destruir: destruir,
      step: step,
      estado: estado,
    };
  }

  globalThis.Ceniza3D = congelar({
    version: VERSION,
    start: start,
    ORDEN: ORDEN,
    SECTORES: SECTORES_PUBLICOS,
    ARMAS: ARMAS,
  });
})();
