const path = require('path');
const { safeName, safeGender, DEFAULT } = require('./tools/brandLoader.cjs');

// The name the app goes by ("Jarvis" unless NEXT_PUBLIC_BRAND_NAME says otherwise — a Cloudflare *build* variable). See tools/brandLoader.cjs.
const BRAND_NAME = safeName(process.env.NEXT_PUBLIC_BRAND_NAME);
const BRAND_GENDER = safeGender(process.env.NEXT_PUBLIC_BRAND_GENDER);        // 'female' → "ค่ะ / คะ" instead of "ครับ"

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack(config) {
    if (BRAND_NAME !== DEFAULT || BRAND_GENDER === 'female') {
      config.module.rules.push({
        test: /\.(js|jsx|mjs|cjs|ts|tsx)$/,
        include: [path.join(__dirname, 'app'), path.join(__dirname, 'lib')],
        enforce: 'pre',
        use: [{ loader: path.join(__dirname, 'tools/brandLoader.cjs'), options: { name: BRAND_NAME, gender: BRAND_GENDER } }],
      });
    }
    return config;
  },
};

module.exports = nextConfig;
