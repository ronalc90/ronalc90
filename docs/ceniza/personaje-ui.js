// Ceniza · panel del viajero: personaje, equipo, forja e importar/exportar.
// Script clásico (sin módulos ES): define globalThis.CenizaPersonaje.
// DOM puro, sin canvas. Usa las funciones de globalThis.CenizaDatos
// (docs/ceniza/datos.js), que debe cargarse antes. Sigue las secciones 4, 5, 9 y 10
// de docs/ceniza-diseno.md. Sirve en el navegador (<script src="ceniza/personaje-ui.js">)
// y en node:vm (ver scripts/ceniza-tests/personaje-ui.smoke.mjs).
//
// No escribe en localStorage: cada cambio se entrega con opciones.onCambio(estado)
// y el juego decide qué guardar.
//
// Uso:
//   CenizaPersonaje.abrir(contenedor, {
//     personaje,             // validarPersonaje; si no es válido se usa personajePorDefecto()
//     inventario,            // piezas sin equipar, como las de generarPieza
//     equipadas,             // { arma, casco, pecho, piernas, botas, accesorio1, accesorio2 }; null si vacía
//     forja,                 // { chatarra }: chatarra disponible para subir la forja
//     onCambio(estado),      // recibe { personaje, inventario, equipadas, forja } tras cada cambio
//     onExportar(codigo),    // opcional: al pulsar EXPORTAR
//     onImportar(resultado), // opcional: tras cada IMPORTAR, con el resultado de importarPersonaje
//   });
//   CenizaPersonaje.cerrar(); // vacía el contenedor y olvida el estado
//
// Criterios de la interfaz:
// - Las piezas se identifican por su posición en el inventario o por su ranura equipada.
// - accesorio1 y accesorio2 aceptan cualquier accesorio.
// - El nombre se recorta y se colapsan los espacios dobles antes de validar (sección 9.1).
//   La validez la decide validarPersonaje.
// - Tono va en pasos de 15 y brillo en pasos de 5 (sección 9.1). Los límites son los de
//   opcionesPersonaje, que es lo que valida datos.js.
// - Todo se usa con Tab y Enter. Los botones tienen aria-label y el estado activo usa aria-pressed.
// - Los números van con coma decimal.

(function () {
  "use strict";

  const D = globalThis.CenizaDatos;
  if (!D) throw new Error("personaje-ui.js necesita docs/ceniza/datos.js cargado antes");

  // ----------------------------------------------------------------- textos y constantes
  // Etiquetas en español de los ids de datos.js. Un id sin etiqueta se muestra tal cual.
  const ETIQUETAS = {
    ceniza: "Ceniza", arena: "Arena", oxido: "Óxido", cobalto: "Cobalto", musgo: "Musgo",
    cristal: "Cristal", carmesi: "Carmesí", ambar: "Ámbar", cian: "Cian", violeta: "Violeta",
    blanco: "Blanco",
    sencillo: "Sencillo", cerrado: "Cerrado", cresta: "Cresta", rastreador: "Rastreador",
    liso: "Liso", rayas: "Rayas", placas: "Placas",
    sol: "Sol", luna: "Luna", ala: "Ala", rayo: "Rayo", espiral: "Espiral",
    gota: "Gota", estrella: "Estrella", ancla: "Ancla",
    arma: "Arma", casco: "Casco", pecho: "Pecho", piernas: "Piernas", botas: "Botas",
    accesorio1: "Accesorio 1", accesorio2: "Accesorio 2",
  };

  const PESTANAS = [
    { id: "personaje", texto: "PERSONAJE" },
    { id: "equipo", texto: "EQUIPO" },
    { id: "forja", texto: "FORJA" },
  ];

  const MAX_NOMBRE = D.opcionesPersonaje.nombre.max;
  const RANURAS_ACCESORIO = ["accesorio1", "accesorio2"];
  const SECCIONES_PERSONAJE = ["traje", "visor", "casco", "capa", "emblema"];

  // Estilos del panel. Los colores son los del juego (ink, bone, ember, crimson).
  const ESTILO = `
.cp-panel{--cp-fondo:#0b0807;--cp-tinta:#1c1714;--cp-texto:#f3e9d8;--cp-suave:#b9b2a6;--cp-acento:#e06b2d;--cp-alerta:#ff8a80;--cp-borde:#4a3b32;box-sizing:border-box;width:100%;max-width:640px;margin:0 auto;padding:16px;background:var(--cp-fondo);color:var(--cp-texto);font:15px/1.4 system-ui,sans-serif;overflow-wrap:anywhere}
.cp-panel *{box-sizing:border-box}
.cp-titulo{margin:0 0 12px;font-size:20px}
.cp-subtitulo{margin:18px 0 8px;font-size:15px;color:var(--cp-acento)}
.cp-pestanas,.cp-grupo{display:flex;flex-wrap:wrap;gap:8px}
.cp-boton{min-height:44px;min-width:44px;padding:8px 12px;border:1px solid var(--cp-borde);border-radius:6px;background:var(--cp-tinta);color:var(--cp-texto);font:inherit;cursor:pointer}
.cp-boton[aria-pressed="true"]{border-color:var(--cp-acento);background:#3a1f12}
.cp-boton:disabled{opacity:.45;cursor:not-allowed}
.cp-boton:focus-visible,.cp-panel input:focus-visible,.cp-panel textarea:focus-visible{outline:3px solid var(--cp-acento);outline-offset:2px}
.cp-muestra{display:inline-block;width:16px;height:16px;margin-right:6px;border-radius:50%;border:1px solid #000;vertical-align:middle}
.cp-campo{display:flex;flex-direction:column;gap:6px;margin:10px 0}
.cp-panel input[type=text],.cp-panel textarea{width:100%;padding:10px;border:1px solid var(--cp-borde);border-radius:6px;background:#140f0c;color:var(--cp-texto);font:inherit}
.cp-panel input[type=range]{width:100%}
.cp-codigo{font-family:ui-monospace,monospace;font-size:13px}
.cp-lista{list-style:none;margin:0;padding:0}
.cp-item{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--cp-borde)}
.cp-info{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1 1 200px}
.cp-rareza{font-weight:700}
.cp-stats,.cp-set,.cp-costo,.cp-contador,.cp-chatarra,.cp-vacio{color:var(--cp-suave);font-size:13px}
.cp-error{color:var(--cp-alerta);margin:4px 0;min-height:1.2em}
.cp-aviso{margin:12px 0 0;min-height:1.4em}
.cp-aviso.cp-error{font-weight:600}
`;

  // ----------------------------------------------------------------- utilidades
  const tiene = (obj, clave) => Object.prototype.hasOwnProperty.call(obj, clave);
  const etiqueta = (id) => (tiene(ETIQUETAS, id) ? ETIQUETAS[id] : String(id));
  const signo = (v) => (v > 0 ? "+" : "");
  // Números en español: coma decimal y hasta 2 decimales.
  const numero = (v) => String(Math.round(v * 100) / 100).replace(".", ",");
  const largo = (texto) => Array.from(texto).length;
  // Los espacios de los extremos se recortan y los dobles se colapsan (sección 9.1).
  const normalizarNombre = (texto) => String(texto).trim().replace(/ {2,}/g, " ");
  const textoContador = (nombre) => `${largo(nombre)} de ${MAX_NOMBRE} caracteres`;
  const funcion = (f) => (typeof f === "function" ? f : () => {});
  const esAccesorio = (ranura) => RANURAS_ACCESORIO.indexOf(ranura) >= 0;
  const ranurasDe = (pieza) => (esAccesorio(pieza.ranura) ? RANURAS_ACCESORIO : [pieza.ranura]);
  const encaja = (pieza, ranura) =>
    pieza.ranura === ranura || (esAccesorio(pieza.ranura) && esAccesorio(ranura));

  function mensajeNombre(nombre) {
    const n = largo(nombre);
    if (n === 0) return `Escribe un nombre de 1 a ${MAX_NOMBRE} caracteres.`;
    if (n > MAX_NOMBRE) return `El nombre admite ${MAX_NOMBRE} caracteres como máximo.`;
    return "Usa solo letras, números y espacios.";
  }

  // ----------------------------------------------------------------- piezas
  const rarezaDe = (pieza) => D.equipoRarezas.find((r) => r.id === pieza.rareza);
  const nombreRareza = (pieza) => (rarezaDe(pieza) ? rarezaDe(pieza).nombre : String(pieza.rareza));

  function statsDe(pieza) {
    try {
      return D.statsDePieza(pieza);
    } catch (e) {
      return [];
    }
  }

  // Pieza usable: ranura y rareza conocidas, forja de +0 a +5, zona y modificadores válidos.
  function esPieza(p) {
    if (!p || typeof p !== "object") return false;
    if (D.RANURAS.indexOf(p.ranura) < 0 || !rarezaDe(p)) return false;
    if (!Number.isInteger(p.forja) || p.forja < 0 || p.forja > D.FORJA_MAX) return false;
    if (!Number.isInteger(p.zona)) return false;
    return statsDe(p).length > 0;
  }

  const copiarPieza = (p) => ({ ...p, modificadores: p.modificadores.map((m) => ({ ...m })) });

  // Chatarra total para llevar una pieza desde su nivel de forja hasta +5 (sección 5.5).
  function costoHasta(nivel) {
    let total = 0;
    for (let k = nivel; k < D.FORJA_MAX; k++) total += D.costoForja(k);
    return total;
  }

  // ----------------------------------------------------------------- personaje
  // Copia solo con los campos conocidos, en un orden fijo (así se compara con JSON).
  // Usa la forma de datos.js (9.2 y 9.3): versión v, patron en la raíz y la capa con on.
  function copiarPersonaje(p) {
    return {
      v: 1,
      nombre: p.nombre,
      traje: { color: p.traje.color, tono: p.traje.tono, brillo: p.traje.brillo },
      visor: { color: p.visor.color },
      casco: { estilo: p.casco.estilo },
      capa: { color: p.capa.color, on: p.capa.on },
      emblema: { icono: p.emblema.icono },
      patron: p.patron,
    };
  }

  // Aplica un cambio parcial, p. ej. { traje: { color: "arena" } }, sobre una copia del personaje.
  function mezclar(base, cambios) {
    const resultado = copiarPersonaje(base);
    if (tiene(cambios, "nombre")) resultado.nombre = cambios.nombre;
    if (tiene(cambios, "patron")) resultado.patron = cambios.patron;
    for (const parte of SECCIONES_PERSONAJE) {
      if (tiene(cambios, parte)) Object.assign(resultado[parte], cambios[parte]);
    }
    return resultado;
  }

  // ----------------------------------------------------------------- DOM
  // Solo se usan createElement, setAttribute, getAttribute, appendChild, removeChild,
  // firstChild, textContent, value, style, addEventListener y focus.
  const vaciar = (nodo) => {
    while (nodo.firstChild) nodo.removeChild(nodo.firstChild);
  };

  function crear(doc, tag, atributos, texto) {
    const el = doc.createElement(tag);
    if (atributos) {
      for (const k of Object.keys(atributos)) el.setAttribute(k, String(atributos[k]));
    }
    if (texto !== undefined) el.textContent = texto;
    return el;
  }

  function hijos(padre, ...nodos) {
    for (const n of nodos) if (n) padre.appendChild(n);
    return padre;
  }

  // El evento solo actúa mientras el panel esté abierto.
  function enlazar(el, tipo, fn) {
    el.addEventListener(tipo, () => {
      if (activo) fn();
    });
  }

  // Botón con aria-label. clave (opcional) guarda la referencia para devolver el foco al re-pintar.
  function boton(doc, texto, etiquetaAccesible, alPulsar, clave, extra) {
    const b = crear(
      doc,
      "button",
      Object.assign({ type: "button", class: "cp-boton", "aria-label": etiquetaAccesible }, extra || {}),
      texto,
    );
    enlazar(b, "click", alPulsar);
    if (clave) activo.refs[clave] = b;
    return b;
  }

  function seccion(doc, titulo, ...nodos) {
    const s = crear(doc, "section", { class: "cp-seccion" });
    s.appendChild(crear(doc, "h3", { class: "cp-subtitulo" }, titulo));
    return hijos(s, ...nodos);
  }

  function grupo(doc, rotulo, botones) {
    return hijos(crear(doc, "div", { class: "cp-grupo", role: "group", "aria-label": rotulo }), ...botones);
  }

  // Botón de opción. Muestra su color si lo tiene. La opción activa usa aria-pressed.
  function botonOpcion(doc, rotulo, texto, color, esActivo, alElegir) {
    const b = crear(doc, "button", {
      type: "button",
      class: "cp-boton",
      "aria-label": `${rotulo}: ${texto}`,
    });
    if (color) {
      const muestra = crear(doc, "span", { class: "cp-muestra", "aria-hidden": "true" });
      muestra.style.backgroundColor = color;
      b.appendChild(muestra);
    }
    b.appendChild(crear(doc, "span", null, texto));
    enlazar(b, "click", () => {
      if (alElegir()) actualizarMarcas();
    });
    activo.marcas.push({ boton: b, esActivo });
    return b;
  }

  // Botones para una lista de ids. colorDe(id) da el color, o null si no hay.
  function opcionesDe(doc, rotulo, ids, colorDe, esActivo, alElegir) {
    return ids.map((id) =>
      botonOpcion(doc, rotulo, etiqueta(id), colorDe ? colorDe(id) : null, () => esActivo(id), () => alElegir(id)),
    );
  }

  // Control deslizante con su valor visible. Cada movimiento aplica el cambio en vivo.
  function deslizador(doc, rotulo, [min, max], paso, valor, alCambiar) {
    const texto = crear(doc, "span", null, `${rotulo}: ${valor}`);
    const control = crear(doc, "input", {
      type: "range",
      min: String(min),
      max: String(max),
      step: String(paso),
      "aria-label": rotulo,
    });
    control.value = String(valor);
    enlazar(control, "input", () => {
      texto.textContent = `${rotulo}: ${control.value}`;
      alCambiar(Number(control.value));
    });
    return hijos(crear(doc, "label", { class: "cp-campo" }), texto, control);
  }

  // Campo con etiqueta visible que envuelve al control.
  const campo = (doc, texto, control) =>
    hijos(crear(doc, "label", { class: "cp-campo" }), crear(doc, "span", null, texto), control);

  // Lista de nodos. Si no hay ninguno y se pide un texto, muestra ese texto.
  function lista(doc, nodos, vacio) {
    const ul = crear(doc, "ul", { class: "cp-lista" });
    const contenido = nodos.length === 0 && vacio ? [crear(doc, "li", { class: "cp-vacio" }, vacio)] : nodos;
    return hijos(ul, ...contenido);
  }

  // ----------------------------------------------------------------- estado
  // Panel abierto (null si está cerrado). Campos:
  //   estado: lo que se entrega a onCambio. borrador: texto del campo IMPORTAR.
  //   refs: elementos con clave, para devolver el foco y actualizar el código.
  //   marcas: botones con aria-pressed y su condición de activo.
  let activo = null;
  let secuencia = 0;

  const codigoActual = () => D.exportarPersonaje(activo.estado.personaje);
  const piezaEn = (origen) =>
    origen.donde === "equipada" ? activo.estado.equipadas[origen.ranura] : activo.estado.inventario[origen.indice];
  const claveOrigen = (origen) =>
    origen.donde === "equipada" ? `forjar:e:${origen.ranura}` : `forjar:i:${origen.indice}`;

  function copiarEquipadas(eq) {
    const copia = {};
    for (const r of D.RANURAS) copia[r] = eq[r] ? copiarPieza(eq[r]) : null;
    return copia;
  }

  // Estado de partida a partir de las opciones. Lo que no sirve se corrige y se avisa.
  function estadoInicial(op) {
    const avisos = [];
    const valido = D.validarPersonaje(op.personaje).ok;
    if (!valido) avisos.push("El personaje recibido no era válido; se usaron los valores por defecto.");
    const personaje = copiarPersonaje(valido ? op.personaje : D.personajePorDefecto());

    const entrada = Array.isArray(op.inventario) ? op.inventario : [];
    const inventario = entrada.filter(esPieza).map(copiarPieza);
    let descartadas = entrada.length - inventario.length;

    const eq = op.equipadas && typeof op.equipadas === "object" ? op.equipadas : {};
    const equipadas = {};
    for (const r of D.RANURAS) {
      const p = eq[r];
      equipadas[r] = esPieza(p) && encaja(p, r) ? copiarPieza(p) : null;
      if (p && !equipadas[r]) descartadas += 1;
    }
    if (descartadas === 1) avisos.push("Se descartó 1 pieza no válida.");
    else if (descartadas > 1) avisos.push(`Se descartaron ${descartadas} piezas no válidas.`);

    const chatarra =
      op.forja && Number.isInteger(op.forja.chatarra) && op.forja.chatarra >= 0 ? op.forja.chatarra : 0;
    return { estado: { personaje, inventario, equipadas, forja: { chatarra } }, aviso: avisos.join(" ") };
  }

  // Entrega el estado nuevo al juego. No guarda nada por su cuenta.
  function emitir() {
    const e = activo.estado;
    activo.opciones.onCambio({
      personaje: copiarPersonaje(e.personaje),
      inventario: e.inventario.map(copiarPieza),
      equipadas: copiarEquipadas(e.equipadas),
      forja: { chatarra: e.forja.chatarra },
    });
  }

  // Aplica un cambio parcial del personaje si el resultado es válido y distinto del actual.
  function aplicarPersonaje(cambios) {
    const a = activo;
    const candidato = mezclar(a.estado.personaje, cambios);
    if (!D.validarPersonaje(candidato).ok) return false;
    if (JSON.stringify(candidato) === JSON.stringify(a.estado.personaje)) return false;
    a.estado = { ...a.estado, personaje: candidato };
    actualizarExportacion();
    emitir();
    return true;
  }

  function actualizarMarcas() {
    for (const m of activo.marcas) m.boton.setAttribute("aria-pressed", String(Boolean(m.esActivo())));
  }

  function actualizarExportacion() {
    const el = activo.refs.codigo;
    if (el) el.value = codigoActual();
  }

  function avisar(texto, esError) {
    const el = activo.avisoEl;
    el.textContent = texto;
    el.setAttribute("class", esError ? "cp-aviso cp-error" : "cp-aviso");
  }

  // Pide que el próximo renderizado devuelva el foco a un control con esa clave.
  function enfocar(clave) {
    activo.foco = clave;
  }

  function restaurarFoco() {
    const a = activo;
    const clave = a.foco;
    a.foco = null;
    if (!clave) return;
    let el = a.refs[clave];
    if (!el || el.getAttribute("disabled") !== null) el = a.botonesPestana[a.pestana];
    if (typeof el.focus === "function") el.focus();
  }

  // ----------------------------------------------------------------- pestañas
  function construirEsqueleto() {
    const a = activo;
    const doc = a.doc;
    const raiz = crear(doc, "section", { class: "cp-panel", "aria-label": "Viajero" });
    raiz.appendChild(crear(doc, "h2", { class: "cp-titulo" }, "Viajero"));
    const pestanas = crear(doc, "div", {
      class: "cp-pestanas",
      role: "group",
      "aria-label": "Secciones del viajero",
    });
    for (const p of PESTANAS) {
      const b = boton(doc, p.texto, `Pestaña ${p.texto}`, () => cambiarPestana(p.id));
      a.botonesPestana[p.id] = b;
      pestanas.appendChild(b);
    }
    raiz.appendChild(pestanas);
    a.cuerpo = crear(doc, "div", { class: "cp-cuerpo" });
    a.bloque = crear(doc, "div", { class: "cp-bloque" });
    a.avisoEl = crear(doc, "p", { class: "cp-aviso", role: "status", "aria-live": "polite" });
    hijos(raiz, a.cuerpo, a.bloque, a.avisoEl);
    a.contenedor.appendChild(raiz);
  }

  function cambiarPestana(id) {
    activo.pestana = id;
    activo.foco = null;
    renderizar();
  }

  // Vuelve a pintar la pestaña activa y el bloque de importar/exportar.
  function renderizar() {
    const a = activo;
    a.refs = {};
    a.marcas = [];
    vaciar(a.cuerpo);
    vaciar(a.bloque);
    if (a.pestana === "personaje") a.cuerpo.appendChild(pestanaPersonaje());
    else if (a.pestana === "equipo") a.cuerpo.appendChild(pestanaEquipo());
    else a.cuerpo.appendChild(pestanaForja());
    construirBloque();
    for (const p of PESTANAS) a.botonesPestana[p.id].setAttribute("aria-pressed", String(a.pestana === p.id));
    actualizarMarcas();
    restaurarFoco();
  }

  // ----------------------------------------------------------------- PERSONAJE
  function pestanaPersonaje() {
    const doc = activo.doc;
    const op = D.opcionesPersonaje;
    const actual = () => activo.estado.personaje;

    const capa = crear(doc, "button", { type: "button", class: "cp-boton", "aria-label": "Capa visible" }, "Capa visible");
    enlazar(capa, "click", () => {
      if (aplicarPersonaje({ capa: { on: !actual().capa.on } })) actualizarMarcas();
    });
    activo.marcas.push({ boton: capa, esActivo: () => actual().capa.on });

    return hijos(
      crear(doc, "div", { class: "cp-pestana" }),
      seccion(
        doc,
        "Traje",
        grupo(
          doc,
          "Color del traje",
          opcionesDe(
            doc,
            "Color del traje",
            Object.keys(op.traje.colores),
            (id) => op.traje.colores[id],
            (id) => actual().traje.color === id,
            (id) => aplicarPersonaje({ traje: { color: id } }),
          ),
        ),
        deslizador(doc, "Tono", op.traje.tono, 15, actual().traje.tono, (v) =>
          aplicarPersonaje({ traje: { tono: v } }),
        ),
        deslizador(doc, "Brillo", op.traje.brillo, 5, actual().traje.brillo, (v) =>
          aplicarPersonaje({ traje: { brillo: v } }),
        ),
        grupo(
          doc,
          "Patrón del traje",
          opcionesDe(
            doc,
            "Patrón del traje",
            op.traje.patrones,
            null,
            (id) => actual().patron === id,
            (id) => aplicarPersonaje({ patron: id }),
          ),
        ),
      ),
      seccion(
        doc,
        "Visor",
        grupo(
          doc,
          "Color del visor",
          opcionesDe(
            doc,
            "Color del visor",
            Object.keys(op.visor.colores),
            (id) => op.visor.colores[id],
            (id) => actual().visor.color === id,
            (id) => aplicarPersonaje({ visor: { color: id } }),
          ),
        ),
      ),
      seccion(
        doc,
        "Casco",
        grupo(
          doc,
          "Estilo del casco",
          opcionesDe(
            doc,
            "Estilo del casco",
            op.casco.estilos,
            null,
            (id) => actual().casco.estilo === id,
            (id) => aplicarPersonaje({ casco: { estilo: id } }),
          ),
        ),
      ),
      seccion(
        doc,
        "Capa",
        capa,
        grupo(
          doc,
          "Color de la capa",
          opcionesDe(
            doc,
            "Color de la capa",
            Object.keys(op.capa.colores),
            (id) => op.capa.colores[id],
            (id) => actual().capa.color === id,
            (id) => aplicarPersonaje({ capa: { color: id } }),
          ),
        ),
      ),
      seccion(
        doc,
        "Emblema",
        grupo(
          doc,
          "Emblema",
          opcionesDe(
            doc,
            "Emblema",
            op.emblema.iconos,
            null,
            (id) => actual().emblema.icono === id,
            (id) => aplicarPersonaje({ emblema: { icono: id } }),
          ),
        ),
      ),
      campoNombre(doc),
    );
  }

  // Nombre con validación en vivo. Lo válido se aplica al instante; lo inválido solo muestra el error.
  function campoNombre(doc) {
    const idError = `cp-nombre-error-${activo.uid}`;
    const nombre = activo.estado.personaje.nombre;
    const contador = crear(doc, "p", { class: "cp-contador" }, textoContador(nombre));
    const error = crear(doc, "p", { class: "cp-error", id: idError, "aria-live": "polite" });
    const input = crear(doc, "input", {
      type: "text",
      autocomplete: "off",
      "aria-label": "Nombre de viajero",
      "aria-describedby": idError,
      "aria-invalid": "false",
    });
    input.value = nombre;

    enlazar(input, "input", () => {
      const limpio = normalizarNombre(input.value);
      contador.textContent = textoContador(limpio);
      if (D.validarPersonaje(mezclar(activo.estado.personaje, { nombre: limpio })).ok) {
        error.textContent = "";
        input.setAttribute("aria-invalid", "false");
        aplicarPersonaje({ nombre: limpio });
      } else {
        error.textContent = mensajeNombre(limpio);
        input.setAttribute("aria-invalid", "true");
      }
    });
    // Al salir del campo, el texto válido se muestra ya recortado.
    enlazar(input, "change", () => {
      const limpio = normalizarNombre(input.value);
      if (D.validarPersonaje(mezclar(activo.estado.personaje, { nombre: limpio })).ok) input.value = limpio;
    });

    return seccion(doc, "Nombre de viajero", input, contador, error);
  }

  // ----------------------------------------------------------------- EQUIPO
  function pestanaEquipo() {
    const doc = activo.doc;
    const e = activo.estado;
    const ranuras = D.RANURAS.map((r) => filaRanura(doc, r));
    const sinEquipar = e.inventario.map((pieza, i) => filaInventario(doc, pieza, i));
    return hijos(
      crear(doc, "div", { class: "cp-pestana" }),
      seccion(doc, "Ranuras", lista(doc, ranuras, "")),
      seccion(doc, "Piezas sin equipar", lista(doc, sinEquipar, "No hay piezas sin equipar.")),
      seccion(doc, "Resumen de estadísticas", ...resumenEquipo(doc)),
    );
  }

  function filaRanura(doc, ranura) {
    const pieza = activo.estado.equipadas[ranura];
    const fila = crear(doc, "li", { class: "cp-item" });
    fila.appendChild(crear(doc, "strong", null, etiqueta(ranura)));
    fila.appendChild(pieza ? infoPieza(doc, pieza) : crear(doc, "span", { class: "cp-stats" }, "Vacía"));
    if (pieza) {
      fila.appendChild(
        boton(doc, "Desequipar", `Desequipar ${etiqueta(ranura)}`, () => desequipar(ranura), `desequipar:${ranura}`),
      );
    }
    return fila;
  }

  // Una botonera por ranura compatible. Los accesorios tienen dos.
  function filaInventario(doc, pieza, indice) {
    const fila = hijos(crear(doc, "li", { class: "cp-item" }), infoPieza(doc, pieza));
    for (const ranura of ranurasDe(pieza)) {
      const nombre = etiqueta(ranura);
      fila.appendChild(
        boton(
          doc,
          `Equipar en ${nombre}`,
          `Equipar en ${nombre}: pieza ${indice + 1}, ${nombreRareza(pieza)}`,
          () => equipar(indice, ranura),
          `equipar:${indice}:${ranura}`,
        ),
      );
    }
    return fila;
  }

  // Descripción de una pieza: la rareza va en su color, con el texto al lado.
  function infoPieza(doc, pieza) {
    const r = rarezaDe(pieza);
    const rareza = crear(doc, "strong", { class: "cp-rareza" }, nombreRareza(pieza));
    if (r) rareza.style.color = r.color;
    const stats = statsDe(pieza)
      .map((s) => `${s.nombre} ${signo(s.valor)}${numero(s.valor)} ${s.unidad}`)
      .join(", ");
    const info = hijos(
      crear(doc, "span", { class: "cp-info" }),
      rareza,
      crear(doc, "span", null, `${etiqueta(pieza.ranura)} · Zona ${pieza.zona} · +${pieza.forja}`),
      crear(doc, "span", { class: "cp-stats" }, stats),
    );
    if (tiene(D.SETS, pieza.set)) {
      info.appendChild(crear(doc, "span", { class: "cp-set" }, `Set: ${D.SETS[pieza.set].nombre}`));
    }
    return info;
  }

  // Estadísticas totales de las piezas equipadas más los bonos de set (sección 5.4).
  function resumenEquipo(doc) {
    const e = activo.estado;
    const equipadas = D.RANURAS.map((r) => e.equipadas[r]);
    const piezas = equipadas.filter(Boolean);
    const bonos = D.bonosDeSet(equipadas);

    const totales = {};
    for (const id of Object.keys(D.MODIFICADORES)) totales[id] = tiene(bonos, id) ? bonos[id] : 0;
    for (const p of piezas) for (const s of statsDe(p)) totales[s.id] += s.valor;

    const estadisticas = Object.keys(D.MODIFICADORES)
      .filter((id) => Math.abs(totales[id]) >= 0.005)
      .map((id) => {
        const m = D.MODIFICADORES[id];
        return crear(doc, "li", null, `${m.nombre}: ${signo(totales[id])}${numero(totales[id])} ${m.unidad}`);
      });

    const sets = Object.keys(D.SETS).map((id) => {
      const set = D.SETS[id];
      const n = piezas.filter((p) => p.set === id).length;
      const activos = bonos.activos.indexOf(id) >= 0;
      const bono = Object.keys(set.bono)
        .map((k) => `${D.MODIFICADORES[k].nombre} +${numero(set.bono[k])} ${D.MODIFICADORES[k].unidad}`)
        .join(", ");
      const cola = activos ? `. Bono activo: ${bono}` : "";
      return crear(doc, "li", null, `${set.nombre}: ${n} de ${set.piezas} piezas${cola}`);
    });

    return [
      lista(doc, estadisticas, "Sin piezas equipadas."),
      crear(doc, "p", { class: "cp-stats" }, "Bonos de set"),
      lista(doc, sets, ""),
    ];
  }

  function equipar(indice, ranura) {
    const a = activo;
    const e = a.estado;
    const pieza = e.inventario[indice];
    if (!pieza || !encaja(pieza, ranura)) return;
    const inventario = e.inventario.filter((_, i) => i !== indice);
    if (e.equipadas[ranura]) inventario.push(e.equipadas[ranura]);
    a.estado = { ...e, inventario, equipadas: { ...e.equipadas, [ranura]: pieza } };
    emitir();
    enfocar(`desequipar:${ranura}`);
    renderizar();
  }

  function desequipar(ranura) {
    const a = activo;
    const e = a.estado;
    const pieza = e.equipadas[ranura];
    if (!pieza) return;
    const inventario = [...e.inventario, pieza];
    a.estado = { ...e, inventario, equipadas: { ...e.equipadas, [ranura]: null } };
    emitir();
    enfocar(`equipar:${inventario.length - 1}:${ranura}`);
    renderizar();
  }

  // ----------------------------------------------------------------- FORJA
  function pestanaForja() {
    const doc = activo.doc;
    const e = activo.estado;
    const filas = [];
    for (const r of D.RANURAS) {
      if (e.equipadas[r]) {
        filas.push(filaForja(doc, e.equipadas[r], { donde: "equipada", ranura: r }, `equipada en ${etiqueta(r)}`));
      }
    }
    e.inventario.forEach((pieza, i) =>
      filas.push(filaForja(doc, pieza, { donde: "inventario", indice: i }, "en el inventario")),
    );
    return hijos(
      crear(doc, "div", { class: "cp-pestana" }),
      seccion(
        doc,
        "Forja",
        crear(doc, "p", { class: "cp-chatarra" }, `Chatarra disponible: ${e.forja.chatarra}`),
        lista(doc, filas, "No hay piezas para forjar."),
      ),
    );
  }

  // Fila de forja: costo del siguiente nivel y total hasta +5 (sección 5.5).
  function filaForja(doc, pieza, origen, ubicacion) {
    const e = activo.estado;
    const desc = `${nombreRareza(pieza)} ${etiqueta(pieza.ranura)}, ${ubicacion}`;
    const fila = hijos(crear(doc, "li", { class: "cp-item" }), infoPieza(doc, pieza));
    if (pieza.forja >= D.FORJA_MAX) {
      fila.appendChild(boton(doc, "Forja al máximo (+5)", `Forja al máximo, ${desc}`, () => {}, null, { disabled: "" }));
      return fila;
    }
    const costo = D.costoForja(pieza.forja);
    const siguiente = pieza.forja + 1;
    const falta = costo - e.forja.chatarra;
    fila.appendChild(
      boton(
        doc,
        `Subir a +${siguiente} (${costo} de chatarra)`,
        `Subir a +${siguiente} (${costo} de chatarra), ${desc}`,
        () => forjar(origen),
        claveOrigen(origen),
        falta > 0 ? { disabled: "" } : null,
      ),
    );
    const aviso = falta > 0 ? `Faltan ${falta} de chatarra. ` : "";
    fila.appendChild(crear(doc, "span", { class: "cp-costo" }, `${aviso}Hasta +5: ${costoHasta(pieza.forja)} de chatarra`));
    return fila;
  }

  // Sube una pieza un nivel. Nunca pasa de +5 ni gasta chatarra que no hay.
  function forjar(origen) {
    const a = activo;
    const e = a.estado;
    const pieza = piezaEn(origen);
    if (!pieza || pieza.forja >= D.FORJA_MAX) return;
    const costo = D.costoForja(pieza.forja);
    if (e.forja.chatarra < costo) return;
    const subida = { ...pieza, forja: pieza.forja + 1 };
    const cambios =
      origen.donde === "equipada"
        ? { equipadas: { ...e.equipadas, [origen.ranura]: subida } }
        : { inventario: e.inventario.map((p, i) => (i === origen.indice ? subida : p)) };
    a.estado = { ...e, ...cambios, forja: { chatarra: e.forja.chatarra - costo } };
    emitir();
    enfocar(claveOrigen(origen));
    renderizar();
  }

  // ----------------------------------------------------------------- IMPORTAR / EXPORTAR
  function construirBloque() {
    const a = activo;
    const doc = a.doc;
    const exportado = crear(doc, "textarea", {
      class: "cp-codigo",
      rows: "3",
      readonly: "",
      "aria-label": "Código de exportación",
    });
    exportado.value = codigoActual();
    a.refs.codigo = exportado;

    const importado = crear(doc, "textarea", {
      class: "cp-codigo",
      rows: "3",
      "aria-label": "Código para importar",
    });
    importado.value = a.borrador;
    a.refs.importado = importado;
    enlazar(importado, "input", () => {
      a.borrador = importado.value;
    });

    hijos(
      a.bloque,
      crear(doc, "h3", { class: "cp-subtitulo" }, "Importar y exportar"),
      campo(doc, "Código de este viajero", exportado),
      boton(doc, "EXPORTAR", "EXPORTAR código del viajero", () => {
        if (typeof exportado.select === "function") exportado.select();
        activo.opciones.onExportar(codigoActual());
      }),
      campo(doc, "Pegar un código para importar", importado),
      boton(doc, "IMPORTAR", "IMPORTAR código pegado", importar, "importar"),
    );
  }

  // Lee el código del campo en el momento de pulsar. Nunca lanza: un código corrupto solo muestra el motivo.
  function importar() {
    const a = activo;
    const area = a.refs.importado;
    a.borrador = area ? area.value : a.borrador;
    let resultado;
    try {
      resultado = D.importarPersonaje(a.borrador);
    } catch (e) {
      resultado = { ok: false, error: "Código corrupto: no se pudo leer" };
    }
    if (resultado.ok) {
      a.estado = { ...a.estado, personaje: copiarPersonaje(resultado.personaje) };
      a.borrador = "";
      avisar("Personaje importado.", false);
      emitir();
    } else {
      avisar(`No se importó nada. ${resultado.error}`, true);
    }
    // Si falla, el foco queda en el campo para corregir el código; si sale bien, en IMPORTAR.
    enfocar(resultado.ok ? "importar" : "importado");
    renderizar();
    a.opciones.onImportar(resultado);
  }

  // ----------------------------------------------------------------- API pública
  function abrir(contenedor, opciones) {
    if (!contenedor || typeof contenedor.appendChild !== "function") {
      throw new TypeError("abrir necesita un elemento del DOM como contenedor");
    }
    cerrar();
    const op = opciones && typeof opciones === "object" ? opciones : {};
    const doc = contenedor.ownerDocument || globalThis.document;
    const inicio = estadoInicial(op);
    secuencia += 1;
    activo = {
      uid: secuencia,
      contenedor,
      doc,
      opciones: {
        onCambio: funcion(op.onCambio),
        onExportar: funcion(op.onExportar),
        onImportar: funcion(op.onImportar),
      },
      estado: inicio.estado,
      pestana: "personaje",
      borrador: "",
      foco: null,
      refs: {},
      marcas: [],
      botonesPestana: {},
      cuerpo: null,
      bloque: null,
      avisoEl: null,
    };
    vaciar(contenedor);
    contenedor.appendChild(crear(doc, "style", null, ESTILO));
    construirEsqueleto();
    if (inicio.aviso) avisar(inicio.aviso, true);
    renderizar();
  }

  function cerrar() {
    if (!activo) return;
    vaciar(activo.contenedor);
    activo = null;
  }

  globalThis.CenizaPersonaje = Object.freeze({ abrir, cerrar });
})();
