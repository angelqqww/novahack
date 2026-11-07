import type { NextConfig } from "next";

// One Line is served under /one-line on the shared Vercel domain (Pulse owns /).
// basePath prefixes pages and <Link>s; client fetch() calls use NEXT_PUBLIC_BASE_PATH.
const BASE_PATH = "/one-line";

const nextConfig: NextConfig = {
  basePath: BASE_PATH,
  env: { NEXT_PUBLIC_BASE_PATH: BASE_PATH },
  // Lets a phone on the same Wi-Fi load the dev server (teammates' dasher page).
  devIndicators: false,
  allowedDevOrigins: ["*.local", "192.168.*.*", "10.*.*.*"],
};

export default nextConfig;
