import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdfjs-dist", "@napi-rs/canvas"],
  outputFileTracingIncludes: {
    "/api/cron/rastreo/*": [
      "./node_modules/pdfjs-dist/**/*",
      "./node_modules/@napi-rs/canvas/**/*",
      "./node_modules/@napi-rs/canvas-linux-x64-gnu/**/*",
    ],
    "/api/rastreo/coviran": [
      "./node_modules/pdfjs-dist/**/*",
      "./node_modules/@napi-rs/canvas/**/*",
      "./node_modules/@napi-rs/canvas-linux-x64-gnu/**/*",
    ],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "supermercado.eroski.es",
        pathname: "/images/**",
      },
      {
        protocol: "https",
        hostname: "supermercado.eroski.es",
        pathname: "/imagesMarket/**",
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
      {
        protocol: "https",
        hostname: "www.lupaonline.com",
        pathname: "/media/catalog/product/**",
      },
      {
        protocol: "https",
        hostname: "static.carrefour.es",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "d2lnr5mha7bycj.cloudfront.net",
        pathname: "/product-image/**",
      },
      {
        protocol: "https",
        hostname: "media.primaprix.eu",
        pathname: "/primaprix-media/**",
      },
    ],
  },
};

export default nextConfig;
