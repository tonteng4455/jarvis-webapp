// lib/r2.js
//
// Generates presigned PUT URLs for Cloudflare R2 using its S3-compatible
// API. We use `aws4fetch` instead of the full `@aws-sdk/client-s3` on
// purpose — the full SDK is heavy and assumes a Node runtime; aws4fetch
// is a ~5KB dependency-free signer that works fine on Cloudflare Pages'
// edge runtime.
//
// This is a SEPARATE credential set from the Cloudflare Worker's R2
// binding (env.IMAGES_BUCKET) used by the LINE bot — bindings only work
// inside a Worker, not from an external Next.js app, so the web app
// needs real R2 S3 API credentials (Access Key ID / Secret) instead.
// Generate them in Cloudflare Dashboard → R2 → Manage API Tokens →
// "Object Read & Write" scoped to the jarvis-line-bot-files bucket.

import { AwsClient } from 'aws4fetch';

function r2Client() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error('R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY not configured');
  }
  return {
    client: new AwsClient({ accessKeyId, secretAccessKey, service: 's3', region: 'auto' }),
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  };
}

// Returns a presigned PUT URL the browser can upload directly to (no
// file bytes ever pass through the Next.js server — same principle as
// the Worker's direct-to-R2 approach, just via S3 signing instead of
// a binding).
export async function presignPutUrl({ bucket, key, contentType, expiresInSeconds = 300 }) {
  const { client, endpoint } = r2Client();
  const url = new URL(`${endpoint}/${bucket}/${key}`);
  url.searchParams.set('X-Amz-Expires', String(expiresInSeconds));
  const signed = await client.sign(
    new Request(url, { method: 'PUT', headers: contentType ? { 'Content-Type': contentType } : {} }),
    { aws: { signQuery: true } }
  );
  return signed.url;
}

// Presigned GET URL — this is what powers the "เปิด" link on the
// Premium dashboard's file list. Short-lived (default 10 min) and
// generated fresh on every page load, unlike the old approach of
// relying on a permanently-public bucket URL (which turned out not to
// resolve reliably and has been removed). Deliberately NOT exposed to
// Free users — see app/api/files/route.js, which only calls this when
// the requester is Premium.
export async function presignGetUrl({ bucket, key, expiresInSeconds = 600 }) {
  const { client, endpoint } = r2Client();
  const url = new URL(`${endpoint}/${bucket}/${key}`);
  url.searchParams.set('X-Amz-Expires', String(expiresInSeconds));
  const signed = await client.sign(
    new Request(url, { method: 'GET' }),
    { aws: { signQuery: true } }
  );
  return signed.url;
}

export function r2Bucket() {
  return process.env.R2_BUCKET_NAME || 'jarvis-line-bot-files';
}
