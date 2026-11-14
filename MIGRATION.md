# Portal personal — migración por etapas

## Alcance

El usuario confirmó que el portal GAMES / NOT GAMES es su blog personal.
Se publica como Worker independiente `marlo-personal` en `my.marlo.games`.
Se conservan contenido, CSS, imágenes, navegación y enlaces a `play.marlo.games`.
Canonical, Open Graph, identidad visible, robots y sitemap usan el nuevo dominio.

El dominio principal conserva temporalmente el portal anterior hasta que la
editorial esté lista. No se modifican `wrangler.jsonc`, el gateway de juegos,
sus orígenes ni el binding PIGEONGOD_API. No hay redirección global del apex.

## Comandos

- `npm run test:personal`: compila exclusivamente `dist/personal/worker.mjs` y prueba la migración.
- `npm run deploy:personal`: valida y despliega únicamente `wrangler.personal.jsonc`.
- `npm run deploy`: comando anterior del gateway; NO usar para publicar el portal personal.

## Auditoría de Cloudflare, 2026-10-16

Confirmado por API: `marlo-play` atiende apex y play; `boardgame-prepress`
atiende `prepress-origin.marlo.games`; Pages `games-of-the-pigeon-god` tiene
`pigeongod-origin.marlo.games`. Existe el Worker `pigeongod-api`.
No había Worker `marlo-personal`, dominio Workers `my.marlo.games` ni rutas
Workers de zona antes del despliegue. La sesión OAuth fue renovada por Wrangler.
Lectura de registros DNS denegada por permisos (403); inventario DNS incompleto.

## Resultado de esta etapa

Publicado el 2026-10-16: Worker `marlo-personal`, versión
`132f65aa-5c85-425b-9af3-7f37ba8be109`, dominio `my.marlo.games`.
Comprobados por HTTPS: portada, tres imágenes, sitemap y robots con HTTP 200;
canonical apunta a `https://my.marlo.games/`. Pasaron 3 pruebas de migración
y 8 pruebas existentes del gateway. Los hashes de las respuestas de apex,
play raíz, Pigeon God y Prepress coinciden antes y después del despliegue.

## Plan de editorial pendiente

1. Construir y probar editorial y API en proyectos independientes sin dominios productivos.
2. Mantener un inventario de las rutas reales: el portal actual solo publica `/`,
   recursos `/assets/*` y `/robots.txt`; no tiene entradas individuales.
3. `/` es un conflicto deliberado: será la editorial, con enlace al portal personal.
   No aplicar 301 de `/` a `my`, porque impediría mostrar la editorial.
4. Los fragmentos `#games`, `#not-games`, `#about` no llegan al servidor.
   Preparar enlaces de compatibilidad en la editorial. Conservar los recursos
   antiguos o definir redirecciones individuales donde no haya colisiones.
5. Tras autorización de cambio del apex, coordinar la asociación del dominio
   al proyecto editorial y retirar solo el apex de la configuración del gateway,
   preservando play y el binding API. Configurar `www` con 301, ruta y query.
6. Preservar registros de correo, dominios de origen y reglas ajenas a la migración.
   No dar por concluido el cambio hasta verificar TLS, HTTP, recursos y juegos.

## Reversión

Esta etapa es aditiva: apex y play mantienen su despliegue. Ante un problema
en my, corregir o revertir exclusivamente marlo-personal. No borrar proyectos.
Para futuras versiones usar una versión anterior del Worker personal.
Antes del cambio del apex guardar su deployment, asociaciones, reglas y DNS;
restaurarlos si falla la verificación. Una redirección 301 cacheada puede
persistir en navegadores tras revertirla.

## Cambio de dominios completado — 2026-10-17

Esta sección sustituye el estado pendiente descrito arriba.

- `marlo.games` y `www.marlo.games`: Worker independiente `marlo-editorial`, versión `2de56baa-1f01-4b77-b2c5-ccd8c9dcf8b7`, con Workers Static Assets y D1 `marlo-editorial` (`e8535ed2-0c6a-4edb-8492-2fd97e001b4e`). Solo esquema, sin productos de prueba.
- `my.marlo.games`: Worker `marlo-personal`, contenido preservado.
- `play.marlo.games`: Worker `marlo-play`, sin redespliegue ni cambios en sus orígenes o API.
- `www` devuelve HTTP 301 al apex, conservando ruta y query. Los tres recursos históricos del portal redirigen a `my`; los fragmentos históricos se resuelven en el cliente. La raíz permanece editorial por el conflicto deliberado.

Cloudflare transfirió únicamente el apex y agregó www mediante Custom Domains; no eliminó dominios. El certificado HTTPS está funcionando en ambos. Se retiró el apex de la configuración local del gateway para que un futuro despliegue no lo recupere. La configuración de producción editorial declara apex y www.

### Verificación

Las respuestas de my, play raíz, Pigeon God y Prepress conservaron exactamente estado, Location y hash SHA-256 del snapshot `editorial/deployments/before-domain-change.json`. La editorial, sus recursos, páginas públicas, robots y sitemap responden 200; ruta desconocida 404. Se verificó el renderizado público. API health confirma modo production, pagos y formularios deshabilitados; crear pedidos devuelve 503; administración sin configurar devuelve 503. Pruebas previas: 26 editorial y 11 portal/gateway aprobadas, compilación aprobada.

### Configuración pendiente para operar la tienda

No hace falta otro cambio manual de DNS para estos dominios. Falta cargar catálogo e imágenes reales, completar y revisar textos legales, configurar Cloudflare Access (issuer, audience y lista permitida), Turnstile, correo y credenciales sandbox. Validar proveedores y cobertura postal antes de habilitar ventas. Las guías y seguimiento reales requieren completar y probar la integración; no están activos. Consultar `editorial/INTEGRATIONS.md` y `editorial/README.md`. No se ejecutaron cobros, correos ni compras de guías reales.

### Reversión del apex

Desde `editorial`, ejecutar `node scripts/domains.mjs rollback` solo cuando se decida revertir. Usa el snapshot para restaurar los dominios originales del Worker marlo-play, incluyendo play para evitar retirarlo al reemplazar su lista. No borra proyectos ni datos. www puede permanecer en editorial redirigiendo al apex restaurado; my permanece independiente. Después ejecutar `node scripts/domains.mjs verify`, comprobar apex y ajustar las dos configuraciones locales de dominios para reflejar el rollback. No desplegar ambos proyectos con el apex declarado simultáneamente. Las redirecciones 301 cacheadas pueden persistir.
