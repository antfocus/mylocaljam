export const dynamic = 'force-dynamic';

import { POST } from '@/app/api/sync-events/route';

export async function GET() {
  return POST(new Request('http://localhost/api/sync-events'));
}