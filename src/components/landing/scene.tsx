import Image, { getImageProps } from "next/image";
import { preload } from "react-dom";
import type { CSSProperties } from "react";
import { BoutonJouer } from "@/components/ui/bouton-jouer";
import { CoucheAnimee } from "./couche-animee";
import { COUCHES, HAUTEUR_SCENE, HAUTEUR_SCENE_MOBILE, SECTIONS, type Couche, type Section } from "./donnees";

// La landing : une scène à l'échelle de la maquette (1 px Figma = --u), calques d'art en position
// absolue (décor, aria-hidden), sections de texte posées par-dessus. Sous 1024 px, mêmes calques avec
// les coordonnées « mobile » (maquette de 390 px de large proposée par SITE).

const MOBILE = "max-width: 1023px";
const BUREAU = "min-width: 1024px";

const varsBoite = (c: Couche): CSSProperties =>
  ({
    "--x": c.x,
    "--y": c.y,
    "--w": c.w,
    "--h": c.h,
    ...(c.mobile && { "--mx": c.mobile.x, "--my": c.mobile.y, "--mw": c.mobile.w, "--mh": c.mobile.h }),
  }) as CSSProperties;

/**
 * L'image d'un calque. Les grands décors (≥ 1500 px de maquette) sont servis en qualité 60 : vignettés et
 * couverts de grain, la différence ne se voit pas. Un fond qui a une version mobile passe par <picture>.
 */
function ImageCalque({ couche }: { couche: Couche }) {
  const qualite = couche.w >= 1500 ? 60 : 75;
  const bureau = getImageProps({
    src: `/images/landing/${couche.image}`,
    alt: "",
    fill: true,
    quality: qualite,
    // Largeur affichée : w px de maquette sur 1600 → w/16 vw (mobile : mw/390 × 100vw).
    sizes:
      couche.mobile && !couche.imageMobile
        ? `(max-width: 1023px) ${Math.round((couche.mobile.w / 390) * 100)}vw, ${Math.round(couche.w / 16)}vw`
        : `${Math.round(couche.w / 16)}vw`,
    loading: couche.lcp ? "eager" : "lazy",
    fetchPriority: couche.lcp ? "high" : undefined,
    className: "object-cover",
  }).props;
  const mobile = couche.imageMobile
    ? getImageProps({
        src: `/images/landing/${couche.imageMobile}`,
        alt: "",
        fill: true,
        quality: qualite,
        sizes: "100vw",
      }).props
    : null;

  if (couche.lcp) {
    // Préchargement de l'image du premier écran, une par mise en page.
    if (mobile)
      preload(mobile.src, {
        as: "image",
        imageSrcSet: mobile.srcSet,
        imageSizes: mobile.sizes,
        media: `(${MOBILE})`,
        fetchPriority: "high",
      });
    preload(bureau.src, {
      as: "image",
      imageSrcSet: bureau.srcSet,
      imageSizes: bureau.sizes,
      media: mobile ? `(${BUREAU})` : undefined,
      fetchPriority: "high",
    });
  }

  // getImageProps rend les attributs de next/image pour un <img> ou un <picture> écrit à la main.
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  const img = <img {...bureau} />;
  if (!mobile) return img;
  return (
    <picture>
      <source media={`(${MOBILE})`} srcSet={mobile.srcSet} sizes={mobile.sizes} />
      {img}
    </picture>
  );
}

function Calque({ couche, z }: { couche: Couche; z: number }) {
  const className = "couche";
  const style = { ...varsBoite(couche), zIndex: z };
  const contenu = couche.image ? (
    <ImageCalque couche={couche} />
  ) : (
    <div className="absolute inset-0" style={{ background: couche.degrade }} />
  );

  if (!couche.mouvement)
    return (
      <div
        className={className}
        style={style}
        data-mobile={couche.mobile ? undefined : "non"}
        data-bureau={couche.mobileSeulement ? "non" : undefined}
        aria-hidden="true"
      >
        {contenu}
      </div>
    );
  return (
    <CoucheAnimee
      mouvement={couche.mouvement}
      className={className}
      style={style}
      masqueMobile={!couche.mobile}
    >
      {contenu}
    </CoucheAnimee>
  );
}

/** Le mot-clé, avec sa partie en gras s'il en a une (« s'<b>arrête jamais</b> »). */
function MotCle({ texte, gras }: { texte: string; gras?: string }) {
  const i = gras ? texte.indexOf(gras) : -1;
  if (!gras || i < 0) return texte;
  return (
    <>
      {texte.slice(0, i)}
      <b className="font-bold">{gras}</b>
      {texte.slice(i + gras.length)}
    </>
  );
}

function BlocTexte({ section, premier }: { section: Section; premier: boolean }) {
  const Titre = premier ? "h1" : "h2";
  return (
    <section
      id={section.id}
      data-univers={section.univers}
      aria-labelledby={`${section.id}-titre`}
      className="bloc-texte"
      style={{ "--x": section.x, "--y": section.y, "--my": section.yMobile } as CSSProperties}
    >
      <Titre id={`${section.id}-titre`}>
        <span className="accroche">{section.accroche}</span>{" "}
        <span className="titre">{section.titre}</span>
      </Titre>
      <p className="corps">
        {section.lignes.map((ligne, i) => (
          <span key={i}>
            {i > 0 && " "}
            {typeof ligne === "string" ? (
              ligne
            ) : (
              <>
                {ligne[0]}
                <mark className="surlignage">
                  <MotCle texte={ligne[1]} gras={section.gras} />
                </mark>
                {ligne[2]}
              </>
            )}
          </span>
        ))}
      </p>
      <BoutonJouer />
    </section>
  );
}

export function Scene() {
  return (
    <div className="scene-cadre">
      <div
        className="scene"
        style={{ "--hauteur": HAUTEUR_SCENE, "--hauteur-mobile": HAUTEUR_SCENE_MOBILE } as CSSProperties}
      >
        {COUCHES.map((couche, i) => (
          <Calque key={couche.id} couche={couche} z={i + 1} />
        ))}
        <div className="grain" style={{ zIndex: COUCHES.length + 1 }} aria-hidden="true" />
        <div className="logo" style={{ zIndex: COUCHES.length + 2 }}>
          <Image
            src="/images/landing/logo-sanstour.webp"
            alt="Sanstour"
            fill
            sizes="(max-width: 1023px) 300px, 720px"
            loading="eager"
            className="object-contain"
          />
        </div>
        <div className="contenu" style={{ zIndex: COUCHES.length + 3 }}>
          {SECTIONS.map((section, i) => (
            <BlocTexte key={section.id} section={section} premier={i === 0} />
          ))}
        </div>
      </div>
    </div>
  );
}
