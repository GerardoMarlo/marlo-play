# Implementación UX y checkout · 20 de octubre de 2026

> Registro histórico. La versión aprobada se publicó el 21 de octubre y el reembolso de prueba quedó confirmado. Estado actual: [RELEASE-2026-10-21.md](RELEASE-2026-10-21.md).

Cambios implementados en el proyecto existente. La versión no se ha desplegado en producción. Los documentos legales siguen siendo borradores para revisión. No se modificaron los interruptores de pagos, correos o guías de producción.

## Cambios

- Navegación de escritorio a 15 px, peso medio, espaciado y hover legibles; encabezado sticky conservado.
- Hover independiente de cartas mediante transformaciones, sin alterar su composición, con preferencia de movimiento reducido respetada.
- Carrito con superficies rectangulares, controles existentes, cupón y total de productos; sin importe ni fila de entrega. CTA «Continuar compra».
- Entrega local primero y seleccionada inicialmente; código postal de residencia verificado contra catálogo y municipios de la ZMG, más consentimiento explícito. No se pide domicilio de envío para recogida.
- Envío a domicilio a $70 MXN por defecto, configurable en Administración → Configuración. El servidor conserva el costo real del transportista separado del cargo al cliente y calcula el importe final.
- Todos los pedidos nacionales, incluidos seis juegos o más, deben tener cotización real elegible. Se eliminó la excepción que generaba una cotización manual ficticia de $70 para pedidos grandes. Se mantienen reglas de empaque, tránsito y selección de servicio.
- «Agregar dirección» revela los campos mexicanos. Validación de dirección y cobertura automática al continuar; las incidencias temporales siguen diferenciadas de la falta de cobertura.
- Mercado Pago seleccionado inicialmente. Tras validar datos y entrega, el formulario oficial se muestra en la misma ruta de checkout, con el total de la orden creada por el servidor. Actualizado el 21 de octubre: los campos seguros se muestran en el checkout; el servidor valida el total antes del cobro. La consulta posterior utiliza número de pedido y verificación por correo.
- Indicador verde «Pago seguro», logos oficiales obtenidos de métodos activos del proveedor y filtrados por importe. El backend utiliza el tipo crédito/débito indicado por el proveedor. PayPal conserva su captura, retorno y verificación de estado en servidor.
- Reintentos con nuevas cotizaciones conservan la identidad comercial del intento; no crean otra orden por un cambio de quoteId. Se bloquea iniciar un pago nuevo con una cotización vencida. Se renueva Turnstile tras un error de registro.
- Páginas `/terminos-de-compra` y `/aviso-de-privacidad`, alias antiguos conservados, enlaces desde footer y checkout. Los enlaces legales del formulario abren otra pestaña para conservar los datos ingresados.
- Casilla publicitaria opcional y desmarcada; estado, fecha y versión guardados con el pedido y en `marketing_subscribers`. Página de baja por token. Los correos de tipo `marketing` incluyen enlace de baja y se suprimen si no existe consentimiento al enviarse. No se enviaron campañas.

## Archivos modificados o añadidos

Rutas relativas a `editorial/`:

| Área | Archivos |
| --- | --- |
| Interfaz | `src/main.tsx`, `src/CartDrawer.tsx`, `src/Showcase.tsx`, `src/checkout.css`, `src/Admin.tsx` |
| Modelo y configuración | `src/domain.ts`, `src/content.ts` |
| Legal y baja | `src/LegalDocument.tsx`, `src/Unsubscribe.tsx` |
| Servidor | `api/worker.ts`, `api/providers.ts`, `api/shipping-policy.ts`, `api/emails.ts`, `api/site.ts` |
| Base de datos | `migrations/schema/0005_marketing.sql` |
| Pruebas | `tests/commerce.test.ts`, `tests/providers.test.ts`, `tests/db.ts`, `tests/payment-return.test.ts`, `tests/fulfillment.test.ts` |
| Diagnóstico reproducible | `scripts/verify-checkout-ui.mjs`, `scripts/verify-payment-methods.mjs` |
| Documentación | Este informe, `docs/LEGAL-REVIEW-2026-10-20.md` y capturas en `docs/ux-verification/` |

## Pruebas y resultados

- `npm run build`: correcto, TypeScript y Vite. Advertencias de anotaciones de terceros en Zod, sin fallo de compilación.
- `npm test`: 97 pruebas, 13 archivos, todas correctas. Incluyen totales, cupones, inventario, idempotencia, tarifas separadas, recogida inelegible, consentimiento, baja, supresión de marketing, pagos, retornos, webhooks, empaque y logística.
- `node scripts/verify-checkout-ui.mjs --providers`: revisión de 1440, 1280, 768 y 390 px con catálogo y órdenes locales de prueba; no valida un pedido real de producción. Comprueba navegación, hover, movimiento reducido, carrito, opciones predeterminadas, total $259/$329, casilla de marketing desmarcada y ausencia de desbordamientos. Un rechazo de cobertura produjo cero órdenes y un reintento válido produjo una sola.
- Los SDK oficiales de Mercado Pago y PayPal se montaron en 390 px con claves públicas de sandbox y una orden local simulada. Se capturaron campos seguros y botones reales; la prueba de interfaz no envía pagos.
- Mercado Pago: autenticación real de cuentas sandbox y producción, HTTP 200. Consulta de medios activos HTTP 200; Visa, Mastercard, American Express y débito Visa/Mastercard disponibles para los importes probados. Esto no garantiza autorización bancaria de cada tarjeta.
- PayPal: autenticación de sandbox y producción, HTTP 200. SDK renderizado; no se ejecutó una compra completa con aprobación de comprador en esta sesión.
- Skydropx sandbox: autenticación HTTP 200 y cotización completada con tarifas reales del entorno de pruebas. No se generaron guías ni recolecciones. Esta prueba no certifica cobertura de producción para otros domicilios ni verificación física de empaques.
- Mercado Pago sandbox: escenarios APRO aprobado, FUND rechazado y CONT pendiente confirmados por lectura en servidor. Repetir APRO devolvió la misma operación. El reembolso de APRO falló con HTTP 422, `unprocessable_entity`, «Post processing rejected the operation». La prueba integral termina con error por este punto: no debe reportarse como un flujo completo aprobado.

## Capturas

En `docs/ux-verification/`: `home-{ancho}.png`, `cart-{ancho}.png`, `checkout-local-{ancho}.png`, `checkout-address-{ancho}.png`; además `secure-mercadopago-390.png` y `secure-paypal-390.png`. Los importes e inventario visibles pertenecen al catálogo local de prueba.

## Revisión legal y datos recibidos

El documento de revisión contiene el nombre Luis Gerardo Martinez Lozano, RFC MALL991103HW2, domicilio fiscal proporcionado y soporte@marlo.games, sin teléfono de soporte. Incluye preparación de hasta dos días hábiles, cancelación antes del envío y devolución/reembolso por daños. Conserva expresamente los derechos legales por defectos, incumplimiento y demás supuestos aplicables.

Falta aprobar el texto completo y fijar la fecha efectiva. También confirmar impuestos y facturación, plazo operativo de atención/reembolso, domicilio e instrucciones de devolución, gastos por devolución dañada, calendario de conservación y procedimiento ARCO. La versión de consentimiento actual es `2026-10-20-draft`; debe cambiarse junto con el aviso definitivo.

Revisión contrastada con la [LFPDPPP vigente](https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPDPPP.pdf) y la [Ley Federal de Protección al Consumidor](https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPC.pdf). Los borradores no representan una certificación jurídica; requieren revisión final de las políticas y su operación.

## Antes de publicar y activar ventas

1. Revisar y aprobar los documentos completos, completar pendientes y actualizar versión/fecha; no publicar el borrador como política final.
2. Respaldar D1 y aplicar `0005_marketing.sql` antes del nuevo código. Esta sesión solo aplicó la migración a bases efímeras de pruebas.
3. Resolver o explicar con el proveedor el reembolso sandbox 422 y repetir la prueba; completar aprobación/captura de PayPal con comprador sandbox y validación de webhooks del despliegue final.
4. Validar catálogo postal real, evidencia de entrega a domicilio, plazo de seis días hábiles y empaques para cada tamaño de pedido. Los pedidos grandes ahora quedan bloqueados si su empaque no está configurado.
5. Verificar que soporte@marlo.games recibe solicitudes y que las futuras campañas utilicen el tipo `marketing`, respeten la tabla de consentimiento y el enlace de baja. No hay una campaña automática activada por comprar.
6. Desplegar en el storefront `marlo.games` después de la revisión y repetir comprobaciones del sitio. Los pagos continúan deshabilitados: este trabajo no cambia `PAYMENTS_ENABLED`, `MP_ENABLED` ni `PAYPAL_ENABLED`.
