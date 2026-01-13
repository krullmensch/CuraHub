import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronRight, ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ControlsSidebarProps {
    isOpen: boolean;
    onToggle: () => void;
}

export const ControlsSidebar = ({ isOpen, onToggle }: ControlsSidebarProps) => {
    return (
        <>
            <Card 
                className={cn(
                    "absolute right-4 top-6 bottom-8 w-64 bg-zinc-950/80 backdrop-blur-md border-zinc-800 shadow-xl flex flex-col z-20 rounded-xl overflow-hidden transition-transform duration-300 ease-in-out",
                    !isOpen && "translate-x-[calc(100%+2rem)]" // Slide completely off screen including margin
                )}
            >
                <CardHeader className="p-4 border-b border-zinc-800 bg-zinc-900/50 flex flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-sm font-medium text-zinc-100">Controls</CardTitle>
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-6 w-6 text-zinc-400 hover:text-white"
                        onClick={onToggle}
                    >
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </CardHeader>
                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                    <div className="text-zinc-500 text-xs text-center mt-10">
                        Controls coming soon...
                    </div>
                </div>
            </Card>

            {/* Toggle Button (Visible when closed) */}
            <div 
                className={cn(
                    "absolute right-0 top-1/2 -translate-y-1/2 z-10 transition-transform duration-300 ease-in-out",
                    isOpen && "translate-x-full" // Hide when open
                )}
            >
                <Button
                    variant="secondary"
                    size="sm"
                    className="h-12 w-6 rounded-l-lg rounded-r-none bg-zinc-900 border-y border-l border-zinc-700 shadow-md p-0 flex items-center justify-center hover:bg-zinc-800"
                    onClick={onToggle}
                >
                    <ChevronLeft className="h-4 w-4 text-zinc-400" />
                </Button>
            </div>
        </>
    );
};
