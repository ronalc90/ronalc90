# Ceniza: diseño de la expansión

Estado: diseño v1 (FASE 1 en 2D y FASE 2 en 3D). Este documento es la referencia de la expansión; el contrato cerrado de la ronda es la fuente de verdad.

Notas sobre los números:

- Las fórmulas de hoja, arco, martillo, lanza, maestría y daño se leyeron de `docs/index.html`. La versión de trabajo tiene cambios sin commit de la ronda anterior (registro y reinicio desde el menú), pero las líneas de armas y daño son iguales a `HEAD`.
- Los daños por golpe usan el mismo redondeo que `strike()` del juego (`Math.round` por golpe).
- Las cifras de tiempo y de la sección 7 son cálculos sobre esas fórmulas. Las cifras de 3D y de loot son valores de diseño por calibrar en prototipo.
- En prosa y tablas los decimales van con coma. En bloques de código y en nombres de variables del juego van con punto.

## Índice

1. Vision y fantasia
2. Estructura
3. Tiempos
4. Personaje
5. Equipo
6. Armas 2D y 3D
7. Balance del arco
8. Cofres y loot
9. Personalizacion
10. Guardado, muerte y reinicio
11. Fase 3D
12. Registro y victoria
13. Criterios de aceptacion medibles

## 1 Vision y fantasia

Ceniza es un juego de exploración y combate en un mundo que se apaga. Un viajero sin nombre cruza cuatro zonas cubiertas de ceniza en 2D, enciende fogatas, forja lo que encuentra y derrota a los guardianes que protegen cada zona. Al vencer al Guardián de chatarra se abre una segunda fase en 3D, en la que el viajero sube a la cabina de un coloso.

Tono: melancólico y tenso. Restos de una civilización que intentó mantener encendida su última forja, hechos de chatarra y cristal, y un viajero que decide si los restos se apagan del todo.

Pilares:

- Exploración con regreso a la fogata: cada zona se recorre entre fogatas y el riesgo está en alejarse de ellas.
- Progresión doble: el nivel del personaje (1 a 30) y el equipo con rareza, modificadores y forja.
- Combate con patrones legibles: jefes con fases claras y oleadas de enemigos conocidos.
- Personalización del viajero que se guarda y se puede exportar.

Plataforma: un sitio estático en `docs/` para GitHub Pages. `docs/index.html` es el juego 2D actual. Los módulos nuevos van en `docs/ceniza/` y se cargan con `script src` relativo. three.js r160 va vendorizado en `docs/ceniza/vendor/three.min.js`. El juego no tiene dependencias de red.

## 2 Estructura

### 2.1 Fases

| Fase | Contenido | Cómo se entra | Cómo se gana |
|---|---|---|---|
| FASE 1 (2D, plataformas) | Z1 a Z4, 12 salas en total | Inicio de partida | Derrotar al Guardián de chatarra (jefe X) |
| FASE 2 (3D, disparos) | Sectores S1, S2, S3 y Coloso final | Tras derrotar al jefe X | Derrotar al Coloso final (victoria) |

### 2.2 Zonas

Cada zona tiene 3 salas enlazadas por puertas, 1 fogata (guardado, curación y forja), 2 a 4 cofres, 1 secreto opcional y un jefe al final.

| Zona | Nombre | Salas | Fogata | Cofres | Secreto | Jefe final |
|---|---|---|---|---|---|---|
| Z1 | Duna tibia | Z1.1, Z1.2, Z1.3 | 1 | 2 a 4 | 1 | Guardián de duna |
| Z2 | Ciudad de cristal | Z2.1, Z2.2, Z2.3 | 1 | 2 a 4 | 1 | Centinela de cristal |
| Z3 | Fundición de lava | Z3.1, Z3.2, Z3.3 | 1 | 2 a 4 | 1 | El Forjador (ya existe en el juego actual) |
| Z4 | Bosque de chatarra | Z4.1, Z4.2, Z4.3 | 1 | 2 a 4 | 1 | Guardián de chatarra (jefe X) |

### 2.3 Sectores de FASE 2 (3D)

| Sector | Nombre | Tipo de combate |
|---|---|---|
| S1 | Pasillo de hielo | Oleadas de drones |
| S2 | Taller de drones | Oleadas de drones y torretas |
| S3 | Cabina del coloso | Oleadas de élite |
| Final | Coloso final | Arena 3D con 3 fases |

### 2.4 Mapa de progresión

| Paso | Requisito | Desbloquea | XP al completar |
|---|---|---|---|
| 0 | Nueva partida | Z1 y la hoja de chatarra | Ninguna |
| 1 | Guardián de duna | Z2 | 150 |
| 2 | Centinela de cristal | Z3 | 200 |
| 3 | El Forjador | Z4 | 300 |
| 4 | Guardián de chatarra (jefe X) | FASE 2 y S1 | 400 |
| 5 | Oleadas de S1, luego S2, luego S3 | Sector siguiente y Coloso final | Ninguna |
| 6 | Coloso final | Victoria | 1.000 |

Las armas 2D se compran con núcleos como hoy: arco 100, martillo 220 y lanza 400 (valores base del árbol actual). Las armas 3D se entregan al entrar a su sector.

## 3 Tiempos

### 3.1 FASE 2D por zona (minutos de referencia, velocidad 1.0)

| Zona | Salas (3) | Fogata y cofres | Jefe | Total |
|---|---|---|---|---|
| Z1 Duna tibia | 9 | 2 | 5 (Guardián de duna) | 16 |
| Z2 Ciudad de cristal | 12 | 3 | 5 (Centinela de cristal) | 20 |
| Z3 Fundición de lava | 12 | 3 | 7 (El Forjador) | 22 |
| Z4 Bosque de chatarra | 12 | 4 | 8 (Guardián de chatarra, jefe X) | 24 |
| **Subtotal FASE 2D** | **45** | **12** | **25** | **82** |

### 3.2 FASE 3D por sector (minutos de referencia, velocidad 1.0)

| Sector | Oleadas o combate | Extras (avance, torretas) | Total |
|---|---|---|---|
| S1 Pasillo de hielo | 9 (3 oleadas de 3) | 3 (avance) | 12 |
| S2 Taller de drones | 9 (3 oleadas de 3) | 5 (torretas 3, avance 2) | 14 |
| S3 Cabina del coloso | 8 (2 oleadas de élite de 4) | 4 (avance) | 12 |
| Coloso final | 10 (3 + 3,5 + 3,5 por fase) | 0 | 10 |
| **Subtotal FASE 3D** | **36** | **12** | **48** |

### 3.3 Total

- FASE 2D (82) más FASE 3D (48) dan **130 minutos de referencia**.
- Mínimo exigido: 120 minutos. El margen es de 10 minutos, un 7,7 % sobre 130.
- Los secretos y la forja son opcionales y no entran en el total.
- Las muertes no entran en el total: la tabla supone una partida sin morir.

### 3.4 Método de medición

1. El tiempo es de simulación, no de reloj de pared. La pausa (Escape o P) no cuenta. Las animaciones de cofre y los diálogos sí cuentan.
2. Ruta de referencia: lista fija de salas, cofres, puertas y jefes, sin secretos, sin forja y sin respec.
3. En 2D, `window.__ceniza.step(n)` avanza la simulación `n` fotogramas de 1/60 s y ya existe en `docs/index.html`. En 3D se expondrá un gancho equivalente.
4. Se marca el tiempo al cruzar cada puerta y al derrotar a cada jefe. Con esas marcas se obtiene el tiempo por zona y sector.
5. Aceptación: 3 repeticiones. El total medido debe ser de al menos 120 minutos y cada zona o sector debe quedar dentro de ±10 % de su tabla.

### 3.5 Advertencia

El tiempo humano varía. Explorar secretos, leer textos, repetir patrones de jefe o morir cambia mucho el resultado. Como estimación orientativa, no medida, el tiempo de una persona jugadora podría estar entre 0,75 y 1,5 veces la referencia, es decir, entre 98 y 195 minutos. La tabla es un objetivo de diseño y no una garantía. Los 120 minutos se miden sobre la ruta de referencia, no sobre jugadores reales.

## 4 Personaje

### 4.1 Nivel y XP

- Niveles de 1 a 30. El nivel 1 empieza con 0 XP.
- Lectura adoptada: el umbral de XP total para llegar al nivel n es `round(40 * n^1.6)`. Es un total acumulado.
- Cada nivel nuevo da 3 puntos de atributo.

| Nivel | XP total para llegar | XP desde el nivel anterior |
|---:|---:|---:|
| 1 | 0 | - |
| 2 | 121 | 121 |
| 3 | 232 | 111 |
| 4 | 368 | 136 |
| 5 | 525 | 157 |
| 6 | 703 | 178 |
| 7 | 900 | 197 |
| 8 | 1.114 | 214 |
| 9 | 1.345 | 231 |
| 10 | 1.592 | 247 |
| 11 | 1.855 | 263 |
| 12 | 2.132 | 277 |
| 13 | 2.423 | 291 |
| 14 | 2.728 | 305 |
| 15 | 3.047 | 319 |
| 16 | 3.378 | 331 |
| 17 | 3.722 | 344 |
| 18 | 4.078 | 356 |
| 19 | 4.447 | 369 |
| 20 | 4.827 | 380 |
| 21 | 5.219 | 392 |
| 22 | 5.623 | 404 |
| 23 | 6.037 | 414 |
| 24 | 6.462 | 425 |
| 25 | 6.899 | 437 |
| 26 | 7.345 | 446 |
| 27 | 7.803 | 458 |
| 28 | 8.270 | 467 |
| 29 | 8.748 | 478 |
| 30 | 9.235 | 487 |

Fuentes de XP del contrato: enemigo común 5, élite 10, cofre común 30, cofre raro 75, cofre de jefe 120, jefe de zona 150 (Z1), 200 (Z2), 300 (Z3) y 400 (Z4), Coloso final 1.000.

Consecuencia de la lectura adoptada: llegar al nivel 30 necesita 9.235 XP, que equivalen a unos 1.847 enemigos comunes. Los jefes de zona y el Coloso final suman 2.050 XP fijos.

Lectura no adoptada, que debe confirmar el dueño: si la curva fuera incremental (cada nivel cuesta `40 * n^1.6`), el total para llegar al nivel 30 sería 111.178 XP, unos 22.236 enemigos comunes. Con las fuentes del contrato eso es inalcanzable en 130 minutos. Ver la decisión D1 en la sección 13.

### 4.2 Atributos

| Atributo | Efecto por punto | Notas |
|---|---|---|
| Vida | +8 HP | Base de 100 HP (propuesta, decisión D4) |
| Daño | +3 % de daño | Se multiplica con el resto de fuentes de daño |
| Armadura | +2 % de reducción del daño recibido | Tope total propuesto de 60 % (decisión D2) |
| Velocidad | +2 % de velocidad de movimiento | |
| Suerte | +3 % de probabilidad de rareza alta | Ver sección 8.3 |

- Total de puntos al nivel 30: 29 subidas por 3 = **87 puntos**.
- Sin tope por atributo en esta fase (decisión D3).
- Los bonos de fuentes distintas se multiplican entre sí. Dentro de una misma fuente se suman.
- La vida pasa de contar vidas, como hoy, a contar HP en la expansión.

### 4.3 Respec

- Se paga en una fogata con **200 núcleos**. El costo es fijo y no depende del nivel.
- Devuelve todos los puntos de atributo para repartirlos de nuevo. No cambia el nivel ni la XP.
- Si no hay núcleos suficientes, la opción aparece deshabilitada.

## 5 Equipo

### 5.1 Ranuras

Hay 7 ranuras: arma, casco, pecho, piernas, botas, accesorio 1 y accesorio 2. La ranura **arma** no contiene el arma. Sus modificadores se aplican al arma activa, sea 2D o 3D.

### 5.2 Rarezas

| Rareza | Color | Modificadores |
|---|---|---|
| Común | Gris (#8a8a8a) | 1 |
| Poco común | Verde (#5cb85c) | 2 |
| Raro | Azul (#4a90d9) | 2 |
| Épico | Morado (#9b59b6) | 3 |
| Legendario | Naranja (#e67e22) | 3 |

### 5.3 Modificadores

Cada pieza tiene un número de modificadores según su rareza. No se repite el mismo tipo en una pieza.

| Modificador | Rango base | Unidad |
|---|---|---|
| Vida | 2 a 6 | HP |
| Daño | 2 a 6 | % |
| Armadura | 1 a 4 | % de reducción |
| Velocidad | 1 a 4 | % |
| Suerte | 1 a 3 | puntos |
| Núcleos | 5 a 15 | % de núcleos obtenidos |
| Chatarra | 5 a 15 | % de chatarra obtenida |

Escala por zona: `valor = round(rango * (1 + 0,2 * (zona - 1)))`. En Z4 el multiplicador es 1,6. Por ejemplo, vida en Z4 va de 3 a 10 HP.

### 5.4 Sets

- **Set Chatarra** (3 piezas): +10 % de daño.
- **Set Cristal** (3 piezas): +15 HP.
- Una pieza pertenece a un solo set. El bono se aplica una vez por set. Tener 4 a 6 piezas no suma más.

### 5.5 Forja

- En una fogata, cada pieza sube de +0 a +5.
- Costo en chatarra para subir de nivel `k` a `k+1`: `round(5 * (k + 1)^1.5)`.
- Propuesta de efecto: cada nivel de forja multiplica los modificadores de la pieza por `1 + 0,10 * nivel`. Así +5 da ×1,5.

| Subida | Valor exacto | Costo (chatarra) | Acumulado |
|---|---:|---:|---:|
| +0 a +1 | 5,000 | 5 | 5 |
| +1 a +2 | 14,142 | 14 | 19 |
| +2 a +3 | 25,981 | 26 | 45 |
| +3 a +4 | 40,000 | 40 | 85 |
| +4 a +5 | 55,902 | 56 | 141 |

Cada pieza cuesta 141 chatarra de +0 a +5. Llevar las 7 ranuras a +5 cuesta 987 chatarra.

## 6 Armas 2D y 3D

### 6.1 Armas 2D

Valores del juego actual, con maestría 0, sin filo, sin crítico y en un solo objetivo. El DPS es la suma de daños entre cadencia.

| Arma | Golpe o proyectil | Daño base | Cadencia (s) | Alcance | DPS de referencia | Notas |
|---|---|---:|---:|---|---:|---|
| Hoja | Golpes 1 y 2 | 14 | 0,25 | 70 px (+20 % por maestría) | - | Combo de 3 golpes |
| Hoja | Golpe 3 | 22 | 0,42 | 86 px (+20 % por maestría) | - | Lanza la onda |
| Hoja | Onda del golpe 3 | 13 | Sale en el golpe 3 | Viaja a 640 px/s durante 0,42 s (≈269 px), perfora | - | Un impacto por objetivo. Desvía balas |
| Hoja | Ciclo completo | 63 por ciclo de 0,92 s | - | - | **68,5** | Sin la onda, 50 por ciclo y DPS 54,3 |
| Arco | Flecha | 9 | 0,23 | Apunta a 640 px; vuela a 980 px/s durante 0,8 s | **39,1** | Ráfaga de 1 + min(maestría, 2) flechas. Perfora en maestría 3 |
| Martillo | Golpe de suelo | 28 | 0,72 | Radio 84 px (+25 % por maestría) | **38,9** | Dos ondas de 12 que viajan a 470 px/s |
| Martillo | Caída (en el aire) | 42 | 0,90 | Radio 120 px | - | Dos ondas de 18 |
| Lanza | Rayo | 16 | 0,46 | 240 px (+10 % por maestría) | **34,8** | Cadena de 2 + maestría saltos a 210 px, con 60 % del daño |

### 6.2 Armas 3D

Valores de diseño, por calibrar en prototipo.

| Arma | Tecla | Sector de entrega | Daño | Cadencia (s) | Alcance | DPS directo de referencia | Notas |
|---|---|---|---|---:|---|---:|---|
| Rifle | 1 | S1 | 18 por disparo | 0,20 | 60 u | 90,0 | Impacto instantáneo |
| Escopeta | 2 | S2 | 8 perdigones de 10 | 0,90 | 14 u efectivos | 88,9 si impactan los 8 | Dispersión; más daño de cerca |
| Plasma | 3 | S3 | 45 directo y 20 de área (radio 2 u) | 0,60 | 50 u | 75,0 directo | Calibra la referencia de los jefes 3D |

Las armas se cambian con las teclas 1, 2 y 3. Cada arma se conserva al cambiar, y el cambio no cuesta tiempo.

## 7 Balance del arco

### 7.1 Requisito y supuestos

Requisito del dueño: el arco nunca debe superar el 95 % del DPS de la hoja con el mismo nivel de maestría. La limitación se aplica al multidisparo por maestría. El daño base por flecha no cambia.

Supuestos del cálculo:

- Ambas armas tienen el mismo nivel de maestría `m` (0 a 3).
- Un objetivo fijo a distancia suficiente. Todas las flechas de la ráfaga impactan. Es la cota superior del arco, así que es el caso más exigente.
- Filo 0, sin buffs y sin crítico. El crítico multiplica a las dos armas por igual, así que la razón no cambia. La cadencia base usa `spd = 1`.
- Daño por golpe redondeado como en el juego: `round(base * P(m))`.
- Ciclo continuo. La cuantización por fotogramas se revisa en 7.5.

### 7.2 Fórmulas

Multiplicador de daño, tomado de `P.dmg` con filo 0 y sin buffs:

```
P(m) = 1 + 0.1 * m
```

Hoja. Los golpes son `b = {14, 14, 22, 13}`, donde 13 es la onda. El ciclo dura `T_h = 0.25 + 0.25 + 0.42 = 0.92` s:

```
DPS_hoja(m) = ( round(14*P) + round(14*P) + round(22*P) + round(13*P) ) / 0.92
```

Arco. Cada flecha vale `b_a = 9` y el número de flechas por ráfaga es `n(m) = 1 + min(m, 2)`, igual que hoy:

```
DPS_arco(m) = n(m) * round(9*P(m)) / cd(m)
```

Límite del multidisparo. La limitación fija el cooldown mínimo de la ráfaga, que es el espaciado de la ráfaga:

```
cd(m) = max( 0.23 ; techo3( n(m) * round(9*P(m)) / (0.95 * DPS_hoja(m)) ) )
```

`techo3` redondea hacia arriba a 3 decimales. Con velocidad de cadencia `spd`, el cooldown real es `cd(m) / spd`. Como la hoja y el arco se dividen por el mismo `spd`, la razón no cambia.

Garantía: `DPS_arco(m) <= 0.95 * DPS_hoja(m)` para `m = 0..3`.

Por qué el tope va en el cooldown y no en el número de flechas. Si se limitara `n`, con cooldown 0.23 el número máximo sería `floor(0.95 * DPS_hoja(m) * 0.23 / round(9*P(m)))`. Los valores exactos son 1,66, 1,62, 1,64 y 1,62 para m = 0 a 3. El resultado es 1 flecha en todos los niveles, es decir, el multidisparo desaparecería. Por eso el tope se aplica al espaciado de la ráfaga y `n(m)` se conserva.

### 7.3 Tabla de DPS por maestría

Hoja (un objetivo, ciclo de 0,92 s):

| Maestría m | P(m) | Golpes 1, 2, 3 y onda | Daño por ciclo | DPS hoja | Tope del arco (95 %) |
|---:|---:|---|---:|---:|---:|
| 0 | 1,00 | 14, 14, 22, 13 | 63 | 68,48 | 65,05 |
| 1 | 1,10 | 15, 15, 24, 14 | 68 | 73,91 | 70,22 |
| 2 | 1,20 | 17, 17, 26, 16 | 76 | 82,61 | 78,48 |
| 3 | 1,30 | 18, 18, 29, 17 | 82 | 89,13 | 84,67 |

Arco (un objetivo, flecha de 9 base):

| Maestría m | Flechas n | Daño por flecha | Cooldown actual | DPS actual | % de la hoja, actual | Cooldown con tope | DPS con tope | % de la hoja, con tope |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 | 1 | 9 | 0,230 | 39,13 | 57,1 % | 0,230 | 39,13 | 57,1 % |
| 1 | 2 | 10 | 0,230 | 86,96 | **117,6 %** | 0,285 | 70,18 | 94,9 % |
| 2 | 3 | 11 | 0,230 | 143,48 | **173,7 %** | 0,421 | 78,38 | 94,9 % |
| 3 | 3 | 12 | 0,230 | 156,52 | **175,6 %** | 0,426 | 84,51 | 94,8 % |

El arco actual supera el 95 % desde la maestría 1. Con el tope, todos los niveles quedan por debajo del 95 %. Hay un margen mínimo en m = 1 (0,06 puntos). La verificación de 7.5 es necesaria.

### 7.4 Sensibilidad

Si la onda de la hoja no contara y solo se usaran los golpes cuerpo a cuerpo, la hoja daría 54,35, 58,70, 65,22 y 70,65 DPS. El tope quedaría en cooldowns de 0,359, 0,533 y 0,537 para m = 1, 2 y 3. El DPS del arco sería 55,71, 61,91 y 67,04, que siguen en 94,9 % de la hoja. Se recomienda contar la onda, porque es daño real contra un objetivo al frente. La versión sin onda queda como margen de seguridad (decisión D5).

### 7.5 Cuantización por fotogramas

En el juego, los cooldowns se descuentan por fotograma. Un ataque sale en el primer fotograma en que el cooldown llega a 0 o menos. Con 60 Hz, cada cooldown se redondea hacia arriba al fotograma: 0,230 pasa a 0,2333; 0,285 pasa a 0,300; 0,421 y 0,426 pasan a 0,4333. La hoja con 0,42 pasa a 0,4333.

| Frecuencia | Hoja m = 0 a 3 | Arco con tope, % de la hoja (m = 0 a 3) |
|---|---|---|
| Ideal (continuo) | 68,48 / 73,91 / 82,61 / 89,13 | 57,1 / 94,9 / 94,9 / 94,8 |
| 60 Hz | 67,50 / 72,86 / 81,43 / 87,86 | 57,1 / 91,5 / 93,5 / 94,6 |
| 120 Hz | 68,11 / 73,51 / 82,16 / 88,65 | 56,6 / 93,3 / 94,5 / 93,7 |

El tope se cumple a 60 y 120 Hz. Debe verificarse en el juego con `window.__ceniza.step(n)` sobre la ruta de referencia (ver CA-03).

## 8 Cofres y loot

### 8.1 Tipos de cofre

| Tipo | XP | Equipo | Núcleos | Chatarra | Consumible |
|---|---:|---|---|---|---|
| Común | 30 | Pieza con probabilidad de 40 % | 20 a 40 | 10 a 20 | 25 % (curación o bomba) |
| Raro | 75 | Pieza con probabilidad de 75 % | 60 a 100 | 30 a 50 | 40 % |
| De jefe | 120 | Pieza siempre; rareza mínima poco común | 150 a 250 | 60 a 100 | 1 garantizado |

Consumibles:

- Curación: +40 % del HP máximo.
- Bomba: 60 de daño en radio de 96 px (2D) o de 2 u (3D).

Un cofre abierto queda abierto en el progreso. Cada zona tiene de 2 a 4 cofres, y el cofre de jefe aparece al derrotar al jefe.

### 8.2 Probabilidad de rareza por tipo y zona (suerte 0)

Pesos en porcentaje. La rareza sube con la zona.

| Tipo de cofre | Zona | Común | Poco común | Raro | Épico | Legendario |
|---|---|---:|---:|---:|---:|---:|
| Común | Z1 | 70 | 25 | 5 | 0 | 0 |
| Común | Z2 | 50 | 36 | 11 | 3 | 0 |
| Común | Z3 | 35 | 40 | 19 | 5 | 1 |
| Común | Z4 | 25 | 40 | 25 | 8 | 2 |
| Raro | Z1 | 40 | 40 | 16 | 4 | 0 |
| Raro | Z2 | 25 | 40 | 27 | 7 | 1 |
| Raro | Z3 | 15 | 35 | 33 | 13 | 4 |
| Raro | Z4 | 10 | 30 | 35 | 18 | 7 |
| De jefe | Z1 | 0 | 60 | 32 | 7 | 1 |
| De jefe | Z2 | 0 | 40 | 42 | 15 | 3 |
| De jefe | Z3 | 0 | 25 | 44 | 23 | 8 |
| De jefe | Z4 | 0 | 15 | 40 | 30 | 15 |

### 8.3 Efecto de la suerte

Los pesos de raro, épico y legendario se multiplican por `(1 + 0,03 * suerte)`. Después se normalizan los pesos. Así la suerte sube la probabilidad de rareza alta en un 3 % relativo por punto.

Probabilidad de rareza alta (raro, épico o legendario):

| Cofre y zona | Suerte 0 | Suerte 10 |
|---|---:|---:|
| Común Z4 | 35,0 % | 41,2 % |
| Raro Z1 | 20,0 % | 24,5 % |
| Raro Z4 | 60,0 % | 66,1 % |
| De jefe Z1 | 40,0 % | 46,4 % |
| De jefe Z4 | 85,0 % | 88,0 % |

## 9 Personalizacion

### 9.1 Opciones

| Parte | Opciones |
|---|---|
| Traje | 8 colores preset: ceniza, arena, óxido, cobalto, musgo, cristal, carmesí y ámbar. Tono de 0 a 345 en pasos de 15. Brillo de −20 a +20 en pasos de 5 |
| Visor | 5 colores: ámbar, cian, carmesí, violeta y blanco |
| Casco | 4 estilos |
| Capa | Color (8 preset) y activa o inactiva |
| Emblema | 8 iconos |
| Patrón del traje | 3: liso, rayas y celdas |
| Nombre de viajero | Máximo 12 caracteres: letras (con tildes y ñ), números y espacios. Se recortan los espacios de los extremos y se colapsan los dobles |

La personalización es solo visual. No cambia atributos ni estadísticas.

### 9.2 Persistencia

- Clave de localStorage: `ceniza.personaje.v1`. Contiene un objeto JSON con el campo `v: 1`.
- Se guarda en cada cambio y se lee al iniciar. Si el dato no es válido, se usan los valores por defecto y se avisa, sin fallar.
- Todas las lecturas y escrituras van dentro de `try/catch`. Si el almacenamiento no está disponible, el juego sigue, pero la personalización no persiste.

### 9.3 Formato de exportación

La cadena de exportación tiene esta forma:

```
CENIZA1.<base64 del JSON en UTF-8>.<checksum>
```

- `checksum` son 8 dígitos hexadecimales: FNV-1a de 32 bits sobre la parte base64.
- El JSON tiene estas claves: `v`, `traje` (con `color`, `tono` y `brillo`), `visor`, `casco`, `capa` (con `color` y `on`), `emblema`, `patron` y `nombre`.
- Al importar se valida el prefijo, el checksum, la base64, el JSON, los rangos, los tipos y la longitud del nombre. Si algo falla, no cambia nada y se muestra el motivo.

## 10 Guardado, muerte y reinicio

### 10.1 Guardado

Encender una fogata hace cuatro cosas: consolida los núcleos, guarda el progreso, restaura el HP al máximo y abre la forja y el respec.

Se guarda:

- Zona, sala y fogata activa.
- Cofres abiertos, jefes derrotados y secretos encontrados.
- Equipo, forja y atributos.
- Nivel, XP, núcleos y chatarra.

Claves propuestas: `ceniza.progreso.v1` para el mundo (cofres, jefes, fogatas) y `ceniza.run.v1` para la partida en curso. La clave `ceniza.personaje.v1` queda como en el contrato.

### 10.2 Muerte

- Al morir, el viajero vuelve a la última fogata con el HP al máximo.
- Los núcleos se consolidan al cruzar una puerta y al encender una fogata. Los núcleos de la sala actual que no se han consolidado se pierden.
- La chatarra no se pierde al morir.
- Los cofres abiertos quedan abiertos. Los jefes derrotados quedan derrotados. Los enemigos de las salas reaparecen.
- La muerte cuenta en las estadísticas de la partida.

### 10.3 Reinicio

- REINICIAR PROGRESO borra el progreso, el personaje (incluida la personalización `ceniza.personaje.v1`), los cofres, el equipo y la partida en curso.
- Es una doble pulsación. La primera muestra el aviso "¿Seguro?" durante 3 s y la segunda borra. Es el mismo mecanismo que ya existe en el menú principal.
- Antes de borrar se recomienda mostrar un aviso para exportar la personalización. El aviso no bloquea el reinicio.

## 11 Fase 3D

### 11.1 Sectores

| Sector | Escenario | Enemigos | Oleadas | Arma entregada | Tiempo (min) |
|---|---|---|---|---|---:|
| S1 Pasillo de hielo | Pasillo lineal de 3 tramos | Dron explorador, dron de asalto | 3 oleadas: 4 exploradores; 4 exploradores y 2 de asalto; 6 de asalto y 2 exploradores | Rifle | 12 |
| S2 Taller de drones | 3 tramos con 2 torretas | Explorador, asalto, torreta | 3 oleadas y 2 torretas | Escopeta | 14 |
| S3 Cabina del coloso | Cabina estrecha de 2 tramos | Guardián de cabina (élite), asalto | 2 oleadas de élite: 1 élite y 3 de asalto; 2 élites y 4 de asalto | Plasma | 12 |

Entrada a cada sector: S1 se abre al derrotar al jefe X. S2 se abre al terminar las oleadas de S1. S3 se abre al terminar S2. El Coloso final se abre al terminar S3. Una oleada termina cuando todos sus enemigos mueren.

### 11.2 Enemigos

| Enemigo | PV | Ataque | XP |
|---|---:|---|---:|
| Dron explorador | 40 | Disparo de 8 cada 2,5 s | 5 |
| Dron de asalto | 90 | Embestida de 15 | 5 |
| Torreta | 150 | Ráfaga de 3 de 10 cada 2 s, fija | 10 |
| Guardián de cabina (élite) | 400, más escudo de 150 que absorbe primero | Golpe de 25 y carga | 10 |

### 11.3 Coloso final en 3 fases

| Fase | Duración objetivo (min) | PV | Patrón | Ventana de daño |
|---|---:|---:|---|---|
| 1 Ojo expuesto | 3 | 6.000 | Barrido de 3 disparos y cañón de pulso | Tras cada ráfaga |
| 2 Brazos | 3,5 | 7.000 | Brazos que cubren el ojo y misiles guiados | Al romper cada brazo |
| 3 Núcleo | 3,5 | 7.000 | Velocidad ×1,25 y ataques combinados | Núcleo expuesto todo el tiempo |

Calibración de los PV con la referencia del plasma: `PV = DPS_ref * uptime * t_combate`.

- DPS de referencia: 75,0 (plasma directo).
- Uptime supuesto: 0,5 (decisión D7).
- DPS efectivo: 37,5.
- Fase 1: 6.000 / 37,5 = 160 s, es decir 2,7 min de combate dentro de 3 min.
- Fase 2: 7.000 / 37,5 = 187 s, es decir 3,1 min dentro de 3,5 min.
- Fase 3: 7.000 / 37,5 = 187 s, es decir 3,1 min dentro de 3,5 min.
- Total: 533 s, es decir 8,9 min de combate dentro de 10 min.

El Coloso final da 1.000 XP.

## 12 Registro y victoria

- El botón **Registrar en mi perfil** ya existe. Aparece al terminar la partida, sea por victoria o por caída, tras 0,9 s. Es un enlace nativo que abre un formulario de issue prellenado en GitHub. No registra nada por sí solo y no toca issues reales.
- Título del issue: `ceniza: victoria` o `ceniza: caida`.
- Cuerpo: `ceniza-stats: {...}` con `arma`, `jefes`, `nivel`, `victoria`, `puntos` y `segundos`.
- Propuesta de ampliación del cuerpo: fase alcanzada (2D o 3D), zona o sector, muertes y versión de guardado (`v1`).
- La victoria (`victoria: true`) solo se activa al derrotar al Coloso final. Cualquier otro final cuenta como caída.
- Esta fase no cambia el flujo de GitHub.

## 13 Criterios de aceptacion medibles

| ID | Criterio | Cómo se mide | Umbral |
|---|---|---|---|
| CA-01 | Tiempo de referencia de la tabla | Suma de la sección 3 (2D 82 + 3D 48) | ≥ 120 min (valor de diseño: 130) |
| CA-02 | Tiempo medido de la ruta de referencia | 3 repeticiones con `step(n)`, 1 fotograma = 1/60 s | ≥ 120 min; cada zona o sector dentro de ±10 % de su tabla |
| CA-03 | El arco nunca supera el 95 % de la hoja | DPS del arco contra la hoja, para m = 0 a 3, a 60 Hz y 120 Hz | ≤ 95 % en todos los casos (valores de 7.3 y 7.5) |
| CA-04 | Multidisparo con cooldown de tope | Cooldown aplicado de la ráfaga por maestría | 0,230 / 0,285 / 0,421 / 0,426; daño base de flecha = 9 |
| CA-05 | Personalización persistente | Cambiar 8 campos, recargar la página, exportar e importar | 100 % iguales; un checksum alterado se rechaza sin cambios |
| CA-06 | Nombre de viajero | Probar 12, 13 caracteres y caracteres no permitidos | Acepta hasta 12 y rechaza el resto |
| CA-07 | Umbrales de XP | Comparar con la tabla de 4.1 | Exacto para n = 2 a 30 (121 a 9.235) |
| CA-08 | Costos de forja | Comparar con la tabla de 5.5 | 5, 14, 26, 40, 56; total 141 por pieza |
| CA-09 | Respec | Intentar con menos de 200 núcleos y con 200 | Solo se ejecuta con 200 o más; devuelve todos los puntos |
| CA-10 | 3D solo tras el jefe X | Intentar entrar a S1, S2, S3 o al Coloso sin derrotar al jefe X, incluso por URL directa | Bloqueado; tras derrotar al jefe X, S1 accesible |
| CA-11 | Muerte | Morir en una sala con núcleos sin consolidar, con cofres abiertos y con jefes derrotados | Vuelve a la última fogata; pierde solo los núcleos no consolidados; lo demás persiste |
| CA-12 | Reinicio | Doble pulsación en REINICIAR PROGRESO y recarga | Primera pulsación avisa; la segunda en 3 s borra todo lo indicado |
| CA-13 | Victoria | Derrotar a cada jefe y a los sectores con finales distintos | Victoria solo tras el Coloso final |
| CA-14 | Sin red | Cargar y jugar sin conexión y revisar peticiones a otros orígenes | 0 peticiones; three.js carga desde `docs/ceniza/vendor/` |
| CA-15 | Controles | Probar teclado y táctil; pausar con Escape y P | Ambos funcionan; la pausa se activa en ambos casos |
| CA-16 | Diseño en móvil | Revisar a 390 px de ancho | Margen lateral de 16 px y sin scroll horizontal |

Decisiones pendientes del dueño:

- **D1 (XP).** La curva se leyó como total acumulado. La lectura incremental daría 111.178 XP hasta el nivel 30, inalcanzable con las fuentes del contrato. Si se quiere la incremental, la constante tendría que bajar a unos 7,2 para tener 20.000 XP acumulados.
- **D2 (armadura).** Tope propuesto de 60 % de reducción.
- **D3 (atributos).** Sin tope por atributo en esta fase.
- **D4 (HP).** Base de 100 HP y paso de vidas a HP.
- **D5 (onda).** La onda de la hoja cuenta en el DPS de referencia. Sin ella, el tope cambia como se indica en 7.4.
- **D6 (cuantización).** El tope se mantiene a 60 y 120 Hz. Si el código cambia cómo se descuentan los cooldowns, hay que repetir la verificación de 7.5.
- **D7 (uptime del coloso).** Se supuso 0,5 para calibrar los PV del Coloso final.
- **D8 (forja).** El efecto `1 + 0,10 * nivel` es una propuesta.
