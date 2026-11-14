# Números de pedido y checkout — 21 de octubre de 2026

## Resultado

Los clientes reciben referencias `MG-AAAA-000001`, separadas del UUID interno.
La confirmación y consulta se sirven en `/pedido/confirmacion` y `/consultar-pedido`.
El checkout usa una cookie HttpOnly, SameSite=Lax, Secure en HTTPS, válida dos horas.
No entrega tokens de acceso en JSON ni URLs, ni depende de localStorage.
Los antiguos Bearer y fragmentos ya no autorizan consultas. Los callbacks de PayPal
siguen verificando el proveedor; un puente acotado a pagos iniciados en las últimas
dos horas permite finalizar callbacks que ya tenían su cookie anterior.

La consulta posterior solicita número y correo, responde de forma genérica y envía
un código de seis dígitos, de un solo uso, válido diez minutos. La base solo guarda
su hash en el registro de desafíos. El correo en la cola contiene el código para
su envío. Cada desafío permite cinco intentos; hay límites por IP, globales y por
correo. Los códigos vencidos no se envían. Las sesiones vencidas se eliminan.

La pantalla muestra productos, cantidades, importe, correo enmascarado, pago y
entrega. Solo marca hitos respaldados por el estado o historial. La guía enlaza
`/rastrear-pedido?guia=...`; la entrega local usa sus propios estados. La simulación
se limita a modo local y el backend la rechaza en producción.

## Migración

`migrations/schema/0007_order_access.sql` agrega `orders.public_number`, índice único,
registro AUTOINCREMENT sin reutilización, trigger de asignación, sesiones y desafíos.
Asigna números a pedidos existentes por fecha e ID sin duplicarlos ni alterar
inventario, pagos, relaciones, UUIDs o historial. La secuencia es global entre años.
Actualiza el FAQ almacenado y los correos en cola hacia la consulta pública.

Los correos con intentos previos pendientes quedan en `review`: no se reenvía con
un cuerpo distinto la misma clave de idempotencia de Resend. Requieren conciliación
manual antes de cualquier reintento; el historial ya enviado se conserva.

Aplicada solo a D1 local, después del respaldo privado
`.wrangler/pre-order-access-local.sql`. No se ha aplicado a D1 de producción.

## API y correos

- `POST /api/order-access/request`: solicita código, sin revelar si existe el pedido.
- `POST /api/order-access/verify`: consume el código y establece sesión temporal.
- `GET /api/order-session`: devuelve solo el resumen autorizado, sin UUID o domicilio.
- `/api/orders/:referencia/*`: exige sesión del mismo pedido; conserva las operaciones
  de pago, captura, actualización y consulta existentes.
- Los retornos de PayPal van a confirmación sin secretos en el URL y verifican el pago.
- `paid`: asunto «¡Recibimos tu pedido MG-…! — Marlo Games», número público, productos,
  cantidades, total, entrega y botón «Consultar mi pedido» sin token.
- `received` sigue indicando pago pendiente. Las actualizaciones de entrega y pago
  usan la misma referencia pública. `order_code` agrega la verificación temporal.
- La cola mantiene su clave de idempotencia por pedido/evento. Los códigos tienen
  prioridad y se despachan con `waitUntil` desde el Worker web, con cron como respaldo.

## Checkout y sandbox

PayPal está habilitado en 5180 y sus credenciales se validan contra la API sandbox.
Mercado Pago mantiene verificación de vendedor de prueba. Ambos formularios aparecen
en checkout. El correo del comprador se proporciona al Brick; Mercado Pago oculta
el campo redundante. La etiqueta dice «Celular». Se eliminó el aviso solicitado.
Se recuperaron el bloque verde «Pago seguro», candado, logo de Mercado Pago y un
solo logo por Visa, Mastercard y American Express, obtenidos de fuentes oficiales.

El sandbox escucha solo en loopback, usa una base en memoria y no genera envíos ni
correos reales. Los callbacks y cookies funcionan en el mismo origen. La solicitud
de códigos por email informa que no está habilitada en 5180. La consulta inmediata
tras comprar funciona con la cookie; los tests cubren la verificación posterior.

## Archivos principales

- `api/order-access.ts`, `api/worker.ts`, `api/site.ts`, `api/emails.ts`, `api/types.ts`.
- `src/OrderPage.tsx`, `src/order.css`, `src/main.tsx`, `src/InlinePayment.tsx`,
  `src/checkout.css`, `src/checkout-validation.ts`, `src/Admin.tsx`, `src/content.ts`,
  `src/LegalDocument.tsx`, `src/TrackingPage.tsx`.
- `public/images/payments/*`, con fuentes registradas en `SOURCES.md`.
- `tests/order-access.test.ts`, `tests/order-pages.test.ts`, `tests/db.ts`, y fixtures
  de comercio, fulfillment, tracking y callbacks actualizados al uso de cookies.
- `scripts/manual-payment-sandbox.mjs`, `scripts/verify-order-experience.mjs`,
  `scripts/verify-checkout-ui.mjs`, `scripts/sync-payment-logos.mjs`, scripts de
  preparación y pruebas sandbox, README y documentos UX/legal actualizados.

## Validación y límites

- 129 pruebas automatizadas aprobadas; TypeScript y compilación Vite aprobados.
- Navegador con Worker y base aislados: sesión inmediata, OTP, pendiente versus
  confirmado, rechazo de enlace antiguo, enlace de guía y ausencia de simulación
  en modo producción. Vistas 1440, 768 y 390 sin desbordamiento ni errores de página.
- Checkout en 1440, 1280, 768 y 390; envío de ambos métodos con SDK simulado y montaje
  de ambos SDK sandbox reales. No se enviaron pagos reales ni correos externos.
- PayPal visible en 5180 y correo reutilizado en Mercado Pago comprobados en navegador.

Antes de producción: respaldar D1 remoto, aplicar 0007 y publicar conjuntamente
Worker y frontend; revisar correos en `review`; verificar entrega real del nuevo
código mediante Resend en una bandeja autorizada. Los flags de pagos de producción
no se modificaron. Este trabajo no afirma aceptación completa de pagos productivos.


## Actualización del 22 de octubre de 2026
- Menú único Rastrear pedido; consultar-pedido conserva acceso a la misma vista.
- Consulta por número de pedido o guía exacta más correo, con verificación de un solo uso.
- Seguimiento de las guías del pedido en la misma vista; error explícito si el proveedor no ofrece datos, sin inventar avance.
- Eliminado el mensaje sobre identificar automáticamente la paquetería.
- Restaurados los logos únicos Visa, Mastercard y Amex, Mercado Pago y Pago seguro con candado verde.
- Compilación correcta, 131 pruebas aprobadas y verificación visual a 390/768/1440 px. SDK de ambos proveedores cargado, sin enviar pagos.
- Servidores locales 5173/8788 y sandbox aislado 5180 reiniciados. No publicado en producción.
