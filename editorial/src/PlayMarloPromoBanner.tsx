export const playMarloUrl = "https://play.marlo.games";

export function OnlineArrow() {
  return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 18 18 6M6 6h12v12" /></svg>;
}

export function PlayMarloPromoBanner({ image = "/images/play-marlo/impostor-hero.webp" }: { image?: string }) {
  return (
    <aside className="play-marlo-promo" aria-label="Juegos gratis en línea">
      <div className="play-marlo-copy">
        <span className="eyebrow">TAMBIÉN EN MARLO</span>
        <h2>¿Una partida en línea?</h2>
        <p>Tenemos juegos gratis para jugar con amigos, en familia o desde donde estés. Entra, elige uno y empieza a jugar.</p>
        <a className="button" href={playMarloUrl}>Descubre nuestros juegos gratis <OnlineArrow /></a>
      </div>
      <img src={image} alt="Robot naranja de Impostor con una lupa, junto a los personajes del juego." width="512" height="640" loading="lazy" decoding="async" />
    </aside>
  );
}
