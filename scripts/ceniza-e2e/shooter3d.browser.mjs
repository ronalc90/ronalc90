// Prueba de navegador de Ceniza3D (docs/ceniza/shooter3d.js) con Chromium y Playwright.
// Prueba de extremo a extremo: no entra en node --test (la suite unitaria está en scripts/ceniza-tests/).
// Ejecutar desde la raíz del repo: node scripts/ceniza-e2e/shooter3d.browser.mjs. Sale con código 0 si todo pasa; si no,
// con código 1 y un mensaje por cada comprobación fallida.
// Requisitos: Playwright (require("playwright") desde cualquier directorio) y Chromium. WebGL va por SwiftShader.
// Ruta de Chromium: variable CENIZA_CHROMIUM (opcional), después la de Playwright y /opt/pw-browsers/chromium.
// Las páginas de prueba se escriben en un directorio temporal (os.tmpdir(), que respeta TMPDIR) y se borran al final.
// Entradas: teclado y ratón de Playwright. El bot solo lee vista() y estado() para decidir qué pulsar; no llama a
// funciones internas. En modo de prueba el tiempo avanza con step(n) (1 fotograma = 1/60 s).

import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const THREE_JS = path.join(RAIZ, "docs", "ceniza", "vendor", "three.min.js");
const JUEGO_JS = path.join(RAIZ, "docs", "ceniza", "shooter3d.js");
const ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"];
const VISOR = { width: 1280, height: 720 };
const CENTRO = { x: VISOR.width / 2, y: VISOR.height / 2 };
const SENSIBILIDAD = 0.0022;        // la misma que shooter3d.js: convierte el giro deseado en píxeles de cursor
const TRAMO = 22;                   // metros por tramo de pasillo (shooter3d.js, TRAMO)
const ALCANCE = { rifle: 60, escopeta: 14, plasma: 50 };
const ARMA_TECLA = { rifle: "Digit1", escopeta: "Digit2", plasma: "Digit3" };
const ARMA_SECTOR = { S1: "rifle", S2: "escopeta", S3: "plasma" };
const LIMITE_TIEMPO = 1800;         // segundos de juego
const LIMITE_SIN_AVANCE = 150;      // segundos de juego sin bajas, cambios de sector ni daño al Coloso
const MAX_PASOS = 60000;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const envolver = (a) => Math.atan2(Math.sin(a), Math.cos(a));

const resultados = [];
const externas = [];      // peticiones http(s): deben ser 0 (CA-14)
const peticiones = [];    // todas las peticiones de las páginas de prueba
function registrar(ok, texto) {
  resultados.push({ ok, texto });
  console.log((ok ? "OK    " : "FALLO ") + texto);
}
function info(texto) {
  console.log("INFO  " + texto);
}

// Página de prueba: carga three.js y shooter3d.js por ruta absoluta (file://). La URL decide el modo de prueba.
function escribirPagina(dir) {
  const ruta = path.join(dir, "juego.html");
  fs.writeFileSync(ruta, `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Prueba CENIZA 3D</title>
<style>html,body{margin:0;background:#000}#c{position:relative;width:${VISOR.width}px;height:${VISOR.height}px}</style>
<script src="${pathToFileURL(THREE_JS).href}"></script>
<script src="${pathToFileURL(JUEGO_JS).href}"></script>
</head>
<body>
<div id="c"></div>
<script>
  window.__eventos = { victorias: [], caidas: [], salidas: [], xp: 0 };
  const q = new URLSearchParams(location.search);
  window.__juego = Ceniza3D.start({
    contenedor: document.getElementById("c"),
    sectorInicial: q.get("sector") || "S1",
    semilla: Number(q.get("semilla") || 7),
    onVictoria: (r) => window.__eventos.victorias.push(r),
    onCaida: (r) => window.__eventos.caidas.push(r),
    onSalir: (r) => window.__eventos.salidas.push(r),
    onXP: (n) => { window.__eventos.xp += n; },
  });
</script>
</body>
</html>
`);
  return ruta;
}

async function lanzarNavegador(chromium) {
  const candidatos = [{ nombre: "Playwright", opciones: {} }];
  if (process.env.CENIZA_CHROMIUM) candidatos.push({ nombre: "CENIZA_CHROMIUM", opciones: { executablePath: process.env.CENIZA_CHROMIUM } });
  if (fs.existsSync("/opt/pw-browsers/chromium")) candidatos.push({ nombre: "/opt/pw-browsers/chromium", opciones: { executablePath: "/opt/pw-browsers/chromium" } });
  const errores = [];
  for (const c of candidatos) {
    try {
      return await chromium.launch({ headless: true, args: ARGS, ...c.opciones });
    } catch (err) {
      errores.push(c.nombre + ": " + String(err.message).split("\n")[0]);
    }
  }
  throw new Error("No se pudo abrir Chromium (" + errores.join(" | ") + ")");
}

// Abre una página de prueba. Registra sus peticiones y bloquea (y cuenta) las http(s).
async function abrirJuego(navegador, ruta, query, errores) {
  const pagina = await navegador.newPage({ viewport: VISOR });
  pagina.on("pageerror", (e) => errores.push("error de página: " + e.message));
  pagina.on("request", (r) => peticiones.push(r.url()));
  await pagina.route(/^https?:\/\//, (r) => {
    externas.push(r.request().url());
    r.abort();
  });
  await pagina.goto(pathToFileURL(ruta).href + (query ? "?" + query : ""));
  return pagina;
}

// Decodifica la captura en una página auxiliar y cuenta colores distintos y píxeles fuera del color dominante.
async function analizarPng(navegador, png) {
  const aux = await navegador.newPage();
  try {
    await aux.setContent("<!doctype html><canvas id='k'></canvas>");
    return await aux.evaluate(async (b64) => {
      const img = new Image();
      img.src = "data:image/png;base64," + b64;
      await img.decode();
      const c = document.getElementById("k");
      c.width = img.width;
      c.height = img.height;
      const g = c.getContext("2d");
      g.drawImage(img, 0, 0);
      const datos = g.getImageData(0, 0, c.width, c.height).data;
      const cuenta = new Map();
      for (let i = 0; i < datos.length; i += 4) {
        const clave = (datos[i] << 16) | (datos[i + 1] << 8) | datos[i + 2];
        cuenta.set(clave, (cuenta.get(clave) || 0) + 1);
      }
      let total = 0, dominante = 0;
      for (const n of cuenta.values()) {
        total += n;
        if (n > dominante) dominante = n;
      }
      return { total, colores: cuenta.size, distintos: total - dominante };
    }, png.toString("base64"));
  } finally {
    await aux.close();
  }
}

// ---------------------------------------------------------------- bot (entradas reales)

// Decide qué pulsar en este paso a partir de vista() y estado(). Devuelve teclas, mira, fuego y arma.
function decidir(v, e, b) {
  const j = v.jugador;
  const ojo = { x: j.x, y: j.y + 1.6, z: j.z };
  const plan = { teclas: new Set(), yaw: null, pitch: null, tecla: null, recargar: false };
  const vivos = v.enemigos.length + (v.coloso ? 1 : 0);
  const alcance = ALCANCE[e.arma] || 60;

  // Objetivo: el más alineado con la mira dentro del alcance. Las partes cerradas del Coloso se preapuntan sin disparar.
  const cands = [];
  for (const en of v.enemigos) {
    cands.push({ x: en.x, y: en.y, z: en.z, radio: en.radio, activa: true, cuerpo: en.tipo === "asalto" || en.tipo === "elite", nombre: en.tipo });
  }
  if (v.coloso) {
    for (const p of v.coloso.partes) cands.push({ x: p.x, y: p.y, z: p.z, radio: p.radio, activa: p.activa, cuerpo: false, nombre: "coloso " + p.id });
  }
  let mejor = null;
  for (const c of cands) {
    const dx = c.x - ojo.x, dy = c.y - ojo.y, dz = c.z - ojo.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist > alcance) continue;
    const yawT = Math.atan2(-dx, -dz), pitchT = Math.atan2(dy, Math.hypot(dx, dz));
    const dyaw = envolver(yawT - j.yaw), dpitch = pitchT - j.pitch;
    const puntos = Math.hypot(dyaw, dpitch) + (c.activa ? 0 : 0.8) + 0.01 * dist - (c.cuerpo && dist < 4 ? 0.3 : 0);
    if (!mejor || puntos < mejor.puntos) {
      mejor = { c, yawT, pitchT, dyaw, dpitch, puntos, ang: Math.atan2(c.radio, dist) };
    }
  }
  // La mira de este paso (aplicar) se decide con el giro que produce el cursor; aquí solo se fija el objetivo.
  plan.yawActual = j.yaw;
  plan.pitchActual = j.pitch;
  if (mejor) {
    plan.yaw = mejor.yawT;
    plan.pitch = mejor.pitchT;
    plan.apunte = { yaw: mejor.yawT, pitch: mejor.pitchT, ang: 0.8 * mejor.ang, activa: mejor.c.activa };
  } else if (vivos > 0 || v.arena) {
    plan.yaw = 0.6 * Math.sin(e.tiempo * 0.5);   // barrido lento mientras no hay objetivo en alcance
    plan.pitch = 0;
  }

  // Arma: la del sector; en el Coloso, el rifle primero. Se cambia si no está en la mano.
  const orden = (v.arena ? ["rifle", "plasma", "escopeta"] : [ARMA_SECTOR[v.sector], "rifle", "plasma", "escopeta"]).filter(Boolean);
  const deseada = orden.find((id) => e.armas.includes(id) && !b.vacia.has(id)) || e.arma;
  if (deseada && deseada !== e.arma && ARMA_TECLA[deseada]) plan.tecla = ARMA_TECLA[deseada];

  // Recarga cuando el cargador está vacío, o bajo y sin enemigos.
  const apuntando = !!(plan.apunte && plan.apunte.activa);
  if (e.municion && e.municion.reserva > 0) {
    if (e.municion.cargador === 0 || (!apuntando && e.municion.cargador <= 4 && vivos === 0)) plan.recargar = true;
  }

  // Movimiento: vector deseado en el mundo, que luego se traduce a WASD según la mirada.
  let mx = 0, mz = 0;
  const empujar = (x, z, w) => { mx += x * w; mz += z * w; };
  const hacia = (ax, az, bx, bz) => {
    const dx = bx - ax, dz = bz - az, d = Math.hypot(dx, dz) || 1;
    return [dx / d, dz / d];
  };
  for (const t of v.telegrafos) {
    const d = Math.hypot(j.x - t.x, j.z - t.z);
    if (t.t > 0 && d < 5) {
      // Hasta que expira el aviso. En el centro no hay dirección: se aleja hacia +z, el lado libre de la arena.
      const [ux, uz] = d < 0.3 ? [0, 1] : hacia(t.x, t.z, j.x, j.z);
      empujar(ux, uz, 4);
    }
  }
  for (const en of v.enemigos) {
    if ((en.tipo === "asalto" || en.tipo === "elite") && Math.hypot(j.x - en.x, j.z - en.z) < 3.2) {
      const [ux, uz] = hacia(en.x, en.z, j.x, j.z);
      empujar(ux, uz, 1.5);
    }
  }
  // Balas enemigas que pasarían cerca en el próximo 1,8 s: esquivar hacia el lado con más margen.
  for (const bl of v.balas) {
    const sp2 = bl.vx * bl.vx + bl.vz * bl.vz;
    if (sp2 < 1e-6) continue;
    const t = ((j.x - bl.x) * bl.vx + (j.z - bl.z) * bl.vz) / sp2;
    if (t <= 0 || t > 1.8) continue;
    const cx = bl.x + bl.vx * t, cz = bl.z + bl.vz * t;
    if (Math.hypot(j.x - cx, j.z - cz) < 1.1) {
      const sp = Math.sqrt(sp2);
      const lx = -bl.vz / sp, lz = bl.vx / sp;
      const lado = (j.x - cx) * lx + (j.z - cz) * lz >= 0 ? 1 : -1;
      empujar(lx * lado, lz * lado, 3);
    }
  }
  if (v.arena) {
    empujar(clamp((4 * Math.sin(e.tiempo * 1.1) - j.x) / 2, -1, 1), clamp((6 - j.z) / 3, -1, 1), 1);
  } else if (vivos > 0 || v.oleadaActiva >= 0) {
    // Se queda cerca de la entrada de la oleada activa, con los enemigos delante; la escopeta se acerca más.
    const zE = v.zonaPuerta !== null ? v.zonaPuerta + TRAMO : j.z;
    const zObj = zE - (e.arma === "escopeta" ? 5 : 1.5);
    empujar(0, clamp((zObj - j.z) / 1.5, -1, 1), 1);
    empujar(clamp((3.5 * Math.sin(e.tiempo * 0.7) - j.x) / 2, -1, 1), 0, 0.8);
  } else if (v.pickups.length && j.vida < 70) {
    let cercano = null;
    for (const p of v.pickups) {
      const d = Math.hypot(p.x - j.x, p.z - j.z);
      if (!cercano || d < cercano.d) cercano = { p, d };
    }
    const [ux, uz] = hacia(j.x, j.z, cercano.p.x, cercano.p.z);
    empujar(ux, uz, 1.2);
  } else {
    empujar(clamp(-j.x / 2, -1, 1), -1, 1);   // avanza por el pasillo hacia la siguiente puerta
  }
  const n = Math.hypot(mx, mz);
  if (n > 0.05) {
    const ux = mx / n, uz = mz / n, y = j.yaw;
    const f = -ux * Math.sin(y) - uz * Math.cos(y);
    const r = ux * Math.cos(y) - uz * Math.sin(y);
    if (f > 0.35) plan.teclas.add("KeyW");
    if (f < -0.35) plan.teclas.add("KeyS");
    if (r > 0.35) plan.teclas.add("KeyD");
    if (r < -0.35) plan.teclas.add("KeyA");
    if (plan.teclas.size) plan.teclas.add("ShiftLeft");
  }

  // Giro del cursor: cada píxel gira SENSIBILIDAD radianes (en sentido contrario).
  if (plan.yaw !== null) {
    plan.dx = -envolver(plan.yaw - j.yaw) / SENSIBILIDAD;
    plan.dy = -(plan.pitch - j.pitch) / SENSIBILIDAD;
  }
  plan.frames = vivos > 0 || v.arena ? 12 : 30;   // 0,2 s o 0,5 s de juego por paso
  return plan;
}

// Aplica el plan con entradas de Playwright: teclado (down/up/press) y ratón (move/down/up).
async function aplicar(pagina, plan, b) {
  for (const k of [...b.teclas]) {
    if (!plan.teclas.has(k)) {
      await pagina.keyboard.up(k);
      b.teclas.delete(k);
    }
  }
  for (const k of plan.teclas) {
    if (!b.teclas.has(k)) {
      await pagina.keyboard.down(k);
      b.teclas.add(k);
    }
  }
  // Primero la mira: el disparo se decide con la vista que produce ese movimiento (el juego usa el mismo paso).
  const ox = b.cursor.x, oy = b.cursor.y;
  let nx = ox, ny = oy;
  if (plan.dx !== undefined && (Math.abs(plan.dx) >= 0.5 || Math.abs(plan.dy) >= 0.5)) {
    nx = clamp(Math.round(ox + plan.dx), 2, VISOR.width - 3);
    ny = clamp(Math.round(oy + plan.dy), 2, VISOR.height - 3);
  }
  if (nx !== ox || ny !== oy) {
    await pagina.mouse.move(nx, ny);
    b.cursor = { x: nx, y: ny };
  }
  let fuego = false;
  if (plan.apunte && plan.apunte.activa) {
    const yaw = plan.yawActual - (nx - ox) * SENSIBILIDAD;
    const pitch = plan.pitchActual - (ny - oy) * SENSIBILIDAD;
    fuego = Math.abs(envolver(plan.apunte.yaw - yaw)) < plan.apunte.ang && Math.abs(plan.apunte.pitch - pitch) < plan.apunte.ang;
  }
  if (fuego !== b.fuego) {
    if (fuego) await pagina.mouse.down();
    else await pagina.mouse.up();
    b.fuego = fuego;
  }
  if (plan.tecla) await pagina.keyboard.press(plan.tecla);
  if (plan.recargar) await pagina.keyboard.press("KeyR");
}

function describirAtasco(obs, motivo) {
  const e = obs.e, v = obs.v;
  const enemigos = v.enemigos.map((en) => {
    const d = Math.hypot(en.x - v.jugador.x, en.z - v.jugador.z).toFixed(1);
    return en.tipo + " a " + d + " m (" + Math.ceil(en.vida) + " PV" + (en.escudo > 0 ? " + " + Math.ceil(en.escudo) + " escudo" : "") + ")";
  });
  const coloso = v.coloso ? "; Coloso fase " + v.coloso.fase + ", PV restantes " + Math.round(v.coloso.pool) + ", ventana " + v.coloso.ventana.toFixed(1) + " s" : "";
  return motivo + " en " + e.sector + " (objetivo: " + e.objetivo + "); vida " + e.vida + "/" + e.vidaMax +
    "; arma " + e.arma + " " + JSON.stringify(e.municion) + "; enemigos vivos " + enemigos.length +
    (enemigos.length ? " [" + enemigos.slice(0, 6).join(", ") + "]" : "") + coloso;
}

// Pulsa "Empezar" sin mover el cursor al reanudar: el giro del modo de prueba parte de la última posición del
// cursor vista en pausa, así que el cursor se deja en el centro antes (el juego ignora el ratón en pausa).
async function arrancar(pagina) {
  await pagina.mouse.move(CENTRO.x, CENTRO.y);
  await pagina.locator(".ceniza3d-boton").first().focus();
  await pagina.keyboard.press("Enter");
}

// Juega con el bot hasta el final (victoria, caída, límite o atasco). El tiempo lo marca step(n).
async function jugar(pagina) {
  await pagina.mouse.move(CENTRO.x, CENTRO.y);
  const leer = () => pagina.evaluate(() => ({ e: globalThis.__juego.estado(), v: globalThis.__juego.vista() }));
  let obs = await leer();
  const b = { teclas: new Set(), fuego: false, cursor: { ...CENTRO }, vacia: new Set() };
  const hitos = [];
  let sectorPrev = obs.e.sector, derrotadosPrev = obs.e.enemigosDerrotados;
  let poolPrev = obs.v.coloso ? obs.v.coloso.pool : null, fasePrev = obs.v.coloso ? obs.v.coloso.fase : null;
  let ultimoAvance = obs.e.tiempo;
  let motivo = null, pasos = 0;
  while (!obs.e.terminado) {
    if (++pasos > MAX_PASOS) { motivo = "límite de pasos"; break; }
    if (obs.e.tiempo > LIMITE_TIEMPO) { motivo = "límite de tiempo de juego"; break; }
    const e = obs.e;
    if (e.municion && e.municion.cargador === 0 && e.municion.reserva === 0) b.vacia.add(e.arma);
    const plan = decidir(obs.v, obs.e, b);
    await aplicar(pagina, plan, b);
    obs = await pagina.evaluate((n) => {
      const estado = globalThis.__juego.step(n);
      return { e: estado, v: globalThis.__juego.vista() };
    }, plan.frames);
    if (obs.e.sector !== sectorPrev) {
      hitos.push({ de: sectorPrev, a: obs.e.sector, tiempo: obs.e.tiempo, vida: obs.e.vida, derrotados: obs.e.enemigosDerrotados });
      sectorPrev = obs.e.sector;
      ultimoAvance = obs.e.tiempo;
    }
    if (obs.e.enemigosDerrotados !== derrotadosPrev) {
      derrotadosPrev = obs.e.enemigosDerrotados;
      ultimoAvance = obs.e.tiempo;
    }
    if (obs.v.coloso) {
      if (poolPrev !== null && obs.v.coloso.pool < poolPrev - 1e-9) ultimoAvance = obs.e.tiempo;
      if (fasePrev !== null && obs.v.coloso.fase !== fasePrev) ultimoAvance = obs.e.tiempo;
      poolPrev = obs.v.coloso.pool;
      fasePrev = obs.v.coloso.fase;
    }
    if (obs.e.tiempo - ultimoAvance > LIMITE_SIN_AVANCE) { motivo = "atasco sin avance"; break; }
  }
  for (const k of [...b.teclas]) await pagina.keyboard.up(k);
  b.teclas.clear();
  if (b.fuego) await pagina.mouse.up();
  return { obs, hitos, pasos, motivo, motivoFin: motivo || (obs.e.terminado ? obs.e.resultado : null) };
}

// ---------------------------------------------------------------- comprobaciones

async function comprobarWebGL(pagina) {
  const datos = await pagina.evaluate(() => {
    const cv = document.createElement("canvas");
    const gl = cv.getContext("webgl2") || cv.getContext("webgl");
    let renderer = null;
    if (gl) {
      const dbg = gl.getExtension("WEBGL_debug_renderer_info");
      renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    }
    return { webgl: !!gl, renderer, revision: typeof THREE !== "undefined" ? THREE.REVISION : null };
  });
  registrar(datos.webgl, "1) WebGL disponible en Chromium. Renderer: " + (datos.renderer || "ninguno"));
  registrar(datos.revision === "160", "1) THREE.REVISION cargado: " + datos.revision + " (se espera 160)");
  return datos.webgl;
}

async function comprobarFotograma(navegador, pagina) {
  const canvas = await pagina.evaluate(() => {
    const c = document.querySelector("#c .ceniza3d-canvas");
    return { existe: !!c, enContenedor: !!c && !!c.parentElement && !!c.parentElement.parentElement && c.parentElement.parentElement.id === "c" };
  });
  registrar(canvas.existe && canvas.enContenedor, "2) start() crea un <canvas> dentro del contenedor");
  await pagina.locator(".ceniza3d-boton").first().click();
  await pagina.waitForTimeout(1200);   // el bucle de pantalla avanza con el reloj de pared en la ruta normal
  await pagina.evaluate(() => { document.querySelector(".ceniza3d-hud").style.display = "none"; });
  const png = await pagina.locator(".ceniza3d-canvas").screenshot();
  const px = await analizarPng(navegador, png);
  const fraccion = px.distintos / px.total;
  registrar(px.colores >= 16 && fraccion >= 0.05,
    "2) Fotograma no en blanco: " + px.colores + " colores; " + (fraccion * 100).toFixed(1) +
    " % de los píxeles distintos del color de fondo (" + px.total + " píxeles)");
}

async function comprobarEstadoYGating(navegador, rutaPagina, errores) {
  const pagina = await abrirJuego(navegador, rutaPagina, "prueba=1&sector=S1&semilla=7", errores);
  const e = await pagina.evaluate(() => globalThis.__juego.estado());
  const exponeStep = await pagina.evaluate(() => typeof globalThis.__juego.step === "function" && typeof globalThis.__juego.vista === "function");
  const barraSinTexto = await pagina.evaluate(() => document.querySelector(".ceniza3d-vida-relleno").textContent === "");
  registrar(e.sector === "S1" && e.vida === 100 && e.vidaMax === 100 && e.arma === "rifle" && e.webgl === true &&
    e.municion.cargador === 30 && e.municion.reserva === 90,
    "3) estado() legible: sector " + e.sector + ", vida " + e.vida + "/" + e.vidaMax + ", arma " + e.arma +
    ", munición " + e.municion.cargador + "/" + e.municion.reserva + ", webgl " + e.webgl);
  registrar(exponeStep, "3) Con prueba=1 existen step() y vista()");
  registrar(barraSinTexto, "3) La barra de vida no muestra texto suelto (corrección del relleno)");
  // Sin prueba=1: no hay gancho de pruebas, y el tiempo sí avanza con el reloj de pared.
  await pagina.close();
  const normal = await abrirJuego(navegador, rutaPagina, "sector=S1", errores);
  const sinGancho = await normal.evaluate(() => typeof globalThis.__juego.step === "undefined" && typeof globalThis.__juego.vista === "undefined");
  registrar(sinGancho, "3) Sin prueba=1 no existen step() ni vista() (gancho de pruebas gateado)");
  await normal.locator(".ceniza3d-boton").first().click();
  await normal.waitForTimeout(1000);
  const tiempoNormal = await normal.evaluate(() => globalThis.__juego.estado().tiempo);
  registrar(tiempoNormal > 0.3, "2) Ruta normal (sin prueba): el bucle de pantalla avanza el tiempo con el reloj de pared (" +
    tiempoNormal.toFixed(2) + " s en 1 s)");
  await normal.close();
  const prueba = await abrirJuego(navegador, rutaPagina, "prueba=1&sector=S1", errores);
  await prueba.locator(".ceniza3d-boton").first().click();
  await prueba.waitForTimeout(600);
  const tiempoPrueba = await prueba.evaluate(() => globalThis.__juego.estado().tiempo);
  registrar(tiempoPrueba === 0, "3) Modo de prueba: sin step() el tiempo no avanza (" + tiempoPrueba + " s)");
  await prueba.close();
}

async function comprobarPausa(navegador, rutaPagina, errores) {
  const pagina = await abrirJuego(navegador, rutaPagina, "prueba=1&sector=S1", errores);
  await pagina.locator(".ceniza3d-boton").first().click();
  const estados = [];
  estados.push(await pagina.evaluate(() => globalThis.__juego.estado().pausado));
  await pagina.keyboard.press("Escape");
  estados.push(await pagina.evaluate(() => globalThis.__juego.estado().pausado));
  await pagina.keyboard.press("Escape");
  estados.push(await pagina.evaluate(() => globalThis.__juego.estado().pausado));
  await pagina.keyboard.press("KeyP");
  estados.push(await pagina.evaluate(() => globalThis.__juego.estado().pausado));
  await pagina.keyboard.press("KeyP");
  estados.push(await pagina.evaluate(() => globalThis.__juego.estado().pausado));
  const esperado = [false, true, false, true, false];
  registrar(JSON.stringify(estados) === JSON.stringify(esperado),
    "15) Escape y P pausan y reanudan en la fase 3D: " + estados.map((x) => (x ? "pausa" : "juega")).join(" > "));
  await pagina.close();
}

async function comprobarRecorrido(navegador, rutaPagina, errores) {
  const pagina = await abrirJuego(navegador, rutaPagina, "prueba=1&sector=S1&semilla=7", errores);
  await arrancar(pagina);
  const t0 = Date.now();
  const r = await jugar(pagina);
  const segundosReales = ((Date.now() - t0) / 1000).toFixed(1);
  const fin = r.obs.e;
  info("Recorrido: " + r.pasos + " pasos, " + segundosReales + " s reales, " + fin.tiempo.toFixed(1) + " s de juego, fin: " + r.motivoFin);
  for (const h of r.hitos) {
    info("Sector " + h.de + " completado a los " + h.tiempo.toFixed(1) + " s de juego (vida " + h.vida + ", enemigos derrotados " + h.derrotados + ")");
  }
  const paso = (de, a) => r.hitos.find((h) => h.de === de && h.a === a);
  const sectores = [
    ["4a", "S1", "S2", "rifle"],
    ["4b", "S2", "S3", "escopeta"],
    ["4c", "S3", "COLOSO", "plasma"],
  ];
  let atascado = null;
  for (const [id, de, a, arma] of sectores) {
    const h = paso(de, a);
    if (h) {
      registrar(true, id + ") " + de + " (" + arma + ") superado con entradas reales a los " + h.tiempo.toFixed(1) + " s de juego");
    } else {
      if (!atascado) atascado = describirAtasco(r.obs, r.motivoFin);
      registrar(false, id + ") " + de + " (" + arma + ") no superado: " + atascado);
    }
  }
  const victoria = fin.resultado === "victoria";
  if (victoria) {
    registrar(true, "4d) Coloso final derrotado con entradas reales a los " + fin.tiempo.toFixed(1) + " s de juego");
  } else {
    const donde = atascado || describirAtasco(r.obs, r.motivoFin);
    registrar(false, "4d) Coloso final no derrotado: " + donde);
  }
  // 5) onVictoria: una sola vez, con arma y segundos.
  const ev = await pagina.evaluate(() => globalThis.__eventos);
  if (victoria) {
    const v = ev.victorias[0];
    registrar(ev.victorias.length === 1 && v && v.resultado === "victoria" && typeof v.arma === "string" && v.tiempo > 0,
      "5) onVictoria llamado una vez con resumen: arma " + (v ? v.arma : "?") + ", " + (v ? v.tiempo : "?") + " s, XP " + (v ? v.xp : "?"));
    await pagina.evaluate(() => globalThis.__juego.step(3600));
    const despues = await pagina.evaluate(() => globalThis.__eventos.victorias.length);
    registrar(despues === 1, "5) Tras la victoria, más pasos no vuelven a llamar onVictoria (llamadas: " + despues + ")");
  } else {
    registrar(false, "5) onVictoria no se llamó (la victoria no se alcanzó). Llamadas a onCaida: " + ev.caidas.length);
  }
  await pagina.close();
  return r;
}

// Diagnóstico (no es una comprobación): Coloso final aislado, con todas las armas y su munición de partida.
async function diagnosticoColoso(navegador, rutaPagina, errores) {
  const pagina = await abrirJuego(navegador, rutaPagina, "prueba=1&sector=COLOSO&semilla=7", errores);
  // Munición con D10: la reserva no se agota, así que solo se informa el cargador de cada arma (ARMAS exportado).
  const armas = await pagina.evaluate(() => globalThis.Ceniza3D.ARMAS);
  info("Munición (D10): cargador rifle " + armas.rifle.cargador + ", escopeta " + armas.escopeta.cargador + ", plasma " + armas.plasma.cargador +
    "; reserva ilimitada. La arena no tiene botiquines: el viajero no recupera vida durante el Coloso");
  await arrancar(pagina);
  const r = await jugar(pagina);
  const v = r.obs.v;
  const pool = v.coloso ? Math.round(v.coloso.pool) : null;
  info("Coloso aislado: fin " + r.motivoFin + " a los " + r.obs.e.tiempo.toFixed(1) + " s de juego; fase " +
    (v.coloso ? v.coloso.fase : "?") + "; PV restantes de la fase " + pool + "; vida " + r.obs.e.vida + "; munición del arma en mano " +
    JSON.stringify(r.obs.e.municion) + " (" + r.obs.e.arma + ")");
  await pagina.close();
}

async function comprobarDeterminismo(navegador, rutaPagina, errores) {
  const correr = async () => {
    const p = await abrirJuego(navegador, rutaPagina, "prueba=1&sector=S1&semilla=7", errores);
    await p.locator(".ceniza3d-boton").first().click();
    await p.keyboard.down("KeyW");
    await p.evaluate(() => globalThis.__juego.step(180));
    await p.keyboard.up("KeyW");
    const e = await p.evaluate(() => globalThis.__juego.step(60));
    await p.close();
    return e;
  };
  const a = await correr();
  const b = await correr();
  registrar(a.enemigosVivos === 4 && a.sector === "S1",
    "7) Con W (teclado real) durante 3 s se crea la oleada de 4 exploradores (vivos: " + a.enemigosVivos + ")");
  registrar(Math.abs(a.tiempo - 4) < 1e-9, "7) step(n): 240 fotogramas son 4,000 s de juego (tiempo " + a.tiempo + ")");
  registrar(JSON.stringify(a) === JSON.stringify(b), "7) Dos ejecuciones con las mismas entradas dan el mismo estado");
}

// ---------------------------------------------------------------- principal

async function main() {
  let chromium;
  try {
    ({ chromium } = require("playwright"));
  } catch (err) {
    throw new Error("No se encuentra Playwright (require(\"playwright\")): " + err.message);
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ceniza3d-"));
  const ruta = escribirPagina(dir);
  const errores = [];
  const navegador = await lanzarNavegador(chromium);
  try {
    const pagina = await abrirJuego(navegador, ruta, "prueba=1&sector=S1&semilla=7", errores);
    let webgl = false;
    try {
      webgl = await comprobarWebGL(pagina);
    } catch (err) {
      registrar(false, "1) WebGL: " + err.message);
    }
    if (!webgl) {
      registrar(false, "WebGL no disponible en este Chromium: la fase 3D no se puede verificar en el navegador");
    } else {
      try { await comprobarFotograma(navegador, pagina); } catch (err) { registrar(false, "2) Fotograma: " + err.message); }
    }
    await pagina.close();
    for (const [nombre, fn] of [
      ["3) estado y gancho de pruebas", () => comprobarEstadoYGating(navegador, ruta, errores)],
      ["15) pausa", () => comprobarPausa(navegador, ruta, errores)],
      ["4) recorrido con el bot", () => comprobarRecorrido(navegador, ruta, errores)],
      ["7) determinismo", () => comprobarDeterminismo(navegador, ruta, errores)],
    ]) {
      try {
        await fn();
      } catch (err) {
        registrar(false, nombre + ": " + err.message);
      }
    }
    try {
      await diagnosticoColoso(navegador, ruta, errores);
    } catch (err) {
      info("Diagnóstico del Coloso no disponible: " + err.message);
    }
    // 6) CA-14: ninguna petición a otros orígenes.
    const permitidas = new Set([path.resolve(ruta), THREE_JS, JUEGO_JS]);
    const ajenas = peticiones.filter((u) => {
      if (!u.startsWith("file://")) return true;
      try {
        return !permitidas.has(path.resolve(fileURLToPath(u)));
      } catch (err) {
        return true;
      }
    });
    registrar(externas.length === 0 && ajenas.length === 0,
      "6) CA-14: " + externas.length + " peticiones http(s) y " + ajenas.length + " peticiones fuera de docs/ceniza y de la página de prueba (" +
      peticiones.length + " peticiones en total)");
    for (const e of errores) registrar(false, "Error en la página: " + e);
  } finally {
    await navegador.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
  const fallos = resultados.filter((r) => !r.ok).length;
  console.log("Resultado: " + (resultados.length - fallos) + " de " + resultados.length + " comprobaciones correctas");
  if (fallos > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error("FALLO general: " + (err && err.message ? err.message : err));
  process.exitCode = 1;
});
