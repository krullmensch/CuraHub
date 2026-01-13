export const processImage = async (file: File): Promise<File> => {
  return new Promise((resolve, reject) => {
    // If it's already a WebP and small enough, we *could* skip, 
    // but for consistency/stripping metadata, we process everything.

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        // Calculate new dimensions
        const MAX_SIZE = 2500;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_SIZE) {
            height = Math.round(height * (MAX_SIZE / width));
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width = Math.round(width * (MAX_SIZE / height));
            height = MAX_SIZE;
          }
        }

        // Draw to canvas
        const canvas = document.createElement('canvas'); // Use standard canvas for broader compatibility
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }

        // High quality scaling
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        // Export as WebP
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Canvas to Blob failed'));
              return;
            }
            
            // Create new File object
            // Use original name but change extension
            const nameParts = file.name.split('.');
            nameParts.pop();
            const newName = `${nameParts.join('.')}.webp`;
            
            const processedFile = new File([blob], newName, { 
              type: 'image/webp',
              lastModified: Date.now()
            });

            resolve(processedFile);
          },
          'image/webp',
          0.8 // Quality 80%
        );
      };
      img.onerror = (error) => reject(error);
    };
    reader.onerror = (error) => reject(error);
  });
};
