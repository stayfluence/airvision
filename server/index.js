import express from 'express';
import cors from 'cors';
import axios from 'axios';

const app = express();
app.use(cors());

// Recursively search the JSON tree for a value by key name
const findByKey = (obj, targetKey, maxDepth = 15, depth = 0) => {
  if (depth > maxDepth || !obj || typeof obj !== 'object') return undefined;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const r = findByKey(item, targetKey, maxDepth, depth + 1);
      if (r !== undefined) return r;
    }
  } else {
    for (const key of Object.keys(obj)) {
      if (key === targetKey) return obj[key];
      const r = findByKey(obj[key], targetKey, maxDepth, depth + 1);
      if (r !== undefined) return r;
    }
  }
  return undefined;
};

const findAllByKey = (obj, targetKey, results = [], maxDepth = 15, depth = 0) => {
  if (depth > maxDepth || !obj || typeof obj !== 'object') return results;
  if (Array.isArray(obj)) {
    for (const item of obj) findAllByKey(item, targetKey, results, maxDepth, depth + 1);
  } else {
    for (const key of Object.keys(obj)) {
      if (key === targetKey && obj[key]) results.push(obj[key]);
      else findAllByKey(obj[key], targetKey, results, maxDepth, depth + 1);
    }
  }
  return results;
};

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
    let metadata = {};

    const uiPathSegments = [
      'AirbnbPlatformAssets', 'airbnb-platform-assets', 'AI-Synthesis',
      'AirbnbPlatform', 'UserProfile', '/pictures/user/', '/miso/',
      'user_identity_profile', 'Hosting/a5',
    ];
    const isUiImage = (url) => uiPathSegments.some(seg => url.includes(seg));

    const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);

    if (nextDataMatch) {
      try {
        const nextData = JSON.parse(nextDataMatch[1]);

        // Photos
        const findImages = (obj, found = new Set()) => {
          if (!obj || typeof obj !== 'object') return found;
          if (Array.isArray(obj)) { obj.forEach(item => findImages(item, found)); }
          else {
            for (const key of Object.keys(obj)) {
              const val = obj[key];
              if (typeof val === 'string' && val.includes('a0.muscache.com/im/pictures/')) {
                try {
                  const parsed = new URL(val);
                  const basePath = parsed.origin + parsed.pathname;
                  if (!isUiImage(basePath)) found.add(basePath);
                } catch (_) {}
              } else if (typeof val === 'object') { findImages(val, found); }
            }
          }
          return found;
        };
        const basePaths = findImages(nextData);
        if (basePaths.size > 0) {
          photosFound = Array.from(basePaths).map(basePath => ({ url: basePath + '?im_w=1440', size: 0 }));
        }

        // Metadata extraction
        const name = findByKey(nextData, 'name');
        if (typeof name === 'string') metadata.title = name;

        const descItems = findAllByKey(nextData, 'htmlDescription').filter(d => typeof d === 'object' && d?.htmlText);
        if (descItems.length > 0) metadata.description = descItems[0].htmlText.replace(/<[^>]+>/g, '').trim();
        if (!metadata.description) {
          const desc = findByKey(nextData, 'description');
          if (typeof desc === 'string' && desc.length > 20) metadata.description = desc;
        }

        const city = findByKey(nextData, 'city');
        const country = findByKey(nextData, 'country');
        const state = findByKey(nextData, 'state');
        const neighborhood = findByKey(nextData, 'neighborhood');
        const publicAddress = findByKey(nextData, 'publicAddress');
        metadata.location = [neighborhood, city, state, country].filter(Boolean).join(', ') || publicAddress || null;

        const lat = findByKey(nextData, 'lat');
        const lng = findByKey(nextData, 'lng');
        if (lat && lng) metadata.coordinates = { lat, lng };

        const personCapacity = findByKey(nextData, 'personCapacity') || findByKey(nextData, 'maxGuestCapacity');
        const bedrooms = findByKey(nextData, 'bedrooms');
        const beds = findByKey(nextData, 'beds');
        const bathrooms = findByKey(nextData, 'bathrooms');
        if (personCapacity) metadata.guests = personCapacity;
        if (bedrooms !== undefined) metadata.bedrooms = bedrooms;
        if (beds !== undefined) metadata.beds = beds;
        if (bathrooms !== undefined) metadata.bathrooms = bathrooms;

        const propertyType = findByKey(nextData, 'propertyType') || findByKey(nextData, 'propertyTypeName');
        const roomType = findByKey(nextData, 'roomTypeCategory') || findByKey(nextData, 'roomType');
        if (propertyType && typeof propertyType === 'string') metadata.propertyType = propertyType;
        if (roomType && typeof roomType === 'string') metadata.roomType = roomType;

        const priceItems = findAllByKey(nextData, 'price').filter(p => typeof p === 'object' && p?.amount);
        if (priceItems.length > 0) {
          metadata.price = { amount: priceItems[0].amount, currency: priceItems[0].currency || '€' };
        }
        if (!metadata.price) {
          const rate = findByKey(nextData, 'rate');
          if (rate?.amount) metadata.price = { amount: rate.amount, currency: rate.currency || '€' };
        }

        const avgRating = findByKey(nextData, 'avgRating') || findByKey(nextData, 'guestSatisfactionOverall');
        const reviewsCount = findByKey(nextData, 'reviewsCount');
        if (avgRating) metadata.rating = { avg: avgRating, count: reviewsCount };

        const ratingBreakdown = {};
        ['accuracy', 'checkin', 'cleanliness', 'communication', 'location', 'value'].forEach(cat => {
          const val = findByKey(nextData, cat + 'Rating');
          if (typeof val === 'number' && val <= 10) ratingBreakdown[cat] = val;
        });
        if (Object.keys(ratingBreakdown).length > 0) metadata.ratingBreakdown = ratingBreakdown;

        const hostName = findByKey(nextData, 'hostName');
        const isSuperhost = findByKey(nextData, 'isSuperhost');
        const hostMemberSince = findByKey(nextData, 'memberSince');
        const hostReviews = findByKey(nextData, 'hostReviewsCount');
        if (hostName) metadata.host = { name: hostName, isSuperhost: isSuperhost || false, memberSince: hostMemberSince, reviewsCount: hostReviews };

        const amenitiesList = findAllByKey(nextData, 'amenities').find(a => Array.isArray(a) && a.length > 0);
        if (amenitiesList) {
          const amenities = amenitiesList
            .flatMap(group => group.amenities || [group])
            .filter(a => a.available !== false)
            .map(a => a.name || a.title || a)
            .filter(a => typeof a === 'string');
          if (amenities.length > 0) metadata.amenities = amenities;
        }

        const checkInTime = findByKey(nextData, 'checkInTime') || findByKey(nextData, 'checkIn');
        const checkOutTime = findByKey(nextData, 'checkOutTime') || findByKey(nextData, 'checkOut');
        const cancellationPolicy = findByKey(nextData, 'cancellationPolicyName');
        if (checkInTime || checkOutTime || cancellationPolicy) {
          metadata.houseRules = { checkIn: checkInTime, checkOut: checkOutTime, cancellation: cancellationPolicy };
        }

        const reviews = findAllByKey(nextData, 'reviews').find(r => Array.isArray(r) && r.length > 0);
        if (reviews) {
          metadata.recentReviews = reviews.slice(0, 5).map(r => ({
            author: r.reviewer?.firstName || r.author,
            date: r.localizedDate || r.createdAt,
            text: r.comments,
          })).filter(r => r.text);
        }

        const listingId = url.match(/\/rooms\/(\d+)/)?.[1];
        if (listingId) metadata.listingId = listingId;

      } catch (jsonErr) {
        console.error('Failed to parse __NEXT_DATA__:', jsonErr.message);
      }
    }

    if (photosFound.length === 0) {
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
          if (!uniqueMap.has(basePath) || uniqueMap.get(basePath).im_w < im_w) uniqueMap.set(basePath, { url: imgUrl, im_w: im_w || 1200 });
        } catch (_) {}
      });
      const candidates = Array.from(uniqueMap.values()).sort((a, b) => b.im_w - a.im_w).map(v => v.url);
      await Promise.all(candidates.map(async (imgUrl) => {
        try {
          const headRes = await axios.head(imgUrl, { timeout: 3000 });
          const size = parseInt(headRes.headers['content-length'] || '0', 10);
          if (size > 75000) photosFound.push({ url: imgUrl, size });
        } catch (_) { photosFound.push({ url: imgUrl, size: 0 }); }
      }));
      photosFound.sort((a, b) => b.size - a.size);
    }

    if (photosFound.length === 0 && Object.keys(metadata).length === 0) {
      return res.status(404).json({ error: 'No data found. The listing might be private or the page structure has changed.' });
    }

    res.json({ images: photosFound, metadata });
  } catch (error) {
    console.error("Scraping error:", error.message);
    res.status(500).json({ error: 'Failed to fetch the listing.' });
  }
});

app.get('/api/proxy', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).send('Missing url');
  try {
    const response = await axios({ method: 'GET', url, responseType: 'stream', headers: { 'User-Agent': 'Mozilla/5.0' } });
    res.set('Content-Type', response.headers['content-type']);
    res.set('Content-Length', response.headers['content-length']);
    response.data.pipe(res);
  } catch (error) { res.status(500).send('Proxy error'); }
});

const PORT = 3001;
app.listen(PORT, () => console.log(`Server proxy running on http://localhost:${PORT}`));
