# Integraciones y activación

Estado: código local y publicación editorial; **ventas reales bloqueadas**.
Las pruebas automatizadas usan SQLite y respuestas controladas; no certifican
cuentas externas. Ver el inventario actualizado y la evidencia en
[`docs/COMMERCE-READINESS.md`](docs/COMMERCE-READINESS.md). PayPal Live y Skydropx
producción ya autenticaron; esto no certifica compras ni envíos completos.

## Entornos

- `local`: solo loopback. Fixtures, simulaciones explícitas, correos en `preview`.
- `sandbox`: APIs externas de prueba requieren flags y secretos explícitos.
- `production`: contenido público, catálogo real (inicialmente vacío), sin checkout
  habilitado. La barrera de pagos requiere una revisión de código antes de ventas.

Nunca colocar secretos en variables `VITE_*`, repositorio, navegador o documentación.
Copiar `.env.example` a `.dev.vars` para Worker local; está ignorado por Git.
Para Cloudflare usar `npx wrangler secret put NOMBRE --config wrangler.production.jsonc`.

## Mercado Pago

Configurar `MP_ACCESS_TOKEN`, `MP_PUBLIC_KEY`, `MP_WEBHOOK_SECRET` de una aplicación
de pruebas y usuarios de prueba mexicanos. El frontend monta CardPayment Brick;
solo envía su token, método e installments al backend. No recibe PAN/CVV.
El backend crea `/v1/orders` con clave de idempotencia y referencia al pedido.
Notificaciones en `/api/webhooks/mercadopago`, tópico Order. Se verifica HMAC
y se consulta la order; una vuelta del navegador no confirma un pago.
Validar contrato exacto del Brick/Orders, estados, moneda, 3DS, débito, reembolso,
rechazos y comportamiento de reintentos con la cuenta antes de activar.

Referencias oficiales: [Orders](https://www.mercadopago.com.mx/developers/es/reference/online-payments/checkout-api/create-order/post),
[notificaciones](https://www.mercadopago.com.mx/developers/es/docs/automatic-payments-orders/notifications/orders).

## PayPal

Configurar `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID` sandbox.
Se carga el SDK oficial, se crea la orden en backend y se captura en backend.
`/api/webhooks/paypal` verifica la firma con la API oficial y consulta la orden.
Se compara referencia, moneda MXN e importe. El adaptador selecciona explícitamente
el host sandbox o Live según PAYPAL_ENVIRONMENT y MODE.
Probar rechazo, pendiente, captura duplicada, captura tras timeout y reembolso.

Referencias: [Orders v2](https://developer.paypal.com/api/orders/v2),
[webhooks](https://developer.paypal.com/api/rest/webhooks/rest/).

## Skydropx y fuente postal

`SKYDROPX_CLIENT_ID`, `SKYDROPX_CLIENT_SECRET`, `SHIPPING_ORIGIN_JSON`.
El origen debe incluir country_code=MX, postal_code, area_level1 (estado),
area_level2 (municipio), area_level3 (colonia), con valores reales.
El adaptador implementa OAuth, creación y consulta de cotizaciones hasta
`is_completed`, selección de tarifa utilizable MXN y caducidad conservadora.
Se verificaron OAuth y cotizaciones de producción a CDMX y Monterrey. El cliente
paga la tarifa elegible confirmada; no hay envío fijo de 7000 centavos.
Los servicios sin evidencia fiable de entrega domiciliaria, días hábiles y
costo completo se excluyen, aunque la API devuelva una tarifa exitosa.

Importar en `postal_codes` un catálogo vigente de SEPOMEX u otra fuente autorizada,
con fecha/licencia registradas en `source`. El único registro local está marcado
FIXTURE y no se acepta fuera de local. Sin fuente no se confirma cobertura.
Empaque configurado: una o dos unidades en bolsa 35 × 55 × 10 cm, con 15 g
de protección más 250 g por juego. Capacidad para tres o más pendiente.

Compra real de guías y seguimiento automático quedan bloqueados hasta completar
la aceptación del proveedor: endpoint de creación, datos Carta Porte, correlación
de timeout sin repetir compras, URL de etiqueta y señal confiable de entrega.
La interfaz y estados locales existen; no representan envíos reales.

Referencia: [API oficial](https://pro.skydropx.com/es-MX/api-docs).

## Resend

Verificar dominio remitente; configurar `RESEND_API_KEY`, `EMAIL_FROM`, `ADMIN_EMAIL`.
Respetar los MX existentes al añadir los registros de verificación del proveedor.
`EMAIL_ENABLED=true` solo después de verificar destinatarios de prueba.
La outbox usa claves únicas, lease, cinco intentos, backoff e idempotencia del proveedor.
Correos locales se guardan como `preview`; no se envían. Las plantillas se editan
en administración. Añadir cron al Worker para procesar la cola periódicamente al
activar operación. El config local de producción incorpora un cron cada cinco
minutos para conciliación y outbox; falta verificar su despliegue remoto.
Revisar resultados inciertos antes de reintentar manualmente fuera de la ventana
de idempotencia del proveedor. Un estado `sent` indica aceptación, no entrega al buzón.

Referencia: [idempotencia](https://resend.com/docs/dashboard/emails/idempotency-keys).

## Administración y formularios

Configurar Cloudflare Zero Trust Access para `/admin` y `/api/admin/*` con el mismo
audience, cookie segura y acceso solo a correos autorizados. Completar
`ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, `ADMIN_EMAILS`. El backend verifica JWT,
issuer, audience, expiración y allowlist; no confía solo en cabeceras de email.
Sin configuración, las APIs administrativas están cerradas. Localmente el bypass
solo funciona con MODE=local y hostname loopback. No hay contraseña en frontend.

Configurar Turnstile con el hostname público, `TURNSTILE_SECRET` y
`TURNSTILE_SITE_KEY`; revisar privacidad antes de recibir datos personales.
Sin estos valores los formularios públicos no se habilitan. Rate limits por IP
se aplican en D1; las mutaciones exigen el origen exacto para prevenir CSRF.

## Lista previa a ventas

- [ ] Catálogo real: precios, SKU, inventario, medidas, pesos, imágenes y reglamentos.
- [ ] Políticas revisadas, contacto comercial y responsable de privacidad.
- [ ] Access y Turnstile verificados desde una sesión externa.
- [ ] Catálogo postal importado y actualizado.
- [ ] Pruebas sandbox completas en ambos proveedores de pago, incluyendo 3DS y reembolsos.
- [ ] Resolver pagos pendientes antes de liberar stock; automatizar conciliación.
- [ ] Skydropx autenticado, cobertura y empaque verificados, guías y tracking aceptados.
- [ ] Correo verificado, reintentos y destinatarios revisados; cron configurado.
- [ ] Backups y restauración D1 ensayados; retención aprobada antes de automatizar borrado.
- [ ] Revisión de seguridad de extremo a extremo y pruebas de concurrencia en D1.
- [ ] Autorización expresa para cobros reales y compra de guías.
