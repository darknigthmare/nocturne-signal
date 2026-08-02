import type { Metadata, Viewport } from "next";
import "./globals.css";

const productionHost =
  process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL ?? "nocturne-signal.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(`https://${productionHost}`),
  title: {
    default: "NOCTURNE SIGNAL",
    template: "%s · NOCTURNE SIGNAL",
  },
  description:
    "Un jeu de rythme survival horror original. Trois morceaux, une station condamnée, une seule façon de tenir la porte fermée : jouer.",
  applicationName: "NOCTURNE SIGNAL",
  keywords: ["rhythm game", "survival horror", "jeu musical", "browser game"],
  authors: [{ name: "darknigthmare" }],
  creator: "darknigthmare",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "NOCTURNE",
  },
  icons: {
    icon: [{ url: "/icon.png", type: "image/png", sizes: "1254x1254" }],
    shortcut: "/icon.png",
  },
  openGraph: {
    type: "website",
    locale: "fr_FR",
    title: "NOCTURNE SIGNAL",
    description: "Le silence n'est pas vide. Jouez jusqu'à l'aube.",
    siteName: "NOCTURNE SIGNAL",
    images: [
      {
        url: "/og.png",
        width: 1672,
        height: 941,
        alt: "NOCTURNE SIGNAL — tour radio et cinq pistes lumineuses dans la nuit",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "NOCTURNE SIGNAL",
    description: "Survival rhythm horror · Jouable gratuitement dans le navigateur.",
    images: ["/og.png"],
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#050907",
  colorScheme: "dark",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
