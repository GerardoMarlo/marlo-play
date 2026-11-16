# Marlo Games — editorial y tienda

Aplicación independiente del portal personal y del gateway de juegos.
React + TypeScript + Vite + Tailwind; API Cloudflare Worker; D1 con migraciones.
Se usa Workers Static Assets para publicar frontend y API bajo el mismo dominio,
aprovechando la asociación Workers existente del apex. Esto evita un cambio de
DNS a Pages y mantiene aislados `my.marlo.games` y `play.marlo.games`.

## Desarrollo (Node 24)

```sh
cd editorial
npm ci
npm run db:local
npm run seed:local
npm run dev:api
# Otra terminal:
npm run dev
```

Abrir http://127.0.0.1:5173. `/admin` tiene acceso de desarrollo solo en loopback.
El cupón `PRUEBA10` y los productos DEMO existen solo en la base local.
Dirección para probar cobertura: CP 45050, colonia Ciudad del Sol, municipio
Zapopan, estado Jalisco; es un fixture, no prueba de cobertura real.
Crear un pedido local permite probar estados de pago sin contactar proveedores.

Para probar el selector de colonias con códigos postales reales, importa también
el catálogo SEPOMEX preparado en este workspace:

```sh
npm run db:postal:local
```

Este comando solo actualiza el catálogo de la base local; conserva los pedidos.
El seed por sí solo contiene el CP de ejemplo 45050. Si falta
`.wrangler/postal-catalog.local.sql`, prepara el archivo con
`scripts/download-postal-catalog.mjs` y `scripts/prepare-postal-catalog.mjs`.
Con el catálogo importado, el CP 45066 también permite seleccionar colonias;
la cobertura y los pagos del modo local siguen siendo simulaciones.

## Actualización de textos editoriales

1. Edita los campos `intro`, `about`, `headline` o `heroText` de `defaultContent`
   en [`src/content.ts`](src/content.ts).
2. Desde `editorial/`, con Node 24, las dependencias instaladas (`npm ci`) y
   Wrangler autenticado en la cuenta de Cloudflare de Marlo (`npx wrangler login`), ejecuta
   `npm run content:diff:prod`. Revisa el valor anterior y el nuevo de cada campo
   que aparece en la vista previa. «Ausente en D1» indica que el Worker toma el
   valor incluido en su despliegue hasta que se guarde el campo en D1.
3. Ejecuta `npm run content:sync:prod` en una terminal interactiva. Revisa la
   nueva vista previa y escribe exactamente `SYNC PRODUCTION` para confirmar.
   El comando vuelve a consultar D1 y muestra los campos verificados.
4. Recarga [marlo.games](https://marlo.games/) y comprueba los textos publicados.

Para ensayar con una base local, usa `npm run content:diff` y luego
`npm run content:sync`. La frase de confirmación local es `SYNC LOCAL`.
Ambos entornos requieren el registro `site` existente. Si falta en una base
local recién preparada, guarda el contenido desde **Contenido** en `/admin`
para inicializarlo.

El comando actualiza exclusivamente los cuatro campos indicados, en el JSON
del registro `content` con `id = 'site'`. Si alguien modifica ese registro
durante la confirmación, vuelve a ejecutar el comando y revisa la nueva vista
previa. Los cuatro campos de `defaultContent` son la referencia para la
sincronización. Si editas alguno desde el panel, refleja también el cambio en
TypeScript para conservarlo en la próxima sincronización.
En Windows, si el registro y los textos superan el límite de tamaño de la
consulta, ejecuta la sincronización desde Linux o macOS.

Si solo cambias esos campos de D1 y no hay otros cambios de código que publicar,
puedes omitir la migración, `npm run build` y el despliegue. La sincronización
es independiente del build y del deploy.

- `catalogHeading` y `localExplanation` se incluyen en el frontend. Para
  publicarlos, ejecuta `npm run build` y
  `npx wrangler deploy --config wrangler.production.jsonc`.
- Revisa y edita `shipping`, `faq`, `privacy`, `terms`, `returns` y
  `announcement` desde **Contenido** en `/admin`. Pueden incluir tarifas,
  condiciones de compra y avisos vigentes.

## Demo de cotización Guadalajara → CDMX

Desde la carpeta `editorial`, en la terminal de VS Code:

```sh
node scripts/demo-cotizacion.mjs
```

Consulta tarifas reales desde el origen configurado de Marlo hacia Centro,
Cuauhtémoc, CDMX (CP 06000). Muestra las paqueterías y servicios disponibles
ordenados por precio. Pulsa **Enter** para seleccionar la tarifa más barata,
escribe el número de otra opción o `q` para salir. Solo cotiza y selecciona:
no compra guías, crea envíos ni programa recolecciones.

El paquete de ejemplo mide 12 × 9 × 5 cm y pesa 0.285 kg. Puedes ajustarlo:

```sh
node scripts/demo-cotizacion.mjs --peso 0.5 --largo 20 --ancho 15 --alto 10
node scripts/demo-cotizacion.mjs --mas-barata
```

Peso en kg; medidas en cm. Requiere las credenciales y el origen configurados
en `.dev.vars.production`, que no debe compartirse ni subirse a Git.
`--sandbox` usa `.dev.vars.sandbox` para consultar el entorno de pruebas.
Las tarifas dependen de la cobertura y el paquete, pueden cambiar y no
modifican el precio de envío que cobra la tienda. La consola muestra los
nombres de las paqueterías, sin identificar al intermediario de cotización.

## Prueba manual de tarjeta (sandbox aislado)

```sh
npm run build
node scripts/manual-payment-sandbox.mjs
```

Abrir `http://127.0.0.1:5180`. Usa Mercado Pago o PayPal sandbox y entrega local para
esta prueba. Los campos seguros aparecen al seleccionar el proveedor en el checkout, antes de registrar el pedido.
El arranque verifica con Mercado Pago que el vendedor es `test_user` y toma
exclusivamente las credenciales de `.dev.vars.sandbox`. No usa D1 de producción.
La base vive en memoria y se reinicia al detener el proceso. Los correos, las guías y el envío nacional están desactivados. PayPal utiliza exclusivamente su API sandbox.

Tarjeta Mastercard oficial de prueba: `5474 9254 3267 0366`, vencimiento `11/30`,
CVV `123`, titular `APRO` (aprobado), correo `test@testuser.com`.
[Fuente de Mercado Pago](https://www.mercadopago.com.mx/developers/es/docs/checkout-api-orders/integration-test/cards).
Nunca introducir una tarjeta real en esta vista.

El arnés escucha exclusivamente en loopback y comprueba Host/Origin. Simula
solo la comprobación CAPTCHA dentro de su proceso; no modifica la seguridad
del Worker desplegado. Los pagos usan el SDK/API auténtico de la cuenta sandbox.
No recibe webhooks públicos: el estado se consulta con el flujo de pago y
“Actualizar estado”. No acredita aceptación comercial completa de producción.

Para dejar una orden sintética lista sin enviar pago:
`node scripts/prepare-manual-sandbox-order.mjs`. Guarda el número de pedido y la ruta de consulta
en `.wrangler/manual-sandbox-order.local.json`.

## Consulta de pedidos

La migración `0007_order_access.sql` asigna números públicos sin cambiar UUIDs.
El checkout entrega una cookie HttpOnly de dos horas; la consulta posterior en
`/consultar-pedido` verifica un código por correo de diez minutos, con cinco intentos.
Los códigos usan la cola Resend y se despachan en segundo plano desde el Worker web.
En 5180 no se envían correos: la sesión inmediata funciona, pero solicitar códigos
responde que el correo no está habilitado. En modo local los códigos se pueden revisar
en la bandeja de correos de desarrollo. La prueba automatizada cubre el flujo completo
sin enviar mensajes externos. Ver `docs/ORDER-ACCESS-2026-10-21.md`.

## Validación

```sh
npm test
npm run build
```

Las pruebas ejercitan la API con una base SQLite real, transacciones y triggers.
También hay pruebas de contratos HTTP con respuestas controladas. No sustituyen
pruebas autenticadas sandbox ni aceptación de D1 remoto con carga concurrente.

## Estructura

- `src/`: interfaz, diseño, contenido por defecto y validación compartida.
- `api/worker.ts`: API de pedidos, catálogo, administración y formularios.
- `api/site.ts`: frontend, metadatos, sitemap y compatibilidad de URLs antiguas.
- `api/providers.ts`, `api/skydropx.ts`: adaptadores de integración y barreras.
- `api/emails.ts`: plantillas/outbox con reintentos.
- `migrations/schema/`: migraciones versionadas; nunca incluir fixtures aquí.
- `migrations/seed.local.sql`: exclusivamente desarrollo local.

## Despliegue autorizado

```sh
npm run build
npx wrangler d1 migrations apply marlo-editorial --remote --config wrangler.production.jsonc
npx wrangler deploy --config wrangler.production.jsonc
```

No ejecutar el seed en remoto. La configuración de producción deja pagos,
correos y compra de guías deshabilitados. El catálogo vacío muestra un estado
editorial honesto, sin precios ni disponibilidad inventados. El panel permanece
cerrado hasta configurar Access. Los formularios esperan Turnstile y políticas.

## Operación y límites actuales

- Dinero en centavos; precios del servidor, envío nacional según cotización real elegible, local $0.
- Reserva de stock y uso de cupón dentro de batch transaccional; restricciones SQL.
- Los intentos sin transacción externa caducan en 30 minutos. Los que tienen
  transacción externa retienen stock hasta conciliación; no se liberan a ciegas.
- Un pago tardío tras liberar stock pasa a revisión; no prepara un envío.
- Pedidos privados usan un token impredecible en el fragmento del enlace.
- Un cupón por pedido; combinación de varios aún no habilitada.
- Dashboard limitado a 500 pedidos recientes; no es un reporte contable completo.
- Stock editable con control de versión. Archivar productos conserva pedidos.
- Imágenes por URL; no hay carga binaria a R2 todavía.
- Ventas reales, guía real y seguimiento automático requieren completar la lista
  de aceptación en INTEGRATIONS.md. No están certificados ni habilitados.

## Privacidad y respaldos

No se captura tarjeta. Formularios/pedidos guardan solo datos operativos y no
activan marketing. No registrar cuerpos, tokens ni domicilios en logs.
Exportar D1 antes de migraciones con `wrangler d1 export` y custodiar el archivo
fuera de Git en almacenamiento restringido. Ensayar restauración en otra base.
Los límites de retención fiscal y atención deben ser aprobados por el propietario;
no se ha automatizado borrado de pedidos. Eliminar/anomimizar a solicitud requiere
revisión de obligaciones; documentar cada acción en auditoría.

Ver `ASSETS.md`, `INTEGRATIONS.md`, `PLAN.md` y `../MIGRATION.md`.

El estado verificable de la integración y los pendientes se mantienen en
[`docs/COMMERCE-READINESS.md`](docs/COMMERCE-READINESS.md).
