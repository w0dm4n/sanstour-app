import { Scene } from "@/components/landing/scene";
import { FiltresRelief } from "@/components/ui/filtres-relief";

// La landing de la vitrine, d'après la maquette Figma de nicow (DA : design/da-sanstour.md).
export default function Accueil() {
  return (
    <main>
      <FiltresRelief />
      <Scene />
    </main>
  );
}
