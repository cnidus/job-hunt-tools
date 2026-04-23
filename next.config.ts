import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Allow fetching from Clockwork's domain for intel ingestion
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [{ key: 'Cache-Control', value: 'no-store' }],
      },
    ]
  },
}

export default nextConfig
