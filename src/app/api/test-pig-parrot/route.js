// Temporary test endpoint — safe to delete after testing
// Visit: https://mylocaljam.com/api/test-pig-parrot
import { scrapePigAndParrot } from '@/lib/scrapers/pigAndParrot';

export async function GET() {
  const { events, error } = await scrapePigAndParrot();
  return Response.json({ 
    count: events.length, 
    error, 
    events 
  });
}