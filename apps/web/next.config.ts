import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  images: {
    // Disable Vercel / Next.js image optimization to serve assets directly from source (e.g. R2)
    unoptimized: true,
  },
};

export default nextConfig;
