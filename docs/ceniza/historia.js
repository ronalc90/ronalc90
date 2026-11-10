// Ceniza · textos de la historia: despertar, zonas, jefes, fogatas, fase 3D y final.
// Script clásico (sin módulos ES): define globalThis.CenizaHistoria.
// Datos puros, sin DOM, sin red y sin dependencias. Sigue docs/ceniza-diseno.md
// (secciones 1, 2, 9, 11 y 12). La narrativa completa está en docs/ceniza-historia.md.
// Estado: NO integrado todavía. docs/index.html no carga este archivo y ninguna pantalla
// llama a texto(). La integración queda para otra ronda (ver «Estado» en la narrativa).
// Se prueba en node:vm (scripts/ceniza-tests/historia.test.mjs). Cuando se integre, se carga
// con <script src="ceniza/historia.js"></script>.
//
// Convenciones:
// - Cada línea tiene 140 caracteres o menos antes de sustituir los marcadores.
// - Marcadores: {nombre} (nombre del viajero), {traje} y {visor} (colores elegidos).
//   Se sustituyen con texto(ruta, datos). Si falta un dato, se usa un valor por defecto.
//   Un color puede llegar con su id de datos.js (oxido, ambar): texto() lo escribe con tilde.
// - texto("zonas.1.entrada.0", { nombre: "Ana" }) devuelve la línea ya sustituida.

(function () {
  "use strict";

  // Congela un dato y sus anidados para que la interfaz no altere los textos.
  function congelar(obj) {
    for (const v of Object.values(obj)) if (typeof v === "object" && v !== null) congelar(v);
    return Object.freeze(obj);
  }

  // Valores por defecto de los marcadores (docs de la historia, sección Nombres). El traje y el visor
  // coinciden con el color por defecto de datos.js (personajePorDefecto). El nombre va en minúscula
  // porque la historia dice «el viajero» hasta que el jugador le pone nombre.
  // Pendiente de integración: datos.js usa "Viajero" como nombre de la interfaz; al integrar, esa
  // interfaz debe tratar ese valor como vacío y usar DEFECTOS.nombre.
  const DEFECTOS = congelar({ nombre: "viajero", traje: "ceniza", visor: "ámbar" });
  const MARCADOR = /\{(nombre|traje|visor)\}/g;
  // Nombre que se escribe para cada color de datos.js (con tilde). Un id sin entrada se usa tal cual.
  const COLORES = congelar({
    ceniza: "ceniza", arena: "arena", oxido: "óxido", cobalto: "cobalto",
    musgo: "musgo", cristal: "cristal", carmesi: "carmesí", ambar: "ámbar",
    cian: "cian", violeta: "violeta", blanco: "blanco",
  });

  // ----------------------------------------------------------------- nombres
  // Nombres de zonas, jefes y sectores. Coinciden con datos.js y mundo.js (lo comprueban las pruebas).
  const nombres = congelar({
    zonas: { 1: "Duna tibia", 2: "Ciudad de cristal", 3: "Fundición de lava", 4: "Bosque de chatarra" },
    jefes: {
      "guardian-duna": "Guardián de duna",
      "centinela-cristal": "Centinela de cristal",
      forjador: "El Forjador",
      "guardian-chatarra": "Guardián de chatarra",
    },
    sectores: { S1: "Pasillo de hielo", S2: "Taller de drones", S3: "Cabina del coloso", COLOSO: "Coloso final" },
  });

  // ----------------------------------------------------------------- zonas
  // entrada: dos líneas, al cruzar la puerta de la zona. trasJefe: una línea, al caer el jefe.
  const zonas = congelar({
    1: {
      entrada: [
        "Las dunas se mueven hacia el mismo lado, como si alguien las empujara. El polvo ya cubre tu traje de {traje}.",
        "Bajo la arena se mueve algo con caparazón. Acércate a la fogata antes de que se levante.",
      ],
      trasJefe: "La arena vuelve a su cauce y deja ver un tubo de metal que sube hacia el norte: era el que llevaba el calor de la forja a la duna.",
    },
    2: {
      entrada: [
        "Cada cristal de la calle muestra un visor {visor} que tarda un segundo en seguirte.",
        "Hay voces que repiten lo último que oyeron. Ninguna dice {nombre} todavía.",
      ],
      trasJefe: "Sin la centinela, la ciudad deja de vibrar y todos sus cristales se giran hacia la fundición.",
    },
    3: {
      entrada: [
        "El puente cruje bajo tus botas, y debajo la lava corre con la prisa de quien llega tarde.",
        "El calor no nace de esta tierra. Sube por el horno como si alguien lo hubiera dejado encendido.",
      ],
      trasJefe: "La colada se detiene y su calor sube hacia el bosque. En la pared hay nombres: está el de Sela. El tuyo, {nombre}, no.",
    },
    4: {
      entrada: [
        "Las hojas de metal no caen: se quedan colgadas de cables que nadie tensó.",
        "Todos los cables apuntan al mismo punto del cielo. Ninguno termina en el suelo.",
      ],
      trasJefe: "Las raíces se abren y una escalera de cables sube hacia una sombra que tapa el cielo entero.",
    },
  });

  // ----------------------------------------------------------------- jefes
  // antesDelCombate: al entrar en la sala del jefe. alCaer: al derrotarlo.
  const jefes = congelar({
    "guardian-duna": {
      antesDelCombate: "Es un cuerpo de arena prensada que guarda un canal seco. Lleva en el pecho una lámpara que sigue encendida.",
      alCaer: "Se deshace en granos que vuelven al canal, y la arena deja de crujir bajo tus pies.",
    },
    "centinela-cristal": {
      antesDelCombate: "Se pone frente a su espejo y cuenta tus pasos en el cristal, uno a uno, sin prisa.",
      alCaer: "Se rompe sin ruido, y en cada trozo queda un visor apagado que todavía devuelve un poco de luz.",
    },
    forjador: {
      antesDelCombate: "Martillea un yunque vacío; no te ha visto llegar y no piensa dejar de martillar.",
      alCaer: "Suelta el martillo, mira la pieza sin terminar y dice: «Ya no hace falta que nadie sople.»",
    },
    "guardian-chatarra": {
      antesDelCombate: "Ocupa el puente de cables como un portón de chatarra. Detrás de él, la escalera sube hacia la sombra.",
      alCaer: "Se desarma por la mitad, y sus piezas caen a los dos lados para dejar libre la escalera.",
    },
  });

  // ----------------------------------------------------------------- despertar (Acto I)
  // Se muestra al empezar una partida nueva, antes de moverse (clave "inicio"). Tres líneas tomadas
  // de docs/ceniza-historia.md, Acto I. El jugador pone su nombre al encender la primera fogata
  // (docs/ceniza-historia.md, «Cómo se nombra»), así que aquí {nombre} sale como «viajero».
  const inicio = congelar([
    "Despiertas junto a la primera fogata con una hoja de chatarra en la mano. Dices en voz alta: «{nombre}». La arena no contesta.",
    "La fogata responde a quien vuelve. El canal de vapor que daba calor a la duna ya no sube, y la arena lo cubre.",
    "La cresta del viento empuja los granos hacia el canal seco, y en el refugio hundido sigue encendida una lámpara.",
  ]);

  // ----------------------------------------------------------------- fogatas
  // Cinco líneas. fogatas[0] a fogatas[3] son las de las zonas 1 a 4 (clave fogata:N, al encender esa
  // fogata por primera vez). fogatas[4] es la de volver tras morir (clave fogata:morir). Son ambiente,
  // no instrucciones: no nombran acciones de menú.
  const fogatas = congelar([
    "La fogata da poco calor, pero alcanza para cerrar los ojos un rato.",
    "En la brasa quedan las marcas de cada cofre abierto y de cada guardián caído. El calor no las borra.",
    "Una pieza sin dueño se hunde en la brasa y sale más dura. Cada vez que la brasa la recibe, pide más chatarra.",
    "En el cristal de la brasa queda la figura de {nombre}, con el traje gastado por la ceniza.",
    "Has vuelto. Lo que venciste sigue vencido; los núcleos sin consolidar se quedaron allá abajo.",
  ]);

  // ----------------------------------------------------------------- fase 3D
  // entrada: al subir a la cabina. S1, S2 y S3: al entrar a cada sector (el arma se entrega ahí).
  // coloso: una línea por fase del Coloso final (Ojo expuesto, Brazos y Núcleo).
  const fase3D = congelar({
    entrada: "La escalera no termina en un techo sino en un asiento, y el asiento está tibio.",
    S1: "Las paredes sudan escarcha. Al entrar se abre un casillero con el rifle, y los drones exploradores siguen buscando calor.",
    S2: "Las mesas siguen fabricando drones, y sobre un banco, a medio pintar, te espera la escopeta.",
    S3: "El plasma te espera en un cilindro de cristal, como una brasa que nadie quiso apagar.",
    coloso: [
      "El ojo se abre después de cada ráfaga y tarda un instante en volver a cerrarse.",
      "Los brazos cubren el ojo como una mano sobre una llama. Al romper uno, lo que suelta no vuelve a su sitio.",
      "El núcleo queda al descubierto. Es lo único de la máquina que nunca se enfrió.",
    ],
  });

  // ----------------------------------------------------------------- final
  // victoria: dos líneas, al derrotar al Coloso final. pregunta: la que queda para el registro.
  const final = congelar({
    victoria: [
      "El coloso cae sobre la arena. Su calor sube sin prisa, como el humo de una hoguera que nadie vuelve a encender.",
      "Sobre el metal queda la huella de {nombre}. No lo apaga ni lo alimenta. Ninguna pared guarda ese nombre.",
    ],
    pregunta: "¿Se apagó la forja porque se acabó el metal, o porque alguien dejó de querer alimentarla?",
  });

  const raiz = congelar({ nombres, zonas, jefes, inicio, fogatas, fase3D, final });

  // Busca un texto por ruta ("zonas.1.entrada.0"). Devuelve undefined si no existe o no es texto.
  function buscar(ruta) {
    let actual = raiz;
    for (const parte of String(ruta).split(".")) {
      if (actual === null || typeof actual !== "object" || !Object.prototype.hasOwnProperty.call(actual, parte)) {
        return undefined;
      }
      actual = actual[parte];
    }
    return typeof actual === "string" ? actual : undefined;
  }

  // Escribe un dato tal como debe leerse: un color pasa de su id a su nombre con tilde.
  // El nombre del viajero no se toca, aunque coincida con un id de color.
  function rotulo(marca, valor) {
    if (marca === "nombre") return valor;
    return Object.prototype.hasOwnProperty.call(COLORES, valor) ? COLORES[valor] : valor;
  }

  // Devuelve el texto de la ruta con {nombre}, {traje} y {visor} sustituidos.
  // Un dato vacío o ausente usa el valor por defecto. Una ruta desconocida lanza RangeError.
  function texto(clave, datos) {
    const base = buscar(clave);
    if (base === undefined) throw new RangeError("Texto de la historia desconocido: " + clave);
    const valores = datos || {};
    return base.replace(MARCADOR, (_, marca) => {
      const valor = valores[marca];
      const dato = typeof valor === "string" && valor.trim() !== "" ? valor : DEFECTOS[marca];
      return rotulo(marca, dato);
    });
  }

  globalThis.CenizaHistoria = congelar({ nombres, zonas, jefes, inicio, fogatas, fase3D, final, texto });
})();
