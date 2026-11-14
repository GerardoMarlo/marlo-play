import api from "./worker";
import { processOutbox } from "./emails";
import type { Env } from "./types";
import { oldProductPaths } from "../src/launch";
import { pageMetadata, jsonForHtml } from "../src/seo";
import type { Product } from "../src/domain";
type SiteEnv = Env & { ASSETS: Fetcher };
const pages: Record<string, string> = {
  "/brand": "Identidad de marca",
  "/brand/": "Identidad de marca",
  "/brand/index.html": "Identidad de marca",
  "/brand/presentation-v3.html": "Identidad de marca · Presentación v3",
  "/brand/presentation-v3": "Identidad de marca · Presentación v3",
  "/consultar-pedido": "Rastrea tu pedido",
  "/pedido/confirmacion": "Confirmación de pedido",
  "/rastrear-pedido": "Rastrea tu pedido",
  "/terminos-de-compra": "Términos de compra",
  "/aviso-de-privacidad": "Aviso de privacidad",
  "/baja-noticias": "Baja de noticias",
  "/": "A la mesa",
  "/juegos": "Nuestros juegos",
  "/nosotros": "La editorial",
  "/faq": "Preguntas frecuentes",
  "/mayoreo": "Para tiendas",
  "/contacto": "Contacto",
  "/privacidad": "Aviso de privacidad",
  "/terminos": "Términos de compra",
  "/envios": "Envíos y entregas",
  "/devoluciones": "Cambios y devoluciones",
  "/carrito": "Tu carrito",
  "/checkout": "Tu pedido",
  "/checkout/processing": "Verificación del pago",
  "/checkout/success": "Estado del pago",
  "/checkout/failure": "Revisar pago",
  "/pedido": "Estado del pedido",
  "/pedido/agendar-entrega": "Agendar mi entrega",
  "/admin": "Administración",
};
const xmlEscape = (v: string) =>
  v.replace(
    /[<>&"']/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
export default {
  async fetch(r: Request, e: SiteEnv, ctx: ExecutionContext) {
    const u = new URL(r.url);
    if (oldProductPaths.includes(u.pathname))
      return Response.redirect(
        "https://marlo.games/juegos/intercambio-navideno" + u.search,
        301,
      );
    if (u.hostname === "www.marlo.games")
      return Response.redirect(
        "https://marlo.games" + u.pathname + u.search,
        301,
      );
    if (
      ["/checkout/paypal/return", "/checkout/paypal/cancel"].includes(
        u.pathname,
      ) ||
      u.pathname.startsWith("/api/")
    )
      {
        const response = await api.fetch(r, e);
        if (u.pathname === "/api/order-access/request" && response.ok) ctx.waitUntil(processOutbox(e));
        return response;
      }
    if (u.pathname === "/robots.txt")
      return new Response(
        "User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /checkout\nDisallow: /pedido\nDisallow: /consultar-pedido\nDisallow: /api/\nSitemap: https://marlo.games/sitemap.xml\n",
        { headers: { "Content-Type": "text/plain; charset=utf-8" } },
      );
    if (u.pathname === "/sitemap.xml") {
      const productRows = await e.DB.prepare(
        "SELECT slug FROM products WHERE json_extract(data,'$.fixture')=0 AND json_extract(data,'$.archived')=0",
      ).all<{ slug: string }>();
      const routes = [
        ...Object.keys(pages).filter(
          (p) =>
            !p.startsWith("/checkout") &&
            !["/admin", "/carrito", "/pedido", "/pedido/confirmacion", "/pedido/agendar-entrega", "/consultar-pedido"].includes(p),
        ),
        ...productRows.results.map((p) => "/juegos/" + p.slug),
      ];
      return new Response(
        '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
          routes
            .map(
              (p) =>
                "<url><loc>https://marlo.games" + xmlEscape(p) + "</loc></url>",
            )
            .join("") +
          "</urlset>",
        { headers: { "Content-Type": "application/xml" } },
      );
    }
    // Retain historical portal artwork without confusing it with shop assets.
    if (
      [
        "/assets/marlo-logo.webp",
        "/assets/pigeongod-cover-en.webp",
        "/assets/prepress-tool.webp",
      ].includes(u.pathname)
    )
      return Response.redirect(
        "https://my.marlo.games" + u.pathname + u.search,
        301,
      );
    let response = await e.ASSETS.fetch(r);
    if (!response.headers.get("Content-Type")?.includes("text/html"))
      return response;
    let title = pages[u.pathname],
      known = !!title;
    let product: Product | undefined;
    if (u.pathname.startsWith("/juegos/")) {
      const p = await e.DB.prepare(
        "SELECT data,stock FROM products WHERE slug=? AND json_extract(data,'$.fixture')=0 AND json_extract(data,'$.archived')=0",
      )
        .bind(u.pathname.slice(8))
        .first<{ data: string; stock: number }>();
      if (p) {
        known = true;
        product = { ...JSON.parse(p.data), stock: p.stock };
        title = product!.title;
      }
    }
    const h = new Headers(response.headers);
    h.set("X-Content-Type-Options", "nosniff");
    h.set("Referrer-Policy", "strict-origin-when-cross-origin");
    h.set("X-Frame-Options", "DENY");
    h.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    h.set(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' https://challenges.cloudflare.com https://sdk.mercadopago.com https://www.paypal.com https://www.paypalobjects.com; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; connect-src 'self' https://*.mercadopago.com https://*.paypal.com https://challenges.cloudflare.com; frame-src https://*.mercadopago.com https://*.mercadolibre.com https://*.paypal.com https://challenges.cloudflare.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
    );
    if (
      u.pathname.startsWith("/checkout") ||
      ["/admin", "/carrito", "/pedido", "/pedido/confirmacion", "/pedido/agendar-entrega", "/consultar-pedido", "/rastrear-pedido"].includes(u.pathname)
    ) {
      h.set("X-Robots-Tag", "noindex, nofollow");
      h.set("Cache-Control", "no-store");
      h.set("Referrer-Policy", "no-referrer");
    }
    response = new Response(response.body, {
      status: known ? 200 : 404,
      headers: h,
    });
    const meta = pageMetadata(
      u.pathname,
      title || "Página no encontrada",
      product,
    );
    return new HTMLRewriter()
      .on(
        'meta[name="description"], meta[property^="og:"], link[rel="canonical"]',
        {
          element(el) {
            el.remove();
          },
        },
      )
      .on("title", {
        element(el) {
          el.setInnerContent(meta.title);
        },
      })
      .on("head", {
        element(el) {
          el.append(
            `<link rel="canonical" href="${xmlEscape(meta.url)}"><meta name="description" content="${xmlEscape(meta.description)}"><meta property="og:title" content="${xmlEscape(meta.title)}"><meta property="og:description" content="${xmlEscape(meta.description)}"><meta property="og:url" content="${xmlEscape(meta.url)}"><meta property="og:type" content="${product ? "product" : "website"}"><meta property="og:image" content="${xmlEscape(meta.image)}"><meta property="og:image:alt" content="Ilustración de carta de Intercambio Navideño"><meta name="twitter:card" content="summary_large_image">${meta.product ? `<script type="application/ld+json">${jsonForHtml(meta.product)}</script>` : ""}`,
            { html: true },
          );
        },
      })
      .transform(response);
  },
  scheduled: api.scheduled,
};
