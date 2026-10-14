// Filtres SVG du relief des titres (ombres internes de la maquette, impossibles en CSS sur du texte) :
// un liseré sombre en bas (0 -2 0) et un liseré de lumière en haut (0 1 0). Référencés par --relief.
const RELIEFS = [
  { id: "relief-village", sombre: 0.15, lumiere: "#dbff6a" },
  { id: "relief-clair", sombre: 0.25, lumiere: "#ffffff" },
];

export function FiltresRelief() {
  return (
    <svg width="0" height="0" aria-hidden="true" focusable="false" style={{ position: "absolute" }}>
      <defs>
        {RELIEFS.map((r) => (
          <filter
            key={r.id}
            id={r.id}
            x="-2%"
            y="-10%"
            width="104%"
            height="120%"
            colorInterpolationFilters="sRGB"
          >
            <feOffset in="SourceAlpha" dy="-2" result="decale-haut" />
            <feComposite in="SourceAlpha" in2="decale-haut" operator="out" result="bord-bas" />
            <feFlood floodColor="#000" floodOpacity={r.sombre} />
            <feComposite in2="bord-bas" operator="in" result="ombre" />
            <feOffset in="SourceAlpha" dy="1" result="decale-bas" />
            <feComposite in="SourceAlpha" in2="decale-bas" operator="out" result="bord-haut" />
            <feFlood floodColor={r.lumiere} />
            <feComposite in2="bord-haut" operator="in" result="lumiere" />
            <feMerge>
              <feMergeNode in="SourceGraphic" />
              <feMergeNode in="ombre" />
              <feMergeNode in="lumiere" />
            </feMerge>
          </filter>
        ))}
      </defs>
    </svg>
  );
}
