# Marlo Games: visual source of truth

## Palette update (2026-11-09)
The requested color-only update supersedes the coral homepage hero and decorative mint references below. The Intercambio Navideño homepage hero shares --festive-red (#a62f31) with the product story and reuses Snowfall behind its content. Keep the existing card composition and layout. Decorative colors are --brand-blue (#bbd7e5), --brand-blue-light (#dceaf1), and --brand-blue-deep (#416d85). Preserve availability greens, including the separate --availability-surface (#bce0c7). The persisted theme-mint identifier remains compatible but renders the blue palette. Snow travels the full height of its own layer, with the existing mobile density, pause controls and reduced-motion behavior. This change does not modify play.marlo.games or deploy production.

## Current direction (2026-10-28)
The user's selective rollback supersedes the earlier antiwebslop visual proposal. Use the existing playful.css, redesign.css and brand.css presentation. Do not flatten cards, remove the colorful editorial blocks, replace the typography, or propose a third design.

- Homepage: original coral hero, sticker, composition, colored sections and buttons.
- Catalog: yellow tilted artwork panel with offset shadow, as explicitly confirmed from reference image 3.
- Editorial: orange publisher panel with logo and the three yellow, mint and peach delivery/payment cards, matching reference image 1. Keep dynamic shipping and provider text.
- Product: original festive gallery, typography, cards and red GameStory section, matching reference image 2.
- Snow: reuse Snowfall in the product gallery and red GameStory only. Same deterministic particle timings and density; 16 particles on mobile. Story snow sits behind content at half opacity. Each section has a pause control; reduced motion hides both layers and controls.
- Canvas: #fff8ea, the old header's opaque cream. Sticky header: #f5ebd6, a slightly darker existing palette tone. The word 'slug' referred to this header, not any route.

## Implementation boundaries
storefront.css now contains only the snow layers and the requested background/header palette. Shared commerce behavior, APIs, provider integrations, emails, admin, routing and SEO stay intact. Existing navigation accessibility attributes are retained. No production deployment is authorized.

## Evidence and preservation
Git has no tracked history for editorial/. The preceding presentation survived in the original CSS files, so only the newly added overrides and removed decorative JSX were reversed. Before-edit copies are in docs/ui-rollback-before/. These are archival evidence, not active sources.

## Validation
npm run build includes tsc --noEmit and Vite. npm test runs the commerce regression suite. No npm lint script exists; check changed files with the installed Prettier checker. Browser validation is in scripts/verify-storefront.local.mjs and docs/storefront-verification/, using a local catalog fixture with no live transactions.

## Latest user correction
The follow-up screenshot explicitly supersedes the earlier request to keep the orange publisher panel and colored delivery cards. Restore the previous clean, light publisher section and three divider-separated delivery rows. Keep the other selective rollback decisions, the catalog reference, the palette and snow unchanged. Retain the mobile overlap correction for purchase controls.
