import React, { useState, useEffect } from 'react';

interface AdRollProps {
  onComplete: () => void;
}

export const AdRoll: React.FC<AdRollProps> = ({ onComplete }) => {
  const [seconds, setSeconds] = useState(10);

  useEffect(() => {
    if (seconds === 0) {
      onComplete();
      return;
    }

    const timer = setInterval(() => {
      setSeconds((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [seconds, onComplete]);

  return (
    <div className="ad-roll-overlay">
      <h2>Please wait...</h2>
      <p>Enjoy this ad for {seconds} seconds.</p>
      <div className="ad-content-placeholder">Interactive Ad Space</div>
    </div>
  );
};
