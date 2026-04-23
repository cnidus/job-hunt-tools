/** @type {import('next').NextConfig} */
const nextConfig = {
  // Prevent caching on API routes so intel fetches always return fresh data
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
