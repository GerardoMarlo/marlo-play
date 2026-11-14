# Despliegue del rediseño — 17 de octubre de 2026

Autorizado explícitamente por el usuario. Publicado únicamente marlo-editorial.

- Versión: 2d78146c-94eb-4d18-9455-2510a3b281b5.
- Dominios: marlo.games y www.marlo.games.
- Build TypeScript/Vite aprobado; 37 assets nuevos/actualizados.
- Respaldo D1 previo: .wrangler/pre-redesign-production.sql (privado, ignorado por Git).
- Migración 0002_intercambio_navideno.sql aplicada correctamente, sin productos previos ni duplicados.
- Catálogo público: Intercambio Navideño, $259 MXN, coming_soon, stock 0.
- Pagos, correos y guías siguen desactivados.
- Ficha 200; www 301 al apex; slug anterior 301 al nuevo conservando query.
- Blog my.marlo.games 200; play raíz mantiene su 308 existente. No se desplegaron esos Workers ni se alteró DNS.
- Portada publicada revisada en navegador; captura docs/review/production-home.jpg.

Reversión del código, solo si se requiere: wrangler rollback 2de56baa-1f01-4b77-b2c5-ccd8c9dcf8b7 --config wrangler.production.jsonc. La migración es compatible con el código previo. No restaurar toda D1 automáticamente: revisar cambios posteriores y usar el respaldo selectivamente para evitar perder información nueva.
