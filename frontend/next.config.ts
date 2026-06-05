import type { NextConfig } from "next";

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

const apiProxyBase = trimTrailingSlash(
  process.env.SERVER_API_BASE_URL ?? "http://localhost:8000/api/v1"
);

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    return [
      {
        source: "/api/v1",
        destination: apiProxyBase,
      },
      {
        source: "/api/v1/:path*",
        destination: `${apiProxyBase}/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          {
            key: "Content-Type",
            value: "application/javascript; charset=utf-8",
          },
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          {
            key: "Content-Security-Policy",
            value: "default-src 'self'; script-src 'self'",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
