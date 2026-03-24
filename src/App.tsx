import React, { useState } from 'react';
import { Search, Download, Image as ImageIcon, RefreshCw, Archive, X, ZoomIn, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

interface ImageMeta {
  url: string;
  size: number;
  dimensions?: string;
}

function App() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [zipping, setZipping] = useState(false);
  const [images, setImages] = useState<ImageMeta[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const formatSize = (bytes: number): string => {
    if (bytes === 0) return '';
    const mb = bytes / (1024 * 1024);
    if (mb >= 1) return `${mb.toFixed(2)} MB`;
    return `${(bytes / 1024).toFixed(0)} KB`;
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim() || !url.includes('airbnb')) {
      setError('Veuillez entrer une URL Airbnb valide.');
      return;
    }

    setLoading(true);
    setError(null);
    setImages([]);

    try {
      const response = await fetch(`/api/scrape?url=${encodeURIComponent(url)}`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erreur lors de la récupération des images');
      }

      const data = await response.json();
      setImages(data.images || []);
    } catch (err: any) {
      setError(err.message || "Impossible de récupérer les photos de cette annonce.");
    } finally {
      setLoading(false);
    }
  };

  const handleImageLoad = (url: string, e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    const { naturalWidth, naturalHeight } = e.currentTarget;
    if (naturalWidth && naturalHeight) {
      setImages(prev => prev.map(img => 
        img.url === url 
          ? { ...img, dimensions: `${naturalWidth}x${naturalHeight}` } 
          : img
      ));
    }
  };

  const downloadSingleImage = async (imgUrl: string, index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const response = await fetch(`/api/proxy?url=${encodeURIComponent(imgUrl)}`);
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `airbnb-photo-${index + 1}.jpg`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(downloadUrl);
      document.body.removeChild(a);
    } catch (error) {
      window.open(imgUrl, '_blank');
    }
  };

  const removeImage = (url: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setImages(prev => prev.filter(img => img.url !== url));
  };

  const handleDownloadZip = async () => {
    if (images.length === 0) return;
    setZipping(true);
    try {
      const zip = new JSZip();
      
      const downloadPromises = images.map(async (img, index) => {
        try {
          const response = await fetch(`/api/proxy?url=${encodeURIComponent(img.url)}`);
          if (response.ok) {
            const blob = await response.blob();
            zip.file(`airbnb-photo-${index + 1}.jpg`, blob);
          }
        } catch (err) {
          console.error(`Failed to fetch ${img.url}`, err);
        }
      });

      await Promise.all(downloadPromises);
      const content = await zip.generateAsync({ type: 'blob' });
      saveAs(content, 'airbnb-photos.zip');
    } catch (err) {
      console.error("Erreur lors de la création du ZIP", err);
      alert("Erreur lors de la création de l'archive ZIP.");
    } finally {
      setZipping(false);
    }
  };

  return (
    <div className="container">
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="header"
      >
        <h1 className="title">AirVision</h1>
        <p className="subtitle">Extrayez instantanément les photos haute résolution de n'importe quelle annonce Airbnb</p>
      </motion.div>

      <motion.form 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="search-section" 
        onSubmit={handleSearch}
      >
        <div className="input-wrapper">
          <Search size={22} className="input-icon" />
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.airbnb.com/rooms/12345678"
            className="url-input"
            required
          />
        </div>
        <button type="submit" className="search-btn" disabled={loading}>
          {loading ? (
             <><RefreshCw size={20} className="animate-spin" style={{ animation: 'spin 1s linear infinite' }} /> Recherche...</>
          ) : (
            <><ImageIcon size={20} /> Extraire</>
          )}
        </button>
      </motion.form>

      <AnimatePresence>
        {error && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="error-message"
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {loading && (
        <motion.div 
          initial={{ opacity: 0 }} 
          animate={{ opacity: 1 }} 
          className="loading-container"
        >
          <div className="spinner"></div>
          <p style={{ color: 'var(--text-secondary)' }}>Analyse de l'annonce et récupération des images...</p>
        </motion.div>
      )}

      {!loading && images.length === 0 && !error && (
        <motion.div 
          initial={{ opacity: 0 }} 
          animate={{ opacity: 1 }} 
          transition={{ delay: 0.4 }}
          className="empty-state"
        >
          <ImageIcon className="empty-icon" />
          <p>Entrez une URL d'annonce Airbnb pour voir la magie opérer</p>
        </motion.div>
      )}

      {images.length > 0 && (
        <motion.div 
          initial={{ opacity: 0 }} 
          animate={{ opacity: 1 }} 
          transition={{ duration: 0.5 }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <p style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>
              {images.length} photos extraites avec succès
            </p>
            <button 
              onClick={handleDownloadZip} 
              disabled={zipping}
              className="zip-btn"
            >
              {zipping ? (
                <><RefreshCw size={18} style={{ animation: 'spin 1s linear infinite' }} /> Compression...</>
              ) : (
                <><Archive size={18} /> Tout télécharger (.zip)</>
              )}
            </button>
          </div>

          <div className="gallery-grid">
            {images.map((img, index) => (
              <motion.div 
                key={img.url + index}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, delay: Math.min(index * 0.05, 0.5) }}
                className="image-card"
                onClick={() => setSelectedImage(img.url)}
              >
                <img 
                  src={img.url} 
                  alt={`Annonce Airbnb photo ${index + 1}`} 
                  className="property-image" 
                  loading="lazy" 
                  onLoad={(e) => handleImageLoad(img.url, e)}
                />
                
                <div className="image-metadata">
                  {img.dimensions && <span>{img.dimensions}</span>}
                  {img.size > 0 && img.dimensions && <span>&nbsp;•&nbsp;</span>}
                  {img.size > 0 && <span>{formatSize(img.size)}</span>}
                </div>

                <div className="download-overlay">
                  <div className="action-buttons">
                    <button 
                      className="action-btn"
                      onClick={(e) => { e.stopPropagation(); setSelectedImage(img.url); }}
                      title="Agrandir"
                    >
                      <ZoomIn size={20} />
                    </button>
                    <button 
                      onClick={(e) => downloadSingleImage(img.url, index, e)} 
                      className="action-btn"
                      title="Télécharger l'image"
                    >
                      <Download size={20} />
                    </button>
                    <button 
                      onClick={(e) => removeImage(img.url, e)} 
                      className="action-btn delete-btn"
                      title="Supprimer la photo"
                    >
                      <Trash2 size={20} />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Lightbox Modal */}
      <AnimatePresence>
        {selectedImage && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="lightbox-overlay"
            onClick={() => setSelectedImage(null)}
          >
            <button className="lightbox-close" onClick={() => setSelectedImage(null)}>
              <X size={32} />
            </button>
            <motion.img 
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.8 }}
              src={selectedImage} 
              alt="Agrandissement" 
              className="lightbox-image"
              onClick={(e) => e.stopPropagation()} 
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default App;
