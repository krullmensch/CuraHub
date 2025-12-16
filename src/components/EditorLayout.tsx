import { useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { UploadDropzone } from './UploadDropzone';
import { MetadataDialog } from './MetadataDialog';
import { useEditorStore } from '../store/editorStore';

export const EditorLayout = () => {
  const { user, logout } = useAuthStore();
  const startPlacement = useEditorStore((state) => state.startPlacement);
  const navigate = useNavigate();
  const [uploadedAsset, setUploadedAsset] = useState<any | null>(null);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const setDialogOpen = useEditorStore((state) => state.setDialogOpen);

  const onUploadComplete = (asset: any) => {
      console.log('Upload complete:', asset);
      setUploadedAsset(asset);
      setDialogOpen(true);
  };

  // Update type to receive data object
  const onMetadataSaved = (data: { id: number, width: number, height: number }) => {
      console.log('Artwork saved:', data);
      setUploadedAsset(null);
      setDialogOpen(false);
      
      startPlacement({ 
          id: data.id, 
          width: data.width, 
          height: data.height, 
          url: uploadedAsset.url 
      });
  };

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <header style={{ 
        padding: '1rem', 
        background: '#333', 
        color: 'white', 
        display: 'flex', 
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div>
           <span style={{ fontWeight: 'bold' }}>CuraHub Editor</span>
           <span style={{ marginLeft: '1rem', fontSize: '0.8rem', color: '#ccc' }}>
             {user?.email}
           </span>
        </div>
        <button 
          onClick={handleLogout}
          style={{ 
            padding: '0.5rem 1rem', 
            background: '#d9534f', 
            color: 'white', 
            border: 'none', 
            borderRadius: '4px',
            cursor: 'pointer' 
          }}
        >
          Logout
        </button>
      </header>
      
      <div style={{ flex: 1, position: 'relative' }}>
         <UploadDropzone
            onUploadStart={() => console.log('Upload started')}
            onUploadComplete={onUploadComplete}
            onUploadError={(err) => alert(`Upload error: ${err}`)}
         >
            <Outlet />
         </UploadDropzone>

         {uploadedAsset && (
             <MetadataDialog 
                asset={uploadedAsset}
                onSave={onMetadataSaved}
                onCancel={() => { setUploadedAsset(null); setDialogOpen(false); }}
             />
         )}
      </div>
    </div>
  );
};
