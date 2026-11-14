import React, { useEffect, useState, useRef } from "react";
import { createRoot } from "react-dom/client";
import { api } from "./api";
import { OrderPage } from "./OrderPage";
import { InlinePayment, InlinePayPal } from "./InlinePayment";
import { checkoutContactError } from "./checkout-validation";
import { defaultContent, localExplanation, type Content } from "./content";
import { money, type Product, type Cart } from "./domain";
import { Admin } from "./Admin";
import { EditorialHome, ProductPage, CatalogRow } from "./Showcase";
import { pageMetadata, jsonForHtml } from "./seo";
import { oldProductPaths } from "./launch";
import "./style.css";
import "./redesign.css";
import "./playful.css";
import "./checkout.css";
import "./brand.css";
import "./storefront.css";
import { LegalDocument } from "./LegalDocument";

import { Unsubscribe } from "./Unsubscribe";
import "@fontsource/fraunces/latin-800.css";
import "@fontsource/fraunces/latin-600.css";
import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-600.css";
import { CartDrawer } from "./CartDrawer";
import { addToCart, saveCart } from "./cart";

type Catalog = {
  providers?: { paypal: boolean; mercadopago: boolean };
  products: Product[];
  content: Content;
  mode: string;
  paymentsEnabled: boolean;
  formsEnabled?: boolean;
  mpPublicKey?: string;
  paypalClientId?: string;
  turnstileSiteKey?: string;
};
const labels = {
  available: "Disponible",
  sold_out: "Agotado",
  coming_soon: "Próximamente",
  preorder: "Preventa",
};
const route = window.location.pathname;
document.body.classList.toggle("storefront", !route.startsWith("/admin"));
if (oldProductPaths.includes(route))
  location.replace("/juegos/intercambio-navideno" + location.search);
if (route === "/" && ["#games", "#not-games", "#about"].includes(location.hash))
  location.replace("https://my.marlo.games/" + location.hash);
function useCart() {
  const [cart, setCart] = useState<Cart>(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem("marlo-shop-cart") || "null",
      );
      return saved &&
        Date.now() - saved.time < 7 * 86400000 &&
        Array.isArray(saved.items)
        ? saved.items
        : [];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    localStorage.setItem(
      "marlo-shop-cart",
      JSON.stringify({ items: cart, time: Date.now() }),
    );
  }, [cart]);
  return [cart, setCart] as const;
}
function Media({
  src,
  label,
  variant = "",
}: {
  src?: string;
  label: string;
  variant?: string;
}) {
  return (
    <div className={"media " + variant}>
      {src ? (
        <img src={src} alt={label} loading="lazy" />
      ) : (
        <>
          <div className="paper-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          {import.meta.env.DEV && <small>{label}</small>}
        </>
      )}
    </div>
  );
}
function App() {
  const [data, setData] = useState<Catalog>({
      products: [],
      content: defaultContent,
      mode: "production",
      paymentsEnabled: false,
    }),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [cart, setCart] = useCart(),
    [notice, setNotice] = useState(() => {
      const n = sessionStorage.getItem("marlo-added") || "";
      sessionStorage.removeItem("marlo-added");
      return n;
    }),
    [cartOpen, setCartOpen] = useState(
      () => sessionStorage.getItem("marlo-cart-open") === "true",
    );
  const buying = useRef(false);
  const showCart = (value: boolean) => {
    sessionStorage.setItem("marlo-cart-open", String(value));
    setCartOpen(value);
  };
  useEffect(() => {
    document.body.classList.toggle("cart-is-open", cartOpen);
    return () => document.body.classList.remove("cart-is-open");
  }, [cartOpen]);
  useEffect(() => {
    api<Catalog>("/catalog")
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  const c = data.content;
  useEffect(() => {
    const titles: Record<string, string> = {
      "/": "A la mesa",
      "/juegos": "Nuestros juegos",
      "/nosotros": "La editorial",
      "/faq": "Preguntas frecuentes",
      "/consultar-pedido": "Rastrea tu pedido",
      "/pedido/confirmacion": "Confirmación de pedido",
      "/rastrear-pedido": "Rastrea tu pedido",
      "/mayoreo": "Para tiendas",
      "/contacto": "Contacto",
      "/carrito": "Tu carrito",
      "/checkout": "Tu pedido",
      "/admin": "Administración",
      "/aviso-de-privacidad": "Aviso de privacidad",
      "/terminos-de-compra": "Términos de compra",
      "/privacidad": "Aviso de privacidad",
      "/terminos": "Términos de compra",
      "/envios": "Envíos",
      "/devoluciones": "Devoluciones",
    };
    document.title =
      (titles[route] ||
        data.products.find((p) => route === "/juegos/" + p.slug)?.title ||
        "Marlo Games") + " · Marlo Games";
    let canonical = document.querySelector(
      'link[rel="canonical"]',
    ) as HTMLLinkElement | null;
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = "https://marlo.games" + route;
    const product = data.products.find((p) => route === "/juegos/" + p.slug);
    const meta = pageMetadata(route, titles[route] || "Marlo Games", product);
    for (const [key, value] of Object.entries({
      description: meta.description,
      "og:title": meta.title,
      "og:description": meta.description,
      "og:image": meta.image,
      "og:url": meta.url,
      "og:type": product ? "product" : "website",
    })) {
      const attr = key.startsWith("og:") ? "property" : "name";
      let tag = document.querySelector(
        "meta[" + attr + '="' + key + '"]',
      ) as HTMLMetaElement | null;
      if (!tag) {
        tag = document.createElement("meta");
        tag.setAttribute(attr, key);
        document.head.appendChild(tag);
      }
      tag.content = value;
    }
    document
      .querySelectorAll('script[type="application/ld+json"]')
      .forEach((el) => el.remove());
    if (meta.product) {
      const script = document.createElement("script");
      script.type = "application/ld+json";
      script.textContent = jsonForHtml(meta.product);
      document.head.appendChild(script);
    }
  }, [data.products]);
  const add = (p: Product, quantity = 1) => {
    setCart((old) => addToCart(old, p, quantity));
    setNotice(p.title + " se agregó al carrito.");
    showCart(true);
  };
  const buyFeatured = (p: Product) => {
    if (
      buying.current ||
      !p.stock ||
      !["available", "preorder"].includes(p.status) ||
      (p.status === "preorder" && !c.preordersEnabled)
    )
      return;
    buying.current = true;
    const next = addToCart(cart, p, 1);
    saveCart(next);
    setCart(next);
    sessionStorage.setItem("marlo-cart-open", "true");
    sessionStorage.setItem("marlo-added", p.title + " se agregó al carrito.");
    location.assign("/juegos/" + p.slug);
  };
  const productCard = (p: Product) => (
    <article className="product-card" key={p.id}>
      <a href={"/juegos/" + p.slug}>
        <Media src={p.image} label={p.title} />
      </a>
      <div className="product-meta">
        <span>{labels[p.status]}</span>
        {p.fixture && <span>Ejemplo de desarrollo</span>}
      </div>
      <h3>
        <a href={"/juegos/" + p.slug}>{p.title}</a>
      </h3>
      <p>{p.shortDescription}</p>
      <div className="specs">
        <span>{p.players} personas</span>
        <span>{p.duration}</span>
        {p.age && <span>{p.age}</span>}
      </div>
      <div className="product-bottom">
        <strong>{p.price ? money(p.price) : "Por anunciar"}</strong>
        <button
          className="small"
          disabled={
            !["available", "preorder"].includes(p.status) ||
            !p.stock ||
            (p.status === "preorder" && !c.preordersEnabled)
          }
          onClick={() => add(p)}
        >
          Agregar <span aria-hidden="true">＋</span>
        </button>
      </div>
    </article>
  );
  const empty = (
    <div className="empty-catalog">
      <span className="eyebrow">EN DESARROLLO</span>
      <h3>La próxima partida está tomando forma.</h3>
      <p>
        Estamos preparando nuestros primeros títulos. Aquí encontrarás sus
        detalles cuando estén listos para compartir.
      </p>
      <a className="text-link" href="/nosotros">
        Conoce la editorial <span>↗</span>
      </a>
    </div>
  );
  const heading = (kicker: string, title: string, description?: string) => (
    <div className="page-heading">
      <span className="eyebrow">{kicker}</span>
      <h1>{title}</h1>
      {description && <p>{description}</p>}
    </div>
  );
  let page: React.ReactNode;
  if (route === "/")
    page = (
      <EditorialHome
        onBuy={buyFeatured}
        products={data.products}
        content={c}
        loading={loading}
        paymentsEnabled={data.paymentsEnabled}
      />
    );
  else if (route === "/juegos")
    page = (
      <>
        {heading(
          "NUESTRO CATÁLOGO",
          "Juegos para compartir.",
          "Cada juego tiene su propia forma de reunirnos. Descubre lo que estamos preparando.",
        )}
        {loading ? (
          <p>Cargando catálogo…</p>
        ) : data.products.length ? (
          <div className="catalog-rows section">
            {data.products
              .filter((p) => !p.fixture)
              .map((p, i) => (
                <CatalogRow key={p.id} product={p} index={i} />
              ))}
            {data.mode === "local" && (
              <details className="local-fixtures">
                <summary>Productos de prueba local</summary>
                <div className="product-grid">
                  {data.products.filter((p) => p.fixture).map(productCard)}
                </div>
              </details>
            )}
          </div>
        ) : (
          empty
        )}
      </>
    );
  else if (route.startsWith("/juegos/")) {
    const p = data.products.find((p) => route === "/juegos/" + p.slug);
    page = p ? (
      <ProductPage
        key={p.id}
        product={p}
        preorders={c.preordersEnabled}
        paymentsEnabled={data.paymentsEnabled}
        shippingFlatRate={c.shippingFlatRate}
        onAdd={add}
      />
    ) : (
      heading("CATÁLOGO", loading ? "Cargando…" : "Juego no encontrado")
    );
  } else if (route === "/nosotros")
    page = (
      <>
        {heading("LA EDITORIAL", "De una idea a la mesa.", c.intro)}
        <section className="about-grid">
          {c.aboutImage ? (
            <Media src={c.aboutImage} label="Marlo Games" />
          ) : (
            <div className="about-identity">
              <span>MARLO GAMES</span>
              <strong>
                Ideas.
                <br />
                Cartas.
                <br />
                <em>Partidas.</em>
              </strong>
              <span>GUADALAJARA, MÉXICO</span>
            </div>
          )}
          <div>
            <h2>Jugar es el punto de partida.</h2>
            <p>{c.about}</p>
            <p>Guadalajara, Jalisco. México.</p>
            <a className="text-link" href="/contacto">
              Hablemos ↗
            </a>
          </div>
        </section>
      </>
    );
  else if (route === "/rastrear-pedido")
    page = (
      <OrderPage local={data.mode === "local"} />
    );
  else if (route === "/faq")
    page = (
      <>
        {heading("ANTES DE LA PARTIDA", "Preguntas frecuentes.")}
        <div className="faq-list">
          {c.faq.map(([q, a]) => (
            <details key={q}>
              <summary>
                {q}
                <span>＋</span>
              </summary>
              <p>
                {q === "¿Cómo puedo consultar el estado de mi pedido?" ? (
                  <>
                    {a} <a href="/rastrear-pedido">Rastreo de pedidos</a>
                  </>
                ) : a.includes("Rastreo de pedidos") ? (
                  <>
                    {a.split("Rastreo de pedidos")[0]}
                    <a href="/rastrear-pedido">Rastreo de pedidos</a>
                    {a
                      .split("Rastreo de pedidos")
                      .slice(1)
                      .join("Rastreo de pedidos")}
                  </>
                ) : (
                  a
                )}
              </p>
            </details>
          ))}
        </div>
      </>
    );
  else if (route === "/mayoreo" || route === "/contacto")
    page = (
      <>
        {heading(
          route === "/mayoreo" ? "PARA TIENDAS" : "CONTACTO",
          route === "/mayoreo"
            ? "Tu tienda, nuestros juegos."
            : "Vamos a platicar.",
          route === "/mayoreo"
            ? "¿Tienes una tienda de juegos de mesa? Nos interesa trabajar con tiendas que quieran incluir nuestros títulos en su catálogo. Déjanos tus datos y nos pondremos en contacto."
            : "Cuéntanos en qué podemos ayudarte.",
        )}
        <div className="form-layout">
          <Contact wholesale={route === "/mayoreo"} data={data} />
          <aside>
            <h3>
              {route === "/mayoreo"
                ? "Empecemos por conocernos."
                : "Desde Guadalajara."}
            </h3>
            <p>
              {route === "/mayoreo"
                ? "Todavía no publicamos precios de mayoreo. Tu solicitud nos ayuda a conocer tu tienda y conversar sobre los próximos pasos."
                : "Para consultar un pedido, incluye su número en el mensaje."}
            </p>
            {c.contactEmail && (
              <a href={"mailto:" + c.contactEmail}>{c.contactEmail}</a>
            )}
            {route === "/mayoreo" && c.wholesaleImage && (
              <Media src={c.wholesaleImage} label="Banner de mayoreo" />
            )}
          </aside>
        </div>
      </>
    );
  else if (
    [
      "/terminos-de-compra",
      "/terminos",
      "/aviso-de-privacidad",
      "/privacidad",
    ].includes(route)
  )
    page = (
      <LegalDocument kind={route.includes("terminos") ? "terms" : "privacy"} />
    );
  else if (route === "/baja-noticias") page = <Unsubscribe />;
  else if (
    ["/privacidad", "/terminos", "/envios", "/devoluciones"].includes(route)
  ) {
    const key = (
      {
        "/privacidad": "privacy",
        "/terminos": "terms",
        "/envios": "shipping",
        "/devoluciones": "returns",
      } as const
    )[route as "/privacidad"];
    page = (
      <div className="reading">
        {heading(
          "INFORMACIÓN",
          {
            privacy: "Aviso de privacidad",
            terms: "Términos de compra",
            shipping: "Envíos y entregas",
            returns: "Cambios y devoluciones",
          }[key],
        )}
        <p className="preserve">{c[key]}</p>
        {route === "/envios" && (
          <>
            <h2>Entrega local gratuita — Solo ZMG</h2>
            <p>{localExplanation}</p>
          </>
        )}
      </div>
    );
  } else if (route === "/carrito")
    page = (
      <>
        {heading("TU SELECCIÓN", "Ya casi estamos en la mesa.")}
        <CartView cart={cart} setCart={setCart} data={data} />
      </>
    );
  else if (route === "/checkout")
    page = (
      <>
        {heading("CHECKOUT", "Preparemos tu pedido.")}
        {new URLSearchParams(location.search).get("payment") ===
          "cancelled" && (
          <p role="status">
            Cancelaste la autorización de PayPal. Puedes elegir otro método o
            intentarlo nuevamente.
          </p>
        )}
        <CheckoutView cart={cart} data={data} />
      </>
    );
  else if (
    ["/pedido", "/pedido/confirmacion", "/consultar-pedido", "/pedido/agendar-entrega"].includes(route) ||
    ["/checkout/processing", "/checkout/success", "/checkout/failure"].includes(
      route,
    )
  )
    page = (
      <>
        <OrderPage
          local={data.mode === "local"}
          confirmation={
            route === "/pedido/confirmacion" || route.startsWith("/checkout/")
          }
        />
      </>
    );
  else if (route === "/admin") page = <Admin />;
  else
    page = (
      <>
        {heading("404", "Aquí no hay una partida.")}
        <a className="button" href="/">
          Volver al inicio
        </a>
      </>
    );
  return (
    <>
      {data.mode === "local" && (
        <div className="dev-bar">
          VISTA PREVIA LOCAL · Sin cobros, envíos ni correos reales
        </div>
      )}
      {data.mode === "sandbox" && (
        <div className="dev-bar">
          SANDBOX · Usa solamente tarjetas de prueba · Sin cobros, envíos ni
          correos reales
        </div>
      )}
      {c.announcement && <div className="announcement">{c.announcement}</div>}
      <a className="skip" href="#contenido">
        Saltar al contenido
      </a>
      <header className="site-header">
        <a className="brand" href="/">
          <img src="/brand/marlo-logo-ink.svg" alt="Marlo Games" width="420" height="136" />
        </a>
        <nav aria-label="Navegación principal">
          {[["/juegos", "Juegos"], ["/nosotros", "La editorial"],
            ["/faq", "Ayuda"], ["/rastrear-pedido", "Rastrear pedido"],
            ["/mayoreo", "Para tiendas"], ["/contacto", "Contacto"]].map(([href, label]) => (
            <a key={href} href={href} aria-current={route === href ? "page" : undefined}
              className={route === href || (href === "/juegos" && route.startsWith("/juegos/")) ? "active" : ""}>
              {label}
            </a>
          ))}
        </nav>
        <button
          className="cart-link"
          aria-label={
            "Abrir carrito, " +
            cart.reduce((s, x) => s + x.quantity, 0) +
            " productos"
          }
          aria-expanded={cartOpen}
          onClick={() => showCart(!cartOpen)}
        >
          Carrito <span>{cart.reduce((s, x) => s + x.quantity, 0)}</span>
        </button>
      </header>
      <main
        id="contenido"
        className={
          "container " +
          (route.startsWith("/juegos/")
            ? "product-universe"
            : route === "/"
              ? "home-universe"
              : "")
        }
      >
        {error && (
          <div role="alert" className="error">
            No pudimos cargar el catálogo. {error}{" "}
            <button onClick={() => location.reload()}>Reintentar</button>
          </div>
        )}
        {notice && (
          <div role="status" className="toast">
            {notice} <a href="/carrito">Ver carrito</a>
            <button aria-label="Cerrar aviso" onClick={() => setNotice("")}>
              ×
            </button>
          </div>
        )}
        {page}
      </main>
      <footer className="site-footer">
        <div className="footer-main">
          <div>
            <a className="brand" href="/">
              <img src="/brand/marlo-logo-ink.svg" alt="Marlo Games" width="420" height="136" />
            </a>
            <p>
              Editorial mexicana independiente.
              <br />
              Guadalajara, Jalisco.
            </p>
          </div>
          <div>
            <h3>La editorial</h3>
            <a href="/juegos">Juegos</a>
            <a href="/nosotros">Nosotros</a>
            <a href="/mayoreo">Mayoreo</a>
            <a href="/contacto">Contacto</a>
          </div>
          <div>
            <h3>Te ayudamos</h3>
            <a href="/faq">Preguntas frecuentes</a>
            
            <a href="/rastrear-pedido">Rastrear pedido</a>
            <a href="/envios">Envíos y entregas</a>
            <a href="/devoluciones">Cambios y devoluciones</a>
            {c.contactEmail && (
              <a href={"mailto:" + c.contactEmail}>{c.contactEmail}</a>
            )}
          </div>
          <div>
            <h3>También por aquí</h3>
            <a href="https://my.marlo.games">El portal de Marlo ↗</a>
            <a href="https://play.marlo.games">Juegos digitales ↗</a>
            {c.instagram && <a href={c.instagram}>Instagram ↗</a>}
            {c.facebook && <a href={c.facebook}>Facebook ↗</a>}
          </div>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} Marlo Games</span>
          <div>
            <a href="/aviso-de-privacidad" target="_blank" rel="noopener">
              Privacidad
            </a>
            <a href="/terminos-de-compra" target="_blank" rel="noopener">
              Términos de compra
            </a>
          </div>
          <span>Hecho para compartir.</span>
        </div>
      </footer>
      <CartDrawer
        open={cartOpen}
        onClose={() => showCart(false)}
        cart={cart}
        loading={loading}
        products={data.products}
        onChange={(next) => {
          saveCart(next);
          setCart(next);
        }}
      />
    </>
  );
}
function CartView({
  cart,
  setCart,
  data,
}: {
  cart: Cart;
  setCart: React.Dispatch<React.SetStateAction<Cart>>;
  data: Catalog;
}) {
  const [coupon, setCoupon] = useState(""),
    [total, setTotal] = useState<any>(),
    [error, setError] = useState("");
  const price = cart.reduce(
    (s, x) =>
      s + (data.products.find((p) => p.id === x.id)?.price || 0) * x.quantity,
    0,
  );
  const update = (id: string, n: number) => {
    setTotal(undefined);
    setCart((old) =>
      n
        ? old.map((x) => (x.id === id ? { ...x, quantity: n } : x))
        : old.filter((x) => x.id !== id),
    );
  };
  if (!cart.length)
    return (
      <div className="empty-catalog">
        <h2>Hay espacio para una buena partida.</h2>
        <p>Tu carrito está vacío.</p>
        <a className="button" href="/juegos">
          Explorar juegos ↗
        </a>
      </div>
    );
  return (
    <div className="form-layout">
      <div>
        {cart.map((x) => {
          const p = data.products.find((p) => p.id === x.id);
          return (
            <div className="cart-row" key={x.id}>
              <div>
                <h3>{p?.title || "Producto ya no disponible"}</h3>
                <p>{p ? money(p.price) : "—"}</p>
              </div>
              <label>
                Cantidad
                <input
                  aria-label={"Cantidad de " + p?.title}
                  type="number"
                  min="1"
                  max="20"
                  value={x.quantity}
                  onChange={(e) =>
                    update(
                      x.id,
                      Math.max(1, Math.min(20, Number(e.target.value))),
                    )
                  }
                />
              </label>
              <button className="text-button" onClick={() => update(x.id, 0)}>
                Eliminar
              </button>
            </div>
          );
        })}
      </div>
      <aside className="summary">
        <h2>Tu selección</h2>
        <p>
          Subtotal <strong>{money(price)}</strong>
        </p>
        <label>
          Código de descuento
          <input
            value={coupon}
            onChange={(e) => {
              setCoupon(e.target.value);
              setTotal(undefined);
            }}
          />
        </label>
        <button
          className="secondary"
          onClick={async () => {
            try {
              setError("");
              const t = await api("/totals", {
                items: cart,
                coupon,
                delivery: "local",
              });
              setTotal(t);
              sessionStorage.setItem("marlo-coupon", coupon);
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          Aplicar cupón
        </button>
        {total && (
          <p>
            Descuento <strong>−{money(total.discount)}</strong>
          </p>
        )}
        <p>
          Envío <span>Se elige en el siguiente paso</span>
        </p>
        <div className="sum-total">
          Productos <strong>{money(total?.total ?? price)}</strong>
        </div>
        <a className="button" href="/checkout">
          Continuar con mi pedido ↗
        </a>
        <p className="muted">
          Los precios y el inventario se validan nuevamente antes de pagar.
        </p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </aside>
    </div>
  );
}
function Turnstile({
  siteKey,
  onToken,
}: {
  siteKey?: string;
  onToken: (token: string) => void;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!siteKey) return;
    let cancelled = false;
    let id: string | undefined;
    const render = () => {
      if (!cancelled && ref.current && (window as any).turnstile)
        id = (window as any).turnstile.render(ref.current, {
          sitekey: siteKey,
          callback: onToken,
          "expired-callback": () => onToken(""),
        });
    };
    const existing = document.querySelector("script[data-turnstile]");
    if (existing) render();
    else {
      const s = document.createElement("script");
      s.src =
        "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.dataset.turnstile = "true";
      s.onload = render;
      document.head.appendChild(s);
    }
    return () => {
      cancelled = true;
      if (id) (window as any).turnstile?.remove(id);
    };
  }, [siteKey]);
  return <div ref={ref} />;
}
function Contact({ wholesale, data }: { wholesale: boolean; data: Catalog }) {
  const [state, setState] = useState(""),
    [busy, setBusy] = useState(false),
    [token, setToken] = useState("");
  async function submit(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    setBusy(true);
    setState("");
    const form = ev.currentTarget,
      b = Object.fromEntries(new FormData(form));
    try {
      await api(wholesale ? "/wholesale" : "/contact", {
        ...b,
        privacy: b.privacy === "on",
        turnstile: token,
      });
      setState(
        data.mode === "local"
          ? "Solicitud guardada en la base local. No se enviaron correos reales."
          : "Recibimos tu mensaje. Gracias por escribirnos.",
      );
      form.reset();
    } catch (e) {
      setState((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="form-card">
      {wholesale && <Field name="store" label="Nombre de la tienda" />}
      <div className="form-grid">
        <Field name="name" label="Nombre de contacto" />
        <Field name="email" type="email" label="Correo electrónico" />
        {wholesale && (
          <>
            <Field name="phone" type="tel" label="Teléfono mexicano" />
            <Field name="city" label="Ciudad" />
            <Field name="state" label="Estado" />
            <Field
              name="website"
              label="Dirección o sitio web (opcional)"
              required={false}
            />
          </>
        )}
      </div>
      <label>
        {wholesale ? "Comentarios (opcional)" : "Tu mensaje"}
        <textarea
          name={wholesale ? "comments" : "message"}
          required={!wholesale}
          minLength={wholesale ? 0 : 10}
          maxLength={wholesale ? 2000 : 4000}
          rows={5}
        />
      </label>
      <label className="honeypot" aria-hidden="true">
        Dejar vacío
        <input name="websiteTrap" tabIndex={-1} autoComplete="off" />
      </label>
      <label className="check">
        <input type="checkbox" name="privacy" required />
        He leído el{" "}
        <a href="/aviso-de-privacidad" target="_blank" rel="noopener">
          aviso de privacidad
        </a>
        .
      </label>
      <Turnstile siteKey={data.turnstileSiteKey} onToken={setToken} />
      <button disabled={busy || !data.formsEnabled}>
        {busy
          ? "Enviando…"
          : wholesale
            ? "Enviar solicitud ↗"
            : "Enviar mensaje ↗"}
      </button>
      <p role="status">{state}</p>
      {!data.formsEnabled && (
        <p className="muted">
          El formulario estará disponible próximamente. Todavía no estamos
          recibiendo solicitudes por este medio.
        </p>
      )}
    </form>
  );
}
function Field({
  name,
  label,
  type = "text",
  required = true,
  value,
  onChange,
  readOnly = false,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  value?: string;
  onChange?: (v: string) => void;
  readOnly?: boolean;
}) {
  return (
    <label>
      {label}
      <input
        name={name}
        type={type}
        required={required}
        maxLength={200}
        value={value}
        readOnly={readOnly}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
      />
    </label>
  );
}
function CheckoutView({ cart, data }: { cart: Cart; data: Catalog }) {
  const [buyerEmail, setBuyerEmail] = useState("");
  const checkoutRef = useRef<HTMLDivElement>(null);
  const cardController = useRef<any>(null);
  const [paymentReady, setPaymentReady] = useState(false);
  const [paymentOrder, setPaymentOrder] = useState<any>();
  useEffect(() => {
    checkoutRef.current
      ?.querySelectorAll("input, select, textarea")
      .forEach((control) => {
        if (!control.closest(".inline-payment"))
          control.setAttribute("form", "checkout-form");
      });
  });
  useEffect(() => {
    if (paymentOrder?.provider === "paypal")
      document
        .getElementById("inline-paypal")
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [paymentOrder?.id]);
  const [verificationAttempt, setVerificationAttempt] = useState(0);
  const [addressOpen, setAddressOpen] = useState(false);
  const [provider, setProvider] = useState("mercadopago");
  const [postalOptions, setPostalOptions] = useState<
    { colony: string; city: string; state: string }[]
  >([]);
  const [postalStatus, setPostalStatus] = useState("");
  const [delivery, setDelivery] = useState<"local" | "national">("local"),
    [coupon, setCoupon] = useState(
      sessionStorage.getItem("marlo-coupon") || "",
    ),
    [total, setTotal] = useState<any>(),
    [quote, setQuote] = useState<any>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [token, setToken] = useState("");
  useEffect(() => {
    const sync = () => setCoupon(sessionStorage.getItem("marlo-coupon") || "");
    window.addEventListener("marlo-coupon-change", sync);
    window.addEventListener("marlo-coupon-clear", sync);
    return () => {
      window.removeEventListener("marlo-coupon-change", sync);
      window.removeEventListener("marlo-coupon-clear", sync);
    };
  }, []);
  const [address, setAddress] = useState({
    recipient: "",
    phone: "",
    email: "",
    street: "",
    exterior: "",
    interior: "",
    colony: "",
    city: "",
    state: "",
    postalCode: "",
    country: "MX",
    references: "",
  });
  useEffect(() => {
    let cancelled = false;
    setPostalOptions([]);
    setPostalStatus("");
    if (!/^\d{5}$/.test(address.postalCode)) return;
    setPostalStatus("Consultando código postal…");
    api<{ colony: string; city: string; state: string }[]>(
      "/postal?code=" + address.postalCode,
    )
      .then((rows) => {
        if (cancelled) return;
        setPostalOptions(rows);
        setPostalStatus(
          rows.length
            ? ""
            : "No encontramos ese código postal. Revisa los cinco dígitos.",
        );
        if (rows.length === 1)
          setAddress((a) => ({
            ...a,
            colony: rows[0].colony,
            city: rows[0].city,
            state: rows[0].state,
          }));
      })
      .catch(() => {
        if (!cancelled)
          setPostalStatus(
            "No pudimos consultar el código postal. Intenta nuevamente.",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [address.postalCode]);
  useEffect(() => {
    let cancelled = false;
    if (cart.length)
      api("/totals", { items: cart, coupon, delivery })
        .then((t) => {
          if (cancelled) return;
          setTotal(t);
          if ((sessionStorage.getItem("marlo-coupon") || "") !== coupon) {
            sessionStorage.setItem("marlo-coupon", coupon);
            window.dispatchEvent(new Event("marlo-coupon-change"));
          }
          setError("");
        })
        .catch((e) => {
          setTotal(undefined);
          setError(e.message);
        });
    return () => {
      cancelled = true;
    };
  }, [delivery, coupon, cart]);
  useEffect(() => {
    const valid =
      delivery === "local"
        ? data.content.localEnabled
        : quote && quote.expires > Date.now();
    if (valid)
      sessionStorage.setItem(
        "marlo-delivery",
        JSON.stringify({
          delivery,
          items: JSON.stringify(cart),
          shipping: delivery === "local" ? 0 : quote.shipping,
          expires: delivery === "local" ? Date.now() + 3600000 : quote.expires,
        }),
      );
    else sessionStorage.removeItem("marlo-delivery");
    window.dispatchEvent(new Event("marlo-delivery-change"));
  }, [delivery, quote, cart, data.content.localEnabled]);
  const quoteInput = JSON.stringify({ cart, address });
  const quoteInputRef = useRef(quoteInput);
  quoteInputRef.current = quoteInput;
  useEffect(() => {
    setQuote(undefined);
  }, [cart]);
  if (!cart.length)
    return (
      <div className="empty-catalog">
        <p>Agrega un juego para continuar.</p>
        <a href="/juegos">Ver catálogo ↗</a>
      </div>
    );
  async function submit(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    if (busy || !ev.currentTarget.reportValidity()) return;
    setBusy(true);
    setError("");
    const fields = Object.fromEntries(new FormData(ev.currentTarget));
    const contactError = checkoutContactError(
      fields.phone,
      delivery === "national" ? address : undefined,
    );
    if (contactError) {
      setError(contactError.message);
      const input = ev.currentTarget.elements.namedItem(contactError.name);
      if (input instanceof HTMLElement) input.focus();
      setBusy(false);
      return;
    }
    const submittedInput = quoteInputRef.current;
    let verifiedQuote = quote;
    if (delivery === "national") {
      try {
        if (!verifiedQuote || verifiedQuote.expires <= Date.now())
          verifiedQuote = await api("/quotes", { items: cart, address });
        if (submittedInput !== quoteInputRef.current)
          throw new Error(
            "Tu pedido cambió durante la verificación. Revisa los datos y vuelve a continuar.",
          );
        setQuote(verifiedQuote);
      } catch (e) {
        setError((e as Error).message);
        setBusy(false);
        return;
      }
    }
    const payload = {
      ...fields,
      items: cart,
      coupon,
      delivery,
      localConsent: fields.localConsent === "on",
      terms: fields.terms === "on",
      privacy: fields.privacy === "on",
      marketingConsent: fields.marketingConsent === "on",
      ...(delivery === "national"
        ? { address, quoteId: verifiedQuote?.id }
        : {}),
      turnstile: token,
    };
    const fingerprint = JSON.stringify({
      ...payload,
      quoteId: undefined,
      turnstile: undefined,
    });
    let attempt = JSON.parse(sessionStorage.getItem("marlo-attempt") || "null");
    if (!attempt || attempt.fingerprint !== fingerprint) {
      attempt = { fingerprint, id: crypto.randomUUID() };
      sessionStorage.setItem("marlo-attempt", JSON.stringify(attempt));
    }
    try {
      const card =
        data.mode !== "local" && provider === "mercadopago"
          ? await cardController.current.getFormData()
          : undefined;
      if (data.mode !== "local" && provider === "mercadopago" && !card?.token)
        throw new Error("Completa los datos de la tarjeta y selecciona la cantidad de cuotas antes de finalizar.");
      const o = await api("/orders", {
        ...payload,
        idempotencyKey: attempt.id,
      });
      setPaymentOrder(o);
      if (card) {
        await api("/orders/" + o.orderNumber + "/payment", { card });
        window.location.href = "/pedido/confirmacion";
      } else if (data.mode === "local") {
        window.location.href = "/pedido/confirmacion";
      }
      setBusy(false);
      return o;
    } catch (e) {
      setError(
        (e as Error).message ||
          "Revisa los datos de pago e intenta nuevamente.",
      );
      setBusy(false);
      setToken("");
      setVerificationAttempt((n) => n + 1);
    }
  }
  return (
    <div className="checkout-layout" ref={checkoutRef}>
      <form id="checkout-form" onSubmit={submit} style={{ display: "none" }} />
      <fieldset className="checkout-fields" disabled={busy}>
        <section className="form-card">
          <span className="eyebrow">01 · TUS DATOS</span>
          <h2>¿Para quién es la partida?</h2>
          <div className="form-grid">
            <Field name="name" label="Nombre completo" />
            <label>
              Correo electrónico
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                onBlur={(e) =>
                  setBuyerEmail(
                    e.target.validity.valid ? e.target.value.trim() : "",
                  )
                }
              />
            </label>
            <Field name="phone" label="Celular" type="tel" />
          </div>
          <p className="muted">
            Usaremos tus datos para gestionar el pedido. Solo recibirás
            publicidad si la aceptas.
          </p>
        </section>
        <section className="form-card">
          <span className="eyebrow">02 · LA ENTREGA</span>
          <h2>¿Cómo lo recibes?</h2>
          <label
            className={
              "delivery-option " + (delivery === "local" ? "selected" : "")
            }
          >
            <input
              type="radio"
              name="delivery"
              value="local"
              checked={delivery === "local"}
              disabled={!data.content.localEnabled}
              onChange={() => setDelivery("local")}
            />
            <span>
              <strong>GRATIS ENTREGA LOCAL</strong>
              <small>
                Recoger en Plaza La Perla, Zapopan, Jalisco. Previa
                coordinación.
              </small>
            </span>
          </label>
          <label
            className={
              "delivery-option " + (delivery === "national" ? "selected" : "")
            }
          >
            <input
              type="radio"
              name="delivery"
              value="national"
              checked={delivery === "national"}
              disabled={!data.content.nationalEnabled}
              onChange={() => setDelivery("national")}
            />
            <span>
              <strong>
                Envío a domicilio — {money(data.content.shippingFlatRate)} MXN
              </strong>
              <small>
                Envío rápido por paquetería: 5 días hábiles. Entrega directamente en tu dirección, sujeta a cobertura.
              </small>
            </span>
          </label>
          {delivery === "local" ? (
            <>
              <p>{localExplanation}</p>
              <label className="check">
                <input type="checkbox" name="localConsent" required />
                Confirmo que puedo acudir a Plaza La Perla y acepto coordinar la
                entrega.
              </label>
            </>
          ) : (
            <>
              <button
                type="button"
                className="secondary"
                aria-expanded={addressOpen}
                onClick={() => setAddressOpen(true)}
              >
                Agregar dirección
              </button>
              <div className="form-grid" hidden={!addressOpen}>
                {Object.entries({
                  recipient: "Nombre del destinatario",
                  phone: "Teléfono del destinatario",
                  email: "Correo del destinatario",
                  street: "Calle",
                  exterior: "Número exterior",
                  interior: "Número interior (opcional)",
                  postalCode: "Código postal",
                  colony: "Colonia",
                  city: "Municipio / ciudad",
                  state: "Estado",
                  references: "Referencias (opcional)",
                }).map(([key, label]) =>
                  key === "colony" ? (
                    <label key={key}>
                      Colonia
                      <select
                        name="colony"
                        required={addressOpen}
                        value={address.colony}
                        onChange={(event) => {
                          const row = postalOptions.find(
                            (r) => r.colony === event.target.value,
                          );
                          setAddress((a) => ({
                            ...a,
                            colony: row?.colony || "",
                            city: row?.city || "",
                            state: row?.state || "",
                          }));
                          setQuote(undefined);
                        }}
                      >
                        <option value="">Selecciona tu colonia</option>
                        {postalOptions.map((row) => (
                          <option key={row.colony} value={row.colony}>
                            {row.colony}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <Field
                      key={key}
                      name={"address-" + key}
                      label={label}
                      type={
                        key === "email"
                          ? "email"
                          : key === "phone"
                            ? "tel"
                            : "text"
                      }
                      required={
                        addressOpen && !["interior", "references"].includes(key)
                      }
                      value={address[key as keyof typeof address]}
                      readOnly={key === "city" || key === "state"}
                      onChange={(v) => {
                        setAddress((a) => ({
                          ...a,
                          [key]: v,
                          ...(key === "postalCode"
                            ? { colony: "", city: "", state: "" }
                            : {}),
                        }));
                        setQuote(undefined);
                      }}
                    />
                  ),
                )}
              </div>
              {postalStatus && <p role="status">{postalStatus}</p>}
              <p className="muted">
                México · Verificaremos automáticamente la cobertura antes del
                pago.
              </p>
              {quote && (
                <p role="status" className="success">
                  {quote.fixture
                    ? "Cobertura de prueba local. No representa un envío real."
                    : "Hay un servicio disponible."}{" "}
                  {quote.carrier} · {money(quote.shipping)} MXN de envío,
                  cobrado por separado.{" "}
                  {quote.transitDays
                    ? `Tránsito estimado: ${quote.transitDays} días hábiles desde la entrega al transportista; no es fecha garantizada.`
                    : ""}
                  {quote.provisionalPackaging &&
                    " Cotización calculada con empaque estimado, pendiente de medición física."}
                </p>
              )}
            </>
          )}
        </section>
        <section className="form-card">
          <span className="eyebrow">03 · PAGO</span>
          <h2>Elige cómo pagar.</h2>
          <label className="check">
            <input
              type="radio"
              name="provider"
              value="mercadopago"
              disabled={data.mode !== "local" && !data.providers?.mercadopago}
              checked={provider === "mercadopago"}
              onChange={() => setProvider("mercadopago")}
            />
            Mercado Pago — Tarjetas
          </label>
          <label className="check">
            <input
              type="radio"
              name="provider"
              value="paypal"
              disabled={data.mode !== "local" && !data.providers?.paypal}
              checked={provider === "paypal"}
              onChange={() => setProvider("paypal")}
            />
            PayPal
          </label>
          {data.mode !== "local" &&
            data.paymentsEnabled &&
            total &&
            (provider === "mercadopago" ? (
              <InlinePayment
                email={buyerEmail}
                amount={
                  (total.total +
                    (delivery === "national"
                      ? data.content.shippingFlatRate
                      : 0)) /
                  100
                }
                publicKey={data.mpPublicKey || ""}
                controllerRef={cardController}
                onReady={setPaymentReady}
              />
            ) : (
              <InlinePayPal
                prepared={paymentOrder?.provider === "paypal"}
                clientId={data.paypalClientId || ""}
                createOrder={async () => {
                  const form = document.getElementById(
                    "checkout-form",
                  ) as HTMLFormElement;
                  const order = await submit({
                    preventDefault() {},
                    currentTarget: form,
                  } as React.FormEvent<HTMLFormElement>);
                  if (!order)
                    throw new Error(
                      "Revisa tus datos y acepta los términos y el aviso de privacidad.",
                    );
                  return order;
                }}
              />
            ))}
          <p className="muted">
            {data.mode === "local"
              ? "Modo local: podrás probar los estados de pago sin realizar un cobro."
              : data.paymentsEnabled
                ? "El pago se procesa con el proveedor. Nunca almacenamos datos de tu tarjeta."
                : "Las compras todavía no están habilitadas. Estamos preparando la tienda."}
          </p>
          <label className="check">
            <input type="checkbox" name="terms" required />
            Acepto los{" "}
            <a href="/terminos-de-compra" target="_blank" rel="noopener">
              términos de compra
            </a>
            .
          </label>
          <label className="check">
            <input type="checkbox" name="privacy" required />
            He leído el{" "}
            <a href="/aviso-de-privacidad" target="_blank" rel="noopener">
              aviso de privacidad
            </a>
            .
          </label>
          <label className="check legal-copy">
            <input type="checkbox" name="marketingConsent" />
            Quiero recibir noticias, promociones y avisos sobre futuros
            lanzamientos de juegos de Marlo Games.
          </label>
          <Turnstile
            key={verificationAttempt}
            siteKey={data.turnstileSiteKey}
            onToken={setToken}
          />
        </section>
      </fieldset>
      <aside className="summary">
        <h2>Tu pedido</h2>
        {paymentOrder?.orderNumber && <p role="status">Número de pedido: <strong>{paymentOrder.orderNumber}</strong></p>}
        {total?.lines.map((l: any) => (
          <p key={l.id}>
            {l.quantity} × {l.title}
            <strong>{money(l.amount)}</strong>
          </p>
        ))}
        <label>
          Cupón
          <input
            disabled={busy}
            value={coupon}
            onChange={(e) => setCoupon(e.target.value)}
          />
        </label>
        <p>
          Subtotal <strong>{money(total?.subtotal || 0)}</strong>
        </p>
        {!!total?.discount && (
          <p>
            Descuento <strong>−{money(total.discount)}</strong>
          </p>
        )}
        <p>
          Entrega{" "}
          <strong>
            {delivery === "national"
              ? money(data.content.shippingFlatRate)
              : "GRATIS ENTREGA LOCAL"}
          </strong>
        </p>
        <div className="sum-total">
          Total MXN{" "}
          <strong>
            {money(
              (total?.total || 0) +
                (delivery === "national" ? data.content.shippingFlatRate : 0),
            )}
          </strong>
        </div>
        <button
          type="submit"
          form="checkout-form"
          disabled={
            busy ||
            !total ||
            (data.mode !== "local" &&
              (!data.paymentsEnabled ||
                (provider === "mercadopago" && !paymentReady)))
          }
        >
          {busy ? "Registrando…" : "Finalizar compra"}
        </button>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </aside>
    </div>
  );
}
const root =
  import.meta.hot?.data.root || createRoot(document.getElementById("root")!);
if (import.meta.hot) import.meta.hot.data.root = root;
root.render(<App />);

