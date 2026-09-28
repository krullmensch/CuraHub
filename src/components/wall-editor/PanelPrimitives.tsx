import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cmInputValue, parseCm } from '@/lib/wallEditor/format';

// Building blocks of the wall editor panel tabs.

interface CmInputProps {
    /** Caption above the field; list rows pass `ariaLabel` instead. */
    label?: string;
    ariaLabel?: string;
    value: number | null;
    placeholder?: string;
    onCommit: (metres: number) => void;
    disabled?: boolean;
    title?: string;
    autoFocus?: boolean;
}

/** Centimetre input: edits locally, commits on Enter/blur, accepts "152,5". */
export const CmInput = ({ label, ariaLabel, value, placeholder, onCommit, disabled, title, autoFocus }: CmInputProps) => {
    const [text, setText] = useState(value === null ? '' : cmInputValue(value));
    const focused = useRef(false);
    const external = value === null ? '' : cmInputValue(value);

    useEffect(() => {
        if (!focused.current) setText(external); // eslint-disable-line react-hooks/set-state-in-effect
    }, [external]);

    const commit = () => {
        const parsed = parseCm(text);
        if (parsed === null || external === cmInputValue(parsed)) {
            setText(external);
            return;
        }
        onCommit(parsed);
    };

    const field = (
        <div className="relative">
            <input
                inputMode="decimal"
                aria-label={ariaLabel ?? label}
                value={text}
                placeholder={placeholder}
                disabled={disabled}
                autoFocus={autoFocus}
                onFocus={(e) => { focused.current = true; e.target.select(); }}
                onChange={(e) => setText(e.target.value)}
                onBlur={() => { focused.current = false; commit(); }}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    if (e.key === 'Escape') { setText(external); (e.target as HTMLInputElement).blur(); }
                }}
                className="w-full h-8 rounded-md bg-zinc-900 border border-zinc-700 pl-2 pr-7 text-xs text-zinc-100 tabular-nums outline-none focus:border-blue-500 disabled:opacity-40"
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-zinc-500 pointer-events-none">cm</span>
        </div>
    );

    if (!label) return <div title={title}>{field}</div>;
    return (
        <label className="block space-y-1" title={title}>
            <span className="block text-[10px] text-zinc-500">{label}</span>
            {field}
        </label>
    );
};

export const IconAction = ({ icon, label, onClick, disabled }: { icon: ReactNode; label: string; onClick: () => void; disabled?: boolean }) => (
    <button
        type="button"
        title={label}
        aria-label={label}
        disabled={disabled}
        onClick={onClick}
        className="h-8 flex-1 flex items-center justify-center rounded-md text-zinc-300 hover:bg-zinc-800 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors"
    >
        {icon}
    </button>
);

export const Section = ({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) => (
    <section className="space-y-2">
        <div className="flex items-center justify-between">
            <h3 className="text-xs text-zinc-400 uppercase tracking-wider">{title}</h3>
            {aside}
        </div>
        {children}
    </section>
);
