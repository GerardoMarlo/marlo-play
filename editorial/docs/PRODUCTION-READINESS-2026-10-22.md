# Producción y aceptación operativa — 22 de octubre de 2026

## Publicación completada

Sitio: https://marlo.games. Versión final `6d1fdeca-81be-4829-ba6a-7195cb7b302b`.
Incluye checkout integrado, logos únicos, páginas legales, números cortos de pedido,
consulta unificada por pedido o guía y correo, sesiones y códigos de un solo uso.
La migración `0007_order_access.sql` se aplicó remotamente tras respaldar D1 en
`.wrangler/pre-release-2026-10-22-production.sql` (privado, ignorado por Git).
La restauración de ese respaldo en SQLite aislado pasó integridad y claves foráneas.
No había pedidos ni correos pendientes de conciliación; un correo anterior estaba enviado.

## Avances y evidencia actual

| Área | Resultado comprobado hoy |
| --- | --- |
| Mercado Pago | Credenciales sandbox y producción autentican HTTP 200; cuenta productiva no es test_user. Compra completa desde formulario real sandbox aprobada: MG-2026-000001, dos juegos, MXN 518 ficticios, confirmación visible. |
| Corrección de tarjeta | Orders API rechazaba `issuer_id` con `unsupported_properties`. Se eliminó ese campo del adaptador y se cubrió con regresión. El checkout ahora impide crear pedidos si el formulario no devuelve token válido. |
| PayPal | OAuth live y consulta del webhook HTTP 200; URL y seis eventos correctos. El SDK crea un pedido desde el checkout sandbox. La ventana de aprobación no se abrió en el navegador integrado; la compra completa actual sigue pendiente. Los eventos remotos conservan aprobación/captura/reembolso sandbox anteriores. |
| Correos | Dominio Resend `verified`. Una prueba de código autorizada a pedidos@marlo.games figura `delivered`, ID `01a164a7-0d40-7e58-979e-ade844ac2d8d`. Código de un solo uso y cookie Secure comprobados en base aislada; no se insertaron pedidos ficticios en D1 productivo. |
| Envíos | OAuth de producción HTTP 200. Corregido email faltante del origen con soporte@marlo.games, conservando los demás datos. Instalados únicamente SHIPPING_ORIGIN_JSON y SHIPPING_SERVICES_JSON. Cotizaciones reales de 1 y 5 juegos a CP 06000 HTTP 200, FedEx, cargo cliente MXN 70. |
| Saldo | Panel autenticado de Skydropx muestra MXN 0.00 el 22 de octubre. No se compraron guías ni se cargó saldo. |
| Pedidos 6+ | Por indicación posterior del titular, se combinan bolsas registradas: mínimo número de bolsas y, en empate, menor volumen. Ya no requiere cajas. Skydropx sandbox generó dos guías distintas para seis juegos (4+2); no hubo dinero ni recolección real. |
| Infraestructura | Apex 200, www 301, my 200, play conserva 308; Access protege administración; webhooks sin firma 401. SEPOMEX responde para 06000/64000/45066. D1 aceptó migración y escrituras de cotizaciones; no se reprodujo el antiguo error de cuota diaria. |
| Pruebas | 140 pruebas en 19 archivos aprobadas, TypeScript/Vite correcto, navegador productivo móvil con legales vigentes, rastreo precargado, FAQ y checkout, sin enviar pedidos productivos. |

## Pendientes concretos para activar todo

1. **Skydropx:** cargar saldo suficiente para las guías elegidas. El dueño realiza la recarga; no se ha autorizado un importe.
2. **Empaques:** resuelto el bloqueo de 6+ usando múltiples bolsas existentes. Sus dimensiones siguen siendo estimaciones autorizadas, no medidas físicas verificadas hoy. Confirmarlas físicamente antes de despachar reduce riesgo de ajustes del transportista.
3. **PayPal:** terminar la aprobación de una compra sandbox desde el checkout en navegador con ventanas emergentes, comprobar captura, confirmación y cancelación. No basta la autenticación ni la prueba histórica por API.
4. **Guía y recolección:** seleccionar un envío controlado con dirección y precio concretos, autorizar su compra, comprobar etiqueta, recolección y eventos auténticos de tránsito/entrega. El historial real de un paquete no se puede simular como aceptación productiva.
5. **Servicios:** la evidencia actual de FedEx/DHL vence el 27 de octubre a las 00:00 UTC (26 de octubre, 18:00 centro de México). Revisar condiciones reales antes de renovar; no ampliar fechas por conjetura.
6. **Activación:** tras completar las pruebas pendientes, habilitar PAYMENTS_ENABLED y cada proveedor aceptado; habilitar LABELS_ENABLED cuando haya saldo y aceptación de guías. Ejecutar una compra controlada y conciliación con importe y medio elegidos por el titular.

Estado final: EMAIL_ENABLED=true; PAYMENTS_ENABLED=false, MP_ENABLED=false,
PAYPAL_ENABLED=false, LABELS_ENABLED=false. El sitio está publicado; no se afirma
que ya acepte dinero real ni que las guías estén operativas. No se efectuaron cobros reales.

## Referencias

- [Contrato oficial Orders API](https://www.mercadopago.com.mx/developers/es/reference/online-payments/checkout-api/create-order/post).
- [Migración oficial de Payments a Orders](https://www.mercadopago.com.mx/developers/es/docs/checkout-api-orders/resources/migrate-payments-to-orders).
- [Evidencia visual sandbox](ux-verification/sandbox-inline-paid-2026-10-22.png).

Scripts nuevos: `audit-commerce-readiness.mjs`, `complete-shipping-config.mjs`,
`verify-order-code-delivery.mjs`. Sus salidas privadas están en `.wrangler/` y no
contienen credenciales. No volver a ejecutar el envío de correo eliminando su recibo:
la autorización recibida fue para una única prueba.


## Combinación de bolsas publicada

- Planes reutilizables de 1–2 juegos en bolsa pequeña y 3–5 en bolsa grande, sin inventar medidas nuevas ni depender de cajas.
- Cada bolsa incluye peso de juegos, espuma, bolsa, cinta y material adicional; los costos desconocidos siguen pendientes.
- Se cotiza el conjunto con servicios multipaquete, conservando el costo real completo y el cargo fijo de MXN 70 al comprador.
- Se envía un paquete a Skydropx por bolsa. Prueba sandbox con seis juegos: bolsas de cuatro y dos, dos etiquetas, dos números de guía, workflow success.
- El pedido no pasa a entregado hasta que todas las bolsas tengan su guía y estén entregadas. Las etiquetas parciales no disparan un correo que omita bolsas pendientes.
- La política de empaque forma parte de la huella de cotización: las cotizaciones de la política anterior se deben renovar.
- Editor administrativo actualizado; no se eliminan configuraciones históricas de cajas ni se cambian los empaques de pedidos ya registrados.
- Archivos: src/packaging.ts, src/PackagingEditor.tsx, api/worker.ts; pruebas de packaging, shipping-policy, fulfillment y tracking.
- Verificación posterior al despliegue: cotizaciones productivas de 6, 10 y 20 juegos aprobadas con FedEx y cargo al comprador de MXN 70 por pedido. Sin crear pedidos ni comprar guías reales.
