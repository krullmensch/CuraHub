import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface SidebarTabsProps<T extends string> {
    tabs: readonly { value: T; label: string }[];
    value: T;
    onChange: (value: T) => void;
    collapseIcon: ReactNode;
    onCollapse: () => void;
    collapseLabel?: string;
    className?: string;
}

/** Blue 32 px tab header shared by the left and right sidebar. */
export function SidebarTabs<T extends string>({
    tabs,
    value,
    onChange,
    collapseIcon,
    onCollapse,
    collapseLabel,
    className,
}: SidebarTabsProps<T>) {
    return (
        <div className={cn('flex h-8 shrink-0 items-center border-b border-zinc-800 bg-blue-600', className)}>
            {tabs.map((tab) => (
                <button
                    key={tab.value}
                    type="button"
                    onClick={() => onChange(tab.value)}
                    className={cn(
                        'h-full flex-1 text-xs font-medium transition-colors',
                        value === tab.value
                            ? 'bg-white/15 text-white'
                            : 'text-white/60 hover:bg-white/5 hover:text-white',
                    )}
                >
                    {tab.label}
                </button>
            ))}
            <Button
                variant="ghost"
                size="icon"
                aria-label={collapseLabel}
                className="mx-1 h-6 w-6 shrink-0 text-white/60 hover:bg-white/10 hover:text-white"
                onClick={onCollapse}
            >
                {collapseIcon}
            </Button>
        </div>
    );
}
