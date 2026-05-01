import React from 'react';
import './AdBanner.css';

interface AdBannerProps {
  className?: string;
}

export const AdBanner: React.FC<AdBannerProps> = ({ className }) => {
  return (
    <div className={`ad-banner-container ${className || ''}`}>
      <div className="ad-placeholder">Advertisement</div>
    </div>
  );
};
