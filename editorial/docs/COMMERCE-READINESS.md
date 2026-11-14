# Aceptación de comercio — actualización 19 de octubre de 2026

> Registro histórico: las tablas y notas siguientes conservan estados de rondas anteriores. Consultar [CURRENT-ACCEPTANCE.md](CURRENT-ACCEPTANCE.md) para el estado vigente y sus pruebas.

Estado global: **BLOCKED**. El código implementado y los contratos simulados no equivalen a aceptación de proveedores. Pagos, correos y compra de guías permanecen desactivados en producción. No se han efectuado cobros ni comprado guías.

| Componente | Estado | Evidencia y pendiente |
| --- | --- | --- |
| Mercado Pago | BLOCKED | Propietario espera verificación de cuenta; onboarding pausado por su solicitud. Falta probar credenciales, Brick/Orders, notificaciones, captura y reembolso. |
| PayPal Live | NOT TESTED | OAuth 200; webhook creado mediante API (201), consultado posteriormente (200), URL y seis eventos correctos. Claves e ID instalados como secretos del Worker. Falta recibir y verificar notificaciones auténticas y completar compra/retorno. |
| PayPal Sandbox | NOT TESTED | Nuevas claves autentican (200). Webhook aislado corregido y seis eventos verificados; secretos instalados con prefijo PAYPAL_SANDBOX_. Falta compra, aprobación de comprador, captura y notificación auténtica. |
| Skydropx producción | BLOCKED | OAuth 200; cotizaciones completas a CDMX y Monterrey, 31 tarifas cada una y 11 exitosas. Falta acreditar entrega domiciliaria, días hábiles y costo total de cada servicio antes de declararlo elegible. |
| Skydropx sandbox | BLOCKED | Credenciales suministradas autenticaron únicamente en producción. No hay prueba real de compra de guía, recolección o entrega. |
| Resend | NOT TESTED | Propietario confirma dominio Verified. Clave de envío y remitente guardados localmente. API aceptó prueba a delivered+marlo-onboarding@resend.dev (200); repetir la misma clave de idempotencia devolvió el mismo ID. Falta recepción en bandeja real y plantillas completas por ciclo de pedido. |
| Checkout | NOT TESTED | Suite local: 70 pruebas pasan, incluidos recolección, reembolsos y rechazo de webhooks sin firma. Build TypeScript/Vite correcto. Falta prueba completa con proveedores y revisión móvil; navegador de revisión no logró conectar tras dos intentos. |
| Reglas de envío | READY | Pruebas locales de umbral 30 MXN, prioridad recolección, exclusión por datos insuficientes y tránsito, caducidad y cambio de tarifa. READY solo del algoritmo; servicios reales aún bloqueados. |
| Base de datos | READY | Respaldo privado .wrangler/commerce-pre-migration-20261018.sql generado antes de migrar. Migraciones 0003/0004 aplicadas remotamente; catálogo público confirma MARLO-XMAS-001, precio 25900 centavos y stock 2000. Falta ensayo de restauración y carga concurrente remota antes de habilitar ventas. |
| Access | READY | Rutas administrativas redirigen a login sin sesión. Corregido ACCESS_TEAM_DOMAIN (se había ingresado un correo). Sesión autorizada del propietario verificada en navegador: carga «Tu editorial, en orden» y resumen administrativo. Script de ingreso valida dominio, audiencia y correos. |
| Turnstile | NOT TESTED | Claves instaladas; catálogo remoto muestra formsEnabled=true. Falta desafío real de navegador. |
| Catálogo postal | BLOCKED | Falta importar fuente autorizada vigente; el registro local FIXTURE no se acepta en producción. |
| Despliegue de integración | READY | Worker publicado, versión 0fea10d7-d795-4078-9dd0-34c929e5ce02. Apex 200, www 301, my 200 y play conserva 308. Páginas de estados 200, retorno sin prueba de pago lleva a processing, cancelación vuelve al checkout. Cron cada cinco minutos. Flags de pagos/correos/guías false. READY describe publicación técnica, no aceptación comercial. |

## Inventario de configuración

Los secretos se ingresan con `scripts/configure-provider.ps1 -Provider PROVEEDOR -Environment production` y se guardan en `.dev.vars.production`, ignorado por Git. Enter conserva un valor existente. No imprimir ese archivo. Guardar localmente no los instala en Cloudflare. Para sandbox usar `-Environment sandbox` con credenciales realmente sandbox.

| Proveedor | Variables | Dashboard y configuración |
| --- | --- | --- |
| PayPal | PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_WEBHOOK_ID, PAYPAL_ENVIRONMENT=live | https://developer.paypal.com/dashboard/applications/live — misma aplicación para claves y webhook. |
| PayPal pruebas | Mismas variables en entorno separado; PAYPAL_ENVIRONMENT=sandbox | https://developer.paypal.com/dashboard/applications/sandbox |
| Mercado Pago | MP_PUBLIC_KEY, MP_ACCESS_TOKEN, MP_WEBHOOK_SECRET | https://www.mercadopago.com.mx/developers/panel/app — credenciales de prueba/producción y Webhooks de la aplicación. |
| Skydropx | SKYDROPX_CLIENT_ID, SKYDROPX_CLIENT_SECRET, SKYDROPX_ENVIRONMENT | https://pro.skydropx.com/merchant_stores/applications ; sandbox: https://sb-pro.skydropx.com/merchant_stores/applications |
| Resend | RESEND_API_KEY, EMAIL_FROM; opcional ADMIN_EMAIL | https://resend.com/domains y https://resend.com/api-keys — EMAIL_FROM es el nombre utilizado por esta aplicación para el remitente. |
| Cloudflare Access | ACCESS_TEAM_DOMAIN, ACCESS_AUD, ADMIN_EMAILS | https://one.dash.cloudflare.com/ — proteger /admin y /api/admin/* con la misma aplicación/audiencia. |
| Turnstile | TURNSTILE_SITE_KEY, TURNSTILE_SECRET | https://dash.cloudflare.com/ — Turnstile, hostname marlo.games. |
| Worker/D1 | PUBLIC_ORIGIN, MODE, binding DB | wrangler.production.jsonc: marlo-editorial; DB existente. No requiere contraseña pública de base de datos. |

## URLs

Verificación pública del 19 de octubre: PayPal Live y receptor Sandbox devuelven 401 sin cabeceras de firma. Mercado Pago devuelve 503 porque aún falta configuración. Esto prueba rechazo de eventos sin firma, no recepción de un evento auténtico firmado.

- PayPal Live: https://marlo.games/api/webhooks/paypal
- Eventos registrados: CHECKOUT.ORDER.APPROVED, PAYMENT.CAPTURE.COMPLETED, PAYMENT.CAPTURE.PENDING, PAYMENT.CAPTURE.DECLINED, PAYMENT.CAPTURE.REFUNDED, PAYMENT.CAPTURE.REVERSED.
- Retorno: https://marlo.games/checkout/paypal/return
- Cancelación: https://marlo.games/checkout/paypal/cancel
- Estados: https://marlo.games/checkout/processing , /checkout/success , /checkout/failure.
- Mercado Pago: https://marlo.games/api/webhooks/mercadopago
- /api/webhooks/paypal/sandbox es un receptor aislado de notificaciones de prueba con PAYPAL_SANDBOX_*; no constituye una tienda sandbox completa ni modifica pedidos reales.

## Envíos y datos faltantes

- Una unidad: bolsa 35 × 55 × 10 cm, peso total 0.265 kg.
- Dos unidades: bolsa 35 × 55 × 10 cm, peso total 0.515 kg.
- Tres o más: bolsa propuesta 55 × 60 × 10 cm; falta capacidad máxima confirmada. No inventar distribución de paquetes.
- Se utiliza la respuesta del propietario de 15 g como peso de bolsa/protección.
- Falta correo del remitente y los códigos de mercancía/empaque requeridos por Skydropx. El domicilio de origen permanece privado.
- SHIPPING_SERVICES_JSON exige evidencia, vigencia, entrega domiciliaria y días hábiles por servicio, y cargos adicionales verificados para pickup/dropoff. No inferir que el servicio más barato de la API cumple las reglas.
- office_delivery describe capacidad del servicio: no prueba que sea obligatorio recoger en sucursal. La solicitud siempre requiere entrega al destinatario, con office_delivery=false.
- El administrador autoriza el importe exacto de la guía; un cambio exige renovar cotización y revisar margen. Una intención persistida impide repetir compras inciertas.

## Resend y DNS

Obtener los valores exactos de DKIM y SPF/MX de la pantalla del dominio en Resend. No inventar valores, no sustituir los MX de Google Workspace ni duplicar SPF en un mismo hostname. Si existe conflicto, utilizar un subdominio transaccional y su remitente. La verificación DNS y la aceptación de un mensaje no prueban llegada a bandeja de entrada.

## Criterios de activación

1. Completar configuración, catálogo postal y evidencia de servicios.
2. Ejecutar sandbox real de pago, retorno, cancelación, pendiente, duplicados, webhook firmado y reembolso.
3. Probar correos con destinatario autorizado, idempotencia y seguimiento.
4. Respaldar D1, aplicar migraciones y desplegar inicialmente con flags false. Verificar apex/www, APIs y sitios my/play.
5. Verificar Access, Turnstile, móvil y concurrencia remota.
6. Solicitar autorización expresa antes de cualquier cobro, guía o otra prueba que gaste dinero. Activar únicamente proveedores aceptados.

Los tests con mocks no satisfacen por sí solos los escenarios de compra real/sandbox o firma de un evento auténtico. La outbox corta reintentos tras 23 horas para evitar duplicados fuera de la ventana de idempotencia; los resultados inciertos requieren revisión.

## Evidencia adicional — 19 de octubre, revisión posterior

- Mercado Pago: /users/me HTTP 200 en ambos ambientes; sandbox identifica test_user y producción no. Tres secretos de producción instalados. Falta transacción completa y webhook auténtico.
- Resend: los envíos iniciales rebotaron antes de configurar Email Routing. Los siguientes quedaron suppressed. Se consultó la supresión (origin=bounce), se retiró únicamente pedidos@marlo.games tras corregir DNS y se reenviaron las plantillas autorizadas. Ambos IDs 01a156ad-105e-7dab-98a3-6ff4df9c9c40 y 01a156ad-1d95-71e9-a63d-091309927355 reportan delivered. Confirmación de bandeja por propietario pendiente.
- Skydropx: receptor /api/webhooks/skydropx implementado con HMAC-SHA512 del cuerpo original, límite 64 KB y lectura autenticada posterior del envío; nunca confía en estado ni URLs recibidas. Falta registrar el webhook y guardar SKYDROPX_WEBHOOK_SECRET.
- Empaques: editor publicado; 1–5 juegos usan estimaciones autorizadas explícitamente, marcadas provisionales. Pesos 285/545/825/1085/1345 g. Cajas 6+ requieren inventario real; no se instalaron cajas ficticias. El cambio de configuración invalida cotizaciones pendientes y cada pedido conserva su snapshot.
- Catálogos Skydropx consultados: Carta Porte disponible, búsqueda juegos retorna categorías candidatas; package_templates vacío es inventario de la cuenta, no catálogo general de códigos de embalaje. No se seleccionó un código por conjetura.
- Suite: 85 pruebas pasan, build TypeScript/Vite correcto. No equivale a pruebas completas con proveedores.
- Publicación f4814bcf-ee5d-413b-8b14-beaa233d870d. Rutas públicas y redirecciones verificadas; Access funciona con sesión, rechaza sin sesión; webhooks PayPal Live/Sandbox y Mercado Pago rechazan solicitudes sin firma (401). Pagos, correo automático y guías permanecen desactivados.
- Pendientes de aceptación comercial: servicios de transporte con condiciones acreditadas, catálogo postal, códigos de embalaje/Carta Porte, webhook Skydropx auténtico, aprobación/captura/reembolso sandbox y notificaciones auténticas de pagos, desafío Turnstile real y correo automático de ciclo completo.

### Pruebas de proveedores posteriores
- Propietario confirmó recepción de correo. Resend entregó ambas plantillas autorizadas; correo automático por ciclo completo sigue pendiente.
- SKYDROPX_WEBHOOK_SECRET instalado. Prueba desde panel Skydropx devolvió 409 por envío inexistente, lo que acredita firma aceptada. Receptor corregido para reconocer eventos firmados ajenos con 200 ignored. Prueba remota posterior: firma falsa 401, firma válida para envío desconocido 200 ignored. Falta notificación de seguimiento de un envío real asociado.
- Mercado Pago sandbox real: APRO=paid, FUND=rejected, CONT=pending; repetición de la misma creación devuelve el mismo ID. Detectado HTTP 402 con referencia en data.id: corregido manejo para conservarla y consultar estado autenticado. Suite 86 pruebas pasa y build correcto.
- Reembolso Mercado Pago sandbox devolvió HTTP 422 unprocessable_entity (Post processing rejected the operation); permanece pendiente, no se considera aprobado.
- PayPal sandbox: orden 21055538270378357 creada, PAYER_ACTION_REQUIRED; propietario necesita cuenta Personal sandbox. Espera aprobación antes de captura/reembolso.
- Versión publicada con corrección MP: eacbca54-a642-4182-9d65-e18aca3f9343. Flags comerciales siguen false.

### PayPal sandbox — ciclo de proveedor verificado
El propietario aprobó la orden 21055538270378357. El script consultó APPROVED, capturó y verificó paid, luego reembolsó y verificó refunded. D1 remoto confirmó recepción y verificación de los tres eventos auténticos: CHECKOUT.ORDER.APPROVED (recurso 21055538270378357), PAYMENT.CAPTURE.COMPLETED (0SK60991U42745448) y PAYMENT.CAPTURE.REFUNDED (92491491UB056173J). Sin dinero real. La página de retorno mostró sesión ausente porque la orden fue creada por el arnés aislado y no por checkout; no acredita todavía checkout completo, reserva de inventario, retorno privado ni correo automático de pedido. No habilitar pagos Live basándose solamente en esta prueba.
