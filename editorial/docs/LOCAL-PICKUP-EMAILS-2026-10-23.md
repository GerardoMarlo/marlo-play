# Correos y entregas locales — implementación 2026-10-23

La duración predeterminada es **5 minutos por cliente**, capacidad exclusiva de una cita. La agenda está desactivada por defecto. No se han enviado correos reales, autorizado Google ni aplicado esta migración en producción durante esta implementación.

## Cambios

- `api/email-templates.ts`: textos cálidos en español mexicano, logotipo aprobado PNG compatible con correo, HTML adaptable, versión texto, datos escapados, pedidos y paquetes individuales. Invitación, cita, cambio, cancelación, recordatorio y recogida tienen plantillas propias. Las notificaciones internas incluyen acción, contacto y pedido.
- `api/emails.ts`: conserva cola, arrendamiento, cinco intentos, retroceso e idempotencia Resend. Retrasa 5 minutos el correo pendiente y lo suprime si el pedido dejó de estar pendiente. Suprime coordinación antigua y avisos de envío manual obsoletos. Invalida correos de citas anteriores. Reply-To solo si `EMAIL_REPLY_TO` está configurado.
- `api/worker.ts`: una confirmación tras pago; preparación interna separada; invitación solo al marcar listo. Reutiliza la sesión OTP y Cloudflare Access. Corrige colisión entre identificadores de correos de rechazo/reembolso para cliente y administrador. Los formularios incluyen los datos recibidos.
- `api/local-pickup.ts`, `api/pickup-calendar.ts`, `src/local-pickup-config.ts`: agenda privada, 5 minutos, aviso mínimo 24 horas, plazo de cambios configurable, márgenes, descansos, cierres, responsable y punto de encuentro. Sin horarios laborales predefinidos. Próximos 60 días. La tarea cron existente reconcilia y encola recordatorios; no crea trabajos por cliente.
- `src/LocalPickup.tsx`, CSS: selector de fecha/horas para cliente verificado y administración de preparación, agenda semanal, configuración, citas, historial y recuperación.
- Rutas: `/pedido/agendar-entrega`; `GET/POST /api/pickup`; `GET/POST /api/admin/local-pickup`.
- `0008_local_pickup.sql`: configuración, citas, historial, restricciones de solapamiento y una cita activa por pedido. Conserva overrides anteriores de correo en `email_template_archive` antes de activar los nuevos textos.

## Google Calendar: autorización segura

1. Usa una cuenta de Google del negocio. Se recomienda una cuenta dedicada: el permiso de eventos propios abarca los calendarios que esa cuenta posee; Google no limita este permiso OAuth a un ID. El servidor usa exclusivamente el ID configurado y conserva el ID original en cada cita.
2. En Google Calendar crea un calendario secundario **Marlo Games — Entregas locales**, zona **America/Mexico_City**. Déjalo privado. Copia su ID desde Configuración > Integrar calendario. No uses `primary`, un enlace público ni un feed compartido.
3. En Google Cloud Console crea o selecciona el proyecto de Marlo Games y habilita **Google Calendar API**.
4. En Google Auth Platform configura Branding/Audience/Data Access. Usa Internal solo si tu organización Workspace lo permite; en caso contrario External y agrega tu cuenta como usuario de prueba durante validación. Revisa las condiciones de publicación/verificación y vigencia de refresh tokens de aplicaciones en prueba antes de producción.
5. Solicita únicamente `https://www.googleapis.com/auth/calendar.events.owned` y `https://www.googleapis.com/auth/calendar.freebusy`. No solicites acceso completo a calendarios, contactos o correo.
6. Crea cliente OAuth tipo **Web application**. Registra exactamente `c` como URI de redirección autorizada. Descarga el JSON fuera del repositorio; no lo adjuntes al chat.
7. Inicia sesión en Cloudflare con Wrangler. Desde `editorial`, ejecuta en tu terminal (sustituye rutas e ID, nunca pegues el contenido del JSON):

   ```powershell
   node scripts/authorize-pickup-calendar.mjs --credentials 'C:\ruta-privada\client.json' --calendar 'ID@group.calendar.google.com' --config wrangler.production.jsonc
   ```

   Este comando abre un receptor de loopback, muestra una URL de Google, valida `state` y PKCE, solicita acceso offline, verifica lectura del calendario/free-busy e instala los cuatro secretos mediante `wrangler secret bulk` por stdin. No imprime ni guarda tokens en disco. El proceso tiene 10 minutos de vigencia. Abre la URL con la cuenta propietaria y autoriza allí. El comando modifica secretos del Worker indicado; conserva `LOCAL_PICKUP_ENABLED=false`.
8. Secretos instalados: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `GOOGLE_CALENDAR_ID`. `EMAIL_REPLY_TO` es opcional y debe ser una bandeja real atendida; configúrala con `wrangler secret put EMAIL_REPLY_TO --config wrangler.production.jsonc` en tu terminal.

Fuentes oficiales: [permisos Calendar](https://developers.google.com/workspace/calendar/api/auth), [OAuth de servidor con acceso offline](https://developers.google.com/identity/protocols/oauth2/web-server), [creación de eventos](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert).

## Despliegue y activación pendientes

1. Respaldar D1 y revisar el inventario real de templates/cola. No reescribir correos ya enviados ni snapshots de intentos anteriores: su idempotencia debe conservarse.
2. Probar la migración en un entorno de ensayo, con correo desactivado. Aplicar migraciones antes de desplegar el código que consulta las tablas nuevas.
3. Desplegar inicialmente con `LOCAL_PICKUP_ENABLED=false`. No modificar las banderas de pagos ni etiquetas.
4. Autorizar Google mediante el procedimiento anterior y verificar el dominio de Resend/remitente. Probar el envío únicamente a buzones de prueba autorizados.
5. En **Entregas locales** definir días, horarios, descansos, cierres, punto preciso de encuentro y responsable. Duración inicial: **5 minutos**. Guardar y activar la disponibilidad.
6. Habilitar `LOCAL_PICKUP_ENABLED=true` solo tras verificar con pedidos de ensayo: reserva exclusiva, cambio, cancelación, recordatorio, recogida y fallos de conexión. Mantener separado el calendario de ensayo del calendario operativo.
7. Revisar las sincronizaciones pendientes desde administración. Nunca borrar una reserva de D1 para liberar un horario con estado incierto. Corregir el conflicto en el calendario y reconciliar, o cancelar la solicitud desde el administrador; el horario se libera después de verificar la eliminación remota.

## Límites operativos y verificaciones

- D1 y Google no comparten una transacción. Las restricciones impiden solapamientos entre clientes de Marlo; se revisa Google antes y después de escribir, se usa un ID estable y se retienen horarios ante errores. Una edición manual posterior en Google puede crear un conflicto fuera del sistema: gestionar citas desde Marlo y usar el calendario dedicado para bloqueos, sin mover manualmente eventos de Marlo.
- Reprogramar conserva ambos horarios mientras se confirma Google. Cancelar una cita no reembolsa ni libera el inventario del pedido.
- El sistema conserva el modelo existente de pago. Diferencia rechazo/fallo/cancelación cuando hay estado verificado; los templates de estados adicionales de reembolso no se disparan sin un evento soportado por el proveedor.
- El recordatorio usa “Mañana” solo si corresponde al día siguiente en Ciudad de México. Las citas creadas con menos de 23 horas de anticipación no reciben inmediatamente un recordatorio redundante. El recordatorio adicional del día está desactivado.
- No hay autorización Google real ni prueba de entrega real de Resend aún. Las pruebas automatizadas del proveedor usan respuestas controladas y no sustituyen el ensayo de integración con la cuenta autorizada.

## Evidencia de validación local

- `npm run build`: aprobado (TypeScript y compilación Vite).
- `vitest run`: **164 pruebas aprobadas en 21 archivos**. Incluye 24 pruebas nuevas de agenda/configuración y los escenarios existentes de pagos, inventario, seguridad, envío, acceso al pedido y cola de correo.
- Edge sin interfaz, con respuestas de API controladas: reserva de cinco minutos y confirmación a 390/1440 px; administración a 390/1440 px; correos a 390/1200 px. Sin desbordamiento horizontal ni errores del navegador. Evidencia en `docs/pickup-verification/`.
- 34 vistas de correo HTML y texto con datos ficticios en `docs/email-preview/index.html`; generación reproducible con `node scripts/export-email-preview.mjs`.
- `node --check scripts/authorize-pickup-calendar.mjs`: aprobado. El intercambio OAuth y la instalación real de secretos no se han ejecutado.

Comandos de publicación para el paso aprobado de despliegue, desde `editorial` (no ejecutados en esta tarea):

```powershell
New-Item -ItemType Directory -Force .wrangler/backups
.\node_modules\.bin\wrangler.cmd d1 export marlo-editorial --remote --config wrangler.production.jsonc --output .wrangler/backups/before-pickup.sql
.\node_modules\.bin\wrangler.cmd d1 migrations apply marlo-editorial --remote --config wrangler.production.jsonc
npm.cmd run build
.\node_modules\.bin\wrangler.cmd deploy --config wrangler.production.jsonc
```

El respaldo contiene datos de clientes: se guarda dentro de `.wrangler`, excluido de Git. El despliegue inicial debe conservar `LOCAL_PICKUP_ENABLED=false`. La autorización y el ensayo real del calendario son requisitos para activar reservas; la compilación y los tests locales por sí solos no prueban acceso real a Google ni entrega de correo.

## Configuración indicada por el propietario — 2026-10-26

Preparada en `0009_pickup_availability.sql`: lunes a viernes 15:30–16:30; sábados 10:30–11:30 y 17:00–19:00; domingos 10:30–11:30. Zona America/Mexico_City, citas de 5 minutos. Punto: **Entrada principal, a un lado de la tienda Nike.** La migración conserva la activación, cierres y demás opciones existentes; no se ha aplicado a producción en esta actualización.

Los avisos internos de preparación y entrega incluyen el teléfono registrado en el pedido y enlaces `tel:` / `https://wa.me/` para llamar o abrir un chat. No envían mensajes de WhatsApp automáticamente. Se conserva el número visible en texto y se omiten enlaces si el formato no es válido. [Formato de enlaces de WhatsApp](https://faq.whatsapp.com/5913398998672934).

Validación de esta actualización: 25 pruebas de agenda/contacto aprobadas; vistas de correo regeneradas en `docs/email-preview`. Las credenciales Google se autorizaron y guardaron en Cloudflare durante la configuración posterior a la implementación inicial; eso no activa por sí solo las reservas.
