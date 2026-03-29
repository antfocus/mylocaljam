import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

function checkAuth(request) {
  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${process.env.ADMIN_PASSWORD}`;
}

/**
 * POST /api/admin/upload-image
 * Accepts a base64 data URI or an external URL, uploads it to Supabase
 * storage (artists bucket), and returns the permanent public URL.
 *
 * Body: { image: "data:image/jpeg;base64,..." | "https://...", folder?: "artists" }
 * Returns: { url: "https://...supabase.co/storage/v1/object/public/artists/..." }
 */
export async function POST(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { image, folder = 'artists' } = await request.json();
    if (!image) {
      return NextResponse.json({ error: 'Missing image field' }, { status: 400 });
    }

    const supabase = getAdminClient();
    const bucket = folder === 'posters' ? 'posters' : 'artists';

    let fileBuffer;
    let contentType = 'image/jpeg';
    let ext = 'jpg';

    if (image.startsWith('data:')) {
      // ── Base64 data URI ───────────────────────────────────────────────────────────
      const match = image.match(/^data:(image\/\w+);base64,(.+)$/);
      if (!match) {
        return NextResponse.json({ error: 'Invalid base64 data URI' }, { status: 400 });
      }
      contentType = match[1];
      ext = contentType.split('/')[1] === 'png' ? 'png'
          : contentType.split('/')[1] === 'webp' ? 'webp'
          : contentType.split('/')[1] === 'gif' ? 'gif'
          : 'jpg';
      fileBuffer = Buffer.from(match[2], 'base64');
    } else if (/^https?:\/\//i.test(image)) {
      // ── External URL — download and re-host ────────────────────────────────────────
      const res = await fetch(image, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) {
        return NextResponse.json({ error: `Failed to fetch image: HTTP ${res.status}` }, { status: 400 });
      }
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('png')) { ext = 'png'; contentType = 'image/png'; }
      else if (ct.includes('webp')) { ext = 'webp'; contentType = 'image/webp'; }
      else if (ct.includes('gif')) { ext = 'gif'; contentType = 'image/gif'; }
      else { ext = 'jpg'; contentType = 'image/jpeg'; }
      const arrayBuf = await res.arrayBuffer();
      fileBuffer = Buffer.from(arrayBuf);
    } else {
      return NextResponse.json({ error: 'image must be a base64 data URI or https:// URL' }, { status: 400 });
    }

    // Limit: 10 MB
    if (fileBuffer.length > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'Image too large (max 10 MB)' }, { status: 413 });
    }

    // Upload to Supabase storage
    const fileName = `${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from(bucket)
      .upload(fileName, fileBuffer, { contentType, upsert: false });

    if (upErr) {
      console.error('[upload-image] Storage upload failed:', upErr.message);
      return NextResponse.json({ error: `Storage upload failed: ${upErr.message}` }, { status: 500 });
    }

    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(fileName);

    return NextResponse.json({ url: urlData.publicUrl });
  } catch (err) {
    console.error('[upload-image] Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
