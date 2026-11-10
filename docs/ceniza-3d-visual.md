# CENIZA: plan visual de la fase 3D

Estado: plan para ejecutar. Base: three.js r160 vendorizado en `docs/ceniza/vendor/three.min.js` (verificado: el archivo declara la versión 160), solo núcleo, sin addons y sin red. Código de referencia: `docs/ceniza/shooter3d.js`. Diseño de referencia: `docs/ceniza-diseno.md`, secciones 1, 9.1 y 11.

Verificado en el vendor: existen `FogExp2`, `HemisphereLight`, `InstancedMesh`, `LatheGeometry`, `CanvasTexture`, `AgXToneMapping`, `ACESFilmicToneMapping`, `ReinhardToneMapping` y `AdditiveBlending`. No existen `NeutralToneMapping` (cero apariciones), `EffectComposer`, `UnrealBloomPass` ni `BufferGeometryUtils`. Sin addons no hay bloom, SSAO ni DecalGeometry; la sección de límites da la alternativa para cada uno.

Leyenda de valores:
- [fuente]: documentación o código de three.js r160, o fuente citada en la sección Fuentes.
- [código]: valor actual de `shooter3d.js`.
- [propuesta]: punto de partida para calibrar en captura.
- [cálculo]: resultado de una fórmula; la fórmula se indica.

Coste:
- bajo: un draw call extra o menos, sin cálculo por píxel adicional.
- medio: de dos a cuatro draw calls, geometría grande o material estándar sobre muchos píxeles.
- alto: pase de render adicional o transmisión.

## Objetivo visual

Quien juega debe sentir una civilización que se apaga y aún mantiene una última forja: el frío y el silencio del pasillo de hielo, el calor de chatarra y hollín del taller, el encierro cálido y tenso de la cabina y, en la arena de brasas, un coloso que ocupa todo el horizonte. Cada sector se lee por tres cosas: una luz clave, una niebla del color del fondo y un acento que marca ruta o amenaza, con el ámbar reservado a ruta y hito y el carmesí a amenaza. Los enemigos y los objetivos deben reconocerse a 20 metros por contraste de valor y por emisión, sin postproceso, con cuatro luces fijas y un presupuesto de draw calls que aguante WebGL por software.

## Principios

1. Contraste de valor antes que detalle. La niebla de todos los sectores es oscura, así que el cuerpo de cada enemigo es claro (ceniza, cristal, cobre) y su parte emisiva marca el tipo. Criterio: a 20 m, la luminancia relativa del enemigo frente a la niebla tiene una razón de contraste de 3:1 o más.
2. Un color por función, en todo el juego. Ámbar: ruta y hito (forjas, salidas, paneles de señalización). Carmesí: amenaza (ojos de asalto y torreta, lente de torreta al cargar, telegrafos, balas enemigas, ojo del Coloso). Cian: el viajero y su plasma. Violeta: élite. Blanco cálido: trazador del rifle y mira.
3. Niebla exponencial del color del fondo. Da profundidad sin geometría extra, oculta el final del pasillo y tapa el borde del plano lejano. Un solo objeto de niebla por escena.
4. Brillo por emisión y sprites aditivos, no por bloom. Los colores por encima de 1 pasan por un único tone mapping. Como máximo 40 sprites aditivos visibles a la vez.
5. Coste fijo y declarado. Cuatro luces siempre presentes, un solo tone mapper, cero geometrías o materiales nuevos durante un combate, y cada efecto con su coste escrito en este documento.

## Paleta por sector

Valores propuestos. Los hex de la sección 9.1 del diseño (cobalto #2f5f8f, cristal #9fc9d8, ámbar #c98a1b, carmesí #e0403a, blanco #f2efe9) son la base de la paleta del traje y aquí sirven de referencia.

| Elemento | S1 Pasillo de hielo | S2 Taller de drones | S3 Cabina del coloso | Coloso (arena) |
|---|---|---|---|---|
| Fondo y niebla | #1d3442 (hoy #c6e2f2) | #2b2622 (hoy #3a3f4b) | #1a0b0e (hoy #2a0e12) | #2b2432 (hoy #140f1e) |
| Densidad de niebla (FogExp2) | 0,025 | 0,020 | 0,030 | 0,012 |
| Cielo / suelo (hemisferio) | #7fb6cc / #15232d | #6b6f7a / #3a2a20 | #3a1a1e / #120506 | #5b4f66 / #2a1a14 |
| Intensidad del hemisferio | 1,0 | 0,9 | 0,5 | 0,8 |
| Clave direccional (color, intensidad) | #d6f1ff, 1,1 | #ffc27a, 0,8 | apagada (0) | #ffd9a0, 0,5 |
| Puntual A (color, candelas, alcance) | #c98a1b, 40, 18 m (forja al fondo) | #ffb347, 40, 16 m (puerta) | #ff9a3c, 60, 10 m (panel de entrada) | #ffd54a, 80, 30 m (núcleo) |
| Puntual B (color, candelas, alcance) | #9fc9d8, 12, 10 m (relleno frío) | #9aa7b8, 10, 10 m (torretas) | #ffb347, 40, 10 m (panel de salida) | #ff7a2e, 30, 20 m (brasas) |
| Suelo | #3e6378, hielo (T1) | #6b4a33, óxido (T2) | #3a1b1b | #4a3f36, arena |
| Paredes y columnas | #5f8aa0, cristal | paredes #4f5560, metal; columnas #b07a3a | #5a2a2a | columnas #5b5560 (hoy #5a4a7a) |
| Acento (ruta y hito) | #c98a1b | #ffb347 | #ffb347 | #ffd54a (núcleo) |
| Amenaza | #e0403a | #e0403a | #e0403a | #ff3b2e (ojo del Coloso) |
| Exposición | 1,0 | 1,0 | 0,9 | 1,1 |

Razones:
- S1: la niebla oscura hace que el dron cian y la forja ámbar del fondo se lean. La forja es el único hito cálido del pasillo y responde a la idea de la última forja encendida (sección 1 del diseño).
- S2: la luz cálida viene de las puertas y el frío de las torretas. El asalto deja el naranja (#ff8a4c, hoy) porque choca con el ámbar de ruta.
- S3: interior carmesí oscuro con paneles ámbar. Los élites violetas se separan del interior por matiz, y la exposición 0,9 evita que los paneles se recorten.
- Arena: humo violeta-gris y brasas. El ojo carmesí del Coloso es el mayor punto de color de la escena. El piso violeta actual (#2b2140) se cambia por arena, porque la brief pide arena con brasas.

Se aparta de la investigación: esta propuso una niebla cian pálida para S1. Con niebla clara los drones cian pierden contraste a media distancia, así que aquí la niebla es azul acero oscuro.

## Iluminación y tono

### Niebla

- Cambio: `escena.fog = new THREE.Fog(0x05060a, 14, 70)` (línea 674) pasa a `new THREE.FogExp2(color, densidad)`, creado una sola vez en `iniciarRender`. `aplicarAmbiente` (líneas 699-705) cambia solo `fog.color` y `fog.density`, y deja de tocar `near` y `far`. [propuesta]
- Motivo: el tipo de niebla forma parte de la compilación de los materiales. Cambiar solo color y densidad no recompila. [conocimiento de three.js; comprobar con `renderer.info.programs`]
- Fórmula de niebla en r160: factor = 1 - exp(-(densidad × distancia)²). [fuente: fragmento de niebla de r160]
- Niebla actual: THREE.Fog de 14 a 70 m mezcla un 3 % a 20 m y un 58 % a 45 m [cálculo, con smoothstep]. Por eso la captura se ve sin niebla.

Factor de niebla según densidad y distancia [cálculo]:

| Densidad | 10 m | 20 m | 30 m | 45 m | 60 m |
|---|---|---|---|---|---|
| 0,012 (arena) | 1 % | 6 % | 12 % | 25 % | 40 % |
| 0,020 (S2) | 4 % | 15 % | 30 % | 56 % | 76 % |
| 0,025 (S1) | 6 % | 22 % | 43 % | 72 % | 90 % |
| 0,030 (S3) | 9 % | 30 % | 55 % | 84 % | 96 % |

Lectura: con 0,025 los drones a 15 a 25 m siguen legibles y el tramo final del pasillo se disuelve. La densidad de 0,04 de la investigación deja solo 47 % de niebla a 20 m y 96 % a 45 m, demasiado para leer enemigos en S1; por eso se descarta.

### Luces

- Cuatro luces fijas por escena: 1 `HemisphereLight`, 1 `DirectionalLight` y 2 `PointLight`. Siempre presentes. Por sector cambian color, intensidad y posición. Las no usadas quedan con intensidad 0. Motivo: three.js recompila los programas cuando cambia el número de luces. [conocimiento de three.js; comprobar con `renderer.info.programs`]
- Hoy: `HemisphereLight(0xffffff, 0x444444, 1.0)` y `DirectionalLight(0xffffff, 0.7)` en las líneas 675-676 [código]. El color de cielo y suelo ya cambia por sector en `aplicarAmbiente` [código].
- Creación: en `iniciarRender`, `new THREE.PointLight(0xffffff, 0, 18)` y `new THREE.PointLight(0xffffff, 0, 10)`, añadidas a la escena. `aplicarAmbiente` las recoloca. [propuesta]
- Unidades: en r160 la intensidad de las puntuales es en candelas y el decaimiento por defecto es 2. [conocimiento de three.js; los valores de la tabla son propuesta y se calibran en captura]

Valores por sector: ver la tabla de la sección Paleta por sector (hemisferio, clave, puntuales y exposición). [propuesta]

Sin sombras: hoy no hay `shadowMap` ni `castShadow` en `shooter3d.js` [código]. Se mantiene así en P1 y P2.

### Tone mapping y exposición

- Un solo tone mapper para los cuatro sectores: `renderer.toneMapping = THREE.ACESFilmicToneMapping`, justo después de crear `WebGLRenderer` (línea 683). [propuesta]
- Comparar dos capturas, S3 y arena, con `AgXToneMapping` (existe en r160). Elegir el que conserve el ámbar y el carmesí sin dejarlos planos. [propuesta]
- No usar `NeutralToneMapping`: no existe en r160. [verificado en el vendor]
- Exposición por sector, en `renderer.toneMappingExposure`. Cambiarla no recompila. Valores: S1 1,0; S2 1,0; S3 0,9; arena 1,1. [propuesta]
- Hoy: sin tone mapping, con el valor por defecto `NoToneMapping` y exposición 1. [fuente: WebGLRenderer r160]. Los colores por encima de 1 (brasas, paneles) se recortan a blanco plano. [razonamiento]
- Los hex de la paleta son colores antes del tone mapping. ACES puede desaturar los rojos intensos. [fuente secundaria: hilo del foro de three.js sobre contraste bajo con ACES] Si las brasas pierden color, subir la saturación del hex, no la exposición. [propuesta]
- El HUD es DOM y no pasa por three.js, así que no hace falta `toneMapped = false`. [código: la interfaz son elementos `div`]

Se aparta de la investigación: esta propuso un tone mapper distinto por sector. Cambiar `renderer.toneMapping` obliga a recompilar, así que se usa uno solo y la diferencia entre sectores va en la exposición y en la paleta.

### Sombras

- Hoy no hay sombras. [código]
- Opcional, P3: una `DirectionalLight` con PCF (no PCFSoft), `mapSize` 1024 y frustum de 10 a 12 m centrado en el viajero. [propuesta] Coste medio-alto. No conviene en pruebas con SwiftShader.
- Alternativa barata en P2: sombra de mancha bajo cada enemigo (T5).

## Materiales y texturas procedurales

Todas las texturas se generan con canvas al arrancar el sector, nunca por fotograma. Se comparten entre materiales y ninguna pasa de 512 px. Coste de memoria: 512 × 512 en RGBA ocupa 1 MiB y unos 1,33 MiB con mipmaps. [cálculo]

| Id | Tamaño | Contenido | Uso | Parámetros | Coste |
|---|---|---|---|---|---|
| T1 Hielo (datos) | 512 | G: rugosidad; B: metalicidad; fbm de 4 octavas | Suelo y paredes de S1 | G entre 0,15 y 0,35; B = 0. Mapa de datos, sin espacio de color | bajo |
| T2 Óxido (color) | 512 | Albedo sRGB con manchas #6b4a33, #8a5a3a y #3a2a20, con fbm | Suelo y paredes de S2 | Único mapa en sRGB | bajo |
| T2d Óxido (datos) | 512 | G: rugosidad entre 0,55 y 0,85; B: metalicidad 0 en óxido y 0,7 en metal limpio | S2 y paneles de S3 | En el material, `roughness` = 1 y `metalness` = 1, para que el mapa mande [fuente: roughnessMap usa G y metalnessMap usa B; por defecto 1 y 0] | bajo |
| T3 Grietas | 512 | Alfa con patrón celular (F1 con umbral; F2-F1 sin verificar) | Planos de 2 mm sobre el hielo de S1 | `polygonOffset` o desfase de 2 mm para evitar parpadeo | bajo |
| T4 Halo | 128 | Degradado radial: blanco con alfa 1 en 0, alfa 0,35 en 0,3 y alfa 0 en 1 | Todos los sprites aditivos | Teñido con `material.color`. Una sola textura compartida | bajo |
| T5 Mancha | 128 | Degradado radial negro con alfa 0,5 | Bajo cada enemigo | Plano horizontal, `depthWrite` false | bajo |
| T6 Humo | 128 | Ruido suave con bordes a alfa 0 | Planos de humo | Un solo material, blending normal | bajo |
| N1 Normal | 256 | Normal de Sobel calculada sobre la altura de T1 o T2 | Hielo y chatarra (P3) | `normalScale` entre 0,3 y 0,6. Verificar el signo con luz rasante | bajo |

Materiales por sector:
- S1, hielo: `MeshStandardMaterial` con T1; color base #3e6378 en el suelo y #5f8aa0 en las paredes; `roughness` = 1 y `metalness` = 1 con el mapa. [propuesta]
- S2, chatarra: `MeshStandardMaterial` con T2 y T2d. `flatShading` en asalto y torreta. [propuesta; coste bajo]
- S3, cabina: paredes #5a2a2a y piso #3a1b1b con T2d. La rugosidad alta evita que los paneles dependan del brillo especular. [propuesta]
- Arena: arena #4a3f36 con grano de T2d. Las brasas son emisivas. [propuesta]

Materiales de P3:
- `onBeforeCompile` para variación fina de rugosidad. Solo funciona con `WebGLRenderer`. Hay que sustituir los `#include` por su contenido y dar un `customProgramCacheKey` distinto a cada variante. [fuente: documentación de Material; el manejo de los `#include` viene de la investigación]. Coste medio.
- `MeshPhysicalMaterial` para el hielo con `clearcoat` 1, `clearcoatRoughness` 0,1 e `ior` 1,31. [fuente: physicallybased.info, valor 1,31 para hielo]. Coste medio sin `transmission`. Con `transmission` el coste es alto: no usarla.

## Partículas y efectos

Notas de implementación:
- `ShaderMaterial` no recibe niebla salvo que se incluya el chunk de niebla. El shader de ceniza desvanece por distancia dentro del propio shader. [fuente: documentación de Material y fog]
- `gl.ALIASED_POINT_SIZE_RANGE` se consulta una sola vez al arrancar, con `renderer.getContext().getParameter`. Si el tamaño pedido supera el máximo, se usa un plano con T4. [fuente: documentación de PointsMaterial]
- Un halo grande nunca es un `Points` grande: es un plano con T4.

| Efecto | Implementación | Cantidad | Sector | Prioridad | Coste |
|---|---|---|---|---|---|
| Ceniza ambiental | `Points` con `ShaderMaterial`; `y = mod(y0 - t·v, altura)`; deriva con sen y cos; alfa por distancia | 300 a 400 | S2, S3, arena | P1 | bajo |
| Nieve y polvo de cristal | Igual que la ceniza, con deriva lateral de viento y tamaño menor | 500 | S1 | P1 | bajo |
| Brasas de la arena | `Points` aditivos; borde suave con `gl_PointCoord` (`pow(1 - d, 3)`); `depthWrite` false | 200 a 300 | Arena | P1 | bajo |
| Anillo de telegrafo | Una `RingGeometry` compartida y un pool de 8 mallas; hoy se crea una por pulso (línea 1159) | 8 | Coloso, fase 1 | P1 | bajo |
| Halos aditivos | Plano con T4 | 12 como máximo | Ojo del Coloso, ojos de drones S1, paneles S3 | P2 | bajo |
| Destello de boca | Pool de 8 sprites con T4, 0,1 a 0,2 s. Rifle: blanco cálido pequeño. Escopeta: blanco cálido grande. Plasma: cian #6ff2ff | 8 | Todos | P2 | bajo |
| Chispas de metal | `InstancedMesh` de cubos pequeños con `setColorAt`, blanco cálido | 64 | S2 | P2 | bajo |
| Humo de forja | Planos billboard con T6, `MeshBasicMaterial`, blending normal, opacidad 0,4 a 0,6, giro lento | 24 por sector como máximo | S2, S3, arena | P2 | medio (overdraw) |
| Marcas de impacto | Pool de planos con quemadura en canvas, desvanecidas en 2 a 4 s | 48 | Todos | P2 | bajo |
| Trazador del rifle | `LineSegments` con buffer fijo y `drawRange`; hoy se crea un `BufferGeometry` por disparo (línea 1100). Color #fff2a8 | 1 | S1 | P2 | bajo |
| Niebla de altura | `ShaderMaterial` propio con densidad exponencial por altura; la niebla hay que sumarla a mano | 1 plano | S3 | P3 | medio |

Las chispas y los destellos se hacen con color y emisión, no con una luz por efecto: cada luz extra cambiaría la cuenta de luces y forzaría recompilación.

## Enemigos y coloso

Mallas actuales [código]: el explorador tiene 4 mallas (esfera, dos alas y ojo); el asalto, 3 (caja y dos conos); la torreta, 2 (cilindro y cañón); la élite, 4 (cuerpo, dos pinzas y escudo). El escudo de la élite es `0x7fe9ff` con opacidad 0,7 [código].

| Enemigo | Silueta (primitivas) | Cuerpo (hex) | Parte emisiva | Cambio | Prioridad |
|---|---|---|---|---|---|
| Dron explorador | Esfera de 0,45, dos alas y ojo | #9fb8c4 (hoy #7fd1ff): contraste de valor de 6:1 frente a la niebla de S1 [cálculo] | Ojo #7fd1ff (`MeshBasicMaterial`; hoy blanco #ffffff) | Cuerpo claro; el ojo marca el tipo | P1 |
| Dron de asalto | Caja de 1,0 × 0,7 × 1,2 y dos conos; uno de ellos 1,3 veces mayor (asimetría) [propuesta] | #8a8f99 (hoy #ff8a4c, naranja, que choca con el ámbar de ruta de S2) | Ojo nuevo carmesí #ff3b2e, intensidad 1,0 (amenaza: embiste) | Añadir ojo; cambiar cuerpo | P1 |
| Torreta | Cilindro de 0,6 y 0,7 y cañón | #b07a3a, cobre (hoy #8a8f99) | Lente nuevo carmesí: 0,2 en reposo, 1,5 al cargar (telegrafo) | Añadir lente; cuerpo cobre | P1 |
| Guardián de cabina (élite) | Esfera de 1,2 escalada, dos pinzas y escudo | #a9a4b0 (hoy #9c6cff) | Ojo nuevo violeta #9c6cff, intensidad 1,0; escudo #7fe9ff sin cambio | Cuerpo claro; violeta pasa al ojo | P1 |
| Coloso, cuerpo | Esfera de 3,2 (24 × 18 segmentos) | #6a6f80 (hoy #3a3f4d). Contraste de 3:1 frente a la niebla de arena [cálculo] | Ojo #ff3b2e: intensidad 0,3 hoy; 0,9 a 1,4 con pulso de 1 Hz cuando la ventana está abierta [propuesta] | Cuerpo más claro para que la silueta se lea contra el humo | P1 |
| Coloso, brazos (fase 2) | Dos cajas de 1,8 × 1,6 × 2,6 | Óxido #6b4a33 con `flatShading` (hoy #555c6e) | Se apagan al romper cada brazo | Cambio de color | P2 |
| Coloso, núcleo (fase 3) | Esfera de 1,5 | #ffd54a, sin cambio (código) | Intensidad 1,2 [código] | Halo T4 de 6 m de diámetro, P2 | P2 |

Notas:
- Silueta: 3 a 5 primitivas por enemigo, con una asimetría. [fuente: guías de diseño de personajes de la investigación; confianza media]
- Forma de torreta y élite con `LatheGeometry` (perfil de gota), P2. Cada punto del perfil debe tener x mayor que 0, sin tapas. [fuente: documentación de LatheGeometry]
- Animación procedural, P2: el explorador flota con `y = base + 0,08 · sen(2t)` [propuesta]. La torreta gira la cabeza con un seno lento. En la fase 2 los brazos tienen fase desfasada. El ojo del Coloso pulsa solo con la ventana abierta.
- Coloso, fase 1 (ojo expuesto): el ojo carmesí es el mayor punto de color de la arena. Halo T4 de 6 m con opacidad 0,35 [propuesta].
- Coloso, fase 3 (núcleo): el núcleo ámbar y las brasas dan la luz principal de la escena.

Se aparta de la investigación: esta propuso carmesí para la élite. Con el interior de S3 ya carmesí, un élite carmesí se perdería. El violeta contrasta con el interior y se conserva.

## Feedback de disparo y cámara

Valores propuestos salvo indicación:
- Trauma global `t` entre 0 y 1, guardado en el estado del juego y no en la cámara. Sube por evento y decae a 0,5 por segundo. La intensidad es `t²`, porque la lineal se percibe plana. [referencia: ejemplo de sacudida de Bevy]
- Offset de cámara: `roll = 2° · t² · r(τ)` y `pitch` y `yaw` con `1,5° · t² · r(τ + desfase)`, donde `r(τ) = sen(17τ) + 0,5 · sen(31τ)`, normalizado a [-1, 1]. Las sumas de senos evitan implementar ruido de Perlin.
- Aplicación: después de `actualizarCamara()` dentro de `bucle` (línea 1836), sumando el offset a `camara.rotation`. No se toca `jugador.yaw` ni `jugador.pitch`, para que la lógica de apuntado no se contamine.
- Eventos, con tope en 1: rifle +0,10; plasma +0,15; escopeta +0,30; daño recibido +0,40; golpe del Coloso al romper un brazo o al pulso +0,50.
- Reducción de movimiento: si `matchMedia('(prefers-reduced-motion: reduce)').matches`, el offset se multiplica por 0,3.
- Daño direccional, P2: patada de roll de 1 a 2° y de pitch de 2 a 3°, con decaimiento de 0,5 s. El signo del roll sale del producto punto entre la dirección del atacante y la derecha de la cámara. [fuente: QuakeSpasm, view.c; los valores de Quake no se trasladan, pero la forma sí]
- Retroceso, P2: muelle por arma con impulso al disparar. Rifle: 1,5 a 2,5° con vuelta en 0,12 a 0,20 s. Escopeta: 4 a 6° con vuelta en 0,30 a 0,45 s. Plasma: intermedio. Va a un nodo del arma, separado del offset de trauma. Se integra con el delta de tiempo, no por fotograma.
- FOV, P2: vertical de 72 hoy (línea 680) [código]. Al correr (Shift, línea 1518) subir 5° en 0,15 s y bajar en 0,3 s. [propuesta]
- FOV en vertical (móvil), P2: con aspecto 1:2 el horizontal actual es de unos 40° [cálculo]. Subir el vertical a 90 o 100 da horizontal de 53° a 62° [cálculo: horizontal = 2 · atan(tan(fov/2) · aspecto)]. A 16:9 el horizontal actual es de unos 104° [cálculo].

## HUD

- `.ceniza3d-enemigos` (línea 250) y `.ceniza3d-vida-texto` (línea 254): panel de fondo `rgba(8,10,14,.6)`, relleno de 3 px por 8 px, radio de 4 px, texto de 14 px con peso 600 (16 px en móvil). [propuesta]. Contraste de #eef3f8 sobre ese panel encima de blanco puro: 5,1:1 [cálculo]. Supera 4,5:1 del texto normal (WCAG 1.4.3). El `text-shadow` no se mide y no cuenta.
- `.ceniza3d-mira` (líneas 257 a 260): núcleo blanco de 2 px y contorno #05060a de 1 px [propuesta]. Contorno frente a nieve #dce4ec: 15,8:1 [cálculo]. La mira actual (blanco al 90 % con sombra) desaparece sobre nieve.
- `.ceniza3d-vida-relleno` (línea 253): #e8604c pasa a #e0403a, el carmesí de la paleta 9.1 [propuesta]. Borde de la barra de 1 px de `rgba(255,255,255,.6)` [propuesta]; el borde actual al 35 % no tiene contraste medido.
- Aviso de daño: capa DOM con `radial-gradient` transparente en el centro y carmesí en los bordes. Opacidad máxima de 0,5, fundido de entrada de 0,1 s y de salida de 0,3 s. Como máximo 3 destellos por segundo (WCAG 2.3.1). Con reducción de movimiento sube la opacidad sin pulso. [propuesta]
- Dirección del daño, P2: el centro del gradiente se desplaza hacia el lado del golpe. [propuesta]
- `.ceniza3d-aviso` (línea 263): ya usa `rgba(0,0,0,.7)`. Sin cambio.

## Rendimiento

Presupuesto medible [propuesta]:

| Concepto | Límite | Cómo se mide |
|---|---|---|
| Draw calls en el peor fotograma de cada sector | 120 o menos | `renderer.info.render.calls` |
| Luces en la escena | 4, siempre | Contar las luces de la escena |
| Sprites aditivos visibles | 40 o menos | Contador en modo de prueba |
| Points por sector | 600 o menos | Contador de cada sistema |
| Texturas de canvas | 6 o menos, todas de 512 px o menos | `renderer.info.memory.textures` |
| Geometrías y materiales nuevos durante una oleada | 0 | `renderer.info.memory.geometries` constante |
| Programas compilados | Constante tras el primer fotograma de cada sector | `renderer.info.programs.length` |

Técnicas:
- Pixel ratio: `Math.min(devicePixelRatio, 2)` ya existe (línea 684) [código]. En pruebas, fijar en 1. [propuesta] El coste de fragmento escala con los píxeles: con ratio 2 hay cuatro veces más píxeles que con 1. [cálculo]. Coste: medio.
- Antialias: hoy `antialias: true` (línea 683) [código]. Propuesta: `antialias = dpr < 1.5`, y medir en SwiftShader con y sin. Coste: alto en software. [inferencia: el MSAA sobre rasterizado por CPU es caro]
- Recursos por enemigo, efecto y disparo, P1: `crearEnemigo` (línea 805) crea un material y de dos a cuatro geometrías por enemigo. `efectoEsfera` (línea 1091) crea un material por efecto. `telegrafoPulso` (línea 1159) crea una `RingGeometry` por pulso. `trazador` (línea 1100) crea un `BufferGeometry` por disparo. Solución: caché por tipo, pool de 16 a 32 mallas de efecto y trazador con buffer fijo. Coste: bajo. `desmontar` (línea 230) debe liberar solo lo que no es compartido; la caché se libera al cambiar de sector. [propuesta]
- InstancedMesh para enemigos, P3. Un `InstancedMesh` por pieza y tipo, con capacidad fija (bajar `count` a los vivos) y `computeBoundingSphere` tras mover instancias. [fuente: documentación de InstancedMesh]. Coste: bajo en draw calls, pero es una reescritura grande de `crearEnemigo` y de la IA.
- Fusión de estáticos, P2: un `Mesh` por material y sector, con `applyMatrix4` y concatenación de buffers a mano. `BufferGeometryUtils` no está vendorizado. Coste medio, una sola vez por sector. Se hace en `montarPasillo` (línea 710).
- LOD del Coloso, P3: nivel de 12 × 9 segmentos a partir de 40 m; el anillo del escudo se oculta a partir de 25 m. [propuesta; fuente: documentación de LOD]. Coste bajo.
- Resolución dinámica, P2: medir la media de 60 fotogramas. Si supera 22 ms, bajar 0,25 con mínimo de 0,75; si baja de 14 ms, subir. [propuesta]. Coste bajo.
- Vendor: el archivo imprime un `console.warn` de deprecación al cargar (cabecera de `three.min.js`). No afecta al render, pero no debe confundirse con un fallo de la fase 3D.
- WebGL no disponible: `iniciarRender` ya tiene un `try/catch` (líneas 682 a 690) que muestra un aviso. Se mantiene.

Límites: lo que no está disponible con three.min.js r160 y sin red.

| Técnica habitual | Disponible | Alternativa barata |
|---|---|---|
| UnrealBloomPass, EffectComposer | No (addons) | Sprites aditivos con T4 y emisivo del material |
| SSAO, N8AO | No | Color por vértice con gradiente en la base (uv.y); la suciedad de la base de paredes |
| DecalGeometry | No (addon) | Plano con textura de quemadura, pool de 48 |
| GLTFLoader y modelos | No | Primitivas y `LatheGeometry` |
| NeutralToneMapping | No en r160 | ACES o AgX |
| Sombras reales | Sí, pero caras | Mancha T5 |
| `transmission` de MeshPhysicalMaterial | Sí, coste alto | Emisivo y `clearcoat` |
| Texturas o modelos externos | No (sin red) | T1 a T6 y N1 generadas en canvas |

## Prioridades

P1: imprescindible. Cada punto tiene el criterio para saber que está hecho.

1. Niebla FogExp2 por sector, un solo objeto, con cambio de color y densidad (líneas 674 y 699 a 705). Criterio: en la captura de S1, el color del horizonte coincide con el de la niebla (±6 por canal) y un dron a 20 m tiene 22 % de niebla [cálculo].
2. Paleta y densidades nuevas en `DEFINICION` (líneas 101 a 127) y en `aplicarAmbiente`. Criterio: los cuatro sectores tienen fondo y niebla con los hex de la tabla, y la luminancia de la niebla de S1 es menor que 0,05.
3. Tone mapping ACES en `iniciarRender` (línea 683), con exposición por sector. Criterio: menos de 1 % de píxeles con los tres canales en 250 o más en las capturas de S1 a S3, y menos de 3 % en la arena.
4. Cuatro luces fijas con color y posición por sector (líneas 674 a 679). Criterio: la escena tiene exactamente 4 luces en todos los sectores, y `renderer.info.programs.length` no sube al cambiar de sector.
5. Colores de enemigos y de amenaza (líneas 136 a 139, `crearEnemigo` en 805, y disparos en 1264, 1282 y 1335). Criterio: cada enemigo tiene contraste de valor de 3:1 o más frente a la niebla a 20 m; el asalto, la torreta y la élite tienen ojo o lente emisivo; los disparos enemigos son carmesí claro #ff5a4a.
6. Caché de geometrías y materiales por tipo, pool de efectos y trazador con buffer fijo (líneas 805, 1091, 1100 y 1159). Criterio: `renderer.info.memory.geometries` no cambia durante una oleada completa.
7. Ceniza, nieve y brasas en `Points`, un draw call por sector. Criterio: entre 300 y 600 puntos por sector, visibles en la captura, sin sumar más de un draw call por sector.
8. Trauma de cámara al disparar y al recibir daño, aplicado después de `actualizarCamara` (línea 1836). Criterio: el offset no cambia `jugador.yaw` ni `jugador.pitch` (comparar antes y después), y el trauma baja a 0 en 2 s desde 1.
9. HUD: panel de fondo en textos y mira bicolor. Criterio: texto de 4,5:1 o más, y mira de 3:1 o más frente a nieve, comprobado en captura.

P2: deseable.

10. Halos aditivos con T4 en el ojo del Coloso, en los ojos de drones de S1 y en los paneles de S3, y pool de 8 destellos de boca. Criterio: 40 sprites visibles como máximo; FPS no más de 15 % por debajo de la línea base.
11. Texturas T1, T2 y T2d en suelos y paredes. Criterio: la desviación típica de la luminancia del suelo de S2 es de 6 o más (escala 0 a 255), sin repetición visible de manchas.
12. Humo de forja con planos, 24 como máximo por sector. Criterio: no más de 24 draw calls adicionales y FPS dentro del 15 %.
13. Marcas de impacto (pool de 48) y chispas de metal (`InstancedMesh` de 64). Criterio: el número de objetos no crece con impactos sucesivos.
14. FOV: sprint con Shift y vertical en móvil (líneas 680 y 1518). Criterio: con aspecto 1:2, el horizontal es de 53° o más; al parar de correr el FOV vuelve al valor base en 0,3 s.
15. Patada direccional al recibir daño, y retroceso con muelle. Criterio: roll y pitch vuelven a 0 en 0,5 s; tras 10 disparos seguidos de escopeta, el retroceso no pasa de 6°. [propuesta]
16. Reducción de movimiento y tope de 3 destellos por segundo en la viñeta. Criterio: con la preferencia activa, la amplitud del trauma es 30 % o menos de la normal, y el número de pulsos por segundo es 3 o menos.
17. Fusión de estáticos por sector y antialias según el pixel ratio. Criterio: un `Mesh` por material y sector, y los draw calls estáticos bajan a la mitad o menos (medido con `renderer.info.render.calls`).
18. Sombra de mancha T5 bajo los enemigos. Criterio: un draw call por tipo de mancha, y ninguna sombra de la luz principal.
19. Formas: `flatShading` en chatarra y `LatheGeometry` en torreta y élite. Criterio: la silueta de torreta y élite se reconoce en vista de perfil.
20. Grietas T3 en el hielo de S1. Criterio: sin parpadeo en dos posiciones de cámara.

P3: después.

21. Normal map N1 en hielo y chatarra. Criterio: con luz rasante se ve relieve, y el signo está verificado.
22. `onBeforeCompile` para variación fina de rugosidad. Criterio: un programa extra por material modificado, sin regresión de FPS mayor al 15 %.
23. `MeshPhysicalMaterial` con `clearcoat` en el hielo, sin `transmission`. Criterio: 3 materiales físicos o menos por escena.
24. `InstancedMesh` para las oleadas. Criterio: draw calls de enemigos de un máximo de uno por tipo y pieza.
25. LOD del Coloso. Criterio: a 40 m se usa la malla de 12 × 9.
26. Niebla de altura con `ShaderMaterial` propio. Criterio: su coste medido es 10 % o menos del fotograma.
27. Sombra direccional real. Criterio: solo si el fotograma sin sombra deja margen; si añade más de 20 % del tiempo de fotograma en SwiftShader, se descarta.

## Criterios medibles

Método: capturas en `docs/ceniza/capturas/` con la misma posición de cámara antes y después de cada cambio. El modo de prueba (`control.vista()`, solo lectura) da las posiciones de enemigos para calcular distancias. Las cifras de SwiftShader son relativas a una línea base tomada en el mismo equipo.

1. Contraste de valor del enemigo a 20 m: 3:1 o más frente a la niebla de su sector (luminancia relativa medida en la captura).
2. Niebla en el horizonte: en la captura de S1, el píxel medio de la franja del horizonte coincide con el color de la niebla ±6 por canal.
3. Recorte: porcentaje de píxeles con los tres canales en 250 o más, 1 % o menos en S1 a S3 y 3 % o menos en la arena.
4. Luminancia media del 60 % central de cada captura de sector: entre 35 y 110 en escala 0 a 255. [propuesta; evita pasillos negros o planos]
5. Contraste de la mira: 3:1 o más frente a nieve #dce4ec en el peor píxel del contorno.
6. Contraste del texto del HUD: 4,5:1 o más (#eef3f8 sobre panel al 60 % sobre blanco puro, 5,1:1 [cálculo]).
7. Luces: exactamente 4 en cada sector (contar las luces de la escena en el modo de prueba).
8. Draw calls: 120 o menos en el peor fotograma de cada sector (`renderer.info.render.calls`).
9. Recursos: `renderer.info.memory.geometries`, `materials` y `textures` constantes durante una oleada completa.
10. Programas: `renderer.info.programs.length` constante tras el primer fotograma de cada sector.
11. Sprites aditivos visibles: 40 o menos.
12. FPS en Chromium con SwiftShader, a 960 × 540 y pixel ratio 1: no más de 15 % por debajo de la línea base del mismo punto de la misma oleada.
13. Viñeta: 3 cambios de luminancia por segundo o menos (WCAG 2.3.1).
14. Reducción de movimiento: amplitud del trauma de 30 % o menos con la preferencia activa (emulada).

## Fuentes

Documentación y código oficial de three.js r160:
- https://threejs.org/docs/pages/FogExp2.html
- https://threejs.org/docs/pages/Fog.html
- https://threejs.org/docs/pages/HemisphereLight.html
- https://threejs.org/docs/pages/WebGLRenderer.html
- https://threejs.org/docs/pages/MeshStandardMaterial.html
- https://threejs.org/docs/pages/MeshPhysicalMaterial.html
- https://threejs.org/docs/pages/Material.html
- https://threejs.org/docs/pages/PointsMaterial.html
- https://threejs.org/docs/pages/SpriteMaterial.html
- https://threejs.org/docs/pages/InstancedMesh.html
- https://threejs.org/docs/pages/LatheGeometry.html
- https://threejs.org/docs/pages/CanvasTexture.html
- https://threejs.org/docs/pages/LOD.html
- https://cdn.jsdelivr.net/npm/three@0.160.0/src/renderers/shaders/ShaderChunk/fog_fragment.glsl.js
- https://cdn.jsdelivr.net/npm/three@0.160.0/src/lights/LightShadow.js
- https://cdn.jsdelivr.net/npm/three@0.160.0/src/lights/DirectionalLightShadow.js
- https://raw.githubusercontent.com/mrdoob/three.js/r160/examples/jsm/utils/BufferGeometryUtils.js

Guías, artículos y fuentes secundarias:
- https://developer.valvesoftware.com/wiki/Fog_tutorial
- https://unity.com/blog/how-to-create-atmospheric-environments-on-a-budget (otro motor; solo cualitativo)
- https://www.blog.radiator.debacle.us/2018/03/gdc-2018-how-to-light-level-slides-and.html?m=1
- https://www.blog.radiator.debacle.us/2015/03/lighting-theory-for-3d-games-part-2.html
- https://discourse.threejs.org/t/how-to-optimize-shadow-rendering-in-three-js-for-better-performance/64681
- https://discourse.threejs.org/t/acesfilmictonemapping-leading-to-low-contrast-textures/15484
- https://discourse.threejs.org/t/three-points-glowing-effect-neon/1193
- https://discourse.threejs.org/t/changing-pixelratio-based-on-fps-good-or-bad-idea/34563
- https://thebookofshaders.com/12/
- https://tympanus.net/codrops/2025/02/04/how-to-make-the-fluffiest-grass-with-three-js/
- https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices
- https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Images/Using_gradients
- https://www.donmccurdy.com/2024/04/27/emission-and-bloom/
- https://80.lv/articles/the-soul-of-low-poly-characters/
- https://blog.maximeheckel.com/posts/the-magical-world-of-particles-with-react-three-fiber-and-shaders/
- https://soledadpenades.com/articles/three-js-tutorials/rendering-snow-with-shaders/
- https://www.shanebrumback.com/tutorials/animated-white-cloud-particle-system.html
- https://www.utsubo.com/blog/threejs-best-practices-100-tips
- https://pawelnosko.com/js-frontend-tools/how-to-create-an-interactive-energy-sphere-with-three-js-complete-javascript-webgl-glsl-tutorial
- https://bevy.org/examples/camera/2d-screen-shake/
- https://sources.debian.org/src/quakespasm/0.96.3%2Bdfsg-1/Quake/view.c
- https://devforum.roblox.com/t/how-would-i-be-able-to-write-a-gun-recoil-system-using-a-spring-module/3224138
- https://www.gdquest.com/library/glossary/field_of_view
- https://medium.com/@jasper.stephenson/a-ux-analysis-of-first-person-shooter-damage-indicators-59ac9d41caf8
- https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
- https://www.w3.org/WAI/WCAG21/Understanding/non-text-contrast.html
- https://physicallybased.info/ (valor de IOR del hielo; citado en la investigación)
