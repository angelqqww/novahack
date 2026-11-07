import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets a phone on the same Wi-Fi load the dev server (teammates' dasher page).
  devIndicators: false,
  allowedDevOrigins: ["*.local", "192.168.*.*", "10.*.*.*"],
};

export default nextConfig;
