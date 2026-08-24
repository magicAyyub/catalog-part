import type { Metadata } from "next";
import { Geist_Mono, Lato, Outfit } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { Providers } from "./providers";
import { SiteHeader } from "@/components/layout/site-header";

const lato = Lato({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-sans" });

const outfit = Outfit({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
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
    "Catalogue de pièces de freinage réservé aux franchisés Jumbo Pneus : plaquettes et disques compatibles avec un véhicule identifié.",
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
      className={cn("h-full", "antialiased", geistMono.variable, "font-sans", lato.variable, outfit.variable)}
    >
      <body className="min-h-full flex flex-col">
        <Providers>
          <SiteHeader />
          {children}
        </Providers>
      </body>
    </html>
  );
}
