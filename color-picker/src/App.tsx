import React, { useState, useRef } from 'react';
import { AdBanner } from './components/AdBanner';
import { AdRoll } from './components/AdRoll';
import { Magnifier } from './components/Magnifier';
import { ColorGrid } from './components/ColorGrid';
import { sampleColorAt, getMedianColors } from './utils/colorExtractor';
import './App.css';

function App() {
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

  return (
    <div className="app">
      <AdBanner />
      <main>
        {showAdRoll ? (
          <AdRoll onComplete={onAdComplete} />
        ) : (
          <div className="hero">
            <h1>Color Identifier</h1>
            <p className="hint">Think of this as a digital eye for your images—click any pixel to capture its hidden shade.</p>
            <input 
              type="file" 
              id="file-upload" 
              className="upload-input" 
              onChange={handleImageUpload} 
              accept="image/*" 
            />
            <label htmlFor="file-upload" className="upload-label">
              Select Image
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
                <h2>Selected Colors:</h2>
                <ColorGrid colors={selectedColors} />
              </div>
            )}

            {detectedColors.length > 0 && (
              <div style={{ marginTop: '2rem' }}>
                <h2>Detected Colors:</h2>
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
