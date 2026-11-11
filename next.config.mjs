/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Allow dev tunnel hostnames for HMR and API requests
  experimental: {
    serverActions: {
      allowedOrigins: [
        "127.0.0.1:3000",
        "localhost:3000",
        "*.devtunnels.ms",
        "*.asse.devtunnels.ms",
        "*.ngrok-free.app",
        "*.ngrok.io",
      ],
    },
  },
  // Ensure headers for static chunks
  async headers() {
    return [
      {
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Access-Control-Allow-Origin",
            value: "*",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
