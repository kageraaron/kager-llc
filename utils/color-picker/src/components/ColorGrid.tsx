import { useState } from 'react';

export const ColorGrid = ({ colors }: { colors: { hex: string, rgb: string }[] }) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1000);
    });
  };

  return (
    <div className="color-grid">
      {colors.map((c, i) => (
        <div key={i} className="color-card">
          <div className="color-swatch" style={{ backgroundColor: c.hex }} />
          <div className="color-info" style={{ position: 'relative' }}>
            {copiedId === `${i}-hex` && <span className="copied-toast">Copied!</span>}
            <div 
              className="hex" 
              onClick={() => copyToClipboard(c.hex, `${i}-hex`)}
              style={{ cursor: 'pointer', fontWeight: 'bold' }}
              title="Click to copy"
            >
              {c.hex}
            </div>
            
            {copiedId === `${i}-rgb` && <span className="copied-toast">Copied!</span>}
            <div 
              className="rgb" 
              onClick={() => copyToClipboard(c.rgb, `${i}-rgb`)}
              style={{ cursor: 'pointer', fontSize: '0.8rem', color: '#666', marginTop: '4px' }}
              title="Click to copy"
            >
              {c.rgb}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
