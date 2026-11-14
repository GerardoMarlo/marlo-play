# Publicación de agenda y correos — 2026-10-26

Versión activa final: `2d8e1347-18ad-4a83-a0f8-17694dd3f44e`.

- Respaldo D1 completado en `.wrangler/backups/before-pickup-20261026.sql` (privado, excluido de Git).
- Migraciones `0008_local_pickup.sql` y `0009_pickup_availability.sql` aplicadas correctamente.
- `pickup_settings.enabled=true`, `LOCAL_PICKUP_ENABLED=true`, `EMAIL_ENABLED=true`.
- Avisos internos a `marlo.games.contact.mx@gmail.com`, con teléfono y botones de llamada/WhatsApp.
- Citas de 5 minutos. L–V 15:30–16:30; sábado 10:30–11:30 y 17:00–19:00; domingo 10:30–11:30. America/Mexico_City.
- Punto de encuentro: Entrada principal, a un lado de la tienda Nike.
- Texto publicado: “Envío rápido por paquetería: 5 días hábiles. Entrega directamente en tu dirección, sujeta a cobertura.”
- Se conservaron `PAYMENTS_ENABLED=false`, `MP_ENABLED=false`, `PAYPAL_ENABLED=false`, `LABELS_ENABLED=false`.

Validación: 169 pruebas aprobadas; compilación TypeScript/Vite aprobada. Verificación pública posterior: portada y agenda 200; API de agenda sin sesión 401; administrador redirige a Access 302; catálogo 200 y pagos desactivados. Bundle público contiene la nueva descripción del envío.

No se enviaron correos de prueba a personas ni se crearon citas de prueba reales en este despliegue. La autorización Google ya había comprobado acceso al calendario/freebusy e instalado cuatro secretos; no se afirma haber verificado en producción una reserva completa o entrega de correo. Si la app OAuth continúa en Testing, debe pasar a producción y reautorizarse para evitar la caducidad de siete días propia del modo de prueba.
