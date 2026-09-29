import { useState, type ReactNode } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface ToolbarPopoverButtonProps {
    icon: ReactNode;
    tooltip: string;
    /** Something inside is switched on — tinted even while closed. */
    active?: boolean;
    children: ReactNode;
}

/** Tool bar button that opens a popover above it (render settings, measures). */
export const ToolbarPopoverButton = ({ icon, tooltip, active, children }: ToolbarPopoverButtonProps) => {
    const [open, setOpen] = useState(false);
    const [hovered, setHovered] = useState(false);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <div style={{ position: 'relative' }}>
                <PopoverTrigger asChild>
                    <button
                        aria-label={tooltip}
                        onMouseEnter={() => setHovered(true)}
                        onMouseLeave={() => setHovered(false)}
                        style={{
                            width: 32,
                            height: 32,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: 8,
                            border: 'none',
                            background: open
                                ? 'rgba(59,130,246,0.7)'
                                : active
                                    ? 'rgba(59,130,246,0.35)'
                                    : hovered ? 'rgba(255,255,255,0.08)' : 'transparent',
                            color: open || active ? '#fff' : 'rgba(255,255,255,0.7)',
                            cursor: 'pointer',
                            transition: 'background 0.15s ease, color 0.15s ease',
                        }}
                    >
                        {icon}
                    </button>
                </PopoverTrigger>
                {hovered && !open && (
                    <div style={{
                        position: 'absolute',
                        bottom: 'calc(100% + 8px)',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        padding: '4px 10px',
                        borderRadius: 6,
                        background: 'rgba(0,0,0,0.92)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: '#fff',
                        fontSize: 11,
                        fontWeight: 500,
                        whiteSpace: 'nowrap',
                        pointerEvents: 'none',
                        fontFamily: '"Albert Sans", sans-serif',
                    }}>
                        {tooltip}
                    </div>
                )}
            </div>
            <PopoverContent
                side="top"
                align="end"
                sideOffset={12}
                className="w-auto rounded-xl border-white/10 bg-black/80 p-4 backdrop-blur-xl"
            >
                {children}
            </PopoverContent>
        </Popover>
    );
};
