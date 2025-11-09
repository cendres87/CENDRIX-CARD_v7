import React from 'react';
import { ImageField, PhotoFiles } from '../types';

interface LivePreviewImageProps {
  field: ImageField;
  currentPreviewRow: string[] | undefined;
  headers: string[];
  photoFiles: PhotoFiles;
  scale: number;
}

export const LivePreviewImage: React.FC<LivePreviewImageProps> = ({ field, currentPreviewRow, headers, photoFiles, scale }) => {
  // Make the column lookup case-insensitive to ensure robustness.
  const linkColumnLower = (field.linkColumn || '').toLowerCase();
  const colIndex = headers.findIndex(h => h.toLowerCase() === linkColumnLower);

  const photoBaseName = colIndex !== -1 && currentPreviewRow ? (currentPreviewRow[colIndex] || '').trim().toLowerCase() : null;
  const photoSrc = photoBaseName ? photoFiles[photoBaseName] : null;

  const frameStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${field.x * scale}px`,
    top: `${field.y * scale}px`,
    width: `${field.width * scale}px`,
    height: `${field.height * scale}px`,
    backgroundColor: field.frame?.color || 'transparent',
  };
  
  const thickness = field.frame?.thickness || 0;
  const innerX = thickness * scale;
  const innerY = thickness * scale;
  const innerWidth = (field.width - 2 * thickness) * scale;
  const innerHeight = (field.height - 2 * thickness) * scale;
  
  if (innerWidth <= 0 || innerHeight <= 0) {
    return <div style={frameStyle}></div>;
  }

  if (!photoSrc) {
     return (
        <div style={frameStyle}>
          <div style={{ position: 'absolute', left: innerX, top: innerY, width: innerWidth, height: innerHeight, backgroundColor: 'rgba(255, 255, 255, 0.1)', border: `1px dashed rgba(255, 255, 255, 0.3)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: `${10 * scale}px`, color: 'rgba(255,255,255,0.5)', textAlign: 'center', overflow: 'hidden' }}>
            <span style={{padding: '2px'}}>Foto no encontrada para '{photoBaseName || 'N/A'}'</span>
          </div>
        </div>
     );
  }
  
  return (
    <div style={frameStyle}>
       <img src={photoSrc} alt={`Vista previa de ${photoBaseName}`} style={{ position: 'absolute', left: innerX, top: innerY, width: innerWidth, height: innerHeight, objectFit: 'cover' }} />
    </div>
  );
};