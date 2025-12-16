import { useState } from 'react';
import { useAuthStore } from '../store/authStore';

interface UploadDropzoneProps {
  onUploadStart: () => void;
  onUploadComplete: (fileData: { url: string, filename: string, mimetype: string, size: number, width?: number, height?: number, widthCm?: number, heightCm?: number }) => void;
  onUploadError: (error: string) => void;
  children: React.ReactNode;
}

export const UploadDropzone = ({ onUploadStart, onUploadComplete, onUploadError, children }: UploadDropzoneProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const token = useAuthStore((state) => state.token);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      
      if (!file.type.startsWith('image/')) {
          onUploadError('Only image files are allowed');
          return;
      }

      onUploadStart();
      
      const formData = new FormData();
      formData.append('file', file);

      try {
        const response = await fetch('http://localhost:3000/upload', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          },
          body: formData,
        });

        if (!response.ok) {
            throw new Error('Upload failed');
        }

        const data = await response.json();
        onUploadComplete(data);
      } catch (error) {
        onUploadError(error instanceof Error ? error.message : 'Unknown error');
      }
    }
  };

  return (
    <div 
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        style={{ position: 'relative', width: '100%', height: '100%' }}
    >
      {isDragging && (
        <div style={{
            position: 'absolute',
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0, 100, 255, 0.2)',
            border: '4px dashed #0064ff',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none'
        }}>
            <h2 style={{ color: 'white', background: 'rgba(0,0,0,0.5)', padding: '20px', borderRadius: '8px' }}>
                Drop image to upload
            </h2>
        </div>
      )}
      {children}
    </div>
  );
};
