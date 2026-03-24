import express from 'express';
import cors from 'cors';
import axios from 'axios';

const app = express();
app.use(cors());

// Recursively search the JSON tree for a value by key name
const findByKey = (obj, targetKey, maxDepth = 20, depth = 0) => {
  if (depth > maxDepth || !obj || typeof obj !== 'object' || obj === null) return undefined;
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

// Find ALL values for a key in the tree
const findAllByKey = (obj, targetKey, results = [], maxDepth = 20, depth = 0) => {
  if (depth > maxDepth || !obj || typeof obj !== 'object' || obj === null) return results;
  if (Array.isArray(obj)) {
    for (const item of obj) findAllByKey(item, targetKey, results, maxDepth, depth + 1);
  } else {
    for (const key of Object.keys(obj)) {
      if (key === targetKey && obj[key] !== null) results.push(obj[key]);
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
        'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
      }
    });

    const html = response.data;
    let photosFound = [];
    let metadata = {};
    let allJsonObjects = [];

    // Extract all JSON blobs from scripts
    const jsonScripts = [...html.matchAll(/<script[^>]*type="application\/(?:ld\+)?json"[^>]*>([\s\S]*?)<\/script>/g)];
    jsonScripts.forEach(m => {
      try { allJsonObjects.push(JSON.parse(m[1].trim())); } catch (e) {}
    });

    const niobeMatch = html.match(/niobeClientData\":([\s\S]*?\]\])/);
    if (niobeMatch) {
      try { allJsonObjects.push(JSON.parse(niobeMatch[1])); } catch (e) {}
    }

    const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (nextDataMatch) {
      try { allJsonObjects.push(JSON.parse(nextDataMatch[1])); } catch (e) {}
    }

    const uiPathSegments = [
      'AirbnbPlatformAssets', 'airbnb-platform-assets', 'AI-Synthesis',
      'AirbnbPlatform', 'UserProfile', '/pictures/user/', '/miso/',
      'user_identity_profile', 'Hosting/a5',
    ];
    const isUiImage = (u) => uiPathSegments.some(seg => u.includes(seg));

    const imagesSet = new Set();
    const findImages = (obj) => {
      if (!obj || typeof obj !== 'object') return;
      if (Array.isArray(obj)) { obj.forEach(item => findImages(item)); }
      else {
        for (const key of Object.keys(obj)) {
          const val = obj[key];
          if (typeof val === 'string' && val.includes('a0.muscache.com/im/pictures/')) {
            try {
              const parsed = new URL(val);
              const basePath = parsed.origin + parsed.pathname;
              if (!isUiImage(basePath)) imagesSet.add(basePath);
            } catch (_) {}
          } else if (typeof val === 'object') { findImages(val); }
        }
      }
    };

    allJsonObjects.forEach(obj => findImages(obj));

    if (imagesSet.size > 0) {
      photosFound = Array.from(imagesSet).map(basePath => ({ url: basePath + '?im_w=1440', size: 0 }));
    }

    // Proxy helper for metadata from pooled sources
    const findInPool = (key) => {
        for (const obj of allJsonObjects) {
            const val = findByKey(obj, key);
            if (val !== undefined && val !== null) return val;
        }
        return undefined;
    };

    const findAllInPool = (key) => {
        let results = [];
        for (const obj of allJsonObjects) { findAllByKey(obj, key, results); }
        return results;
    };

    metadata.title = findInPool('name') || findInPool('listingName') || findInPool('title');

    const descriptions = findAllInPool('htmlDescription').filter(d => typeof d === 'object' && d?.htmlText);
    if (descriptions.length > 0) metadata.description = descriptions[0].htmlText.replace(/<[^>]+>/g, '').trim();
    if (!metadata.description) metadata.description = findInPool('description');

    const city = findInPool('city');
    const country = findInPool('country') || findInPool('addressCountry');
    const neighborhood = findInPool('neighborhood') || findInPool('addressLocality');
    metadata.location = [neighborhood, city, country].filter(Boolean).join(', ') || findInPool('publicAddress');

    metadata.guests = findInPool('personCapacity') || findInPool('maxGuestCapacity') || findInPool('guestCount');
    metadata.bedrooms = findInPool('bedrooms');
    metadata.beds = findInPool('beds');
    metadata.bathrooms = findInPool('bathrooms') || findInPool('bathroomCount');

    metadata.propertyType = findInPool('propertyType') || findInPool('propertyTypeName') || findInPool('roomType');

    const prices = findAllInPool('price').filter(p => p !== null);
    if (prices.length > 0) {
        if (typeof prices[0] === 'object' && prices[0].amount) {
            metadata.price = { amount: prices[0].amount, currency: prices[0].currency || '€' };
        } else if (typeof prices[0] === 'string' || typeof prices[0] === 'number') {
            metadata.price = { amount: prices[0], currency: '€' };
        }
    }

    const avgRating = findInPool('avgRating') || findInPool('guestSatisfactionOverall') || findInPool('ratingValue');
    const reviewsCount = findInPool('reviewsCount') || findInPool('reviewCount');
    if (avgRating) metadata.rating = { avg: avgRating, count: reviewsCount };

    const amenitiesLists = findAllInPool('amenities').filter(a => Array.isArray(a) && a.length > 0);
    if (amenitiesLists.length > 0) {
        const uniqueAmenities = new Set(
            amenitiesLists[0]
                .flatMap(group => group.amenities || [group])
                .map(a => a.name || a.title || a)
                .filter(a => typeof a === 'string')
        );
        metadata.amenities = Array.from(uniqueAmenities);
    }

    const hostName = findInPool('hostName') || findInPool('firstName');
    const isSuperhost = findInPool('isSuperhost');
    if (hostName) {
        metadata.host = {
            name: hostName,
            isSuperhost: isSuperhost || false,
            memberSince: findInPool('memberSince'),
            reviewsCount: findInPool('hostReviewsCount')
        };
    }

    metadata.listingId = url.match(/\/rooms\/(\d+)/)?.[1] || findInPool('id');

    res.json({ images: photosFound, metadata });
  } catch (error) {
    console.error("Scraping error:", error.message);
    res.status(500).json({ error: 'Failed' });
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
