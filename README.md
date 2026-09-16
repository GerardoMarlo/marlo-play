# MARLO Play

Independent static portal at https://marlo.games and game routing Worker at https://play.marlo.games. The play root permanently redirects to the MARLO homepage; game URLs remain unchanged.

## Build and test

Use Node 24. Run `npm run build` and `npm test`. No runtime packages are needed. The build emits a static `dist/index.html` and a self-contained `dist/worker.mjs`. HTML/CSS is compiled once, not rendered from game state. `npm run deploy` deploys the Worker via Wrangler after authentication.

## Content and routing

Edit `src/catalog.mjs`. `sections` supplies both accessible accordion banners and their entries. `origins` is the server-only allowlist mapping a slug to its independent Pages origin. Do not put origin URLs in public catalogue entries.

To add a game:
1. Create its own repository and Pages project (`npm run build`, output `dist`).
2. Add `<slug>-origin.marlo.games` as its Pages custom domain, then add a proxied CNAME pointing to its Pages hostname.
3. Add one origin entry and one available Games entry in `src/catalog.mjs`.
4. Make the game emit relative bundle URLs and use `<base href="/">` plus document.baseURI for runtime artwork. The gateway rewrites this base to `/<slug>/`. Apps with client routers must separately configure their route basename.
5. Deploy this portal, then test the exact slug, trailing slash, nested refresh, asset requests and unknown paths. Later game updates deploy only that Pages project.

Add non-game entries to the `not-games` section and a corresponding origin mapping when applicable. No component changes are needed. Each entry has slug, title, description, status and optional tag or public url. By default entries link to https://play.marlo.games/<slug>; use url for non-game projects hosted elsewhere.

## Cloudflare configuration

Worker: marlo-play. Custom Domains: marlo.games and play.marlo.games (Cloudflare-managed DNS/certificate).
Pigeon origin: pigeongod-origin.marlo.games, proxied CNAME to games-of-the-pigeon-god.pages.dev and registered on that Pages project.
No Origin Rules or Transform Rules are used: Free-plan Host/DNS overrides are unavailable; the Worker handles prefix stripping and redirects.
The apex Custom Domain serves the portal. Cloudflare manages its DNS and certificate; preserve unrelated email records.

The router preserves query strings, strips only a registered leading slug, limits requests to GET/HEAD for current static apps, streams origin bodies, and rewrites same-origin Location headers. Unknown slugs and missing assets return 404. Fetch failures return 502. Cookies/auth are not forwarded: future authenticated apps need an explicit reviewed extension.

The portal canonical URL is https://marlo.games/. Game canonical URLs remain under play.marlo.games. Origin hostnames are not secret or access-protected. Do not globally redirect an origin to the gateway (that creates a proxy loop). Games share a browser origin: namespace localStorage/IndexedDB keys and scope service workers to their mount.

Worker invocations include proxied game assets; monitor Workers request limits. Portal HTML is small and cacheable; no database, paid plan upgrade or persistent server is required.

## Deployment and rollback

Deploy this repository independently with `node build.mjs` and `npx wrangler deploy`. The wrangler.jsonc file owns the Worker name, entry point and Custom Domain. Cloudflare Git builds should watch `*`, not dist (which is generated). Keep API tokens in Cloudflare/GitHub secrets, never in this repository.

Rollback by redeploying a prior portal commit or selecting a previous Worker deployment. Game releases/rollback remain in the independent Pages project.

## Homepage design and artwork

The homepage uses pumpkin orange, mustard, cream and warm brown design tokens in `src/portal.css`. Its workshop hero, project cards and both accordion sections share the same responsive design. Native buttons support keyboard navigation; reduced-motion settings disable animation.

Edit `src/catalog.mjs` to add projects. Optional fields include `image`, `imageAlt`, `details`, `cta`, and `url`. The brand logo and English Pigeon God cover live in `assets/`; original PNGs are retained alongside optimized WebP delivery files. The build bundles the two WebP files into the existing Worker and copies them into `dist/assets/` for static previews. No extra service or storage binding is required. Add new local artwork to the build's explicit asset list.

The cover was supplied by the owner and its title translated into English with image generation. Its printed player/age/duration icons belong to the supplied physical-game artwork, not browser-mode specifications. Game code and rules are maintained separately.
