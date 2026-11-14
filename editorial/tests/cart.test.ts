import { expect, it } from "vitest";
import { addToCart } from "../src/cart";
import { commercialName, productSchema } from "../src/domain";
import launch from "../data/intercambio-navideno.json";
const product = productSchema.parse({
  ...launch,
  status: "available",
  stock: 3,
  weight: 1,
  length: 1,
  width: 1,
  height: 1,
});
it("one buy action adds one unit, preserves unrelated products and merges by stable ID", () => {
  const old = [{ id: "other", quantity: 2 }];
  const one = addToCart(old, product);
  expect(one).toEqual([...old, { id: product.id, quantity: 1 }]);
  expect(old).toEqual([{ id: "other", quantity: 2 }]);
  expect(addToCart(one, product)).toEqual([
    ...old,
    { id: product.id, quantity: 2 },
  ]);
});
it("caps quantities at stock and refuses unavailable products", () => {
  expect(addToCart([], product, 20)[0].quantity).toBe(3);
  expect(addToCart([], productSchema.parse(launch))).toEqual([]);
});
it("maps the old commercial name for presentation without changing internal IDs", () => {
  expect(commercialName("Xmas Xchange")).toBe("Intercambio Navideño");
  expect(commercialName("Otro juego")).toBe("Otro juego");
});
it("accepts reusable themes but rejects arbitrary CSS injection", () => {
  expect(
    productSchema.safeParse({
      ...launch,
      theme: "mint",
      themeAccent: "#235643",
      themePaper: "#f5efdb",
      themeFont: "classic",
    }).success,
  ).toBe(true);
  expect(
    productSchema.safeParse({ ...launch, themeAccent: "red;display:none" })
      .success,
  ).toBe(false);
});
