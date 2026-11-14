import type { Product } from "./domain";
export function pageMetadata(path: string, title: string, product?: Product) {
  const url = "https://marlo.games" + path;
  const description =
    product?.shortDescription ||
    "Marlo Games, estudio creativo mexicano de juegos de mesa en Guadalajara. Conoce nuestros juegos y próximos lanzamientos.";
  const image = product?.image
    ? new URL(product.image, "https://marlo.games").href
    : "https://marlo.games/images/intercambio-navideno/juego-de-mesa.webp";
  return {
    title: (product?.title || title) + " · Marlo Games",
    description,
    url,
    image,
    product: product
      ? {
          "@context": "https://schema.org",
          "@type": "Product",
          name: product.title,
          description: product.shortDescription,
          sku: product.sku,
          brand: { "@type": "Brand", name: "Marlo Games" },
          image: [product.image, ...product.gallery]
            .filter(Boolean)
            .map((src) => new URL(src, "https://marlo.games").href),
          offers: {
            "@type": "Offer",
            url,
            priceCurrency: "MXN",
            price: (product.price / 100).toFixed(2),
            availability:
              product.status === "available" && product.stock > 0
                ? "https://schema.org/InStock"
                : "https://schema.org/OutOfStock",
          },
        }
      : undefined,
  };
}
export const jsonForHtml = (data: unknown) =>
  JSON.stringify(data).replace(/</g, "\\u003c");
