/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    serverComponentsExternalPackages: ["xrpl", "@solana/web3.js"],
  },
  webpack: (config, { isServer }) => {
    // pino-pretty / lokijs / encoding are optional deps of WalletConnect — not needed anywhere
    if (isServer) {
      config.externals = [...(config.externals ?? []), "pino-pretty", "lokijs", "encoding"];
    } else {
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
