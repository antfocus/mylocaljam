import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // May take a while for many artists

function checkAuth(request) {
  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${process.env.ADMIN_PASSWORD}`;
}

/**
 * POST /api/admin/migrate-base64
 * Sweeps the artists table for any image_url values that are base64 data URIs,
 * uploads each to Supabase storage (artists bucket), and overwrites the row
 * with the permanent public URL.
 *
 * Returns: { migrated: number, errors: string[] }
 */
export async function POST(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdminClient();
  const bucket = 'artists';

  // Find all artists with base64 image_url
  const { data: artists, error: fetchErr } = await supabase
    .from('artists')
    .select('id, name, image_url')
    .like('image_url', 'data:%');

  if (fetchErr) {
    return NextResponse.json({ error: `Query failed: ${fetchErr.message}` }, { status: 500 });
  }

  if (!artists || artists.length === 0) {
    return NextResponse.json({ migrated: 0, errors: [], message: 'No base64 images found \u2014 all clean!' });
  }

  let migrated = 0;
  const errors = [];

  for (const artist of artists) {
    try {
      const match = artist.image_url.match(/^data:(image\/\w+);base64,(.+)$/);
      if (!match) {
        errors.push(`${artist.name}: invalid data URI format`);
        continue;
      }

      const contentType = match[1];
      const ext = contentType.includes('png') ? 'png'
                : contentType.includes('webp') ? 'webp'
                : contentType.includes('gif') ? 'gif'
                : 'jpg';

      const fileBuffer = Buffer.from(match[2], 'base64');

      // Skip unreasonably large images
      if (fileBuffer.length > 10 * 1024 * 1024) {
        errors.push(`${artist.name}: image too large (${(fileBuffer.length / 1024 / 1024).toFixed(1)} MB)`);
        continue;
      }

      const fileName = `${artist.id}.${ext}`;

      // Upload (upsert in case we re-run)
      const { error: upErr } = await supabase.storage
        .from(bucket)
        .upload(fileName, fileBuffer, { contentType, upsert: true });

      if (upErr) {
        errors.push(`${artist.name}: upload failed \u2014 ${upErr.message}`);
        continue;
      }

      const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(fileName);

      // Update artist row with permanent URL
      const { error: updateErr } = await supabase
        .from('artists')
        .update({ image_url: urlData.publicUrl })
        .eq('id', artist.id);

      if (updateErr) {
        // Full error to Vercel runtime logs; generic detail in prod response
        // (security audit M8). Dev mode keeps the message for fast debugging.
        console.error(`[migrate-base64] ${artist.name} DB update failed:`, updateErr);
        errors.push(
          process.env.NODE_ENV === 'production'
            ? `${artist.name}: DB update failed`
            : `${artist.name}: DB update failed \u2014 ${updateErr.message}`
        );
        continue;
      }

      migrated++;
      console.log(`[migrate-base64] \u2713 ${artist.name} \u2192 ${urlData.publicUrl}`);
    } catch (err) {
      console.error(`[migrate-base64] ${artist.name} failed:`, err);
      errors.push(
        process.env.NODE_ENV === 'production'
          ? `${artist.name}: failed`
          : `${artist.name}: ${err.message}`
      );
    }
  }

  return NextResponse.json({
    migrated,
    total_found: artists.length,
    errors,
    message: `Migrated ${migrated}/${artists.length} artist images from base64 to Supabase storage.`,
  });
}
