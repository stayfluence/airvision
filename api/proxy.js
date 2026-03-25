import axios from 'axios';

export default async function handler(req, res) {
  const { url } = req.query;
  if (!url) return res.status(400).send('Missing url');

  // Allow CORS
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    const response = await axios({
      method: 'GET',
      url: url,
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'
      },
      timeout: 10000
    });

    const buffer = Buffer.from(response.data);
    res.set('Content-Type', response.headers['content-type'] || 'image/jpeg');
    res.set('Content-Length', buffer.length);
    res.send(buffer);
  } catch (error) {
    res.status(500).send('Proxy error');
  }
}
