import React, { useRef } from 'react';
import { Camera, Image as ImageIcon } from 'lucide-react';

export default function CameraCapture({ onPhotoSelected, previewUrl, label = 'Take Problem Photo' }) {
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 8 * 1024 * 1024) {
      alert('Photo exceeds 8MB limit. Please choose a smaller photo.');
      return;
    }

    onPhotoSelected(file);
  };

  return (
    <div style={{ marginBottom: 16 }}>
      <input
        type="file"
        ref={fileInputRef}
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {previewUrl ? (
        <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)' }}>
          <img
            src={previewUrl}
            alt="Preview"
            style={{ width: '100%', maxHeight: 240, objectFit: 'cover', display: 'block' }}
          />
          <button
            type="button"
            className="btn btn-outline"
            style={{
              position: 'absolute',
              bottom: 12,
              right: 12,
              width: 'auto',
              background: 'rgba(255, 255, 255, 0.9)',
              padding: '6px 12px',
              fontSize: 13,
            }}
            onClick={() => fileInputRef.current?.click()}
          >
            <Camera size={16} /> Retake Photo
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="btn btn-outline"
          style={{ width: '100%', borderStyle: 'dashed', borderWidth: 2, padding: '24px 16px' }}
          onClick={() => fileInputRef.current?.click()}
        >
          <Camera size={24} color="var(--primary)" />
          <span>{label}</span>
        </button>
      )}
    </div>
  );
}
