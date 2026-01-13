import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { FileIcon, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Asset {
  id: number;
  filename: string;
  path: string;
  mimetype: string;
  width: number;
  height: number;
  artwork?: {
    title: string;
  } | null;
}

export const AssetSidebar = () => {
    const [assets, setAssets] = useState<Asset[]>([]);
    const [loading, setLoading] = useState(true);
    const { toast } = useToast();

    useEffect(() => {
        const fetchAssets = async () => {
            try {
                const res = await fetch('/api/assets');
                if (!res.ok) throw new Error('Failed to fetch assets');
                const data = await res.json();
                setAssets(data);
            } catch (err) {
                console.error(err);
                toast({
                    variant: "destructive",
                    title: "Error",
                    description: "Could not load assets.",
                });
            } finally {
                setLoading(false);
            }
        };
        fetchAssets();
    }, [toast]);

    const handleDragStart = (e: React.DragEvent, asset: Asset) => {
        e.dataTransfer.setData('asset-id', asset.id.toString());
        e.dataTransfer.setData('asset-data', JSON.stringify(asset));
        e.dataTransfer.effectAllowed = 'copy';
    };

    return (
        <Card className="absolute left-4 top-6 bottom-8 w-64 bg-zinc-950/80 backdrop-blur-md border-zinc-800 shadow-xl flex flex-col z-20 rounded-xl overflow-hidden">
            <CardHeader className="p-4 border-b border-zinc-800 bg-zinc-900/50">
                <CardTitle className="text-sm font-medium text-zinc-100">Asset Library</CardTitle>
            </CardHeader>
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                {loading ? (
                     <div className="flex h-full items-center justify-center">
                        <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
                     </div>
                ) : assets.length === 0 ? (
                    <div className="text-center py-8 text-zinc-500 text-xs">
                        No assets found. Upload some in the main library.
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-2">
                        {assets.map((asset) => (
                            <div 
                                key={asset.id}
                                draggable
                                onDragStart={(e) => handleDragStart(e, asset)}
                                className="group relative aspect-square bg-zinc-900 rounded-md overflow-hidden border border-zinc-800 cursor-grab active:cursor-grabbing hover:border-zinc-600 transition-colors"
                                title={asset.artwork?.title || asset.filename}
                            >
                                {asset.mimetype.startsWith('image/') ? (
                                    <img 
                                        src={asset.path} 
                                        alt={asset.filename} 
                                        className="w-full h-full object-cover"
                                        draggable={false} // Prevent browser native image drag, let the wrapper div handle it
                                    />
                                ) : (
                                    <div className="flex items-center justify-center h-full">
                                        <FileIcon className="h-6 w-6 text-zinc-600" />
                                    </div>
                                )}
                                <div className="absolute inset-x-0 bottom-0 bg-black/60 p-1 translate-y-full group-hover:translate-y-0 transition-transform">
                                    <p className="text-[10px] text-white truncate text-center">
                                        {asset.artwork?.title || asset.filename}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </Card>
    );
};
