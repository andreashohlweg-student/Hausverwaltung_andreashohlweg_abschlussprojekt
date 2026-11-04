import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  devIndicators: false,
  serverExternalPackages: ["pdfkit"],
  outputFileTracingIncludes: { "/api/damages/*": ["./src/assets/fonts/*.ttf"] },
};

export default nextConfig;
