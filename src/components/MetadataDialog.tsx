import { useState } from 'react';
import { useAuthStore } from '../store/authStore';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2 } from 'lucide-react';

interface AssetData {
    id: number;
    path: string;
    filename: string;
    mimetype: string;
    size: number;
    width?: number;
    height?: number;
    dpi?: number;
    metadata?: {
        widthCm?: number;
        heightCm?: number;
        projectId?: string;
    };
    artwork?: {
        id: number;
        title: string;
        artist?: string | null;
        year?: string | null;
        description?: string | null;
        width?: number | null;
        height?: number | null;
    } | null;
}

interface MetadataDialogProps {
  asset: AssetData;
  onSave: (data: { id: number, width: number, height: number }) => void;
  onCancel: () => void;
}

export const MetadataDialog = ({ asset, onSave, onCancel }: MetadataDialogProps) => {
  const token = useAuthStore((state) => state.token);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const existingArtwork = asset.artwork;

  const widthCm = existingArtwork?.width || asset.metadata?.widthCm;
  const heightCm = existingArtwork?.height || asset.metadata?.heightCm;

  const initialWidth = widthCm && widthCm > 0 ? widthCm.toString() : (asset.width ? (asset.width / 37.8).toFixed(1) : '');
  const initialHeight = heightCm && heightCm > 0 ? heightCm.toString() : (asset.height ? (asset.height / 37.8).toFixed(1) : '');

  const [formData, setFormData] = useState({
      title: existingArtwork?.title || '',
      artist: existingArtwork?.artist || '',
      year: existingArtwork?.year || '',
      description: existingArtwork?.description || '',
      width: initialWidth,
      height: initialHeight
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setLoading(true);
      setError(null);

      try {
          const body = {
              title: formData.title,
              artist: formData.artist,
              year: formData.year,
              description: formData.description,
              width: formData.width ? parseFloat(formData.width) : undefined,
              height: formData.height ? parseFloat(formData.height) : undefined,
          };

          let response;
          if (existingArtwork) {
              response = await fetch(`/api/artworks/${existingArtwork.id}`, {
                  method: 'PUT',
                  headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${token}`
                  },
                  body: JSON.stringify(body)
              });
          } else {
              response = await fetch('/api/artworks', {
                  method: 'POST',
                  headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${token}`
                  },
                  body: JSON.stringify({
                      ...body,
                      assetId: asset.id
                  })
              });
          }

          if (!response.ok) throw new Error('Failed to save artwork');

          const data = await response.json();
          onSave({ id: data.id, width: data.width || 50, height: data.height || 50 });
      } catch (err) {
          setError(err instanceof Error ? err.message : 'Error saving');
          setLoading(false);
      }
  };

  // Construct image path - defaulting to /api prefix if relative, or handling absolute URLs
  const getImageUrl = (path: string) => {
      if (path.startsWith('http')) return path;
      // If it looks like a relative path from uploads, prepend /api if not already there? 
      // Actually previous code had complex logic. Let's simplify: 
      // If it's a file saved in 'uploads/', and we are serving via /uploads route on backend?
      // Usually static files are served.
      // Based on previous code: asset.path might be just filename or relative path.
      // previous code: `http://localhost:3000${asset.path}`.
      // If we use relative path in vite (proxy), it should be just `asset.path` IF it starts with /uploads and /uploads is proxied.
      // Let's assume asset.path is like '/uploads/file.jpg'.
      return path; 
  };

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-[500px] bg-zinc-950 border-zinc-800 text-white">
        <DialogHeader>
          <DialogTitle>{existingArtwork ? 'Edit Artwork Metadata' : 'Add Artwork Metadata'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4 py-4">
          <div className="flex justify-center mb-4 bg-black/20 rounded-lg p-2">
             <img 
                src={getImageUrl(asset.path)} 
                alt="Preview" 
                className="h-48 object-contain"
                onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    if (!target.src.includes('localhost:3000') && !target.src.startsWith('http')) {
                        // Fallback to direct backend URL if proxy fails or path is raw
                         target.src = `http://localhost:3000${asset.path}`;
                    }
                }}
             />
          </div>

          {error && <div className="text-red-500 text-sm">{error}</div>}

          <div className="grid gap-2">
             <Input 
                name="title" 
                placeholder="Title *" 
                required 
                value={formData.title} 
                onChange={handleChange}
                className="bg-zinc-900 border-zinc-700 focus:border-zinc-500"
             />
          </div>

          <div className="grid gap-2">
             <Input 
                name="artist" 
                placeholder="Artist" 
                value={formData.artist} 
                onChange={handleChange}
                className="bg-zinc-900 border-zinc-700 focus:border-zinc-500"
             />
          </div>

          <div className="grid grid-cols-3 gap-2">
             <Input 
                name="year" 
                placeholder="Year" 
                value={formData.year} 
                maxLength={4}
                onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, ''); // Remove non-digits
                    setFormData(prev => ({ ...prev, year: value }));
                }}
                className="bg-zinc-900 border-zinc-700 focus:border-zinc-500"
             />
             <div className="relative">
                 <Input 
                    name="width" 
                    placeholder="Width" 
                    type="number" 
                    step="0.1" 
                    value={formData.width} 
                    onChange={handleChange}
                    className="bg-zinc-900 border-zinc-700 focus:border-zinc-500 pr-8 no-spinner"
                 />
                 <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-zinc-500 pointer-events-none">cm</span>
             </div>
             <div className="relative">
                 <Input 
                    name="height" 
                    placeholder="Height" 
                    type="number" 
                    step="0.1" 
                    value={formData.height} 
                    onChange={handleChange}
                    className="bg-zinc-900 border-zinc-700 focus:border-zinc-500 pr-8 no-spinner"
                 />
                 <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-zinc-500 pointer-events-none">cm</span>
             </div>
          </div>

          <div className="grid gap-2">
            <textarea 
                name="description" 
                placeholder="Description" 
                value={formData.description} 
                onChange={handleChange} 
                className="flex min-h-[80px] w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-500 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel} className="bg-transparent border-zinc-700 text-white hover:bg-zinc-800 hover:text-white">
               Cancel
            </Button>
            <Button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white border-none">
                {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : 'Save Artwork'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
