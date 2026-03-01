import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import BottomNav from "@/components/layout/BottomNav";
import OfflineBanner from "@/components/layout/OfflineBanner";
import PushNotificationInit from "@/components/layout/PushNotificationInit";
import { AuthProvider } from "@/components/providers/AuthProvider";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

const APP_NAME = "BuckMed";
const APP_DESCRIPTION =
  "Gerencie medicamentos de pacientes e pets em tempo real. Evite doses duplicadas.";

export const metadata: Metadata = {
  applicationName: APP_NAME,
  title: {
    default: `${APP_NAME} – Gestão de Medicamentos`,
    template: `%s | ${APP_NAME}`,
  },
  description: APP_DESCRIPTION,
  manifest: "/manifest.json",

  // ── Apple / iOS PWA ──────────────────────────────────────────────────
  appleWebApp: {
    capable: true,                    // <meta name="apple-mobile-web-app-capable">
    statusBarStyle: "default",        // shows the native iOS status bar
    title: APP_NAME,
    startupImage: "/apple-touch-icon.png",
  },

  // ── Icons ─────────────────────────────────────────────────────────────
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
    shortcut: "/icon-192.png",
  },

  // ── Open Graph (share card) ───────────────────────────────────────────
  openGraph: {
    type: "website",
    siteName: APP_NAME,
    title: `${APP_NAME} – Gestão de Medicamentos`,
    description: APP_DESCRIPTION,
    images: [{ url: "/icon-512.png", width: 512, height: 512 }],
  },

  // ── Twitter / X card ─────────────────────────────────────────────────
  twitter: {
    card: "summary",
    title: APP_NAME,
    description: APP_DESCRIPTION,
    images: ["/icon-512.png"],
  },

  // ── Format detection ─────────────────────────────────────────────────
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#5fb8b0",          // BuckMed teal — shown in Chrome address bar on Android
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 5,                 // allow pinch-zoom for accessibility
  userScalable: true,
  viewportFit: "cover",            // fills the full screen on notched iPhones
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className={inter.variable}>
      <head>
        {/* iOS: explicit link tags as belt-and-suspenders alongside Next.js metadata */}
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className="antialiased">
        <AuthProvider>
          <OfflineBanner />
          <PushNotificationInit />
          <main>{children}</main>
          <BottomNav />
        </AuthProvider>
      </body>
    </html>
  );
}
