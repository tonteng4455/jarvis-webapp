const path = require('path');
const { safeName, safeGender, DEFAULT } = require('./tools/brandLoader.cjs');

// The name the app goes by ("Jarvis" unless NEXT_PUBLIC_BRAND_NAME says otherwise — a Cloudflare *build* variable). See tools/brandLoader.cjs.
const BRAND_NAME = safeName(process.env.NEXT_PUBLIC_BRAND_NAME);
const BRAND_GENDER = safeGender(process.env.NEXT_PUBLIC_BRAND_GENDER);        // 'female' → "ค่ะ / คะ" instead of "ครับ"

/** @type {import('next').NextConfig} */
// The OA's "Add friend" link (guide button + QR at public/line-qr.svg). Jarvis's is the default; other instances take theirs from brands/<name>/brand.json (deploy-instance.mjs).
const LINE_OA_URL = process.env.NEXT_PUBLIC_LINE_OA_URL || (BRAND_NAME === DEFAULT ? 'https://line.me/R/ti/p/@718jkftt' : '');

const nextConfig = {
  reactStrictMode: true,
  env: { NEXT_PUBLIC_LINE_OA_URL: LINE_OA_URL },
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
