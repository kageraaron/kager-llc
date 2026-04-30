import React, { useEffect, useRef } from 'react';

interface MagnifierProps {
  image: HTMLImageElement;
  x: number;
  y: number;
}

export const Magnifier: React.FC<MagnifierProps> = ({ image, x, y }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) return;

    const zoom = 5;
    const size = 50;

    // Use naturalWidth/naturalHeight to account for CSS resizing
    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;
    
    // The area to zoom is centered on (x, y)
    // We want the (x, y) coordinates to be the center of the zoom area.
    const sourceWidth = size / zoom;
    const sourceHeight = size / zoom;
    const sourceX = (x * scaleX) - (sourceWidth / 2);
    const sourceY = (y * scaleY) - (sourceHeight / 2);
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(
      image,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      size,
      size
    );
  }, [image, x, y]);

  return (
    <div style={{
      position: 'absolute',
      // Adjust offset to better center the magnifier on the cursor
      left: x - 25,
      top: y - 25,
      pointerEvents: 'none',
      border: '2px solid white',
      borderRadius: '50%',
      overflow: 'hidden',
      width: 50,
      height: 50,
      zIndex: 10
    }}>
      <canvas ref={canvasRef} width={50} height={50} />
    </div>
  );
};
