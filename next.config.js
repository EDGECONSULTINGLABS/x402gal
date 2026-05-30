/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    serverComponentsExternalPackages: ["xrpl", "@solana/web3.js"],
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // pino-pretty is an optional CLI dep of @walletconnect/logger — not needed in browser
      config.resolve.fallback = {
        ...config.resolve.fallback,
        "pino-pretty": false,
        "lokijs": false,
        "encoding": false,
      };
    }
    return config;
  },
};
