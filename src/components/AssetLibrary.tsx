import { useState, useEffect } from 'react';
import { UploadDropzone } from './UploadDropzone';
import { Card, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from '@/hooks/use-toast';
import { Trash2, FileIcon, Loader2, Edit, CloudUpload } from 'lucide-react';
import { MetadataDialog } from './MetadataDialog';

interface Asset {
  id: number;
  filename: string;
  path: string;
  mimetype: string;
  size: number;
  width: number;
  height: number;
  dpi: number;
  createdAt: string;
  artwork?: { // Updated interface to match MetadataDialog expectations
      id: number; 
      title: string;
      artist?: string;
      year?: string;
      description?: string;
      width?: number;
      height?: number;
  } | null;
  metadata?: {
      widthCm?: number;
      heightCm?: number;
      projectId?: string;
  };
}

export const AssetLibrary = () => {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [assetsToDelete, setAssetsToDelete] = useState<number[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  
  const { toast } = useToast();

  const fetchAssets = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/assets');
      if (!res.ok) throw new Error('Failed to fetch assets');
      const data = await res.json();
      setAssets(data);
    } catch (err) {
      toast({
          variant: "destructive",
          title: "Error",
          description: "Could not load assets.",
      });
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAssets();
  }, []);

  const confirmDelete = async () => {
      if (assetsToDelete.length === 0) return;
      
      try {
          // Execute all deletes in parallel
          const deletePromises = assetsToDelete.map(id => 
              fetch(`/api/assets/${id}`, { method: 'DELETE' })
                  .then(async res => {
                      if (!res.ok) throw new Error(`Failed to delete asset ${id}`);
                      return id;
                  })
          );

          const results = await Promise.allSettled(deletePromises);
          
          const successfulIds = results
              .filter(r => r.status === 'fulfilled')
              .map(r => (r as PromiseFulfilledResult<number>).value);
              
          const failedCount = results.filter(r => r.status === 'rejected').length;

          setAssets(prev => prev.filter(a => !successfulIds.includes(a.id)));
          setSelectedIds(prev => prev.filter(id => !successfulIds.includes(id)));

          if (failedCount === 0) {
              toast({
                  title: "Assets deleted",
                  description: `${successfulIds.length} file(s) permanently removed.`,
              });
          } else {
             toast({
                  variant: "destructive",
                  title: "Deletion Warning",
                  description: `Deleted ${successfulIds.length} files. Failed to delete ${failedCount} files.`,
             });
          }
      } catch (err) {
          toast({
              variant: "destructive",
              title: "Error",
              description: "Failed to delete assets.",
          });
          console.error(err);
      } finally {
          setAssetsToDelete([]);
      }
  };

  const toggleSelect = (id: number, e: React.SyntheticEvent) => {
      e.stopPropagation();
      setSelectedIds(prev => 
          prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
      );
  };

  const handleSelectAll = () => {
      if (selectedIds.length === assets.length) {
          setSelectedIds([]);
      } else {
          setSelectedIds(assets.map(a => a.id));
      }
  };

  const handleUploadComplete = (newAsset: any) => {
      console.log("DEBUG: handleUploadComplete called with:", newAsset);
      setAssets(prev => [newAsset, ...prev]);
      toast({
          title: "Upload complete",
          description: `${newAsset.filename} has been added to your library.`,
      });
  };

  const handleMetadataSaved = () => {
      setSelectedAsset(null);
      fetchAssets(); // Refresh list to show new title
      toast({
          title: "Saved",
          description: "Artwork metadata updated successfully.",
      });
  };

  const formatBytes = (bytes: number) => {
      if (bytes === 0) return '0 Bytes';
      const k = 1024;
      const sizes = ['Bytes', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  if (loading && assets.length === 0) {
      return <div className="flex h-full items-center justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <UploadDropzone
        onUploadComplete={handleUploadComplete}
        onUploadError={(msg) => toast({ variant: "destructive", title: "Upload Failed", description: msg })}
        className="h-full w-full flex flex-col bg-zinc-950"
    >

        <div className="flex-1 overflow-auto p-6 space-y-6 pb-20">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-white mb-2">Asset Library</h2>
                    <p className="text-gray-400">Manage your uploaded files and artworks. Click an image to edit details.</p>
                </div>
                {selectedIds.length > 0 && (
                    <div className="flex items-center gap-2 bg-blue-900/30 px-4 py-2 rounded-lg border border-blue-800">
                        <span className="text-sm font-medium text-blue-100">{selectedIds.length} selected</span>
                        <Button 
                            variant="destructive" 
                            size="sm" 
                            onClick={() => setAssetsToDelete(selectedIds)}
                        >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete Selected
                        </Button>
                        <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => setSelectedIds([])}
                            className="text-blue-200 hover:text-white hover:bg-blue-800/50"
                        >
                            Cancel
                        </Button>
                    </div>
                )}
            </div>
            
            <div className="flex justify-end mb-2">
                {assets.length > 0 && (
                    <Button variant="ghost" size="sm" onClick={handleSelectAll} className="text-zinc-400 hover:text-white">
                        {selectedIds.length === assets.length ? 'Deselect All' : 'Select All'}
                    </Button>
                )}
            </div>

            {assets.length === 0 ? (
                <div className="text-center py-20 text-gray-500 border-2 border-dashed border-zinc-800 rounded-xl">
                    <FileIcon className="mx-auto h-16 w-16 opacity-20 mb-4" />
                    <h3 className="text-lg font-medium text-gray-400 mb-2">No assets yet</h3>
                    <p>Drag and drop images anywhere on the screen to upload.</p>
                </div>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                    {assets.map(asset => {
                        const isSelected = selectedIds.includes(asset.id);
                        return (
                        <Card 
                            key={asset.id} 
                            className={`bg-zinc-950 overflow-hidden group transition-all cursor-pointer relative ${isSelected ? 'border-blue-500 ring-1 ring-blue-500 bg-blue-900/10' : 'border-zinc-800 hover:border-zinc-700'}`}
                            onClick={(e) => toggleSelect(asset.id, e)}
                        >
                            <div className="aspect-square relative flex items-center justify-center bg-black/40 p-2">
                                {asset.mimetype.startsWith('image/') ? (
                                    <img 
                                        src={asset.path} 
                                        alt={asset.filename}
                                        className={`max-h-full max-w-full object-contain transition-opacity ${isSelected ? 'opacity-90' : 'opacity-100'}`}
                                    />
                                ) : (
                                    <FileIcon className="h-12 w-12 text-gray-600" />
                                )}
                                
                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                    <Button 
                                        size="icon" 
                                        variant="secondary" 
                                        className="h-8 w-8"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedAsset(asset);
                                        }}
                                    >
                                        <Edit className="h-4 w-4" />
                                    </Button>
                                    <Button 
                                        size="icon" 
                                        variant="destructive" 
                                        className="h-8 w-8"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setAssetsToDelete([asset.id]);
                                        }}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                            
                            <CardFooter className="p-3 flex flex-col items-start gap-1">
                                <p className="text-xs font-medium text-gray-200 truncate w-full" title={asset.artwork?.title || asset.filename}>
                                    {asset.artwork?.title || asset.filename}
                                </p>
                                <div className="flex justify-between w-full text-[10px] text-gray-500">
                                    <span>{formatBytes(asset.size)}</span>
                                    <span>{asset.width}x{asset.height} px</span>
                                </div>
                            </CardFooter>
                        </Card>
                    )})}
                </div>
            )}

            {/* Hint Element */}
            <div className="fixed bottom-6 right-6 bg-zinc-900/90 backdrop-blur-sm text-white px-4 py-2.5 rounded-full border border-zinc-700 shadow-xl z-40 pointer-events-none text-sm font-medium flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4 duration-500">
                 <div className="bg-blue-600 rounded-full p-1">
                    <CloudUpload className="w-3 h-3 text-white" />
                 </div>
                 Drag & drop images anywhere to upload
            </div>

            {/* Delete Confirmation Dialog */}
            <Dialog open={assetsToDelete.length > 0} onOpenChange={(open) => !open && setAssetsToDelete([])}>
                <DialogContent>
                <DialogHeader>
                    <DialogTitle>Delete {assetsToDelete.length > 1 ? `${assetsToDelete.length} Assets` : 'Asset'}</DialogTitle>
                    <DialogDescription>
                    Are you sure you want to delete {assetsToDelete.length > 1 ? 'these assets' : 'this asset'}? This action cannot be undone and will remove the {assetsToDelete.length > 1 ? 'files' : 'file'} permanently.
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setAssetsToDelete([])}>Cancel</Button>
                    <Button variant="destructive" onClick={confirmDelete}>Delete</Button>
                </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Metadata Edit Dialog */}
            {selectedAsset && (
                <MetadataDialog 
                    asset={selectedAsset}
                    onSave={handleMetadataSaved}
                    onCancel={() => setSelectedAsset(null)}
                />
            )}
        </div>
    </UploadDropzone>
  );
};
