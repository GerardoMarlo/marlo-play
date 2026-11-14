import { LocalPickupAdmin } from "./LocalPickup";
import { useEffect, useState, type FormEvent } from "react";
import { api } from "./api";
import { PickupScheduler } from "./PickupScheduler";
import { PackagingEditor } from "./PackagingEditor";
import { money, type Product } from "./domain";
import type { Content } from "./content";
const newProduct: Product = {
  id: "",
  slug: "",
  title: "",
  shortDescription: "",
  description: "",
  price: 0,
  stock: 0,
  status: "coming_soon",
  sku: "",
  players: "Por definir",
  duration: "Por definir",
  age: "",
  components: "",
  weight: 0,
  length: 0,
  width: 0,
  height: 0,
  image: "",
  gallery: [],
  rules: "",
  theme: "editorial",
  themeAccent: "#b94f2c",
  themePaper: "#f7f2e8",
  themeFont: "expressive",
  category: "Juegos de mesa",
  featured: false,
  fixture: false,
  archived: false,
};
const names: Record<string, string> = {
  id: "ID",
  slug: "Ruta del producto",
  title: "Nombre",
  shortDescription: "Descripción breve",
  description: "Descripción completa",
  price: "Precio (centavos MXN)",
  stock: "Inventario disponible",
  sku: "SKU",
  players: "Jugadores",
  duration: "Duración",
  age: "Edad",
  components: "Componentes",
  weight: "Peso empacado (kg)",
  length: "Largo (cm)",
  width: "Ancho (cm)",
  height: "Alto (cm)",
  image: "Imagen principal (HTTPS o /images/)",
  rules: "Reglamento (URL HTTPS)",
  category: "Categoría",
  intro: "Presentación",
  featuredProductId:
    "ID del lanzamiento destacado (vacío: usar producto marcado como destacado)",
  themeAccent: "Color temático (hexadecimal)",
  themePaper: "Fondo temático (hexadecimal)",
  theme: "Tema: editorial, festive, mint o coral",
  themeFont: "Tipografía: expressive, classic o sans",
  headline: "Título principal",
  heroText: "Texto del banner",
  contactEmail: "Correo de contacto",
  instagram: "Instagram",
  facebook: "Facebook",
  logo: "Logotipo (URL)",
  heroDesktop: "Banner desktop (URL)",
  heroMobile: "Banner móvil (URL)",
  aboutImage: "Imagen editorial (URL)",
  wholesaleImage: "Imagen mayoreo (URL)",
  announcement: "Aviso superior",
  about: "Acerca de",
  privacy: "Aviso de privacidad",
  terms: "Términos",
  returns: "Devoluciones",
  shipping: "Envíos",
};
export function Admin() {
  const [session, setSession] = useState<any>(),
    [data, setData] = useState<any>(),
    [tab, setTab] = useState("Resumen"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [product, setProduct] = useState<any>(newProduct),
    [filter, setFilter] = useState(""),
    [payment, setPayment] = useState(""),
    [logistics, setLogistics] = useState(""),
    [date, setDate] = useState("");
  const load = () =>
    api("/admin/overview")
      .then(setData)
      .catch((e) => setError(e.message));
  useEffect(() => {
    api("/admin/session")
      .then((s) => {
        setSession(s);
        load();
      })
      .catch((e) => setError(e.message));
  }, []);
  async function save(path: string, b: unknown) {
    setError("");
    setNotice("");
    try {
      await api("/admin/" + path, b);
      setNotice("Cambios guardados.");
      await load();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  }
  if (!session)
    return (
      <div className="reading">
        <h1>Administración</h1>
        <p>Este espacio requiere una sesión autorizada de Cloudflare Access.</p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </div>
    );
  if (!data) return <p>Cargando administración… {error}</p>;
  const tabs = [
    "Resumen",
    "Productos",
    "Pedidos",
    "Entregas locales",
    "Envíos",
    "Empaques",
    "Cupones",
    "Mayoreo",
    "Mensajes",
    "Contenido",
    "Correos",
    "Configuración",
    "Auditoría",
  ];
  const orders = data.orders.filter(
    (o: any) =>
      (!filter ||
        JSON.stringify(o).toLowerCase().includes(filter.toLowerCase())) &&
      (!payment || o.payment === payment) &&
      (!logistics || o.logistics === logistics) &&
      (!date || new Date(o.created).toISOString().slice(0, 10) >= date) &&
      (tab !== "Entregas locales" ||
        JSON.parse(o.data).checkout.delivery === "local") &&
      (tab !== "Envíos" || JSON.parse(o.data).checkout.delivery === "national"),
  );
  return (
    <section className="admin">
      <div className="section-top">
        <div>
          <span className="eyebrow">MARLO GAMES · ADMINISTRACIÓN</span>
          <h1>Tu editorial, en orden.</h1>
        </div>
        <div>
          <small>{session.actor}</small>
          <button className="secondary" onClick={() => load()}>
            Actualizar
          </button>
        </div>
      </div>
      {session.mode === "local" && (
        <p className="sandbox-box">
          Acceso local de desarrollo. En un dominio público se exige Cloudflare
          Access con validación JWT y lista de administradores.
        </p>
      )}
      <nav className="admin-tabs" aria-label="Secciones de administración">
        {tabs.map((t) => (
          <button
            key={t}
            className={tab === t ? "selected" : "secondary"}
            onClick={() => {
              setTab(t);
              setNotice("");
            }}
          >
            {t}
          </button>
        ))}
      </nav>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="success">
          {notice}
        </p>
      )}
      {tab === "Empaques" && <PackagingEditor />}
      {tab === "Entregas locales" && <LocalPickupAdmin orders={data.orders} refresh={() => { void load(); }} />}
      {tab === "Resumen" && (
        <>
          <div className="metrics">
            {Object.entries({
              Ventas: money(data.metrics.sales),
              "Pedidos pagados": data.metrics.paid,
              "Por preparar / entregar": data.metrics.pending,
              Entregados: data.metrics.delivered,
              Descuentos: money(data.metrics.discounts),
              "Subsidio de envío": money(data.metrics.shippingSubsidy),
              "Ingreso menos envío": money(data.metrics.estimatedNet),
            }).map(([k, v]) => (
              <div key={k}>
                <small>{k}</small>
                <strong>{String(v)}</strong>
              </div>
            ))}
          </div>
          <p className="muted">
            Vista de los últimos 500 pedidos. Ingreso menos envío excluye
            comisiones, costo del producto e impuestos: no representa utilidad
            fiscal.
          </p>
          <h2>Ventas por producto</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Unidades pagadas</th>
                  <th>Importe antes de descuentos</th>
                </tr>
              </thead>
              <tbody>
                {data.products.map((p: Product) => {
                  const lines = data.orders
                    .filter((o: any) => o.payment === "paid")
                    .flatMap((o: any) => JSON.parse(o.data).totals.lines)
                    .filter((l: any) => l.id === p.id);
                  return (
                    <tr key={p.id}>
                      <td>{p.title}</td>
                      <td>
                        {lines.reduce((s: number, l: any) => s + l.quantity, 0)}
                      </td>
                      <td>
                        {money(
                          lines.reduce((s: number, l: any) => s + l.amount, 0),
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      {tab === "Resumen" && data.readiness && (
        <section className="form-card">
          <h2>Preparación de producción</h2>
          <p>La presencia de credenciales no acredita una prueba real.</p>
          {Object.entries(data.readiness)
            .filter(([k]) => k !== "mode")
            .map(([k, v]: [string, any]) => (
              <p key={k}>
                <strong>
                  {k}: {v.status}
                </strong>
                {v.missing?.length ? " · Falta: " + v.missing.join(", ") : ""}
                <br />
                <span>{v.reason}</span>
              </p>
            ))}
        </section>
      )}
      {tab === "Productos" && (
        <div className="admin-columns">
          <div>
            <button onClick={() => setProduct({ ...newProduct })}>
              Nuevo producto
            </button>
            {data.products.map((p: Product) => (
              <button
                className="product-select secondary"
                key={p.id}
                onClick={() =>
                  setProduct({
                    ...newProduct,
                    ...p,
                    theme:
                      p.theme ||
                      (p.slug === "intercambio-navideno"
                        ? "festive"
                        : "editorial"),
                    themeAccent:
                      p.themeAccent ||
                      (p.slug === "intercambio-navideno"
                        ? "#a62f31"
                        : "#b94f2c"),
                    themePaper:
                      p.themePaper ||
                      (p.slug === "intercambio-navideno"
                        ? "#eff0d9"
                        : "#f7f2e8"),
                    galleryText: p.gallery.join("\n"),
                  })
                }
              >
                <strong>{p.title}</strong>
                <span>
                  {money(p.price)} · {p.stock} disponibles
                  {p.archived ? " · Archivado" : ""}
                </span>
              </button>
            ))}
          </div>
          <form
            className="form-card"
            onSubmit={async (e) => {
              e.preventDefault();
              const { galleryText, ...p } = product;
              if (
                await save("products", {
                  ...p,
                  gallery:
                    galleryText?.split("\n").filter(Boolean) || p.gallery,
                })
              ) {
                setProduct(newProduct);
              }
            }}
          >
            <h2>{product.title || "Nuevo producto"}</h2>
            <div className="form-grid">
              {Object.keys(newProduct)
                .filter(
                  (k) =>
                    ![
                      "gallery",
                      "status",
                      "featured",
                      "fixture",
                      "archived",
                    ].includes(k),
                )
                .map((k) => (
                  <label key={k}>
                    {names[k] || k}
                    {["theme", "themeFont"].includes(k) ? (
                      <select
                        value={product[k] || newProduct[k as "theme"]}
                        onChange={(e) =>
                          setProduct({ ...product, [k]: e.target.value })
                        }
                      >
                        {(k === "theme"
                          ? ["editorial", "festive", "mint", "coral"]
                          : ["expressive", "classic", "sans"]
                        ).map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                      </select>
                    ) : [
                        "description",
                        "components",
                        "shortDescription",
                      ].includes(k) ? (
                      <textarea
                        required={k !== "components"}
                        value={product[k]}
                        onChange={(e) =>
                          setProduct({ ...product, [k]: e.target.value })
                        }
                      />
                    ) : (
                      <input
                        required={!["image", "rules", "age"].includes(k)}
                        type={
                          typeof (newProduct as any)[k] === "number"
                            ? "number"
                            : "text"
                        }
                        step={
                          ["weight", "length", "width", "height"].includes(k)
                            ? "0.01"
                            : "1"
                        }
                        min="0"
                        value={product[k]}
                        onChange={(e) =>
                          setProduct({
                            ...product,
                            [k]:
                              typeof (newProduct as any)[k] === "number"
                                ? Number(e.target.value)
                                : e.target.value,
                          })
                        }
                      />
                    )}
                  </label>
                ))}
              <label>
                Estado
                <select
                  value={product.status}
                  onChange={(e) =>
                    setProduct({ ...product, status: e.target.value })
                  }
                >
                  {["coming_soon", "available", "sold_out", "preorder"].map(
                    (v) => (
                      <option key={v}>{v}</option>
                    ),
                  )}
                </select>
              </label>
              <label>
                Galería (una URL HTTPS por línea)
                <textarea
                  value={product.galleryText || ""}
                  onChange={(e) =>
                    setProduct({ ...product, galleryText: e.target.value })
                  }
                />
              </label>
            </div>
            {["featured", "fixture", "archived"].map((k) => (
              <label className="check" key={k}>
                <input
                  type="checkbox"
                  checked={product[k]}
                  onChange={(e) =>
                    setProduct({ ...product, [k]: e.target.checked })
                  }
                />
                {
                  {
                    featured: "Destacado",
                    fixture: "Dato de desarrollo",
                    archived: "Archivado (retirar del catálogo)",
                  }[k]
                }
              </label>
            ))}
            <button>Guardar producto</button>
            <p className="muted">
              Archivar conserva el historial de pedidos. El inventario usa
              control de versiones para evitar sobrescribir reservas.
            </p>
          </form>
        </div>
      )}
      {["Pedidos", "Envíos"].includes(tab) && (
        <>
          <div className="filters">
            <label>
              Buscar cliente o pedido
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            </label>
            <label>
              Pago
              <select
                value={payment}
                onChange={(e) => setPayment(e.target.value)}
              >
                <option value="">Todos</option>
                {[
                  "pending",
                  "paid",
                  "rejected",
                  "refunded",
                  "expired",
                  "review",
                ].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label>
              Logística
              <select
                value={logistics}
                onChange={(e) => setLogistics(e.target.value)}
              >
                <option value="">Todos</option>
                {[
                  "pending_contact",
                  "scheduled",
                  "ready",
                  "label_created",
                  "shipped",
                  "delivered",
                  "incident",
                ].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label>
              Desde
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
          </div>
          {orders.length ? (
            orders.map((o: any) => {
              const d = JSON.parse(o.data);
              return (
                <details className="order-admin" key={o.id}>
                  <summary>
                    <span>{o.public_number}</span>
                    <strong>{money(o.total)}</strong>
                    <span>
                      {o.payment} · {o.logistics}
                    </span>
                  </summary>
                  <div className="form-card">
                    <p>
                      {d.checkout.name} · {o.email} · {d.checkout.phone}
                    </p>
                    <p>
                      {d.checkout.delivery === "local"
                        ? "Plaza La Perla · Solo ZMG"
                        : Object.values(d.checkout.address || {}).join(", ")}
                    </p>
                    {d.totals.lines.map((l: any) => (
                      <p key={l.id}>
                        {l.quantity} × {l.title} — {money(l.amount)}
                      </p>
                    ))}
                    <p>
                      Envío cobrado: {money(o.shipping)} · Costo real:{" "}
                      {money(o.shipping_cost)} · Subsidio:{" "}
                      {money(Math.max(0, o.shipping_cost - o.shipping))}
                    </p>
                    {d.quote && (
                      <p>
                        Transportista: {d.quote.carrier} ·{" "}
                        {d.quote.method === "dropoff"
                          ? "Entrega del remitente en sucursal"
                          : "Recolección en origen"}{" "}
                        · Ahorro: {money(d.quote.savings || 0)}
                        <br />
                        {d.quote.rationale}
                      </p>
                    )}
                    {d.quote?.packaging && (
                      <div>
                        <h4>Empaque del pedido</h4>
                        {d.quote.parcels.map((p: any, i: number) => {
                          const m = d.quote.packaging.parcels[i];
                          return (
                            <p key={i}>
                              {m.units} juegos · {m.name} · {p.length} ×{" "}
                              {p.width} × {p.height} cm · {p.weight} kg ·{" "}
                              {m.verified
                                ? "Medidas verificadas"
                                : "Medidas provisionales"}{" "}
                              ·{" "}
                              {m.weightVerified
                                ? "Peso verificado"
                                : "Peso estimado"}
                            </p>
                          );
                        })}
                        <p>
                          Materiales:{" "}
                          {d.quote.packaging.costCents === null
                            ? "Costo pendiente"
                            : money(d.quote.packaging.costCents)}{" "}
                          · Costo total de preparación y transporte:{" "}
                          {d.quote.packaging.costCents === null
                            ? "Pendiente de costos de materiales"
                            : money(
                                o.shipping_cost + d.quote.packaging.costCents,
                              )}
                        </p>
                      </div>
                    )}
                    {d.label?.labels?.map((url: string, i: number) => (
                      <a key={url} href={url} target="_blank" rel="noreferrer">
                        Descargar / imprimir guía {i + 1}
                      </a>
                    ))}
                    <p>
                      Guía: {o.tracking || "Sin guía"}
                      {d.label?.labelUrl && (
                        <a
                          href={d.label.labelUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Descargar etiqueta ↗
                        </a>
                      )}
                    </p>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const b = Object.fromEntries(
                          new FormData(e.currentTarget),
                        );
                        save("order", { id: o.id, ...b, action: "notes" });
                      }}
                    >
                      <label>
                        Fecha acordada (hora de Ciudad de México)
                        <input
                          type="datetime-local"
                          name="appointment"
                          defaultValue={o.appointment}
                        />
                      </label>
                      <label>
                        Notas internas
                        <textarea name="notes" defaultValue={o.notes} />
                      </label>
                      <button className="secondary">Guardar notas</button>
                    </form>
                    <div className="actions">
                      {o.payment === "paid" && (
                        <button
                          className="secondary"
                          onClick={() => {
                            if (
                              window.confirm(
                                `Reembolsar ${money(o.total)} al cliente. Esta acción mueve dinero.`,
                              )
                            )
                              save("order", {
                                id: o.id,
                                action: "refund",
                                approvedCost: o.total,
                              });
                          }}
                        >
                          Reembolsar pago
                        </button>
                      )}
                      {(d.checkout.delivery === "local"
                        ? ["scheduled", "ready", "delivered", "incident"]
                        : ["shipped", "delivered", "incident"]
                      ).map((s) => (
                        <button
                          className="secondary"
                          key={s}
                          onClick={() =>
                            save("order", {
                              id: o.id,
                              action: "logistics",
                              logistics: s,
                              notes: o.notes,
                              appointment: o.appointment,
                            })
                          }
                        >
                          {s}
                        </button>
                      ))}
                      {d.checkout.delivery === "national" && (
                        <>
                          <button
                            className="secondary"
                            onClick={() =>
                              save("order", { id: o.id, action: "quote" })
                            }
                          >
                            Renovar cotización
                          </button>
                          <button
                            className="secondary"
                            onClick={() =>
                              save("order", { id: o.id, action: "tracking" })
                            }
                          >
                            Consultar guía y rastreo
                          </button>
                          <button
                            className="secondary"
                            onClick={() =>
                              save("order", {
                                id: o.id,
                                action: "retry-label",
                                approvedCost: d.quote?.cost,
                              })
                            }
                          >
                            Recuperar intento de guía sin respuesta
                          </button>
                          <a
                            href="https://pro.skydropx.com"
                            target="_blank"
                            rel="noreferrer"
                          >
                            Gestionar recolección en Skydropx
                          </a>
                          <button
                            disabled={o.payment !== "paid" || !!o.tracking}
                            onClick={() =>
                              save("order", {
                                id: o.id,
                                action: "label",
                                approvedCost: d.quote?.cost,
                              })
                            }
                          >
                            Autorizar guía · {money(d.quote?.cost || 0)}
                          </button>
                        </>
                      )}
                    </div>
                    {d.quote?.manualFulfillment && (
                      <div>
                        <p>
                          Gestión interna: envío fijo $70. Generar guía
                          manualmente; sin compra automática.
                        </p>
                        {o.payment === "paid" && !o.tracking && (
                          <form
                            onSubmit={(event) => {
                              event.preventDefault();
                              const form = new FormData(event.currentTarget);
                              save("order", {
                                id: o.id,
                                action: "manual-tracking",
                                tracking: String(form.get("tracking") || ""),
                              });
                            }}
                          >
                            <label>
                              Número de seguimiento
                              <input
                                name="tracking"
                                required
                                minLength={3}
                                maxLength={200}
                              />
                            </label>
                            <button type="submit">
                              Registrar guía y notificar al comprador
                            </button>
                          </form>
                        )}
                      </div>
                    )}
                    {o.payment === "paid" &&
                      d.quote?.method === "pickup" &&
                      o.tracking && <PickupScheduler orderId={o.id} />}
                    <p className="muted">
                      Crear una guía no marca el pedido como enviado. Confirma
                      “shipped” solo al entregarlo al transportista.
                    </p>
                  </div>
                </details>
              );
            })
          ) : (
            <p>No hay pedidos con estos filtros.</p>
          )}
        </>
      )}
      {tab === "Cupones" && (
        <>
          <div className="chips">
            {data.coupons.map((row: any) => (
              <span key={row.code}>
                {row.code} · {row.uses} usos ·{" "}
                {JSON.parse(row.data).active ? "Activo" : "Inactivo"}
              </span>
            ))}
          </div>
          <CouponEditor save={save} coupons={data.coupons} />
        </>
      )}
      {tab === "Mayoreo" && (
        <>
          {data.leads.length === 0 && <p>Aún no hay solicitudes.</p>}
          {data.leads.map((l: any) => {
            const d = JSON.parse(l.data);
            return (
              <form
                className="form-card"
                key={l.id}
                onSubmit={(e) => {
                  e.preventDefault();
                  save("leads", {
                    id: l.id,
                    ...Object.fromEntries(new FormData(e.currentTarget)),
                  });
                }}
              >
                <h3>{d.store}</h3>
                <p>
                  {d.name} · {d.email} · {d.phone}
                </p>
                <p>
                  {d.city}, {d.state} · {d.website}
                </p>
                <p>{d.comments}</p>
                <label>
                  Estado
                  <select name="status" defaultValue={l.status}>
                    {["nuevo", "contactado", "negociación", "cerrado"].map(
                      (s) => (
                        <option key={s}>{s}</option>
                      ),
                    )}
                  </select>
                </label>
                <label>
                  Notas
                  <textarea name="notes" defaultValue={l.notes} />
                </label>
                <button>Guardar</button>
              </form>
            );
          })}
        </>
      )}
      {tab === "Mensajes" && (
        <>
          {data.messages.length === 0 && <p>Aún no hay mensajes.</p>}
          {data.messages.map((m: any) => {
            const d = JSON.parse(m.data);
            return (
              <article className="form-card" key={m.id}>
                <h3>{d.name}</h3>
                <p>{d.email}</p>
                <p>{d.message}</p>
              </article>
            );
          })}
        </>
      )}
      {tab === "Contenido" && (
        <ContentEditor
          content={data.content}
          products={data.products}
          save={save}
        />
      )}
      {tab === "Correos" && (
        <>
          <button onClick={() => save("process", {})}>Procesar cola</button>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Destinatario</th>
                  <th>Estado</th>
                  <th>Intentos</th>
                  <th>Error</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {data.outbox.map((m: any) => (
                  <tr key={m.id}>
                    <td>{m.kind}</td>
                    <td>{m.recipient}</td>
                    <td>{m.status}</td>
                    <td>{m.attempts}</td>
                    <td>{m.error}</td>
                    <td>
                      <button
                        className="secondary"
                        onClick={() => save("mail-retry", { id: m.id })}
                      >
                        Reintentar
                      </button>
                      <button
                        className="secondary"
                        onClick={async () => {
                          const preview = await api(
                            "/admin/mail-preview?id=" +
                              encodeURIComponent(m.id),
                          );
                          const panel = document.getElementById(
                            "mail-preview",
                          ) as HTMLIFrameElement;
                          panel.srcdoc = preview.html;
                        }}
                      >
                        Vista previa
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <iframe
            title="Vista previa de correo"
            id="mail-preview"
            sandbox=""
            className="mail-preview"
          />
          <form
            className="form-card"
            onSubmit={(e) => {
              e.preventDefault();
              save(
                "email-template",
                Object.fromEntries(new FormData(e.currentTarget)),
              );
            }}
          >
            <h3>Editar texto de plantilla</h3>
            <label>
              Plantilla
              <select name="kind">
                {[
                  "received",
                  "paid",
                  "pickup_ready",
                  "pickup_invitation_reminder",
                  "pickup_confirmed",
                  "pickup_rescheduled",
                  "pickup_cancelled",
                  "pickup_reminder",
                  "pickup_completed",
                  "rejected",
                  "refunded",
                  "label_created",
                  "internal_preparation",
                  "internal_contact",
                  "internal_lead",
                  "shipped",
                  "delivered",
                  "lead",
                  "contact",
                  "incident",
                ].map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
            </label>
            <label>
              Texto
              <textarea name="text" required rows={5} />
            </label>
            <button>Guardar plantilla</button>
          </form>
        </>
      )}
      {tab === "Configuración" && (
        <form
          className="form-card"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            save("content", {
              localEnabled: f.has("localEnabled"),
              nationalEnabled: f.has("nationalEnabled"),
              shippingFlatRate: Math.round(
                Number(f.get("shippingFlatRate")) * 100,
              ),
              preordersEnabled: f.has("preordersEnabled"),
            });
          }}
        >
          <h2>Operación comercial</h2>
          <label>
            Envío a domicilio (MXN)
            <input
              name="shippingFlatRate"
              type="number"
              min="0"
              max="1000"
              step="0.01"
              required
              defaultValue={(data.content.shippingFlatRate ?? 7000) / 100}
            />
          </label>
          <p>
            Envío nacional: <strong>Tarifa fija configurada</strong> · Entrega
            local: <strong>$0</strong>
          </p>
          {["localEnabled", "nationalEnabled", "preordersEnabled"].map((k) => (
            <label className="check" key={k}>
              <input
                type="checkbox"
                name={k}
                defaultChecked={data.content[k]}
              />
              {
                {
                  localEnabled: "Habilitar entrega local",
                  nationalEnabled: "Habilitar envío nacional",
                  preordersEnabled: "Habilitar preventas",
                }[k]
              }
            </label>
          ))}
          <p>Umbral de envío gratis: desactivado.</p>
          <p>
            Pagos, remitente de correo y credenciales se configuran en los
            secretos y variables del Worker. El panel no expone secretos.
          </p>
          <button>Guardar configuración</button>
        </form>
      )}
      {tab === "Auditoría" && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Administrador</th>
                <th>Acción</th>
                <th>Objeto</th>
              </tr>
            </thead>
            <tbody>
              {data.audit.map((a: any) => (
                <tr key={a.id}>
                  <td>
                    {new Date(a.created).toLocaleString("es-MX", {
                      timeZone: "America/Mexico_City",
                    })}
                  </td>
                  <td>{a.actor}</td>
                  <td>{a.action}</td>
                  <td>{a.target}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
function ContentEditor({
  products,
  content,
  save,
}: {
  products: Product[];
  content: Content;
  save: (path: string, b: unknown) => Promise<boolean>;
}) {
  const [c, setC] = useState(content);
  return (
    <form
      className="form-card"
      onSubmit={(e) => {
        e.preventDefault();
        save("content", c);
      }}
    >
      <h2>Textos, imágenes y políticas</h2>
      <p>
        Las imágenes se cambian mediante referencias HTTPS. Usa los tamaños
        indicados en ASSETS.md.
      </p>
      <div className="form-grid">
        {Object.entries(c)
          .filter(([, v]) => typeof v === "string")
          .map(([k, v]) => (
            <label key={k}>
              {names[k] || k}
              {k === "featuredProductId" ? (
                <select
                  value={String(v)}
                  onChange={(e) =>
                    setC({ ...c, featuredProductId: e.target.value })
                  }
                >
                  <option value="">Automático: primer destacado</option>
                  {products
                    .filter((p) => !p.fixture && !p.archived)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                </select>
              ) : [
                  "intro",
                  "about",
                  "privacy",
                  "terms",
                  "returns",
                  "shipping",
                  "heroText",
                ].includes(k) ? (
                <textarea
                  rows={5}
                  value={String(v)}
                  onChange={(e) => setC({ ...c, [k]: e.target.value })}
                />
              ) : (
                <input
                  value={String(v)}
                  onChange={(e) => setC({ ...c, [k]: e.target.value })}
                />
              )}
            </label>
          ))}
      </div>
      <h3>Preguntas frecuentes</h3>
      {c.faq.map(([q, a], i) => (
        <div className="form-grid" key={i}>
          <label>
            Pregunta {i + 1}
            <input
              value={q}
              onChange={(e) =>
                setC({
                  ...c,
                  faq: c.faq.map((x, j) =>
                    i === j ? [e.target.value, x[1]] : x,
                  ),
                })
              }
            />
          </label>
          <label>
            Respuesta
            <textarea
              value={a}
              onChange={(e) =>
                setC({
                  ...c,
                  faq: c.faq.map((x, j) =>
                    i === j ? [x[0], e.target.value] : x,
                  ),
                })
              }
            />
          </label>
        </div>
      ))}
      <button>Guardar contenido</button>
    </form>
  );
}
function CouponEditor({
  save,
  coupons,
}: {
  save: (path: string, b: unknown) => Promise<boolean>;
  coupons: any[];
}) {
  const initial = {
    code: "",
    type: "percent",
    value: 10,
    starts: Date.now(),
    expires: Date.now() + 30 * 86400000,
    maxUses: 100,
    perCustomer: 1,
    minimum: 0,
    eligible: [] as string[],
    active: true,
    combinable: false,
  };
  const [c, setC] = useState(initial);
  return (
    <form
      className="form-card"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        save("coupons", c);
      }}
    >
      <h2>Crear o editar cupón</h2>
      <label>
        Editar existente
        <select
          onChange={(e) =>
            setC(
              e.target.value
                ? JSON.parse(
                    coupons.find((x) => x.code === e.target.value).data,
                  )
                : initial,
            )
          }
        >
          <option value="">Nuevo</option>
          {coupons.map((x) => (
            <option key={x.code}>{x.code}</option>
          ))}
        </select>
      </label>
      <div className="form-grid">
        <label>
          Código
          <input
            required
            value={c.code}
            onChange={(e) => setC({ ...c, code: e.target.value.toUpperCase() })}
          />
        </label>
        <label>
          Tipo
          <select
            value={c.type}
            onChange={(e) => setC({ ...c, type: e.target.value })}
          >
            <option value="percent">Porcentaje</option>
            <option value="fixed">Monto fijo (centavos MXN)</option>
          </select>
        </label>
        {["value", "maxUses", "perCustomer", "minimum"].map((k) => (
          <label key={k}>
            {
              {
                value: "Valor",
                maxUses: "Usos totales",
                perCustomer: "Usos por cliente",
                minimum: "Compra mínima (centavos MXN)",
              }[k]
            }
            <input
              type="number"
              min="0"
              value={(c as any)[k]}
              onChange={(e) => setC({ ...c, [k]: Number(e.target.value) })}
            />
          </label>
        ))}
        {["starts", "expires"].map((k) => (
          <label key={k}>
            {k === "starts" ? "Inicio" : "Vencimiento"} (UTC)
            <input
              type="datetime-local"
              value={new Date((c as any)[k]).toISOString().slice(0, 16)}
              onChange={(e) => {
                if (e.target.value)
                  setC({ ...c, [k]: Date.parse(e.target.value + "Z") });
              }}
            />
          </label>
        ))}
        <label>
          IDs de productos elegibles (coma; vacío = todos)
          <input
            value={c.eligible.join(",")}
            onChange={(e) =>
              setC({
                ...c,
                eligible: e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
          />
        </label>
      </div>
      <label className="check">
        <input
          type="checkbox"
          checked={c.active}
          onChange={(e) => setC({ ...c, active: e.target.checked })}
        />
        Activo
      </label>
      <p>Se admite un cupón por pedido. Nunca descuenta el envío.</p>
      <button>Guardar cupón</button>
    </form>
  );
}
