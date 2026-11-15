# Vendor: three.js

| Campo | Valor |
|---|---|
| Biblioteca | three.js |
| Versión | r160 (0.160.0) |
| Archivo | `three.min.js` |
| Contenido | Build minificada en formato UMD, solo núcleo (sin addons de `examples/jsm`). Expone el global `THREE`. |
| Origen | Paquete npm `three@0.160.0`, archivo `build/three.min.js`. URL: https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js |
| Licencia | MIT, véase [LICENSE](LICENSE) (© 2010-2023 three.js authors) |
| Tamaño | 669 884 bytes |
| SHA-256 | `170c6789f43217c96b3170f4b42fafe135de7f7cd48497a4218f9757ee1d49fa` |

## Cambios locales

Ninguno. El archivo coincide byte a byte con `build/three.min.js` de `three@0.160.0`, y su SHA-256 es el del original indicado arriba.

## Aviso conocido en la primera línea

La primera línea es un `console.warn` que se ejecuta en cada carga y dice que la build `build/three.min.js` está obsoleta desde r150 y que será eliminada en r160. Ese aviso no corresponde a esta versión, porque el archivo ya es r160.

No se ha quitado la línea porque no es una sentencia independiente: forma parte de una expresión separada por coma (`console.warn(...), function(t,e){...}(...)`). Sin esa línea el archivo deja de analizarse (`SyntaxError`). Para eliminar el aviso habría que pasar a la build ES module de three.js y adaptar `docs/ceniza/shooter3d.js`, que usa el global `THREE`, y la carga de `docs/index.html` (`AV_3D`).

Para actualizar la versión, cambia esta tabla (versión, origen, tamaño y SHA-256) y el número de versión en los comentarios de `docs/ceniza/shooter3d.js`.
