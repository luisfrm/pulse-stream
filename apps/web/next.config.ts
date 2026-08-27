import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  images: {
    // Covers vienen de R2 (presigned o público) — permitir optimización con
    // formatos modernos. Si se mantiene <img> con sizes/eager, el browser ya
    // elige mejor; si se migra a next/image, esto habilita AVIF/WebP + srcset.
    // Mantener unoptimized:false para que remotePatterns/formats tengan efecto.
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      { protocol: "https", hostname: "pulsestreambucket.luisrivas.site" },
      { protocol: "https", hostname: "*.r2.dev" },
      { protocol: "https", hostname: "*.r2.cloudflarestorage.com" },
      { protocol: "https", hostname: "*.cloudflarestorage.com" },
    ],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
  // Cache de cliente (router cache) para páginas dinámicas y estáticas.
  // Sin esto, cada navegación a una ruta dinámica roundtripea al servidor y
  // muestra su loading.tsx aunque la hubiéramos visitado hace segundos.
  // 300s/600s cubre una sesión típica (dashboard→songs→artist→album→back
  // sin flashes); la frescura la garantizan updateTag + router.refresh().
  experimental: {
    staleTimes: {
      dynamic: 300,
      static: 600,
    },
  },
};

export default nextConfig;
