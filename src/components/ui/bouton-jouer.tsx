import { URL_JEU } from "@/components/landing/donnees";

// Bouton principal de la DA : couleur de l'univers de la section (data-univers), vers le jeu en ligne.
export function BoutonJouer({ libelle = "Jouer maintenant" }: { libelle?: string }) {
  return (
    <a className="bouton" href={URL_JEU}>
      {libelle}
    </a>
  );
}
