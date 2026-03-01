import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import BottomNav from "@/components/layout/BottomNav";
import OfflineBanner from "@/components/layout/OfflineBanner";
import PushNotificationInit from "@/components/layout/PushNotificationInit";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "BuckMed \u2013 Medication Manager",
  description:
    "Track medication schedules for pets and patients. Prevent double-dosing in real-time.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "BuckMed",
  },
  icons: {
    apple: "/apple-touch-icon.png",
    icon: "/icon-512.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#5fb8b0",
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

import { AuthProvider } from "@/components/providers/AuthProvider";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
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
