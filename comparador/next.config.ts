import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "supermercado.eroski.es",
        pathname: "/images/**",
      },
      {
        protocol: "https",
        hostname: "cdn-bm.aktiosdigitalservices.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "prod-mercadona.imgix.net",
        pathname: "/images/**",
      },
      {
        protocol: "https",
        hostname: "s7g10.scene7.com",
        pathname: "/is/image/aldinord/**",
      },
    ],
  },
};

export default nextConfig;
