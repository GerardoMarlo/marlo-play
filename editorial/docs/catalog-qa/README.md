# Catalog and online play — 2026-11-16

Published to marlo.games and www.marlo.games on 2026-11-16. Cloudflare version: bfa3574a-c818-47f7-9530-429dbfd47df2.

## Files
- src/Showcase.tsx: online hero anchor; catalog purchase actions using canBuy and the existing onAdd callback; shared promotional banner after the first real catalog product and after product information.
- src/main.tsx: passes existing App.add to home/catalog and inserts the same banner in /juegos.
- src/PlayMarloPromoBanner.tsx: configurable image, shared copy, semantic link, SVG arrow.
- src/storefront.css: responsive promotion and actions; game-about layout override only at min-width:1001px.
- public/images/play-marlo/impostor-hero.webp and SOURCES.md: unchanged 46,302-byte portal illustration, including the original orange robot. No separate transparent mascot was found; full artwork is intentionally preserved.
- scripts/verify-catalog-promo.mjs and docs/catalog-qa/: browser checks and evidence.

## Validation
- npm run build: passed, including tsc --noEmit. Rollup reported non-blocking annotations in the existing Zod dependency.
- npm test: 23 files, 186 tests passed.
- No lint script/configuration is supplied in package.json; lint was not run.
- Edge/Playwright: home, catalog and product at 320,390,768,1440px; no horizontal overflow; image loads; semantic online links; banner order; available-only purchase buttons; shared cart storage, header and accessible feedback; mobile about computed metrics unchanged; sticky header and back-to-top.
- Availability scenarios include empty catalog, zero stock, unavailable products and preorder flag enabled/disabled.
- Browser tests use intercepted catalog data, not production inventory. No payment or order is submitted. Real-device Safari and assistive technology testing remain unverified.

All new online links target https://play.marlo.games. Existing product copy was retained, including the current heading “Encuentra tus regalos favoritos.” which differs from the request's example.

Cart path: CatalogRow -> App.add -> addToCart -> shared React state/useCart storage. The existing drawer and role=status toast provide feedback. Existing stock and quantity caps remain in addToCart; canBuy controls availability, and catalog click handlers suppress rapid duplicate events.

Final browser run: run-1794851219026/results.json. Rapid duplicate click added exactly one unit; checkout navigation retained the cart. Passed without submitting an order.


Production: scripts/verify-catalog-production.mjs passed at 390 and 1440 px across home, catalog and product detail, using the live catalog. Verified banner position/image/links, desktop alignment, no overflow, cart count/storage and www redirect. No orders or payments submitted. Results: production-results.json.
