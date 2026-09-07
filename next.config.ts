import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `sharp` and the Prisma engines are native/binary and must not be bundled
  // into the server chunks.
  serverExternalPackages: ["sharp", "@prisma/client", "prisma"],

  experimental: {
    serverActions: {
      // Photo and 3D-garment uploads travel through Server Actions.
      bodySizeLimit: "25mb",
    },
  },

  typedRoutes: true,
};

export default nextConfig;
