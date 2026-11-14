import type { Product } from "./domain";
export const launchSlug = "intercambio-navideno";
export const artRoot = "/images/intercambio-navideno/";
export const artNames: Record<string, string> = {
  "juego-de-mesa": "Juego de mesa · mapache con un regalo",
  abrazo: "Abrazo · un zorro y un oso",
  audifonos: "Audífonos · un pingüino con su regalo",
  bufanda: "Bufanda · ilustración de regalo",
  planta: "Planta · ilustración de regalo",
  "sueter-feo": "Suéter feo · ilustración de regalo",
  "taza-navidena": "Taza navideña · ilustración de regalo",
  "yo-queria-ese": "Yo quería ése · carta especial",
};
export const imageLabel = (src: string, title: string) =>
  artNames[src.split("/").pop()?.replace(".webp", "") || ""] || title;
export const isLaunch = (p: Product) => p.slug === launchSlug;
export const statusLabels = {
  available: "Disponible",
  sold_out: "Agotado",
  coming_soon: "Próximamente",
  preorder: "Preventa",
};
export const canBuy = (p: Product, preorders: boolean) =>
  p.stock > 0 &&
  (p.status === "available" || (p.status === "preorder" && preorders));
export const oldProductPaths = [
  "/juegos/xmas-xchange",
  "/juegos/xmas-xchange/",
];

export const responsiveArt = (src: string) =>
  src.startsWith(artRoot) && src.endsWith(".webp")
    ? {
        srcSet: src.replace(".webp", "-small.webp") + " 450w, " + src + " 900w",
        sizes: "(max-width:700px) 40vw, 300px",
      }
    : {};
export const thumbArt = (src: string) =>
  src.startsWith(artRoot) && src.endsWith(".webp")
    ? src.replace(".webp", "-thumb.webp")
    : src;
