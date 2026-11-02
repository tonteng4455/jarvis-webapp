const path = require('path');
const { safeName, DEFAULT } = require('./tools/brandLoader.cjs');

// The name the app goes by ("Jarvis" unless NEXT_PUBLIC_BRAND_NAME says otherwise — a Cloudflare *build* variable). See tools/brandLoader.cjs.
const BRAND_NAME = safeName(process.env.NEXT_PUBLIC_BRAND_NAME);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack(config) {
    if (BRAND_NAME !== DEFAULT) {
      config.module.rules.push({
        test: /\.(js|jsx|mjs|cjs|ts|tsx)$/,
        include: [path.join(__dirname, 'app'), path.join(__dirname, 'lib')],
        enforce: 'pre',
        use: [{ loader: path.join(__dirname, 'tools/brandLoader.cjs'), options: { name: BRAND_NAME } }],
      });
    }
    return config;
  },
};

module.exports = nextConfig;
