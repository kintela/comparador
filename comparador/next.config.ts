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
      {
        protocol: "https",
        hostname: "www.dia.es",
        pathname: "/product_images/**",
      },
      {
        protocol: "https",
        hostname: "www.lidl.es",
        pathname: "/assets/**",
      },
      {
        protocol: "https",
        hostname: "www.compraonline.alcampo.es",
        pathname: "/images-v3/**",
      },
    ],
  },
};

export default nextConfig;
