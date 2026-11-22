import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Commit que Vercel está compilando, para marcar los errores de Sentry con su
  // versión (lib/sentry-options.ts). Va en el código del navegador, no es secreto
  env: {
    NEXT_PUBLIC_SENTRY_RELEASE: process.env.VERCEL_GIT_COMMIT_SHA ?? "",
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.API_URL ?? "http://localhost:3000"}/:path*`,
      },
    ];
  },
};

export default nextConfig;