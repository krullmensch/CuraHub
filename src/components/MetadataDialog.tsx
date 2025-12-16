import { useState } from 'react';
import { useAuthStore } from '../store/authStore';

interface AssetData {
    url: string;
    filename: string;
    mimetype: string;
    size: number;
    width?: number; // Pixels
    height?: number; // Pixels
    widthCm?: number;
    heightCm?: number;
    dpi?: number;
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

  // Use backend provided cm dimensions if available, otherwise fallback to estimation
  // If backend returns 0 for cm, fallback to px estimate
  const initialWidth = asset.widthCm && asset.widthCm > 0 ? asset.widthCm.toString() : (asset.width ? (asset.width / 37.8).toFixed(1) : '');
  const initialHeight = asset.heightCm && asset.heightCm > 0 ? asset.heightCm.toString() : (asset.height ? (asset.height / 37.8).toFixed(1) : '');

  const [formData, setFormData] = useState({
      title: '',
      artist: '',
      year: '',
      description: '',
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
              asset: {
                  filename: asset.filename,
                  path: asset.url,
                  mimetype: asset.mimetype,
                  size: asset.size,
                  width: asset.width,
                  height: asset.height,
                  dpi: asset.dpi,
                  metadata: {} // Placeholder for extra if needed
              }
          };

          const response = await fetch('http://localhost:3000/artworks', {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify(body)
          });

          if (!response.ok) throw new Error('Failed to create artwork');

          const data = await response.json();
          // Backend returns the created artwork. 
          // We need to ensure backend returns width/height or we pass what we sent.
          // Assuming backend returns the full object.
          onSave({ id: data.id, width: data.width || 50, height: data.height || 50 });
      } catch (err) {
          setError(err instanceof Error ? err.message : 'Error saving');
          setLoading(false);
      }
  };

  return (
    <div style={{
       position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
       backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 10000,
       display: 'flex', alignItems: 'center', justifyContent: 'center'
    }}>
      <div style={{
          background: '#222', padding: '30px', borderRadius: '12px',
          width: '400px', color: 'white', border: '1px solid #444'
      }}>
          <h3>Add Artwork Metadata</h3>
          
          <img src={`http://localhost:3000${asset.url}`} alt="Preview" 
               style={{ width: '100%', height: '150px', objectFit: 'contain', background: 'black', marginBottom: '15px' }} />

          {error && <div style={{ color: 'red', marginBottom: '10px' }}>{error}</div>}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <input name="title" placeholder="Title *" required value={formData.title} onChange={handleChange} 
                     style={{ padding: '8px', background: '#333', border: 'none', color: 'white' }} />
              
              <input name="artist" placeholder="Artist" value={formData.artist} onChange={handleChange} 
                     style={{ padding: '8px', background: '#333', border: 'none', color: 'white' }} />
              
              <div style={{ display: 'flex', gap: '10px' }}>
                  <input name="year" placeholder="Year" value={formData.year} onChange={handleChange} 
                         style={{ flex: 1, padding: '8px', background: '#333', border: 'none', color: 'white' }} />
                  <input name="width" placeholder="Width (cm)" type="number" step="0.1" value={formData.width} onChange={handleChange} 
                         style={{ flex: 1, padding: '8px', background: '#333', border: 'none', color: 'white' }} />
                  <input name="height" placeholder="Height (cm)" type="number" step="0.1" value={formData.height} onChange={handleChange} 
                         style={{ flex: 1, padding: '8px', background: '#333', border: 'none', color: 'white' }} />
              </div>

              <textarea name="description" placeholder="Description" value={formData.description} onChange={handleChange} 
                        style={{ padding: '8px', background: '#333', border: 'none', color: 'white', minHeight: '60px' }} />

              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                  <button type="button" onClick={onCancel} style={{ flex: 1, padding: '10px', background: '#555', border: 'none', color: 'white', cursor: 'pointer' }}>
                      Cancel
                  </button>
                  <button type="submit" disabled={loading} style={{ flex: 1, padding: '10px', background: '#0064ff', border: 'none', color: 'white', cursor: 'pointer' }}>
                      {loading ? 'Saving...' : 'Save Artwork'}
                  </button>
              </div>
          </form>
      </div>
    </div>
  );
};
