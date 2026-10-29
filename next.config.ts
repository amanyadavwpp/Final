import type { NextConfig } from "next";

/**
 * Two deployment targets from one codebase:
 *
 *  1. Node server (default) — `npm run build` + `npm start`. PostgreSQL via
 *     Drizzle, API routes active, full server-side history.
 *
 *  2. GitHub Pages — `npm run build:static`. Emits plain HTML/CSS/JS into
 *     `out/`. The API routes are absent, so the browser falls back to the
 *     localStorage engine and the app still works fully (even offline).
 *
 * `basePath` matters on Pages: a project site is served from
 * `https://<user>.github.io/<repo>/`, so asset URLs must be prefixed. Set
 * NEXT_PUBLIC_BASE_PATH to `/repo-name` when building for a project page.
 */

const isStatic = process.env.NEXT_PUBLIC_STATIC_EXPORT === "1";
const rawBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const basePath = rawBasePath ? `/${rawBasePath.replace(/^\/+|\/+$/g, "")}` : "";

const nextConfig: NextConfig = {
  ...(basePath ? { basePath, assetPrefix: basePath } : {}),
  ...(isStatic
    ? {
        output: "export" as const,
        // No route can be dynamic without a server.
        trailingSlash: true,
        images: { unoptimized: true },
      }
    : {}),
};

export default nextConfig;
