import { useState } from "react";
import { Snowfall } from "./Snowfall";
import { catalogHeading, type Content } from "./content";
import { money, type Product } from "./domain";
import {
  responsiveArt,
  thumbArt,
  imageLabel,
  isLaunch,
  canBuy,
  statusLabels,
} from "./launch";

export function CardComposition({
  product,
  content,
  compact = false,
}: {
  product: Product;
  content?: Content;
  compact?: boolean;
}) {
  const images = [product.image, ...product.gallery].filter(Boolean);
  return (
    <figure className={"card-composition" + (compact ? " compact" : "")}>
      {content?.heroDesktop ? (
        <picture className="custom-hero">
          <source
            media="(max-width:620px)"
            srcSet={content.heroMobile || content.heroDesktop}
          />
          <img
            src={content.heroDesktop}
            alt={product.title}
            fetchPriority="high"
          />
        </picture>
      ) : (
        <div className="card-fan">
          {images.slice(0, 3).map((src, i) => (
            <img
              key={src}
              className={"fan-card fan-" + i}
              src={src}
              {...responsiveArt(src)}
              alt={imageLabel(src, product.title)}
              width="900"
              height="1350"
              loading={compact ? "lazy" : undefined}
              fetchPriority={!compact && i === 0 ? "high" : "auto"}
            />
          ))}
        </div>
      )}
      <figcaption>
        {isLaunch(product)
          ? "Arte ilustrativo · Diseño sujeto a cambios"
          : "Una mirada al juego"}
      </figcaption>
    </figure>
  );
}

export function DeliveryNotes({
  paymentsEnabled = false,
  shippingFlatRate = 7000,
}: {
  paymentsEnabled?: boolean;
  shippingFlatRate?: number;
}) {
  return (
    <div className="delivery-notes">
      <div>
        <span className="eyebrow">A DOMICILIO</span>
        <h3>Envío por {money(shippingFlatRate)} MXN.</h3>
        <p>
          Envío nacional. Estimado de hasta 6 días hábiles desde la entrega al
          transportista, sujeto a destino y cobertura.
        </p>
      </div>
      <div>
        <span className="eyebrow">CERCA DE NOSOTROS</span>
        <h3>Entrega local sin costo.</h3>
        <p>Solo ZMG. Previa coordinación en Plaza La Perla, Zapopan.</p>
      </div>
      <div>
        <span className="eyebrow">AL COMPRAR</span>
        <h3>Mercado Pago y PayPal.</h3>
        <p>
          {paymentsEnabled
            ? "El pago se procesa con el proveedor; no almacenamos los datos de tu tarjeta."
            : "Estamos preparando los pagos con tarjeta y PayPal. Las compras aún no están habilitadas."}
        </p>
      </div>
    </div>
  );
}

export function GameStory({ snow = false }: { snow?: boolean }) {
  return (
    <section
      className={"game-story" + (snow ? " with-snow" : "")}
      aria-labelledby="story-title"
    >
      {snow && <Snowfall />}
      <div className="story-intro">
        <span className="eyebrow">DENTRO DE LA PARTIDA</span>
        <h2 id="story-title">
          La Navidad <br />
          une a las personas.
          <br />
          <em>Este juego pone eso a prueba.</em>
        </h2>
        <p>Intercambia regalos, descubre qué quieren los demás y ten cuidado: alguien podría estar arruinando la Navidad.</p>
      </div>
      <div className="story-steps">
        <article>
          <span>01</span>
          <div>
            <h3>Intercambia regalos.</h3>
            <p>
              Decide qué conservar y qué intercambiar. Cada participante persigue
              un objetivo secreto.
            </p>
          </div>
        </article>
        <article>
          <span>02</span>
          <div>
            <h3>Lee las intenciones.</h3>
            <p>
              Observa los intercambios. La deducción, el engaño y las cartas
              especiales entran en juego.
            </p>
          </div>
        </article>
        <article>
          <span>03</span>
          <div>
            <h3>Cuidado con el Grinch.</h3>
            <p>
              Mientras unos buscan su regalo favorito, alguien podría
              tener otros planes.
            </p>
          </div>
        </article>
      </div>
    </section>
  );
}

export function EditorialHome({
  products,
  content,
  loading,
  paymentsEnabled,
  onBuy,
}: {
  onBuy: (p: Product) => void;
  products: Product[];
  content: Content;
  loading: boolean;
  paymentsEnabled: boolean;
}) {
  const featured =
    products.find((p) => p.id === content.featuredProductId && !p.fixture) ||
    products.find((p) => p.featured && !p.fixture) ||
    products.find((p) => !p.fixture);
  return (
    <>
      <div className="editorial-masthead">
        <span>MARLO GAMES </span>
        <span>México</span>
      </div>
      {featured ? (
        <section
          className={
            "launch-hero" +
            (featured.slug === "intercambio-navideno" ? " festive-hero" : "")
          }
        >
          {featured.slug === "intercambio-navideno" && <Snowfall />}
          <div className="hero-sticker" aria-hidden="true">
            La próxima
            <br />
            <strong>partida</strong>
            <span>es aquí.</span>
          </div>
          <div className="launch-copy">
            <span className="eyebrow">
              <i className="status-dot" />
              {statusLabels[featured.status]} / JUEGO DESTACADO
            </span>
            <h1>{featured.title}</h1>
            <p>
              {isLaunch(featured)
                ? "Regalos que cambian de manos. Intenciones que nadie conoce."
                : featured.shortDescription}
            </p>
            <div className="launch-price">
              <strong>{money(featured.price)}</strong>
              <span>MXN</span>
            </div>
            <div className="hero-actions">
              {canBuy(featured, content.preordersEnabled) && (
                <button onClick={() => onBuy(featured)}>
                  Comprar — {money(featured.price).replace(".00", "")}{" "}
                  <span>↗</span>
                </button>
              )}
              <a
                className={
                  canBuy(featured, content.preordersEnabled)
                    ? "text-link"
                    : "button"
                }
                href={"/juegos/" + featured.slug}
              >
                Conocer el juego <span aria-hidden="true">↗</span>
              </a>
              <a className="text-link" href="/juegos">
                Ver catálogo
              </a>
            </div>
            <p className="launch-footnote">
              {isLaunch(featured)
                ? "Regalar es bonito. Quedarte con lo mejor, también."
                : featured.category}
            </p>
          </div>
          <CardComposition product={featured} content={content} />
        </section>
      ) : (
        <section className="page-heading">
          <span className="eyebrow">MARLO GAMES</span>
          <h1>{content.headline}</h1>
          <p>{loading ? "Preparando el catálogo…" : content.heroText}</p>
          <a className="button" href="/juegos">
            Ver catálogo ↗
          </a>
        </section>
      )}
      <div className="brand-line">
        <span>Hacemos juegos.</span>
        <span>Tú haces las historias..</span>
        <a href="/nosotros">Conócenos ↗</a>
      </div>
      {featured && isLaunch(featured) && <GameStory />}
      <section className="catalog-editorial">
        <div className="section-top">
          <div>
            <span className="eyebrow">{catalogHeading.label}</span>
            <h2>{catalogHeading.title}</h2>
            <p>{catalogHeading.description}</p>
          </div>
          <a className="text-link" href="/juegos">
            Explorar todos los juegos ↗
          </a>
        </div>
        <div className="catalog-rows">
          {products
            .filter((p) => !p.fixture)
            .map((p, i) => (
              <CatalogRow key={p.id} product={p} index={i} />
            ))}
        </div>
      </section>
      <section className="publisher-story">
        <div className="publisher-mark" aria-hidden="true">
          <img
            src="/brand/marlo-icon-ink.svg"
            alt=""
            width="192"
            height="136"
          />
        </div>
        <div>
          <span className="eyebrow">DESDE GUADALAJARA</span>
          <h2>
            Un estudio creativo mexicano.
            <br />
            <em>Un lugar en tu mesa.</em>
          </h2>
          <p>{content.intro}</p>
          <a className="text-link" href="/nosotros">
            Más sobre Marlo Games ↗
          </a>
        </div>
      </section>
      <DeliveryNotes
        paymentsEnabled={paymentsEnabled}
        shippingFlatRate={content.shippingFlatRate}
      />
      <section className="wholesale-call">
        <div>
          <span className="eyebrow">PARA TIENDAS</span>
          <h2>¿Jugamos en tu tienda?</h2>
        </div>
        <a className="button light" href="/mayoreo">
          Hablemos de mayoreo ↗
        </a>
      </section>
    </>
  );
}
export function CatalogRow({
  product: p,
  index = 0,
}: {
  product: Product;
  index?: number;
}) {
  return (
    <article className="catalog-row">
      <a
        className="catalog-art"
        href={"/juegos/" + p.slug}
        aria-label={"Conocer " + p.title}
      >
        <CardComposition product={p} compact />
      </a>
      <div className="catalog-copy">
        <div className="catalog-index">
          <span>MARLO GAMES / {String(index + 1).padStart(2, "0")}</span>
          <span>{statusLabels[p.status]}</span>
        </div>
        <span className="eyebrow">{p.category}</span>
        <h3>
          <a href={"/juegos/" + p.slug}>{p.title}</a>
        </h3>
        <p>
          {isLaunch(p)
            ? p.shortDescription.split(/(Le Gronch)/g).map((text, index) =>
                text === "Le Gronch" ? (
                  <em className="le-gronch" key={index}>{text}</em>
                ) : text,
              )
            : p.shortDescription}
        </p>
        <div className="catalog-end">
          <strong>
            {money(p.price)} <small>MXN</small>
          </strong>
          <a className="text-link" href={"/juegos/" + p.slug}>
            Conoce el juego ↗
          </a>
        </div>
      </div>
    </article>
  );
}
export function ProductPage({
  product: p,
  preorders,
  paymentsEnabled,
  shippingFlatRate,
  onAdd,
}: {
  product: Product;
  preorders: boolean;
  paymentsEnabled: boolean;
  shippingFlatRate: number;
  onAdd: (p: Product, quantity?: number) => void;
}) {
  const [selected, setSelected] = useState(0),
    [quantity, setQuantity] = useState(1),
    [expanded, setExpanded] = useState(false);
  const images = [p.image, ...p.gallery].filter(
    (v, i, a) => v && a.indexOf(v) === i,
  );
  const buy = canBuy(p, preorders),
    launch = isLaunch(p);
  return (
    <div
      className={
        "game-theme theme-" +
        (p.theme || (launch ? "festive" : "editorial")) +
        " font-" +
        (p.themeFont || "expressive")
      }
      style={
        {
          "--game-accent": p.themeAccent,
          "--game-paper": p.themePaper,
        } as React.CSSProperties
      }
    >
      <nav className="breadcrumbs" aria-label="Ruta de navegación">
        <a href="/">Inicio</a>
        <span>/</span>
        <a href="/juegos">Juegos</a>
        <span>/</span>
        <span aria-current="page">{p.title}</span>
      </nav>
      <section className="game-product">
        <div className="mobile-product-heading">
          <span className="eyebrow">MARLO GAMES / JUEGO DE CARTAS</span>
          <h1>{p.title}</h1>
          <div>
            <strong>
              {money(p.price)} <small>MXN</small>
            </strong>
            <span>{statusLabels[p.status]}</span>
          </div>
        </div>
        <div className="product-gallery">
          <div className="gallery-stage">
            {p.slug === "intercambio-navideno" && images.length > 0 && (
              <Snowfall />
            )}
            <span className="gallery-counter">
              {String(selected + 1).padStart(2, "0")} /{" "}
              {String(images.length).padStart(2, "0")}
            </span>
            {images.length ? (
              <button
                className="gallery-image"
                onClick={() => setExpanded(true)}
                aria-label="Ampliar ilustración"
              >
                <img
                  src={images[selected]}
                  alt={imageLabel(images[selected], p.title)}
                  width="900"
                  height="1350"
                  fetchPriority="high"
                />
                <span>Ampliar ↗</span>
              </button>
            ) : (
              <p>Imágenes por confirmar.</p>
            )}
          </div>
          <div className="gallery-thumbs" aria-label="Imágenes del juego">
            {images.map((src, i) => (
              <button
                key={src}
                aria-label={"Ver " + imageLabel(src, p.title)}
                aria-pressed={i === selected}
                onClick={() => setSelected(i)}
              >
                <img
                  src={thumbArt(src)}
                  alt=""
                  width="90"
                  height="135"
                  loading="lazy"
                />
              </button>
            ))}
          </div>
          <p className="art-disclosure">
            {launch
              ? "Ilustraciones auténticas de las cartas. El empaque y los componentes finales están pendientes de confirmación."
              : "Imágenes del juego."}
          </p>
        </div>
        <div className="purchase-panel">
          <span className="eyebrow">MARLO GAMES / {p.category}</span>
          <h1>{p.title}</h1>
          <div className="product-status">
            <i className="status-dot" />
            {statusLabels[p.status]}
          </div>
          <p className="product-description">{p.shortDescription}</p>
          <div className="purchase-price">
            <strong>{money(p.price)}</strong>
            <span>MXN</span>
          </div>
          <div className="purchase-controls">
            <label>
              Cantidad
              <select
                value={quantity}
                disabled={!buy}
                onChange={(e) => setQuantity(Number(e.target.value))}
              >
                {Array.from(
                  { length: Math.max(1, Math.min(p.stock, 20)) },
                  (_, i) => (
                    <option key={i} value={i + 1}>
                      {i + 1}
                    </option>
                  ),
                )}
              </select>
            </label>
            <button disabled={!buy} onClick={() => onAdd(p, quantity)}>
              {buy ? "Agregar al carrito" : statusLabels[p.status]}{" "}
              <span aria-hidden="true">{buy ? "＋" : ""}</span>
            </button>
          </div>
          {!buy && (
            <p className="availability-note">
              {p.status === "coming_soon"
                ? "Estamos preparando el lanzamiento. La fecha de venta está por confirmar."
                : "Este juego no está disponible para compra en este momento."}
            </p>
          )}
          <dl className="game-facts">
            <div>
              <dt>Jugadores</dt>
              <dd>{p.players}</dd>
            </div>
            <div>
              <dt>Duración</dt>
              <dd>{p.duration}</dd>
            </div>
            <div>
              <dt>Edad</dt>
              <dd>{p.age || "Por confirmar"}</dd>
            </div>
          </dl>
          <div className="purchase-delivery">
            <p>
              <strong>Envío nacional · {money(shippingFlatRate)} MXN</strong>
              <br />
              hasta 6 días hábiles desde la entrega al transportista estimados,
              sujeto a cobertura.
            </p>
            <p>
              <strong>Entrega local gratuita · Solo ZMG</strong>
              <br />
              Plaza La Perla, Zapopan. Previa coordinación.
            </p>
            <a className="text-link" href="/envios">
              Ver condiciones de entrega ↗
            </a>
          </div>
        </div>
      </section>
      <section className="game-about">
        <span className="eyebrow">SOBRE EL JUEGO</span>
        <div>
          <h2>{launch ? "Encuentra tus regalos favoritos." : p.title}</h2>
          <p>{p.description}</p>
          <br />
          {launch && (
            <div className="mechanics">
              <span>Objetivos secretos</span>
              <span>Deducción y engaño</span>
              <span>Interacción directa</span>
            </div>
          )}
        </div>
      </section>
      {launch && <GameStory snow={p.slug === "intercambio-navideno"} />}
      <section className="product-information">
        <div>
          <span className="eyebrow">LA EDICIÓN</span>
          <h2>Antes de jugar.</h2>
        </div>
        <div className="faq-list">
          <details open>
            <summary>
              Contenido y componentes <span>＋</span>
            </summary>
            <p>
              {p.components ||
                "La lista final de componentes está pendiente de confirmación. Las ilustraciones mostradas no representan la cantidad de cartas incluida."}
            </p>
          </details>
          <details>
            <summary>
              Cómo se juega y reglamento <span>＋</span>
            </summary>
            <p>
              {launch
                ? "Intercambia regalos y utiliza cartas especiales para alcanzar tu objetivo secreto. Publicaremos la preparación, los turnos y las condiciones completas de victoria con el reglamento final."
                : "Consulta el reglamento para conocer la preparación y los turnos."}
            </p>
            {p.rules ? (
              <a
                className="text-link"
                href={p.rules}
                target="_blank"
                rel="noreferrer"
              >
                Abrir reglamento ↗
              </a>
            ) : (
              <p>Reglamento final por publicar.</p>
            )}
          </details>
          <details>
            <summary>
              ¿Cuándo puedo comprarlo? <span>＋</span>
            </summary>
            <p>
              {buy
                ? "Puedes agregarlo al carrito. La disponibilidad se valida nuevamente antes del pago."
                : "La venta no está abierta. Actualizaremos esta página cuando la disponibilidad esté confirmada."}
            </p>
          </details>
          <details>
            <summary>
              Entrega y formas de pago <span>＋</span>
            </summary>
            <p>
              Envío nacional de {money(shippingFlatRate)} MXN, sujeto a
              cobertura. Entrega local gratuita únicamente en la ZMG, con
              coordinación en Plaza La Perla, Zapopan.
            </p>
            <p>
              {paymentsEnabled
                ? "Pago mediante Mercado Pago o PayPal."
                : "Los pagos con Mercado Pago y PayPal están en preparación. No se realizan cobros por ahora."}
            </p>
          </details>
        </div>
      </section>
      {expanded && (
        <ImageDialog
          src={images[selected]}
          label={imageLabel(images[selected], p.title)}
          onClose={() => setExpanded(false)}
        />
      )}
    </div>
  );
}
import { useEffect, useRef } from "react";
function ImageDialog({
  src,
  label,
  onClose,
}: {
  src: string;
  label: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = old;
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label={label}
      className="image-dialog"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <button autoFocus className="dialog-close" onClick={onClose}>
        Cerrar ×
      </button>
      <img src={src} alt={label} />
      <p>{label}</p>
    </dialog>
  );
}
