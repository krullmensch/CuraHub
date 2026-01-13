import { useState, useRef } from 'react';
import { useAuthStore } from '../store/authStore';
import { Button } from "@/components/ui/button";
import { CloudUpload } from "lucide-react";

interface UploadDropzoneProps {
  onUploadStart?: () => void;
  onUploadComplete?: (fileData: any) => void;
  onUploadError?: (error: string) => void;
  children?: React.ReactNode;
  disabled?: boolean;
  className?: string; 
}

export const UploadDropzone = ({ 
    onUploadStart = () => {}, 
    onUploadComplete = () => {}, 
    onUploadError = (e) => console.error(e), 
    children, 
    disabled = false,
    className = ""
}: UploadDropzoneProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const token = useAuthStore((state) => state.token);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    
    // Only show dropzone for file uploads
    if (e.dataTransfer.types.includes('Files')) {
        setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    // Don't signal copy if it's not a file (optional, but good practice)
  };

  const processFiles = async (files: FileList | File[]) => {
      const validFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
      
      if (validFiles.length === 0) {
          if (files.length > 0) {
             onUploadError('Only image files are allowed');
          }
          return;
      }

      setProcessing(true);
      onUploadStart();

      try {
          // Process files sequentially to avoid overwhelming the server or client state
          for (const rawFile of validFiles) {
              try {
                  const formData = new FormData();
                  formData.append('file', rawFile);

                  const response = await fetch('/upload', {
                    method: 'POST',
                    headers: {
                      'Authorization': `Bearer ${token}`
                    },
                    body: formData,
                  });

                  if (!response.ok) {
                      throw new Error(`Upload failed for ${rawFile.name}`);
                  }

                  const data = await response.json();
                  onUploadComplete(data);
              } catch (error) {
                  onUploadError(error instanceof Error ? error.message : `Error uploading ${rawFile.name}`);
              }
          }
      } finally {
        setProcessing(false);
      }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };
  
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
          processFiles(e.target.files);
      }
      if (fileInputRef.current) {
          fileInputRef.current.value = '';
      }
  };

  const handleZoneClick = () => {
    if (disabled || processing) return;
    fileInputRef.current?.click();
  };

  return (
    <div 
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={className} 
        style={{ position: 'relative', width: '100%', height: '100%' }}
    >
      {isDragging && (
        <div className="absolute inset-0 bg-blue-500/20 border-4 border-dashed border-blue-500 z-50 flex items-center justify-center pointer-events-none rounded-lg">
             <div className="bg-black/80 text-white px-4 py-2 rounded-md font-medium backdrop-blur-sm">
                Drop images to upload
            </div>
        </div>
      )}
      
      {children ? children : (
          <div 
              onClick={handleZoneClick}
              className={`flex flex-col items-center justify-center w-full h-full border-2 border-dashed rounded-lg cursor-pointer bg-zinc-950/50 border-zinc-800 hover:bg-zinc-900 hover:border-zinc-600 transition-all ${isDragging ? 'opacity-0' : ''}`}
          >
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <CloudUpload className="h-10 w-10 text-muted-foreground mb-4" />
                  <p className="mb-2 text-sm text-gray-400 font-medium">
                      {processing ? 'Optimizing & Uploading...' : 'Click to upload or drag and drop'}
                  </p>
                  <p className="text-xs text-gray-500">
                      Images are automatically optimized
                  </p>
                  <Button variant="outline" size="sm" className="mt-4 pointer-events-none" disabled={processing}>
                      {processing ? 'Processing...' : 'Select Files'}
                  </Button>
              </div>
          </div>
      )}

      {!children && (
        <input 
            ref={fileInputRef}
            type="file" 
            className="hidden" 
            onChange={handleFileSelect} 
            accept="image/*"
            multiple 
            disabled={processing} 
        />
      )}
    </div>
  );
};
