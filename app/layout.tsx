import type { Metadata } from "next";
import { Exo_2, Geist_Mono, Inter } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { Providers } from "./providers";

// Inter porte le contenu dense : chiffres nets, lisible en petit corps.
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
});

// Exo 2 est la police de titres de la charte Jumbo Pneus.
const exo2 = Exo_2({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-heading",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Catalogue Jumbo Pneus · Espace franchisé",
    template: "%s · Catalogue Jumbo Pneus",
  },
  description:
    "Catalogue de pièces réservé aux franchisés Jumbo Pneus : les références compatibles avec un véhicule identifié, avec leurs caractéristiques techniques.",
  // Outil interne derrière authentification : rien à indexer.
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      className={cn("h-full", "antialiased", geistMono.variable, "font-sans", inter.variable, exo2.variable)}
    >
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
