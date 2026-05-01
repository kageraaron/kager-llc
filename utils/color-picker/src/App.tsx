import React, { useState, useRef } from 'react';
import { AdBanner } from './components/AdBanner';
import { AdRoll } from './components/AdRoll';
import { Magnifier } from './components/Magnifier';
import { ColorGrid } from './components/ColorGrid';
import { sampleColorAt, getMedianColors } from './utils/colorExtractor';
import { useI18n } from './lib/i18n';
import './App.css';

function App() {
  const { t, lang, setLanguage } = useI18n();
  const [image, setImage] = useState<string | null>(null);
  const [selectedColors, setSelectedColors] = useState<{ hex: string, rgb: string }[]>([]);
  const [detectedColors, setDetectedColors] = useState<{ hex: string, rgb: string }[]>([]);
  const [showAdRoll, setShowAdRoll] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isHovering, setIsHovering] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        setImage(result);
        setSelectedColors([]);
        
        const img = new Image();
        img.src = result;
        img.onload = () => {
          setDetectedColors(getMedianColors(img));
        };
        
        setShowAdRoll(true);
      };
      reader.readAsDataURL(event.target.files[0]);
    }
  };

  const handleImageClick = (event: React.MouseEvent<HTMLImageElement>) => {
    if (imageRef.current) {
      const rect = imageRef.current.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const color = sampleColorAt(imageRef.current, x, y);
      setSelectedColors(prev => [color, ...prev]);
    }
  };

  const onAdComplete = () => {
    setShowAdRoll(false);
  };

  const languages = ['en', 'es', 'fr', 'de', 'zh', 'ja'];

  return (
    <div className="app">
      <div className="language-switcher" style={{ position: 'absolute', top: '1rem', right: '1rem', display: 'flex', gap: '0.5rem', zIndex: 100 }}>
        {languages.map(l => (
          <button 
            key={l} 
            onClick={() => setLanguage(l)}
            style={{ 
              padding: '0.2rem 0.5rem', 
              fontSize: '0.7rem', 
              borderRadius: '4px', 
              border: '1px solid var(--border)',
              background: lang === l ? 'var(--primary)' : 'rgba(255,255,255,0.1)',
              color: 'white',
              cursor: 'pointer'
            }}
          >
            {l.toUpperCase()}
          </button>
        ))}
      </div>
      <AdBanner />
      <main>
        {showAdRoll ? (
          <AdRoll onComplete={onAdComplete} />
        ) : (
          <div className="hero">
            <h1>{t('h1')}</h1>
            <p className="hint">{t('hint')}</p>
            <input 
              type="file" 
              id="file-upload" 
              className="upload-input" 
              onChange={handleImageUpload} 
              accept="image/*" 
            />
            <label htmlFor="file-upload" className="upload-label">
              {t('upload_label')}
            </label>
            {image && (
              <div 
                style={{ position: 'relative', display: 'inline-block' }}
                onMouseMove={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
                }}
                onMouseEnter={() => setIsHovering(true)}
                onMouseLeave={() => setIsHovering(false)}
              >
                <img 
                  ref={imageRef} 
                  src={image} 
                  alt="Uploaded" 
                  className="preview" 
                  onClick={handleImageClick}
                  style={{ cursor: 'crosshair', display: 'block' }}
                />
                {isHovering && imageRef.current && (
                  <Magnifier image={imageRef.current} x={mousePos.x} y={mousePos.y} />
                )}
              </div>
            )}
            
            {selectedColors.length > 0 && (
              <div style={{ marginTop: '2rem' }}>
                <h2>{t('selected_colors_title')}</h2>
                <ColorGrid colors={selectedColors} />
              </div>
            )}

            {detectedColors.length > 0 && (
              <div style={{ marginTop: '2rem' }}>
                <h2>{t('detected_colors_title')}</h2>
                <ColorGrid colors={detectedColors} />
              </div>
            )}
          </div>
        )}
      </main>
      <AdBanner />
    </div>
  );
}

export default App;
