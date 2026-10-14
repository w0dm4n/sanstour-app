"use client";

import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
} from "motion/react";
import { useRef, useSyncExternalStore, type CSSProperties, type ReactNode, type RefObject } from "react";
import type { Mouvement } from "./donnees";

// Calque d'art animé au défilement. Le positionnement (--x, --y, --w, --h) reste en CSS ; ce composant
// n'ajoute qu'une translation, posée sur un enfant pour ne pas toucher à la boîte de la maquette.
// Rendu serveur et premier rendu client : immobile (pas d'écart d'hydratation) ; ensuite, animé sauf si
// l'utilisateur demande moins de mouvement.

const rien = () => () => {};
const useMonte = () =>
  useSyncExternalStore(
    rien,
    () => true,
    () => false,
  );

type Props = {
  mouvement: Mouvement;
  className: string;
  style: CSSProperties;
  /** Calque absent de la mise en page mobile. */
  masqueMobile: boolean;
  children: ReactNode;
};

export function CoucheAnimee({ mouvement, className, style, masqueMobile, children }: Props) {
  const monte = useMonte();
  const reduit = useReducedMotion();
  const fixe = !monte || reduit !== false;
  // Mesuré sur la boîte immobile, jamais sur l'enfant translaté.
  const boite = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={boite}
      className={className}
      style={style}
      data-mobile={masqueMobile ? "non" : undefined}
      aria-hidden="true"
    >
      {mouvement.type === "fond" ? (
        <Fond cible={boite} amplitude={mouvement.amplitude} fixe={fixe}>
          {children}
        </Fond>
      ) : (
        <Descente vitesse={mouvement.vitesse} fixe={fixe}>
          {mouvement.type === "nuage" && !fixe ? (
            <motion.div
              className="absolute inset-0"
              initial={{ x: "0%" }}
              animate={{ x: mouvement.derive }}
              transition={{
                duration: mouvement.duree,
                ease: "easeInOut",
                repeat: Infinity,
                repeatType: "mirror",
              }}
            >
              {children}
            </motion.div>
          ) : (
            children
          )}
        </Descente>
      )}
    </div>
  );
}

/** La page défile, le calque descend d'une fraction du défilement (il « traîne » derrière). */
function Descente({ vitesse, fixe, children }: { vitesse: number; fixe: boolean; children: ReactNode }) {
  const { scrollY } = useScroll();
  // Au-delà de deux écrans, le calque est hors de vue : on cesse de le déplacer.
  const y = useTransform(scrollY, (v) =>
    typeof window === "undefined" ? 0 : Math.min(Math.max(v, 0), window.innerHeight * 2) * vitesse,
  );
  return (
    <motion.div className="absolute inset-0" style={fixe ? undefined : { y }}>
      {children}
    </motion.div>
  );
}

/**
 * Fond de section : --p va de -1 à +1 pendant que la section traverse l'écran ; la CSS (.couche-fond)
 * en fait une translation de ±amplitude px de maquette (× --u, proportionnelle à la largeur).
 */
function Fond({
  cible,
  amplitude,
  fixe,
  children,
}: {
  cible: RefObject<HTMLDivElement | null>;
  amplitude: number;
  fixe: boolean;
  children: ReactNode;
}) {
  const { scrollYProgress } = useScroll({ target: cible, offset: ["start end", "end start"] });
  const p: MotionValue<number> = useTransform(scrollYProgress, [0, 1], [-1, 1]);
  return (
    <motion.div
      className="couche-fond absolute inset-0"
      style={fixe ? undefined : ({ "--p": p, "--amplitude": amplitude } as unknown as CSSProperties)}
    >
      {children}
    </motion.div>
  );
}
