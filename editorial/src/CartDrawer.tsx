import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { money, type Cart, type Product, type Totals } from "./domain";
import { thumbArt } from "./launch";
export function CartDrawer({
  open,
  onClose,
  cart,
  products,
  onChange,
  loading,
}: {
  loading: boolean;
  open: boolean;
  onClose: () => void;
  cart: Cart;
  products: Product[];
  onChange: (cart: Cart) => void;
}) {
  const [coupon, setCoupon] = useState(
      () => sessionStorage.getItem("marlo-coupon") || "",
    ),
    [total, setTotal] = useState<Totals>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const ref = useRef<HTMLElement>(null),
    closeRef = useRef<HTMLButtonElement>(null);
  const serial = useRef(0);
  useEffect(() => {
    const sync = () => {
      setCoupon(sessionStorage.getItem("marlo-coupon") || "");
      setTotal(undefined);
    };
    window.addEventListener("marlo-coupon-change", sync);
    return () => window.removeEventListener("marlo-coupon-change", sync);
  }, []);
  useEffect(() => {
    serial.current++;
    setTotal(undefined);
    setError("");
  }, [JSON.stringify(cart)]);
  const [mobile, setMobile] = useState(
    () => matchMedia("(max-width:1000px)").matches,
  );
  useEffect(() => {
    const media = matchMedia("(max-width:1000px)");
    const changed = () => setMobile(media.matches);
    media.addEventListener("change", changed);
    return () => media.removeEventListener("change", changed);
  }, []);
  useEffect(() => {
    if (
      !open ||
      loading ||
      !cart.length ||
      !sessionStorage.getItem("marlo-coupon")
    )
      return;
    const attempt = ++serial.current;
    api<Totals>("/totals", {
      items: cart,
      coupon: sessionStorage.getItem("marlo-coupon"),
      delivery: "local",
    })
      .then((t) => {
        if (attempt === serial.current) setTotal(t);
      })
      .catch((e) => {
        if (attempt === serial.current) {
          setTotal(undefined);
          setError(e.message);
        }
      });
    return () => {
      serial.current++;
    };
  }, [open, loading, coupon, JSON.stringify(cart), JSON.stringify(products)]);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();

    const old = document.body.style.overflow;
    const background = [
      ...document.querySelectorAll<HTMLElement>(
        "#contenido,.site-header,.site-footer",
      ),
    ];
    if (mobile) {
      document.body.style.overflow = "hidden";
      background.forEach((el) => (el.inert = true));
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && mobile) {
        const els = ref.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled)",
        );
        if (!els?.length) return;
        const first = els[0],
          last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = old;
      background.forEach((el) => (el.inert = false));
      previous?.focus();
    };
  }, [open, mobile]);
  if (!open) return null;
  const subtotal = cart.reduce(
    (sum, line) =>
      sum +
      (products.find((p) => p.id === line.id)?.price || 0) * line.quantity,
    0,
  );
  const update = (id: string, quantity: number) =>
    onChange(
      quantity
        ? cart.map((x) => (x.id === id ? { ...x, quantity } : x))
        : cart.filter((x) => x.id !== id),
    );
  return (
    <>
      <button
        className="cart-scrim"
        onClick={onClose}
        aria-label="Cerrar carrito"
        tabIndex={-1}
      />
      <aside
        ref={ref}
        className="cart-drawer"
        role={mobile ? "dialog" : "complementary"}
        aria-modal={mobile ? true : undefined}
        aria-label="Tu carrito"
      >
        <header>
          <div>
            <span className="eyebrow">BUENA ELECCIÓN</span>
            <h2>
              Tu carrito <span>{cart.reduce((n, x) => n + x.quantity, 0)}</span>
            </h2>
          </div>
          <button
            ref={closeRef}
            className="drawer-close"
            onClick={onClose}
            aria-label="Cerrar panel de carrito"
          >
            ×
          </button>
        </header>
        {loading ? (
          <p className="drawer-loading" role="status">
            Cargando tu selección…
          </p>
        ) : cart.length ? (
          <>
            <div className="drawer-items">
              {cart.map((line) => {
                const p = products.find((p) => p.id === line.id);
                return (
                  <article className="drawer-item" key={line.id}>
                    {p?.image ? (
                      <img
                        src={thumbArt(p.image)}
                        alt={p.title}
                        width="72"
                        height="105"
                      />
                    ) : (
                      <span className="drawer-placeholder" aria-hidden="true">
                        m.
                      </span>
                    )}
                    <div>
                      <a href={"/juegos/" + p?.slug}>
                        {p?.title || "Producto no disponible"}
                      </a>
                      <p>{p ? money(p.price) : "—"} MXN</p>
                      <div className="drawer-quantity">
                        <button
                          aria-label={"Quitar una unidad de " + p?.title}
                          onClick={() => update(line.id, line.quantity - 1)}
                        >
                          −
                        </button>
                        <output aria-label={"Cantidad de " + p?.title}>
                          {line.quantity}
                        </output>
                        <button
                          aria-label={"Añadir una unidad de " + p?.title}
                          disabled={
                            !p || line.quantity >= Math.min(20, p.stock)
                          }
                          onClick={() => update(line.id, line.quantity + 1)}
                        >
                          +
                        </button>
                        <button
                          className="remove-line"
                          onClick={() => update(line.id, 0)}
                        >
                          Eliminar
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
            <div className="drawer-summary">
              <details>
                <summary>
                  ¿Tienes un código de descuento? <span>＋</span>
                </summary>
                <label>
                  Código
                  <input
                    value={coupon}
                    onChange={(e) => {
                      setCoupon(e.target.value);
                      setTotal(undefined);
                      serial.current++;
                      sessionStorage.removeItem("marlo-coupon");
                      window.dispatchEvent(
                        new CustomEvent("marlo-coupon-clear"),
                      );
                    }}
                  />
                </label>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={async () => {
                    const attempt = ++serial.current;
                    setBusy(true);
                    setError("");
                    try {
                      const t = await api<Totals>("/totals", {
                        items: cart,
                        coupon,
                        delivery: "local",
                      });
                      if (attempt === serial.current) {
                        setTotal(t);
                        sessionStorage.setItem("marlo-coupon", coupon);
                        window.dispatchEvent(new Event("marlo-coupon-change"));
                        setTotal(t);
                      }
                    } catch (e) {
                      if (attempt === serial.current)
                        setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {busy ? "Validando…" : "Aplicar código"}
                </button>
              </details>
              <p>
                Subtotal <strong>{money(subtotal)}</strong>
              </p>
              {total && (
                <p>
                  Descuento <strong>−{money(total.discount)}</strong>
                </p>
              )}
              <p className="drawer-total">
                Total de productos{" "}
                <strong>
                  {money(total ? subtotal - total.discount : subtotal)}{" "}
                  <small>MXN</small>
                </strong>
              </p>
              <a className="button" href="/checkout" onClick={onClose}>
                Continuar compra <span>↗</span>
              </a>
              <button className="drawer-continue" onClick={onClose}>
                Seguir explorando
              </button>
              <p className="drawer-note">
                Revisa tus productos y continúa para elegir la entrega.
              </p>
              {error && (
                <p role="alert" className="error">
                  {error}
                </p>
              )}
            </div>
          </>
        ) : (
          <div className="drawer-empty">
            <div aria-hidden="true">m.</div>
            <h3>
              Falta el juego.
              <br />
              La mesa ya está.
            </h3>
            <p>Explora el catálogo para encontrar tu próxima partida.</p>
            <a className="button" href="/juegos" onClick={onClose}>
              Ver juegos ↗
            </a>
          </div>
        )}
      </aside>
    </>
  );
}
