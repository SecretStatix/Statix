const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@react-native-async-storage/async-storage': path.join(
        __dirname,
        'lib/async-storage-stub.js'
      ),
    };
    config.resolve.fallback = { fs: false, net: false, tls: false };
    config.externals.push('pino-pretty', 'lokijs', 'encoding');
    return config;
  },
  async rewrites() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
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
