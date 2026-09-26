import type { NextConfig } from "next";
import pkg from "./package.json";

/**
 * Next evaluates this config once per compilation — server and client, a few
 * seconds apart — so calling `new Date()` inline produced two timestamps. The
 * footer prints them to the minute, so a build that straddled a minute
 * boundary hydrated the client's string against the server's and failed.
 * Pinned on the first evaluation and reused by the second.
 */
const BUILD_TIME = (process.env.NEXT_PUBLIC_BUILD_TIME ??= new Date().toISOString());

const nextConfig: NextConfig = {
  reactStrictMode: true,
  env: {
    // Baked at build time, so the server and client render the same string.
    NEXT_PUBLIC_APP_VERSION: pkg.version,
    NEXT_PUBLIC_BUILD_TIME: BUILD_TIME,
  },
};

export default nextConfig;
