import { sections, brand } from './catalog.mjs';

const escape = value =>
  String(value).replace(
    /[&<>"']/g,
    c =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      })[c]
  );

const logo = () =>
  brand.logo
    ? `<img class="logo" src="${escape(brand.logo)}" alt="MARLO">`
    : `
      <span class="wordmark">
        MARLO<span aria-hidden="true">.</span>
      </span>
    `;

const card = e => `
  <article class="project">
    <div class="project-art">
      ${
        e.image
          ? `
            <img
              src="${escape(e.image)}"
              alt="${escape(e.imageAlt ?? '')}"
              loading="lazy"
              width="680"
              height="1008"
            >
          `
          : `
            <span
              class="project-placeholder"
              aria-hidden="true"
            >
              ＋
            </span>
          `
      }

      ${
        e.artLabel
          ? `
            <span class="art-label">
              ${escape(e.artLabel)}
            </span>
          `
          : ''
      }
    </div>

    <div class="project-copy">
      <div class="project-meta">
        <span>${escape(e.tag ?? e.status)}</span>
        <span class="status">${escape(e.status)}</span>
      </div>

      <h3>${escape(e.title)}</h3>

      <p>
        ${escape(e.description)}
      </p>

      ${
        e.details
          ? `
            <small>
              ${escape(e.details)}
            </small>
          `
          : ''
      }

      <a
        class="button cream"
        href="${escape(
          e.url ??
            `https://play.marlo.games/${encodeURIComponent(e.slug)}`
        )}"
      >
        ${escape(e.cta ?? 'Open project')}
        <span aria-hidden="true">↗</span>
      </a>
    </div>
  </article>
`;

export function portal(css) {
  return `
    <!doctype html>

    <html lang="en">
      <head>
        <meta charset="utf-8">

        <meta
          name="viewport"
          content="width=device-width,initial-scale=1"
        >

        <meta
          name="theme-color"
          content="#201913"
        >

        <meta
          name="description"
          content="MARLO is a creative playground. Play browser games, discover experiments, and see what else is on the workbench."
        >

        <meta
          property="og:title"
          content="MARLO — Games & questionable engineering"
        >

        <meta
          property="og:description"
          content="Games first. Other interesting things also welcome."
        >

        <meta
          property="og:url"
          content="https://marlo.games/"
        >

        <link
          rel="canonical"
          href="https://marlo.games/"
        >

        <link
          rel="icon"
          type="image/webp"
          href="/assets/marlo-logo.webp"
        >

        <title>
          MARLO — Games & questionable engineering
        </title>

        <style>
          ${css}
        </style>
      </head>

      <body>
        <a
          class="skip"
          href="#main"
        >
          Skip to content
        </a>

        <div class="shell">
          <header>
            <a
              class="brand"
              href="/"
              aria-label="MARLO home"
            >
              ${logo()}
            </a>

            <nav aria-label="Main navigation">
              <a
                href="#games"
                data-open="games"
              >
                Games
              </a>

              <a
                href="#not-games"
                data-open="not-games"
              >
                Not games
              </a>

              <a href="#about">
                Who's making this?
              </a>
            </nav>

            <span class="bench-status">
              <i></i>
              WORKBENCH: OCCUPIED
            </span>
          </header>

          <main id="main">
            <section
              class="hero"
              aria-labelledby="hero-title"
            >
              <div class="hero-copy">
                <span class="eyebrow">
                  MARLO.GAMES / PERSONAL CREATIVE LAB
                </span>

                <h1 id="hero-title">
                  Built for fun.
                  <br>
                  <em>Mostly on purpose.</em>
                </h1>

                <p>
                  Games, tools, experiments, and a few ideas that got
                  out of hand. Made by an engineer who likes seeing
                  what happens.
                </p>

                <div class="hero-actions">
                  <a
                    class="button orange"
                    href="#games"
                    data-open="games"
                  >
                    See the games
                    <span aria-hidden="true">↓</span>
                  </a>

                  <a
                    class="text-button"
                    href="#not-games"
                    data-open="not-games"
                  >
                    See the not-games ↘
                  </a>
                </div>

                <span class="tiny-note">
                  CODE + CARDBOARD + “WHAT IF?”
                </span>
              </div>

              <div
                class="bench"
                aria-label="A schematic of play: an idea becomes a prototype, then a game"
              >
                <span class="bench-label">
                  FIG. 01 — THE GENERAL IDEA
                </span>

                <div class="schematic">
                  <span class="axis horizontal"></span>
                  <span class="axis vertical"></span>

                  <div
                    class="die"
                    aria-hidden="true"
                  >
                    <i></i>
                    <i></i>
                    <i></i>
                    <i></i>
                    <i></i>
                  </div>

                  <span class="dimension">
                    FUN / NOT TO SCALE
                  </span>

                  <span class="bolt b1">＋</span>
                  <span class="bolt b2">＋</span>
                  <span class="bolt b3">＋</span>
                  <span class="bolt b4">＋</span>

                  <span class="stamp">
                    ${logo()}
                  </span>

                  <span class="annotation">
                    probably works ↗
                  </span>
                </div>

                <div class="process">
                  <span>01 / IDEA</span>
                  <b>→</b>
                  <span>02 / BUILD</span>
                  <b>→</b>
                  <span>03 / PLAY</span>
                </div>
              </div>
            </section>

            <div class="section-intro">
              <span>
                THINGS OFF THE WORKBENCH
              </span>

              <span>
                ↓ HANDLE WITH CURIOSITY
              </span>
            </div>

            ${sections
              .map(
                (s, i) => `
                  <section
                    class="section"
                    id="${s.id}"
                  >
                    <h2>
                      <button
                        class="banner"
                        id="toggle-${s.id}"
                        aria-expanded="${s.open}"
                        aria-controls="panel-${s.id}"
                      >
                        <span class="num">
                          0${i + 1}
                        </span>

                        <span class="banner-title">
                          <strong>
                            ${escape(s.title)}
                          </strong>

                          <small>
                            ${escape(s.subtitle)}
                          </small>
                        </span>

                        <span class="badge">
                          ${s.entries.length
                            .toString()
                            .padStart(2, '0')}
                          PROJECT${s.entries.length === 1 ? '' : 'S'}
                        </span>

                        <span
                          class="chevron"
                          aria-hidden="true"
                        >
                          ＋
                        </span>
                      </button>
                    </h2>

                    <div
                      class="panel ${s.open ? 'open' : ''}"
                      id="panel-${s.id}"
                      role="region"
                      aria-labelledby="toggle-${s.id}"
                      ${s.open ? '' : 'inert'}
                    >
                      <div>
                        <div class="panel-inner">
                          ${
                            s.entries.length
                              ? s.entries.map(card).join('')
                              : `
                                <div class="empty">
                                  <span
                                    class="empty-symbol"
                                    aria-hidden="true"
                                  >
                                    [ … ]
                                  </span>

                                  <div>
                                    <span class="eyebrow">
                                      SPACE RESERVED FOR THE NEXT TANGENT
                                    </span>

                                    <h3>
                                      ${escape(s.empty)}
                                    </h3>

                                    <p>
                                      ${escape(
                                        s.emptyDetail ??
                                          'More projects are on the way.'
                                      )}
                                    </p>
                                  </div>

                                  <span class="work-tag">
                                    STILL TINKERING
                                  </span>
                                </div>
                              `
                          }
                        </div>
                      </div>
                    </div>
                  </section>
                `
              )
              .join('')}

            <section
              class="about"
              id="about"
            >
              <span class="eyebrow">
                THE PERSON BEHIND THE PARTS
              </span>

              <h2>
                Hello, Im Marlo
                <br>
                I make things.<br>Some of them are even useful
              </h2>

              <p>
                This is my place for building and sharing things:
                PC games, web games, board games, little tools,
                and experiments. Games are the main attraction.
                Anything interesting is allowed through the side door.
              </p>

              <span class="about-note">
                No grand master plan.
                All I have is a workbench.
              </span>
            </section>
          </main>

          <footer>
            <a href="/">
              MARLO.GAMES
            </a>

            <span>
              Built with code, cardboard, and coffee.
            </span>

            <a href="#main">
              Back to the top ↑
            </a>
          </footer>
        </div>

        <script>
          const setOpen = (button, open) => {
            button.setAttribute(
              'aria-expanded',
              String(open)
            );

            const panel =
              document.getElementById(
                button.getAttribute('aria-controls')
              );

            panel.classList.toggle(
              'open',
              open
            );

            panel.inert = !open;
          };

          document
            .querySelectorAll('.banner')
            .forEach(button =>
              button.addEventListener(
                'click',
                () =>
                  setOpen(
                    button,
                    button.getAttribute('aria-expanded') !== 'true'
                  )
              )
            );

          document
            .querySelectorAll('[data-open]')
            .forEach(link =>
              link.addEventListener(
                'click',
                () =>
                  setOpen(
                    document.getElementById(
                      'toggle-' + link.dataset.open
                    ),
                    true
                  )
              )
            );
        </script>
      </body>
    </html>
  `;
}