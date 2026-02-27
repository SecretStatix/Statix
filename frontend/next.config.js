/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    config.resolve.fallback = { fs: false, net: false, tls: false };
    config.externals.push('pino-pretty', 'lokijs', 'encoding');
    return config;
  },
  async rewrites() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://claude-foundation-production.up.railway.app';
    return [
      {
        source: '/api/players/:path*',
        destination: `${apiUrl}/api/players/:path*`,
      },
      {
        source: '/api/trading/:path*',
        destination: `${apiUrl}/api/trading/:path*`,
      },
      {
        source: '/api/dividends/:path*',
        destination: `${apiUrl}/api/dividends/:path*`,
      },
    ];
  },
}

module.exports = nextConfig
