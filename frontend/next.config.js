const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'cdn.nba.com' },
      { protocol: 'https', hostname: 'a.espncdn.com' },
    ],
  },
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
    const raw = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    let apiUrl = raw.trim().replace(/\/+$/, '');
    // Next.js requires rewrite destinations to start with `/`, `http://`, or
    // `https://`. If the env var was set without a protocol (e.g. a bare
    // Railway hostname), prepend https:// so we don't crash on boot.
    if (!/^https?:\/\//i.test(apiUrl) && !apiUrl.startsWith('/')) {
      apiUrl = `https://${apiUrl}`;
    }
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
