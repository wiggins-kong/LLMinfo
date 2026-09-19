import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  serverExternalPackages: ["better-sqlite3", "@node-rs/argon2"],
  poweredByHeader: false,
  outputFileTracingIncludes: {
    "/api/logo/[id]": ["./node_modules/@node-rs/argon2/**"],
  },
};

export default config;
