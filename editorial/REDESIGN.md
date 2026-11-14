# Marlo Games — Playful Editorial + Cozy Colorful

Revisión del 17 de octubre de 2026. **Publicada con autorización explícita del usuario**. Ver docs/DEPLOYMENT-2026-10-17.md para versión, respaldo y verificaciones.

## Auditoría y dirección de arte

La versión anterior dependía de una ilustración CSS genérica, mucho espacio neutro, tipografía contenida y una ficha con imágenes sueltas. El checkout y el administrador ya tenían lógica funcional; el rediseño se concentra en presentación y recorrido, conservando la validación del servidor.

La primera revisión editorial se ajustó a la nueva dirección solicitada: coral, mostaza, calabaza, menta, crema y negro cálido; Fraunces para títulos y DM Sans para lectura, servidas desde el propio sitio. Hero con composición asimétrica de cartas auténticas, piezas gráficas inspiradas en fichas, botones con relieve, bloques de color y movimientos breves. Se respeta `prefers-reduced-motion`.

La home pertenece a la editorial. La ficha navideña tiene rojo, verde, patrón discreto y galería propia, manteniendo header, carrito y checkout comunes. No se generaron fotografías de caja ni se alteró el arte original. Ver ASSETS.md y ASSETS-INTERCAMBIO.md.

## Producto y datos

- Intercambio Navideño, `/juegos/intercambio-navideno`, precio 25900 centavos = **$259 MXN**.
- Migración preparada `0002_intercambio_navideno.sql`, aplicada **solo a D1 local**. Estado final: `coming_soon`, stock 0, peso/medidas 0 (pendientes, no reales).
- La migración conserva ID, SKU e inventario si encuentra el producto anterior; no reescribe pedidos históricos. Un nuevo registro usa el SKU administrativo provisional `MG-IN-001`.
- Si una base contiene simultáneamente los dos slugs, la restricción única detiene la migración: resolver la duplicidad antes de publicar, sin borrar registros.
- Los nombres comerciales antiguos se normalizan para mostrar pedidos y correos; los identificadores históricos permanecen intactos.
- Redirección 301 de `/juegos/xmas-xchange` y su variante con barra final; conserva query. El cliente también resuelve esa ruta en Vite.
- Canonical, descripción, Open Graph y Product JSON-LD dinámicos. Precio `259.00`, moneda MXN, sin reseñas ni disponibilidad inventadas. Sitemap incluye el producto desde la base.

## Carrito global y compra directa

El carrito vive en el layout global, con contenido en localStorage y apertura en sessionStorage. Comprar guarda una unidad y la apertura **antes de navegar**, con bloqueo de doble ejecución durante esa navegación. No hay efectos que vuelvan a añadir productos al montar una ruta.

En escritorio el contenido deja espacio a la columna de 380 px. En móvil el panel tiene fondo modal, foco contenido, Escape, cierre accesible y restauración de foco. Se puede cerrar y volver a abrir sin perder productos. Cantidades respetan inventario y límite de 20; los totales definitivos siguen siendo responsabilidad del servidor.

Los cupones se validan por API, se sincronizan con checkout y se vuelven a validar cuando cambia el carrito. El panel solo muestra entrega conocida si la selección local es válida o hay cotización nacional vigente para ese carrito. No se habilitaron pagos, envío real, correos ni generación de guías.

## Administración y futuros lanzamientos

En Contenido se elige el lanzamiento destacado mediante un selector de productos. Vacío conserva el comportamiento automático del primer producto marcado como destacado. El hero usa nombre, precio, imagen y galería de ese producto; los banners desktop/móvil pueden reemplazarse desde Contenido con URLs HTTPS.

Cada producto admite `theme` (`editorial`, `festive`, `mint`, `coral`), `themeAccent`, `themePaper` (hexadecimal validado) y `themeFont` (`expressive`, `classic`, `sans`). No se admite CSS arbitrario. El diseño temático se aplica solo a la ficha. Descripciones, galería, precio, disponibilidad, componentes y reglamento siguen administrándose con el producto. Intercambio Navideño usa el tema festivo por defecto mientras no tenga una selección guardada.

## Validación

- Worker completo verificado por HTTP local: ficha 200 con canonical único y Product JSON-LD ($259 MXN, OutOfStock); URL anterior 301 conservando query; sitemap con el nuevo slug y sin fixtures; ruta desconocida 404.
- Build TypeScript + Vite aprobado. 36 pruebas de editorial y 11 pruebas de portal/gateway aprobadas.
- Se probó en navegador el recorrido Comprar → una unidad → ficha → carrito abierto; recarga y navegación no duplicaron la unidad. También cantidades, cupón PRUEBA10, subtotal, entrega local $0, cierre/Escape y Conocer el juego sin agregar.
- Para esa prueba se activó temporalmente un escenario **solo local** con medidas y stock sintéticos. Se restauró el registro a Próximamente, stock 0 y medidas 0. Se retiró la unidad de prueba del carrito, conservando sus productos anteriores. No se creó un pedido ni se ejecutó un cobro.
- Revisión visual en escritorio 1440 px, tablet 820 px y móvil 390 px; segunda pasada para separar pies de imagen, ajustar título/precio móvil y conservar espacio junto al panel. Capturas en `docs/review/`.
- Rutas revisadas: home, catálogo, producto, nosotros, FAQ, mayoreo, contacto, legales, carrito, checkout, pedido y admin. Comprobación de imágenes y desbordamiento horizontal.
- Las respuestas públicas de my, play raíz, Pigeon God y Prepress coincidieron en estado, redirección y hash con el snapshot previo. No se modificaron sus fuentes, configuración ni despliegues en esta tarea.

## Pendientes de confirmación

Jugadores, edad, duración, componentes, reglamento final, peso y medidas empacadas, fotografías de empaque, SKU definitivo, fecha e inventario para venta. La portada con marca anterior se excluyó; no debe sustituir el arte seleccionado sin revisión. Persisten los pendientes de servicios/legales descritos en INTEGRATIONS.md.

Publicar requiere autorización nueva: el usuario pidió explícitamente no desplegar esta revisión. Cuando se autorice, respaldar D1, revisar duplicidades, aplicar la migración y desplegar únicamente `marlo-editorial` con `wrangler.production.jsonc`. No desplegar el gateway ni cambiar DNS. Cambiar disponibilidad requiere datos confirmados; la migración no abre ventas.

## Reabrir la vista previa

Desde `editorial`: `npm run db:local`, luego `npm run dev:api` y `npm run dev` en terminales separadas. No ejecutar `seed:local` sobre producción. Para comprobar el Worker completo: primero `npm run build`, después `node node_modules/wrangler/bin/wrangler.js dev --config wrangler.site-preview.jsonc --local --port 8790 --inspector-port 9230`.


