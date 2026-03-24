import React, { useState } from 'react';
import { Search, Download, Image as ImageIcon, RefreshCw, Archive, X, ZoomIn, Trash2, Star, Users, BedDouble, Bath, MapPin, Tag, ShieldCheck, ChevronDown, ChevronUp, CalendarClock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

interface ImageMeta { url: string; size: number; dimensions?: string; }
interface ListingMetadata {
  title?: string; subtitle?: string; description?: string; location?: string;
  coordinates?: { lat: number; lng: number }; guests?: number; bedrooms?: number;
  beds?: number; bathrooms?: number; propertyType?: string; roomType?: string;
  price?: { amount: number; currency: string };
  rating?: { avg: number; count: number };
  ratingBreakdown?: Record<string, number>;
  host?: { name: string; isSuperhost: boolean; memberSince?: string; reviewsCount?: number };
  amenities?: string[];
  houseRules?: { checkIn?: string; checkOut?: string; cancellation?: string };
  recentReviews?: { author?: string; date?: string; text?: string }[];
  listingId?: string;
}

const RATING_LABELS: Record<string, string> = {
  accuracy: 'Précision', checkin: 'Arrivée', cleanliness: 'Propreté',
  communication: 'Communication', location: 'Emplacement', value: 'Rapport qualité/prix',
};

function App() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [zipping, setZipping] = useState(false);
  const [images, setImages] = useState<ImageMeta[]>([]);
  const [metadata, setMetadata] = useState<ListingMetadata | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [showAllAmenities, setShowAllAmenities] = useState(false);
  const [showAllReviews, setShowAllReviews] = useState(false);

  const formatSize = (bytes: number): string => {
    if (!bytes) return '';
    const mb = bytes / (1024 * 1024);
    return mb >= 1 ? `${mb.toFixed(2)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim() || !url.includes('airbnb')) { setError('Veuillez entrer une URL Airbnb valide.'); return; }
    setLoading(true); setError(null); setImages([]); setMetadata(null);
    try {
      const response = await fetch(`/api/scrape?url=${encodeURIComponent(url)}`);
      if (!response.ok) { const d = await response.json(); throw new Error(d.error || 'Erreur'); }
      const data = await response.json();
      setImages(data.images || []);
      setMetadata(data.metadata || null);
    } catch (err: any) {
      setError(err.message || "Impossible de récupérer les photos de cette annonce.");
    } finally { setLoading(false); }
  };

  const handleImageLoad = (url: string, e: React.SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth, naturalHeight } = e.currentTarget;
    if (naturalWidth && naturalHeight) {
      setImages(prev => prev.map(img => img.url === url ? { ...img, dimensions: `${naturalWidth}x${naturalHeight}` } : img));
    }
  };

  const downloadSingleImage = async (imgUrl: string, index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const response = await fetch(`/api/proxy?url=${encodeURIComponent(imgUrl)}`);
      const blob = await response.blob();
      const a = document.createElement('a');
      a.href = window.URL.createObjectURL(blob);
      a.download = `airvision-photo-${index + 1}.jpg`;
      document.body.appendChild(a); a.click();
      window.URL.revokeObjectURL(a.href); document.body.removeChild(a);
    } catch { window.open(imgUrl, '_blank'); }
  };

  const removeImage = (url: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setImages(prev => prev.filter(img => img.url !== url));
  };

  const handleDownloadZip = async () => {
    if (!images.length) return;
    setZipping(true);
    try {
      const zip = new JSZip();
      await Promise.all(images.map(async (img, i) => {
        try {
          const r = await fetch(`/api/proxy?url=${encodeURIComponent(img.url)}`);
          if (r.ok) zip.file(`airvision-photo-${i + 1}.jpg`, await r.blob());
        } catch (_) {}
      }));
      saveAs(await zip.generateAsync({ type: 'blob' }), 'airvision-photos.zip');
    } catch { alert("Erreur lors de la création du ZIP."); }
    finally { setZipping(false); }
  };

  const m = metadata;

  return (
    <div className="container">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }} className="header">
        <h1 className="title">AirVision</h1>
        <p className="subtitle">Extrayez photos et informations complètes de n'importe quelle annonce Airbnb</p>
      </motion.div>

      <motion.form initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5, delay: 0.2 }} className="search-section" onSubmit={handleSearch}>
        <div className="input-wrapper">
          <Search size={22} className="input-icon" />
          <input type="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://www.airbnb.com/rooms/12345678" className="url-input" required />
        </div>
        <button type="submit" className="search-btn" disabled={loading}>
          {loading ? <><RefreshCw size={20} style={{ animation: 'spin 1s linear infinite' }} /> Analyse...</> : <><ImageIcon size={20} /> Extraire</>}
        </button>
      </motion.form>

      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="error-message">{error}</motion.div>
        )}
      </AnimatePresence>

      {loading && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="loading-container">
          <div className="spinner" />
          <p style={{ color: 'var(--text-secondary)' }}>Analyse de l'annonce en cours...</p>
        </motion.div>
      )}

      {!loading && !m && !images.length && !error && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="empty-state">
          <ImageIcon className="empty-icon" />
          <p>Entrez une URL d'annonce Airbnb pour voir la magie opérer</p>
        </motion.div>
      )}

      {/* ── METADATA PANEL ── */}
      <AnimatePresence>
        {m && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="metadata-panel">

            {/* Header */}
            <div className="meta-header">
              <div>
                {m.propertyType && <span className="meta-badge">{m.propertyType}</span>}
                {m.host?.isSuperhost && <span className="meta-badge superhost"><ShieldCheck size={12} /> Superhost</span>}
                <h2 className="meta-title">{m.title || 'Annonce Airbnb'}</h2>
                {m.location && <p className="meta-location"><MapPin size={14} /> {m.location}</p>}
              </div>
              <div className="meta-right">
                {m.rating && (
                  <div className="meta-rating">
                    <Star size={18} fill="currentColor" />
                    <span className="meta-rating-value">{Number(m.rating.avg).toFixed(2)}</span>
                    {m.rating.count && <span className="meta-rating-count">({m.rating.count} avis)</span>}
                  </div>
                )}
                {m.price && (
                  <div className="meta-price">
                    <span className="price-amount">{m.price.currency}{m.price.amount}</span>
                    <span className="price-label"> / nuit</span>
                  </div>
                )}
              </div>
            </div>

            {/* Quick stats */}
            <div className="meta-stats">
              {m.guests !== undefined && <div className="stat-item"><Users size={16} /><span>{m.guests} voyageurs</span></div>}
              {m.bedrooms !== undefined && <div className="stat-item"><BedDouble size={16} /><span>{m.bedrooms} chambre{m.bedrooms !== 1 ? 's' : ''}</span></div>}
              {m.beds !== undefined && <div className="stat-item"><BedDouble size={16} /><span>{m.beds} lit{m.beds !== 1 ? 's' : ''}</span></div>}
              {m.bathrooms !== undefined && <div className="stat-item"><Bath size={16} /><span>{m.bathrooms} sdb</span></div>}
              {m.houseRules?.checkIn && <div className="stat-item"><CalendarClock size={16} /><span>Arrivée : {m.houseRules.checkIn}</span></div>}
              {m.houseRules?.checkOut && <div className="stat-item"><CalendarClock size={16} /><span>Départ : {m.houseRules.checkOut}</span></div>}
            </div>

            <div className="meta-grid">
              {/* Description */}
              {m.description && (
                <div className="meta-card full">
                  <h3 className="meta-card-title">Description</h3>
                  <p className="meta-description">{m.description}</p>
                </div>
              )}

              {/* Host */}
              {m.host && (
                <div className="meta-card">
                  <h3 className="meta-card-title">Hôte</h3>
                  <p className="host-name">{m.host.name}</p>
                  {m.host.isSuperhost && <p className="host-superhost"><ShieldCheck size={14} /> Superhost</p>}
                  {m.host.memberSince && <p className="host-detail">Membre depuis {m.host.memberSince}</p>}
                  {m.host.reviewsCount && <p className="host-detail">{m.host.reviewsCount} avis</p>}
                </div>
              )}

              {/* Rating breakdown */}
              {m.ratingBreakdown && Object.keys(m.ratingBreakdown).length > 0 && (
                <div className="meta-card">
                  <h3 className="meta-card-title">Notes détaillées</h3>
                  <div className="rating-breakdown">
                    {Object.entries(m.ratingBreakdown).map(([key, val]) => (
                      <div key={key} className="rating-row">
                        <span className="rating-cat">{RATING_LABELS[key] || key}</span>
                        <div className="rating-bar-wrap">
                          <div className="rating-bar" style={{ width: `${(val / 5) * 100}%` }} />
                        </div>
                        <span className="rating-val">{Number(val).toFixed(1)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* House rules */}
              {m.houseRules?.cancellation && (
                <div className="meta-card">
                  <h3 className="meta-card-title">Annulation</h3>
                  <p className="meta-text"><Tag size={14} /> {m.houseRules.cancellation}</p>
                </div>
              )}

              {/* Amenities */}
              {m.amenities && m.amenities.length > 0 && (
                <div className="meta-card full">
                  <h3 className="meta-card-title">Équipements ({m.amenities.length})</h3>
                  <div className="amenities-grid">
                    {(showAllAmenities ? m.amenities : m.amenities.slice(0, 12)).map((a, i) => (
                      <span key={i} className="amenity-tag">{a}</span>
                    ))}
                  </div>
                  {m.amenities.length > 12 && (
                    <button className="show-more-btn" onClick={() => setShowAllAmenities(!showAllAmenities)}>
                      {showAllAmenities ? <><ChevronUp size={14} /> Voir moins</> : <><ChevronDown size={14} /> Voir les {m.amenities.length - 12} autres</>}
                    </button>
                  )}
                </div>
              )}

              {/* Reviews */}
              {m.recentReviews && m.recentReviews.length > 0 && (
                <div className="meta-card full">
                  <h3 className="meta-card-title">Avis récents</h3>
                  <div className="reviews-list">
                    {(showAllReviews ? m.recentReviews : m.recentReviews.slice(0, 3)).map((r, i) => (
                      <div key={i} className="review-item">
                        <div className="review-header">
                          <span className="review-author">{r.author || 'Voyageur'}</span>
                          {r.date && <span className="review-date">{r.date}</span>}
                        </div>
                        <p className="review-text">{r.text}</p>
                      </div>
                    ))}
                  </div>
                  {m.recentReviews.length > 3 && (
                    <button className="show-more-btn" onClick={() => setShowAllReviews(!showAllReviews)}>
                      {showAllReviews ? <><ChevronUp size={14} /> Voir moins</> : <><ChevronDown size={14} /> Voir plus d'avis</>}
                    </button>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── GALLERY ── */}
      {images.length > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <p style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{images.length} photos extraites</p>
            <button onClick={handleDownloadZip} disabled={zipping} className="zip-btn">
              {zipping ? <><RefreshCw size={18} style={{ animation: 'spin 1s linear infinite' }} /> Compression...</> : <><Archive size={18} /> Tout télécharger (.zip)</>}
            </button>
          </div>
          <div className="gallery-grid">
            {images.map((img, index) => (
              <motion.div key={img.url + index} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4, delay: Math.min(index * 0.04, 0.6) }} className="image-card" onClick={() => setSelectedImage(img.url)}>
                <img src={img.url} alt={`Photo ${index + 1}`} className="property-image" loading="lazy" onLoad={e => handleImageLoad(img.url, e)} />
                <div className="image-metadata">
                  {img.dimensions && <span>{img.dimensions}</span>}
                  {img.size > 0 && img.dimensions && <span> • </span>}
                  {img.size > 0 && <span>{formatSize(img.size)}</span>}
                </div>
                <div className="download-overlay">
                  <div className="action-buttons">
                    <button className="action-btn" onClick={e => { e.stopPropagation(); setSelectedImage(img.url); }} title="Agrandir"><ZoomIn size={20} /></button>
                    <button className="action-btn" onClick={e => downloadSingleImage(img.url, index, e)} title="Télécharger"><Download size={20} /></button>
                    <button className="action-btn delete-btn" onClick={e => removeImage(img.url, e)} title="Supprimer"><Trash2 size={20} /></button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}

      <AnimatePresence>
        {selectedImage && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="lightbox-overlay" onClick={() => setSelectedImage(null)}>
            <button className="lightbox-close" onClick={() => setSelectedImage(null)}><X size={32} /></button>
            <motion.img initial={{ scale: 0.8 }} animate={{ scale: 1 }} exit={{ scale: 0.8 }} src={selectedImage} alt="Agrandissement" className="lightbox-image" onClick={e => e.stopPropagation()} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default App;
