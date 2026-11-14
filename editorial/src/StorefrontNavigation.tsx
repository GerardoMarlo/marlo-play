import { useEffect, useLayoutEffect, useRef, useState } from "react";

const links = [
  ["/juegos", "Juegos"],
  ["/nosotros", "La editorial"],
  ["/faq", "FAQ"],
  ["/rastrear-pedido", "Rastrear pedido"],
  ["/mayoreo", "Para tiendas"],
  ["/contacto", "Contacto"],
];

export function StorefrontNavigation({
  route,
  cartCount,
  cartOpen,
  onToggleCart,
  hasNotice,
}: {
  route: string;
  cartCount: number;
  cartOpen: boolean;
  onToggleCart: () => void;
  hasNotice: boolean;
}) {
  const publicPage = !route.startsWith("/admin");
  const allowBackToTop =
    publicPage && !/^\/(?:carrito|checkout|pedido)(?:\/|$)/.test(route);
  const [compact, setCompact] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const header = useRef<HTMLElement>(null);
  const headerEnd = useRef<HTMLDivElement>(null);
  const brand = useRef<HTMLAnchorElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const nav = useRef<HTMLElement>(null);
  const backToTop = useRef<HTMLButtonElement>(null);
  const focusAfterScroll = useRef<"toggle" | "nav" | null>(null);

  useLayoutEffect(() => {
    if (!publicPage) return;
    const mobile = matchMedia("(max-width: 700px)");
    let isCompact = false;
    let frame = 0;

    const update = () => {
      frame = 0;
      const end = headerEnd.current!.getBoundingClientRect().top;
      // Keep a small buffer between the two thresholds to avoid flicker.
      const next = mobile.matches && end <= (isCompact ? 16 : 0);
      if (next !== isCompact) {
        if (next && nav.current?.contains(document.activeElement))
          focusAfterScroll.current = "toggle";
        if (!next && document.activeElement === toggle.current)
          focusAfterScroll.current = "nav";
        isCompact = next;
        setCompact(next);
        setMenuOpen(false);
      }
      if (!allowBackToTop || window.scrollY < 500) {
        setShowBackToTop(false);
        return;
      }

      const button = backToTop.current!;
      const bounds = button.getBoundingClientRect();
      const overlap = [...document.querySelectorAll(
        "#contenido :is(a[href], button, input, select, textarea, summary), .site-footer a[href]",
      )].some((control) => {
        let ancestor: Element | null = control;
        let floating = false;
        while (ancestor && ancestor !== document.body) {
          const position = getComputedStyle(ancestor).position;
          if (position === "fixed" || position === "sticky") {
            floating = true;
            break;
          }
          ancestor = ancestor.parentElement;
        }
        if (!floating) return false;
        const rect = control.getBoundingClientRect();
        return (
          rect.width > 0 && rect.height > 0 &&
          rect.left < bounds.right && rect.right > bounds.left &&
          rect.top < bounds.bottom && rect.bottom > bounds.top
        );
      });
      setShowBackToTop(!overlap || document.activeElement === button);
    };
    const scheduleUpdate = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const observer = new ResizeObserver(scheduleUpdate);
    observer.observe(header.current!);
    observer.observe(document.body);
    update();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    mobile.addEventListener("change", scheduleUpdate);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      mobile.removeEventListener("change", scheduleUpdate);
    };
  }, [publicPage, allowBackToTop]);

  useLayoutEffect(() => {
    if (focusAfterScroll.current === "toggle")
      toggle.current?.focus({ preventScroll: true });
    if (focusAfterScroll.current === "nav" || menuOpen)
      nav.current?.querySelector("a")?.focus({ preventScroll: true });
    focusAfterScroll.current = null;
  }, [compact, menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (event.target instanceof Node && !header.current?.contains(event.target))
        setMenuOpen(false);
    };
    const closeOnReturn = () => setMenuOpen(false);
    document.addEventListener("pointerdown", closeOnOutsidePress);
    window.addEventListener("pageshow", closeOnReturn);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      window.removeEventListener("pageshow", closeOnReturn);
    };
  }, [menuOpen]);

  const closeMenu = () => {
    toggle.current?.focus({ preventScroll: true });
    setMenuOpen(false);
  };

  return (
    <>
      <header
        ref={header}
        className={publicPage ? "site-header storefront-header" : "site-header"}
        data-compact={compact}
        data-menu-open={menuOpen}
        onBlur={(event) => {
          if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget))
            setMenuOpen(false);
        }}
        onKeyDown={(event) => {
          if (menuOpen && event.key === "Escape") {
            event.preventDefault();
            closeMenu();
          }
        }}
      >
        <a className="brand" href="/" ref={brand}>
          <img
            src="/brand/marlo-logo-ink.svg"
            alt="Marlo Games"
            width="420"
            height="136"
          />
        </a>
        {publicPage && (
          <button
            className="menu-toggle"
            type="button"
            aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
            aria-expanded={menuOpen}
            aria-controls="site-navigation"
            ref={toggle}
            onClick={() => menuOpen ? closeMenu() : setMenuOpen(true)}
          >
            <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d={menuOpen ? "m6 6 12 12M18 6 6 18" : "M4 6h16M4 12h16M4 18h16"} />
            </svg>
          </button>
        )}
        <nav
          id="site-navigation"
          ref={nav}
          aria-label="Navegación principal"
          aria-hidden={compact && !menuOpen ? true : undefined}
          inert={compact && !menuOpen}
          onClick={(event) => {
            if (menuOpen && (event.target as HTMLElement).closest("a"))
              closeMenu();
          }}
        >
          {links.map(([href, label]) => (
            <a
              key={href}
              href={href}
              aria-current={route === href ? "page" : undefined}
              className={
                route === href ||
                (href === "/juegos" && route.startsWith("/juegos/"))
                  ? "active"
                  : ""
              }
            >
              {label}
            </a>
          ))}
        </nav>
        <button
          className="cart-link"
          aria-label={`Abrir carrito, ${cartCount} productos`}
          aria-expanded={cartOpen}
          onClick={() => {
            setMenuOpen(false);
            onToggleCart();
          }}
        >
          Carrito <span>{cartCount}</span>
        </button>
      </header>
      {publicPage && <div ref={headerEnd} aria-hidden="true" />}
      {allowBackToTop && (
        <button
          className="back-to-top"
          ref={backToTop}
          type="button"
          aria-label="Volver arriba"
          data-visible={showBackToTop && !cartOpen && !hasNotice && !menuOpen}
          onClick={() => {
            setMenuOpen(false);
            brand.current?.focus({ preventScroll: true });
            window.scrollTo({
              top: 0,
              behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
                ? "instant"
                : "smooth",
            });
          }}
        >
          <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20V4m-6 6 6-6 6 6" />
          </svg>
        </button>
      )}
    </>
  );
}
