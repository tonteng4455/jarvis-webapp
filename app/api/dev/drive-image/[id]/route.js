// app/api/dev/drive-image/[id]/route.js — MOCK_MODE only: serves photos
// "uploaded to Drive" by dev/mockBot.js. 404s everywhere else.
import { getMockDriveFile } from '../../../../../dev/mockBot';

export async function GET(_req, { params }) {
  const { id } = await params;
  if (process.env.MOCK_MODE !== '1' || process.env.NODE_ENV === 'production') return new Response('Not found', { status: 404 });
  const f = getMockDriveFile(id);
  if (!f) return new Response('Not found', { status: 404 });
  return new Response(Buffer.from(f.base64, 'base64'), { headers: { 'Content-Type': f.mimeType } });
}
