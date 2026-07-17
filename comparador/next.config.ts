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
    ],
  },
};

export default nextConfig;
