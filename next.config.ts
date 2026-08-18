import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite", "@neondatabase/serverless", "ws"],
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
