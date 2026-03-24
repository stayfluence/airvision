import express from 'express';
import cors from 'cors';
import axios from 'axios';

const app = express();
app.use(cors());

app.get('/api/scrape', async (req, res) => {
  const { url } = req.query;

  if (!url || !url.includes('airbnb')) {
    return res.status(400).json({ error: 'Please provide a valid Airbnb URL.' });
  }

  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      }
    });

    const html = response.data;
    let photosFound = [];

    // Deny-list: CDN path segments that belong to Airbnb UI / illustrations / profiles
    // These are confirmed non-property image paths found by inspection
    const uiPathSegments = [
      'AirbnbPlatformAssets',     // 3D characters, AI-Synthesis illustrations
      'airbnb-platform-assets',   // UserProfile 3D character
      'AI-Synthesis',             // Review-AI balloons, sofa, etc.
      'AirbnbPlatform',           // General platform assets
      'UserProfile',              // Host profile avatar
      '/pictures/user/',          // Host profile photos
      '/miso/',                   // Airbnb 3D mascots
      'user_identity_profile',    // User identity images
      'Hosting/a5',               // Known UI asset prefix
    ];

    const isUiImage = (url) => uiPathSegments.some(seg => url.includes(seg));

    // --- Strategy 1: Parse __NEXT_DATA__ JSON (structured listing data) ---
    const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);

    if (nextDataMatch) {
      try {
        const nextData = JSON.parse(nextDataMatch[1]);

        // Recursively collect ALL muscache picture URLs, only filtering out known UI paths
        const findImages = (obj, found = new Set()) => {
          if (!obj || typeof obj !== 'object') return found;
          if (Array.isArray(obj)) {
            obj.forEach(item => findImages(item, found));
          } else {
            for (const key of Object.keys(obj)) {
              const val = obj[key];
              if (typeof val === 'string' && val.includes('a0.muscache.com/im/pictures/')) {
                try {
                  const parsed = new URL(val);
                  const basePath = parsed.origin + parsed.pathname;
                  if (!isUiImage(basePath)) {
                    found.add(basePath);
                  }
                } catch (_) {}
              } else if (typeof val === 'object') {
                findImages(val, found);
              }
            }
          }
          return found;
        };

        const basePaths = findImages(nextData);

        if (basePaths.size > 0) {
          photosFound = Array.from(basePaths).map(basePath => ({
            url: basePath + '?im_w=1440',
            size: 0
          }));
          console.log(`Strategy 1 (NEXT_DATA): found ${photosFound.length} photos`);
        }
      } catch (jsonErr) {
        console.error('Failed to parse __NEXT_DATA__:', jsonErr.message);
      }
    }

    // --- Strategy 2: Fallback regex if __NEXT_DATA__ didn't work ---
    if (photosFound.length === 0) {
      console.log('Falling back to regex extraction...');
      const regex = /https:\/\/a0\.muscache\.com\/im\/pictures\/[^\\\"&\s]+/g;
      const matches = html.match(regex) || [];
      const jsonMatches = (html.match(/https:\\u002F\\u002Fa0\.muscache\.com\\u002Fim\\u002Fpictures\\u002F[^"]+/g) || [])
        .map(m => m.replace(/\\u002F/g, '/'));
      const allMatches = [...matches, ...jsonMatches];

      const uniqueMap = new Map();
      allMatches.forEach(imgUrl => {
        try {
          const parsed = new URL(imgUrl);
          const basePath = parsed.origin + parsed.pathname;
          if (isUiImage(basePath)) return;
          const im_w = parseInt(parsed.searchParams.get('im_w') || '0');
          if (!uniqueMap.has(basePath) || uniqueMap.get(basePath).im_w < im_w) {
            uniqueMap.set(basePath, { url: imgUrl, im_w: im_w || 1200 });
          }
        } catch (_) {}
      });

      const candidates = Array.from(uniqueMap.values()).sort((a, b) => b.im_w - a.im_w).map(v => v.url);
      await Promise.all(candidates.map(async (imgUrl) => {
        try {
          const headRes = await axios.head(imgUrl, { timeout: 3000 });
          const size = parseInt(headRes.headers['content-length'] || '0', 10);
          if (size > 75000) photosFound.push({ url: imgUrl, size });
        } catch (_) {
          photosFound.push({ url: imgUrl, size: 0 });
        }
      }));
      photosFound.sort((a, b) => b.size - a.size);
    }

    if (photosFound.length === 0) {
      return res.status(404).json({ error: 'No images found. The listing might be private or the page structure has changed.' });
    }

    res.json({ images: photosFound });
  } catch (error) {
    console.error("Scraping error:", error.message);
    res.status(500).json({ error: 'Failed to fetch the listing. Please make sure the URL is public and valid.' });
  }
});

app.get('/api/proxy', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).send('Missing url');
  try {
    const response = await axios({
      method: 'GET',
      url: url,
      responseType: 'stream',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'
      }
    });
    res.set('Content-Type', response.headers['content-type']);
    res.set('Content-Length', response.headers['content-length']);
    response.data.pipe(res);
  } catch (error) {
    res.status(500).send('Proxy error');
  }
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Server proxy running on http://localhost:${PORT}`);
});
