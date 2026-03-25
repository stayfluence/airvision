export const config = { runtime: 'edge' };

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get('url');

  if (!url) return new Response('Missing url', { status: 400 });

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Referer': 'https://www.airbnb.com/',
      },
    });

    if (!response.ok) {
      return new Response(`Upstream error: ${response.status}`, { status: 502 });
    }

    const headers = new Headers();
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Content-Type', response.headers.get('content-type') || 'image/jpeg');

    return new Response(response.body, { status: 200, headers });
  } catch (error) {
    return new Response('Proxy error', { status: 500 });
  }
}
