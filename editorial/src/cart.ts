import type { Cart, Product } from "./domain";
export function addToCart(cart: Cart, p: Product, quantity = 1): Cart {
  const n = Math.max(1, Math.min(20, Math.floor(quantity)));
  if (!p.stock || !["available", "preorder"].includes(p.status)) return cart;
  const found = cart.find((x) => x.id === p.id);
  return found
    ? cart.map((x) =>
        x.id === p.id
          ? { ...x, quantity: Math.min(20, p.stock, x.quantity + n) }
          : x,
      )
    : [...cart, { id: p.id, quantity: Math.min(p.stock, n) }];
}
export function saveCart(cart: Cart) {
  localStorage.setItem(
    "marlo-shop-cart",
    JSON.stringify({ items: cart, time: Date.now() }),
  );
}
