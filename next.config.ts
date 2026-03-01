import type { NextConfig } from "next";
// @ts-ignore - next-pwa doesn't have proper types for the new config style
const withPWA = require("next-pwa")({
  dest: "public",
  register: true,
  skipWaiting: true,
  // Disable PWA service worker in development to avoid Turbopack conflicts
  disable: process.env.NODE_ENV === "development",
  runtimeCaching: [
    {
      urlPattern: /^https?.*/,
      handler: "NetworkFirst",
      options: {
        cacheName: "med-tracker-cache",
        expiration: {
          maxEntries: 200,
          maxAgeSeconds: 24 * 60 * 60, // 24 hours
        },
      },
    },
  ],
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Empty turbopack config silences the webpack/Turbopack conflict warning
  // while still allowing next-pwa's webpack plugin to run in production builds
  turbopack: {},
};

module.exports = withPWA(nextConfig);
