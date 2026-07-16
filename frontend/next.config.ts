import path from 'node:path';
import type { NextConfig } from 'next';

const externalApiUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
const localApiTarget = process.env.LOCAL_API_TARGET?.trim() || 'http://127.0.0.1:4000';
const useLocalApiRewrite = !externalApiUrl || externalApiUrl === '/api';

const nextConfig: NextConfig = {
  typedRoutes: false,
  outputFileTracingRoot: path.join(__dirname, '..'),
  async rewrites() {
    if (!useLocalApiRewrite) return [];
    return [
      {
        source: '/api/:path*',
        destination: `${localApiTarget}/:path*`,
      },
    ];
  },
};

export default nextConfig;
