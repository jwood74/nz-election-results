import { createService } from './feed.mjs';
export const service = createService();

export async function respond(request, load) {
  if (request.method !== 'GET') return Response.json({ error: 'Method not allowed' }, { status: 405, headers: { Allow: 'GET' } });
  try {
    const data = await load();
    return Response.json(data, { headers: {
      'Cache-Control': 'public, max-age=0, must-revalidate',
      'Netlify-CDN-Cache-Control': data.warnings?.length ? 'no-store' : 'public, s-maxage=55, stale-while-revalidate=60, stale-if-error=300',
    } });
  } catch (error) {
    console.error('Election feed request failed:', error.message);
    return Response.json({ error: 'Election source unavailable. Please retry shortly.' }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
}
