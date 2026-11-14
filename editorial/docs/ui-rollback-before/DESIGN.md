# Marlo Games: storefront design

## Product and audience
Spanish-language shop for Mexican families and tabletop players. Help visitors understand a game, inspect real illustrations, buy, and find delivery information. React + Vite. Real artwork lives in public/images and the approved logo in public/brand.

## Design Read
An independent game publisher with an illustrated, warm, legible storefront. Home and catalog: persuade/showcase V5 M2 D4. Product: showcase/operate V4 M3 D5. Checkout, tracking and help: operate/read V2 M1 D5.

## Tokens
Existing brand colors and the fonts Fraunces (600/800) and DM Sans (400/600) stay. Warm paper is an established Marlo brand choice, not a new template palette. Merchant product themes remain configurable.

```design-tokens
fonts: Fraunces, DM Sans
colors: #fcfaf5, #655d51, #bd512b, #fff
radii: 0, 6px, 50%
```

Typography: balanced headings, normal body tracking, display tracking -0.025em, body 14–18px with 1.6–1.75 leading. Spacing: 4, 8, 12, 16, 24, 32, 40, 48, 64. Controls have a 6px radius; sections use spacing and rules. Preserve the responsive grids and existing commerce behaviors.

## Motion and imagery
Use authentic game illustrations. Snow is the single seasonal motion, restricted to the Intercambio Navideño gallery, with 24 deterministic CSS particles (16 on phones), pointer-events disabled, a pause control, and no motion under prefers-reduced-motion. No image-obscuring scrim. No new dependency.

## 2026-10-28: quieter shop, clearer products
Removed the detached hero sticker and decorative location strip. Removed heavy offset shadows from primary actions, rotation from forms, repeated colored delivery cards and patterned gallery background. Product artwork supplies the personality. Shared navigation, readable help, forms and cart inherit the same paper/ink vocabulary. Preserve price, inventory, optional consent, shipping, payments and email workflows. Admin is outside the public redesign scope. Validate locally before requesting production deployment approval.

## Review exceptions
The remaining lint warnings in existing JSX have been reviewed: delivery labels distinguish fulfillment methods; product category and availability labels convey actual catalog data; section labels orient the longer rules/help pages; checkout numbers represent the real contact/delivery/payment sequence. The three story numbers summarize successive decisions during a game. The brand-line has two borders because it is a single standalone divider, not repeated list rows. The flagged word “Partidas.” is sentence copy inside the about page, not the logo. Existing delivery-copy dashes separate the local-only ZMG qualifier and are retained to avoid changing fulfillment meaning. No lint errors were found in the changed files.
