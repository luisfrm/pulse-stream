import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Los paquetes compartidos se publican como TypeScript fuente (sin build):
  // Next los transpila junto con la app.
  transpilePackages: [
    "@pulse-stream/ui",
    "@pulse-stream/design",
    "@pulse-stream/api-client",
    "@pulse-stream/shared",
  ],
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      { protocol: "https", hostname: "pulsestreambucket.luisrivas.site" },
      { protocol: "https", hostname: "*.r2.dev" },
      { protocol: "https", hostname: "*.r2.cloudflarestorage.com" },
      { protocol: "https", hostname: "*.cloudflarestorage.com" },
    ],
  },
  // Mismo cache de cliente que la app (antes el panel vivía bajo su root
  // layout): navegación del panel sin flashes al volver a una página reciente.
  experimental: {
    staleTimes: {
      dynamic: 300,
      static: 600,
    },
  },
};

export default nextConfig;
