# Aceptación vigente — 20 de octubre de 2026

> Actualización: consultar [PRODUCTION-READINESS-2026-10-22.md](PRODUCTION-READINESS-2026-10-22.md) para el estado comprobado y los bloqueos actuales. Las notas siguientes son históricas.

## Actualización del 20 de octubre

- Cambio autorizado: 6+ juegos con envío nacional fijo de $70 MXN, gestión de guía manual y aviso exclusivo a pedidos@marlo.games después de pago confirmado. No se comunica el proceso interno al comprador. Administrador permite registrar seguimiento, dispara correo de guía y permite actualizar logística manualmente. No se consulta Skydropx ni se inventan medidas para esos pedidos. Se conserva validación de dirección, inventario y cotización vinculada al carrito.
- Pruebas: 91 pruebas automatizadas pasaron, incluida compra de seis juegos con tarifa 7000 centavos, aviso interno separado y registro manual. Build pasó. Publicado; comprobación remota de tarifa NO completada: D1 informa literalmente que se excedió el límite diario de escrituras del plan gratuito. Requiere ampliar plan o reinicio de cuota; no habilitar cobros mientras D1 no pueda registrar pedidos.
- Mercado Pago: usuario confirmó simulación auténtica HTTP 200 received tras actualizar el secreto sandbox.

- Mercado Pago: corregida preservación de mayúsculas en data.id al verificar HMAC y uso de x-request-id cuando el simulador omite id del evento. Publicado en 3f55ace7-f87e-42b2-b8d4-c019190ee6e7. Receptor público comprobado: firma válida 200, falsa 401. Pendiente repetición desde el panel del proveedor; prueba manual no acredita evento auténtico.
- Skydropx sandbox: nuevas credenciales OAuth 200; envío 0f2e413c-fce7-49b6-bff7-f96850a03049 finalizó success con FedEx Standard Overnight, total sandbox MXN 111.78, tracking y URL de etiqueta presentes. No se compró guía de producción ni se solicitó recolección real.
- La respuesta real usa included.type=package (singular). Corregido lector y añadida regresión para recuperar etiqueta y tracking; las direcciones incluidas se excluyen.
- Servicios: data/shipping-services.json registra evidencia del panel para FedEx Express Saver, Standard Overnight y DHL Express; secreto instalado. La tarjeta indica IVA y cargos extra incluidos. Cotizaciones siempre consultan precio actual; no se fija precio promocional. Recolección efectiva todavía pendiente de prueba.
- Códigos publicados: mercancía 60141103 (Naipes) y empaque 5H4 (bolsa de película plástica). Cajas 6+ siguen sin catálogo físico y requieren código de caja correspondiente.
- Restauración de respaldo en SQLite aislado pasó integridad y claves foráneas; no alteró producción.
- Saldo observado en cuenta Skydropx de producción: MXN 0.00; requiere fondos antes de comprar guías reales.

La tienda todavía no está aceptada para ventas completas. EMAIL_ENABLED=true; PAYMENTS_ENABLED, MP_ENABLED, PAYPAL_ENABLED y LABELS_ENABLED siguen false. No se hicieron cobros reales ni compras de guías.

## Verificado

- PayPal sandbox: orden 21055538270378357 aprobada por comprador, capturada y reembolsada. Tres webhooks auténticos verificados y almacenados. El retorno de esta prueba aislada no tuvo sesión de tienda: falta checkout completo en navegador.
- Mercado Pago sandbox: aprobado, rechazado, pendiente e idempotencia verificados. La orden ORDTST01M5BBSEKEC571TPC3KF1NDQ27 finalmente aceptó reembolso HTTP 201; GET posterior confirmó refunded. El reintento sin cuerpo conservó la clave de idempotencia. No se atribuye el error 422 previo a una causa no demostrada.
- Checkout por backend real con base aislada: pedidos, reserva/restauración de stock, estados de pago y duplicados verificados. Turnstile se simuló únicamente en ese arnés; no acredita navegador completo.
- Correos: propietario confirmó recepción tras retirar supresión por rebote. Los dos correos del arnés y el correo automático de contacto reportan delivered. IDs 01a156c4-bb64-7365-9b3e-68339bf59a63, 01a156c4-bc67-71d7-a2da-cbae568b31f3 y 01a156c9-888d-7775-ab60-a233d2c79e15. Cron procesó contacto como sent, sin error.
- Turnstile: formulario de contacto en navegador de producción aceptado; captura docs/review/contact-production-verified.png. Access probado con sesión autorizada; sin sesión redirige a login.
- Catálogo postal oficial SEPOMEX importado: 158360 registros únicos, 1018 duplicados idénticos descartados. Fuente actualizada 2026-10-18. SHA256 del TXT: 867650cd8451dfdb9704e2457ad445d34e08bc42649efa0927177db47605281d. Respaldo previo privado .wrangler/pre-postal-import-20261019.sql. GET públicos 06000/64000/45066 correctos.
- Skydropx: OAuth y cotizaciones reales funcionan. Webhook auténtico del panel aceptó firma; desconocidos ahora reciben 200 ignored, firmas falsas 401. Falta seguimiento de envío asociado real.
- Empaques 1–5: estimaciones autorizadas explícitamente, marcadas provisionales, pesos 285/545/825/1085/1345 g. No hay inventario real de cajas para 6+.

## Pendientes para habilitar ventas

1. Notificación auténtica Mercado Pago en receptor sandbox separado y checkout completo en navegador, incluidos retorno y cancelación.
2. SHIPPING_SERVICES_JSON con evidencia de domicilio, días hábiles y costos adicionales por servicio. No convertir disponibilidad de recolección en costo cero supuesto.
3. Códigos Skydropx de mercancía y empaque correctos, prueba de guía/recolección/seguimiento. La compra de una guía requiere aprobación del importe y destino concretos.
4. Catálogo físico de cajas para 6+ juegos; costos de materiales siguen desconocidos si no configurados.
5. Revisión móvil, concurrencia remota y ensayo de restauración aislado.

## Herramientas reproducibles

- scripts/test-checkout-sandbox.mjs: backend + proveedores sandbox, base aislada.
- scripts/recheck-mp-refund.mjs: consulta la orden sandbox conocida; --refund habilita reembolso, solo con cuenta test_user.
- scripts/diagnose-email.mjs: acepta IDs de correos para consultar entrega sin imprimir claves.
- scripts/download-postal-catalog.mjs y prepare-postal-catalog.mjs: descarga oficial y SQL privado validado; no publica el catálogo completo.
- scripts/verify-production.mjs: rutas, catálogo y rechazo de notificaciones sin firma.

Documentación oficial: https://www.mercadopago.com.mx/developers/es/reference/online-payments/checkout-api/refund-order/post y https://www.correosdemexico.gob.mx/sslservicios/consultacp/CodigoPostal_Exportar.aspx.
