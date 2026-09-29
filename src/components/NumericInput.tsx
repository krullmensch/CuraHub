import { useState, type InputHTMLAttributes } from 'react';
import { Input } from '@/components/ui/input';

// Numeric input that holds local string state while focused, only committing on blur/Enter.
// This prevents React from snapping the value back mid-edit (e.g. after typing "-" or "1.").
export interface NumericInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
    value: string | number;
    onChange: (raw: string) => void;
    className?: string;
}

export const NumericInput = ({ value, onChange, className, ...props }: NumericInputProps) => {
    const [local, setLocal] = useState(String(value));
    const [focused, setFocused] = useState(false);
    const [syncedValue, setSyncedValue] = useState(value);

    // Sync from outside only when not focused (state adjusted during render instead of in an effect)
    if (!focused && !Object.is(value, syncedValue)) {
        setSyncedValue(value);
        setLocal(String(value));
    }

    return (
        <Input
            {...props}
            type="number"
            value={local}
            className={className}
            onFocus={() => setFocused(true)}
            onChange={(e) => setLocal(e.target.value)}
            onBlur={() => {
                setFocused(false);
                onChange(local);
                // Reset to external value if input is invalid
                const n = parseFloat(local);
                if (isNaN(n)) setLocal(String(value));
            }}
            onKeyDown={(e) => {
                if (e.key === 'Enter') {
                    (e.target as HTMLInputElement).blur();
                }
            }}
        />
    );
};
