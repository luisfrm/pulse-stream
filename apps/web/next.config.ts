import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  images: {
    // Disable Vercel / Next.js image optimization to serve assets directly from source (e.g. R2)
    unoptimized: true,
  },
  // Cache de cliente (router cache) para páginas dinámicas y estáticas.
  // Sin esto, cada navegación a una ruta dinámica roundtripea al servidor y
  // muestra su loading.tsx aunque la hubiéramos visitado hace segundos.
  // 30s para dinámicas encaja con el revalidate de 60s del catálogo; las
  // mutaciones ya invalidan a demanda con router.refresh().
  experimental: {
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
};

export default nextConfig;
