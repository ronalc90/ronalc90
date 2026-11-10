Historia definitiva. Fuente de los textos de docs/ceniza/historia.js.

Estado: pendiente de integración. docs/index.html todavía no carga docs/ceniza/historia.js, así que el jugador no ve estos textos aún. El despertar del Acto I está en historia.js con la clave inicio (tres líneas tomadas de este documento), y aventura-ui.js lo muestra al empezar una partida nueva. Queda pendiente para la integración: el nombre se escribe al encender la primera fogata (ver «Cómo se nombra»), así que el despertar siempre sale como «viajero».

# CENIZA: lo que queda encendido

## Premisa

Los forjadores mantuvieron encendida su última forja cuando el cielo dejó de dar calor. La alimentaron con chatarra, con cristal y, al final, con la memoria de quien encendía cada fuego. Cuando el combustible se acabó, levantaron un coloso para llevar su trabajo más lejos, y dejaron fogatas y guardianes en cuatro zonas de ceniza. Hoy solo quedan sus restos, hechos de metal y de cristal, y un viajero sin nombre que despierta junto a la primera fogata con una hoja de chatarra en la mano. Avanza por la duna, la ciudad de cristal, la fundición y el bosque de chatarra, y en cada puerta encuentra un guardián que cuida algo que ya nadie sabe para qué sirve. Al final, una escalera de cables lo sube a la cabina del coloso, donde un asiento tibio le espera. Vencer al coloso es la victoria, y el calor que queda es lo último que el viajero toca.

## Tono y voz

1. **Imagen antes que emoción.** Cada frase muestra algo que se ve o se toca: metal tibio, cristal rayado, arena dentro de un guante. Si una frase nombra la tristeza, se reescribe con un objeto.
2. **La tristeza va en los objetos.** Una placa, un yunque vacío o un asiento tibio dicen lo que el narrador calla. Nunca se explica lo que el objeto ya dice.
3. **Pocas palabras, en tú.** El viajero habla poco y en presente. Los guardianes no suplican ni amenazan: hacen su trabajo. Cada línea de diálogo cabe en 140 caracteres y lleva una sola idea.
4. **Nadie es héroe ni villano.** Los guardianes cumplen lo que se les dejó hacer.

## El viajero

**Quién es.** Nadie lo espera en la duna. Despierta sin nombre, junto a una fogata que nunca antes había visto.

**Qué lleva.** La hoja de chatarra, con la que despierta. Desde el inicio tiene también el arco, el martillo y la lanza: cambia de una a otra con las teclas 1 a 4 (en pantallas táctiles, con el botón Arma). Lo demás lo encuentra en la ceniza: cables, cristal y piezas sin dueño. Traje, visor, casco, capa, emblema y patrón los elige el jugador. La historia los describe, pero el color no cambia lo que pasa.

**Cómo se nombra.** El jugador escribe un nombre de hasta 12 caracteres al encender la primera fogata. Hasta entonces la historia lo llama «el viajero». Después usa {nombre}: es lo primero que el viajero decide sobre sí mismo.

## Actos

**Acto I. Duna tibia (Z1).** El viajero despierta junto a la primera fogata y dice su nombre en voz alta: «{nombre}». La arena no contesta. Aprende que la fogata responde a quien vuelve. El canal de vapor que daba calor a la duna ya no sube, y la arena lo cubre. En la Cresta del viento el viento empuja los granos hacia el canal, y en el Refugio hundido alguien dejó una lámpara encendida que nadie ha apagado. Los areneros se levantan de la arena y los escarabajos de duna cavan bajo el canal. Al caer el Guardián de duna, la arena vuelve a su cauce y deja ver un tubo de metal que sube hacia el norte: era el que llevaba el calor de la forja a la duna.

**Despertar (clave `inicio`).** Tres líneas que se leen al empezar una partida nueva, antes de moverse. Son el comienzo del Acto I en tono de pantalla:

1. Despiertas junto a la primera fogata con una hoja de chatarra en la mano. Dices en voz alta: «{nombre}». La arena no contesta.
2. La fogata responde a quien vuelve. El canal de vapor que daba calor a la duna ya no sube, y la arena lo cubre.
3. La cresta del viento empuja los granos hacia el canal seco, y en el refugio hundido sigue encendida una lámpara.

**Acto II. Ciudad de cristal (Z2).** Los cristales devuelven al viajero siempre un poco tarde. En las Calles de vidrio hay voces que repiten lo último que oyeron. En el Mirador de espejos la ciudad se ve de cabeza, los reflejos de cristal se desprenden del vidrio y las astillas vivas crecen en las esquinas. En la Catedral rota el suelo suena como una campana sin badajo. Al caer la Centinela, el cristal deja de vibrar y la luz de la ciudad se inclina hacia la fundición, como una lámpara que alguien gira.

**Acto III. Fundición de lava (Z3).** El calor sube del horno como si alguien lo hubiera dejado encendido. En la Colada de magma la lava corre sin descanso; en la Galería de crisol las brasas errantes cruzan y los crisoles ardientes se abren como bocas. El Forjador martillea un yunque vacío en el Horno mayor. Al caer, la colada se detiene y el calor sube hacia el bosque.

**Acto IV. Bosque de chatarra (Z4).** Los árboles son cables tensados. En las Raíces de metal cada raíz suena cuando pasa el viento; en la Cañada de cables los oxidados caminan lentos y los carroñeros de chatarra siguen a quien cae. Al caer el Guardián de chatarra, las raíces del Corazón del bosque se abren y una escalera sube hacia una sombra que tapa el cielo. Esa escalera es la puerta de la fase 3D.

## Secretos

Cada zona tiene un secreto opcional: algo que la forja nunca llegó a entregar. Se encuentra en la sala y no se explica más.

- **Z1, Refugio hundido:** una lámpara que sigue encendida bajo la arena. El Guardián de duna lleva otra en el pecho.
- **Z2, Mirador de espejos:** una inscripción borrada en un espejo.
- **Z3, Puente de escoria:** una herramienta sin dueño apoyada en la barandilla.
- **Z4, Raíces de metal:** una placa con una fecha que nadie volvió a leer.

## Fogatas

Cada zona tiene una fogata. Al encenderla por primera vez sale su línea, y la vida del viajero vuelve al máximo. Las líneas describen el ambiente de la fogata, no las acciones del menú. La quinta línea sale al volver tras morir.

1. **Fogata de Z1** (clave `fogata:1`). La fogata da poco calor, pero alcanza para cerrar los ojos un rato.
2. **Fogata de Z2** (clave `fogata:2`). En la brasa quedan las marcas de cada cofre abierto y de cada guardián caído. El calor no las borra.
3. **Fogata de Z3** (clave `fogata:3`). Una pieza sin dueño se hunde en la brasa y sale más dura. Cada vez que la brasa la recibe, pide más chatarra.
4. **Fogata de Z4** (clave `fogata:4`). En el cristal de la brasa queda la figura de {nombre}, con el traje gastado por la ceniza.
5. **Al volver tras morir** (clave `fogata:morir`). Has vuelto. Lo que venciste sigue vencido; los núcleos sin consolidar se quedaron allá abajo. Sale la primera vez que el viajero vuelve tras morir, como el resto de cuadros.

## Zonas

### Z1 Duna tibia

**Entrada, en Mar de arena**
1. Las dunas se mueven hacia el mismo lado, como si alguien las empujara. El polvo ya cubre tu traje de {traje}.
2. Bajo la arena se mueve algo con caparazón. Acércate a la fogata antes de que se levante.

**Tras el jefe, en Cuenca del guardián**
La arena vuelve a su cauce y deja ver un tubo de metal que sube hacia el norte: era el que llevaba el calor de la forja a la duna.

### Z2 Ciudad de cristal

**Entrada, en Calles de vidrio**
1. Cada cristal de la calle muestra un visor {visor} que tarda un segundo en seguirte.
2. Hay voces que repiten lo último que oyeron. Ninguna dice {nombre} todavía.

**Tras el jefe, en Corazón de cristal**
Sin la centinela, la ciudad deja de vibrar y todos sus cristales se giran hacia la fundición.

### Z3 Fundición de lava

**Entrada, en Puente de escoria**
1. El puente cruje bajo tus botas, y debajo la lava corre con la prisa de quien llega tarde.
2. El calor no nace de esta tierra. Sube por el horno como si alguien lo hubiera dejado encendido.

**Tras el jefe, en Horno mayor**
La colada se detiene y su calor sube hacia el bosque. En la pared hay nombres: está el de Sela. El tuyo, {nombre}, no.

### Z4 Bosque de chatarra

**Entrada, en Claro de chatarra**
1. Las hojas de metal no caen: se quedan colgadas de cables que nadie tensó.
2. Todos los cables apuntan al mismo punto del cielo. Ninguno termina en el suelo.

**Tras el jefe, en Corazón del bosque**
Las raíces se abren y una escalera de cables sube hacia una sombra que tapa el cielo entero.

## Jefes

### Guardián de duna
- **Antes del combate.** Es un cuerpo de arena prensada que guarda un canal seco. Lleva en el pecho una lámpara que sigue encendida.
- **Al caer.** Se deshace en granos que vuelven al canal, y la arena deja de crujir bajo tus pies.

### Centinela de cristal
- **Antes del combate.** Se pone frente a su espejo y cuenta tus pasos en el cristal, uno a uno, sin prisa.
- **Al caer.** Se rompe sin ruido, y en cada trozo queda un visor apagado que todavía devuelve un poco de luz.

### El Forjador
- **Antes del combate.** Martillea un yunque vacío; no te ha visto llegar y no piensa dejar de martillar.
- **Al caer.** Suelta el martillo, mira la pieza sin terminar y dice: «Ya no hace falta que nadie sople.»

### Guardián de chatarra (jefe X)
- **Antes del combate.** Ocupa el puente de cables como un portón de chatarra. Detrás de él, la escalera sube hacia la sombra.
- **Al caer.** Se desarma por la mitad, y sus piezas caen a los dos lados para dejar libre la escalera.

## Fase 3D

- **Entrada a la cabina.** La escalera no termina en un techo sino en un asiento, y el asiento está tibio.
- **S1 Pasillo de hielo.** Las paredes sudan escarcha. Al entrar se abre un casillero con el rifle, y los drones exploradores siguen buscando calor.
- **S2 Taller de drones.** Las mesas siguen fabricando drones, y sobre un banco, a medio pintar, te espera la escopeta.
- **S3 Cabina del coloso.** El plasma te espera en un cilindro de cristal, como una brasa que nadie quiso apagar.
- **Coloso final, fase 1 (Ojo expuesto).** El ojo se abre después de cada ráfaga y tarda un instante en volver a cerrarse.
- **Coloso final, fase 2 (Brazos).** Los brazos cubren el ojo como una mano sobre una llama. Al romper uno, lo que suelta no vuelve a su sitio.
- **Coloso final, fase 3 (Núcleo).** El núcleo queda al descubierto. Es lo único de la máquina que nunca se enfrió.

Cada arma de la fase 3D se entrega al entrar a su sector: el rifle en S1, la escopeta en S2 y el plasma en S3.

## Final

**Victoria**
1. El coloso cae sobre la arena. Su calor sube sin prisa, como el humo de una hoguera que nadie vuelve a encender.
2. Sobre el metal queda la huella de {nombre}. No lo apaga ni lo alimenta. Ninguna pared guarda ese nombre.

**Pregunta sin responder para el registro:** ¿Se apagó la forja porque se acabó el metal, o porque alguien dejó de querer alimentarla?

## Nombres

- **CENIZA**: título del juego, en la pantalla de inicio y en el registro.
- **{nombre}**: nombre del viajero, escrito por el jugador (hasta 12 caracteres). Aparece en el Acto I (el despertar), en la fogata de Z4, en la entrada de Z2, en la pared del Horno mayor y en el final. Sin nombre escrito, la historia usa «viajero».
- **{traje}**: color del traje. Aparece en la entrada de Z1.
- **{visor}**: color del visor. Aparece en la entrada de Z2.
- **Colores**: se escriben con tilde (óxido, carmesí, ámbar). El juego pasa el id de datos.js y la historia lo convierte en su nombre.
- **Los forjadores**: el pueblo que mantuvo la última forja. Aparece en la premisa.
- **Sela**: nombre tallado en la pared del Horno mayor. No tiene más papel en la historia.
- **Z1 Duna tibia**: Mar de arena (entrada), Cresta del viento y Refugio hundido (Acto I), Cuenca del guardián (sala del jefe).
- **Z2 Ciudad de cristal**: Calles de vidrio (entrada), Mirador de espejos y Catedral rota (Acto II), Corazón de cristal (sala del jefe).
- **Z3 Fundición de lava**: Puente de escoria (entrada), Colada de magma y Galería de crisol (Acto III), Horno mayor (sala del jefe).
- **Z4 Bosque de chatarra**: Claro de chatarra (entrada), Raíces de metal y Cañada de cables (Acto IV), Corazón del bosque (sala del jefe).
- **Enemigos del mundo 2D**: Arenero y Escarabajo de duna (Acto I); Reflejo de cristal y Astilla viva (Acto II); Brasa errante y Crisol ardiente (Acto III); Oxidado y Carroñero de chatarra (Acto IV).
- **Enemigos de la fase 3D**: dron explorador, dron de asalto, torreta y guardián de cabina (élite).
- **Jefes**: Guardián de duna, Centinela de cristal, El Forjador y Guardián de chatarra (jefe X). Aparecen en la sección de jefes y en los actos.
- **Armas**: hoja de chatarra (con el viajero al despertar), arco, martillo y lanza (desde el inicio, con las teclas 1 a 4); rifle (S1), escopeta (S2) y plasma (S3), que se entregan al entrar a cada sector.
- **Fase 3D**: S1 Pasillo de hielo, S2 Taller de drones, S3 Cabina del coloso y Coloso final, con sus fases Ojo expuesto, Brazos y Núcleo.
