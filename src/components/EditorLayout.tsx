import { useState } from 'react';
import { Outlet, useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { UploadDropzone } from './UploadDropzone';
import { MetadataDialog } from './MetadataDialog';
import { useEditorStore } from '../store/editorStore';
import { Button } from '@/components/ui/button';
import { LogOut } from 'lucide-react';
import { AssetSidebar } from './AssetSidebar';

// ViewModeControls import causes a white screen crash (likely due to circular dependency or build issue).
// Temporarily disabled to allow the app to run.
// import { ViewModeControls } from './ViewModeControls';

export const EditorLayout = () => {
  const { user, logout } = useAuthStore();
  const startPlacement = useEditorStore((state) => state.startPlacement);
  const viewMode = useEditorStore((state) => state.plannerViewMode);
  const navigate = useNavigate();
  const location = useLocation();
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
          url: uploadedAsset.path 
      });
  };

  const isPlanningMode = viewMode !== 'firstPerson';
  const isActive = (path: string) => location.pathname.startsWith(path);

  return (
    <div className="h-full w-full flex flex-col bg-zinc-950">
      <header className="border-b border-zinc-800 p-3 bg-zinc-900 flex justify-between items-center z-10">
        <div className="flex items-center gap-4">
            <h1 className="text-lg font-bold tracking-tight text-white">CuraHub <span className="text-blue-500">Dashboard</span></h1>
            <nav className="flex gap-4 ml-6 text-sm font-medium">
                <Link 
                    to="/exhibition/satellit/edit" 
                    className={`transition-colors ${isActive('/exhibition') ? 'text-white' : 'text-gray-400 hover:text-white'}`}
                >
                    Editor
                </Link>
                <Link 
                    to="/dashboard/assets" 
                    className={`transition-colors ${isActive('/dashboard') ? 'text-white' : 'text-gray-400 hover:text-white'}`}
                >
                    Assets
                </Link>
            </nav>
        </div>
        
        <div className="flex items-center gap-4">
            {user?.email && (
                <span className="text-xs text-gray-500 hidden sm:inline-block">
                    {user.email}
                </span>
            )}
            <Button 
                variant="ghost" 
                size="sm" 
                onClick={handleLogout}
                className="text-gray-400 hover:text-white hover:bg-zinc-800"
            >
                <LogOut className="h-4 w-4 mr-2" />
                Logout
            </Button>
        </div>
      </header>
      
      <div className="flex-1 relative overflow-hidden">
         <UploadDropzone
            disabled={!isPlanningMode} // Disable upload in FP mode
            onUploadStart={() => console.log('Upload started')}
            onUploadComplete={onUploadComplete}
            onUploadError={(err) => alert(`Upload error: ${err}`)}
         >
            <Outlet />
         
            {/* Show Asset Sidebar in Planning Mode if not already placing an asset (optional logic, but good for now) */}
            {isPlanningMode && <AssetSidebar />}
         </UploadDropzone>

         {uploadedAsset && isPlanningMode && (
             <MetadataDialog 
                asset={uploadedAsset}
                onSave={onMetadataSaved}
                onCancel={() => { setUploadedAsset(null); setDialogOpen(false); }}
             />
         )}
         
         {!isPlanningMode && (
             <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-white bg-black/60 px-4 py-2 rounded-lg pointer-events-none backdrop-blur-sm text-sm">
                 First Person Preview (Press ESC to exit)
             </div>
         )}
      </div>
    </div>
  );
};
