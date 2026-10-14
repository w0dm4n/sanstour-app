import type { Metadata } from "next";
import { Rowdies } from "next/font/google";
import "./globals.css";

const rowdies = Rowdies({
  weight: ["300", "400", "700"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-rowdies",
});

export const metadata: Metadata = {
  // SITE_URL est lu au build (métadonnées prérendues) : le fixer aussi à la construction de l'image.
  metadataBase: new URL(process.env.SITE_URL || "https://sanstour.com"),
  title: {
    default: "Sanstour",
    template: "%s · Sanstour",
  },
  description:
    "Sanstour, un fan game Dofus en temps réel. Le Monde des Douze n'attend pas son tour.",
  openGraph: {
    type: "website",
    locale: "fr_FR",
    siteName: "Sanstour",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={rowdies.variable}>
      <body>{children}</body>
    </html>
  );
}
