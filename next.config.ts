import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Server-only heavy packages: loaded from node_modules at runtime, never bundled.
  serverExternalPackages: [
    "@remotion/bundler",
    "@remotion/renderer",
    "@remotion/cli",
    "@remotion/studio",
    "@remotion/studio-server",
    "@remotion/compositor-linux-x64-gnu",
    "@remotion/compositor-linux-x64-musl",
    "@remotion/compositor-linux-arm64-gnu",
    "@remotion/compositor-linux-arm64-musl",
    "@remotion/compositor-darwin-arm64",
    "@remotion/compositor-darwin-x64",
    "@remotion/compositor-win32-x64-msvc",
    "esbuild",
    "typescript",
    "@anthropic-ai/sdk",
    "@elevenlabs/elevenlabs-js",
    "@fal-ai/client",
    "openai",
  ],
  turbopack: { root: path.resolve(".") },
  outputFileTracingRoot: path.resolve("."),
  // project data and caches are local user data, never part of the server bundle
  outputFileTracingExcludes: { "*": ["projects/**", ".cache/**", "music/**", ".git/**", "tests/**"] },
  // Uploaded media goes through route handlers; allow generous request bodies.
  experimental: { serverActions: { bodySizeLimit: "512mb" } },
  poweredByHeader: false,
};

export default nextConfig;
