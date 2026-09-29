import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
    FRAME_FINISHES,
    FRAME_LINES,
    FRAME_MANUFACTURER_LABELS,
    FRAME_PROFILES,
    MAX_PASSEPARTOUT_WIDTH_CM,
    PASSEPARTOUT_PLACEMENTS,
    PROFILE_FINISHES,
    frameLineOf,
    frameStyle as frameStyleSpec,
    framedArtworkLayout,
    profileFitsFormat,
    styleForProfile,
    styleIdOf,
    type FrameFinishId,
    type FrameProfileId,
    type FrameStyleId,
    type PassepartoutPlacement,
} from '@/lib/frameStyles';
import type { PassepartoutValue } from '@/lib/passepartout';
import { NumericInput } from './NumericInput';

const formatCm = (value: number) => value.toLocaleString('de-DE', { maximumFractionDigits: 1 });
const formatMm = (value: number) => value.toLocaleString('de-DE', { maximumFractionDigits: 1 });

/** CSS swatch of a finish: the grain's light-to-dark range for wood, a sheen on metal, flat lacquer. */
function finishSwatch(id: FrameFinishId): string {
    const surface = FRAME_FINISHES[id].surface;
    if (surface.kind === 'wood') {
        return `repeating-linear-gradient(100deg, ${surface.light} 0 3px, ${surface.dark} 3px 4px, ${surface.light} 4px 6px)`;
    }
    if (surface.kind === 'lacquer') return surface.color;
    return `linear-gradient(135deg, #ffffff66 0%, transparent 45%), ${surface.color}`;
}

export interface FrameControlsProps {
    frameStyle: FrameStyleId;
    onFrameToggle: (framed: boolean) => void;
    onFrameStyleChange: (frameStyle: FrameStyleId) => void;
    passepartout: PassepartoutValue;
    onPassepartoutToggle: (on: boolean) => void;
    onPassepartoutChange: (passepartout: PassepartoutValue) => void;
    /** Current picture size in cm (the frame opening without passepartout). */
    pictureCm: { w: number; h: number };
}

const selectClass = "w-full h-8 text-xs bg-zinc-900 border border-zinc-700 text-zinc-100 rounded-md px-2 focus:outline-none focus:ring-1 focus:ring-blue-500";
const toggleClass = (active: boolean) => cn("flex-1 h-8 text-xs", active ? "bg-blue-600 hover:bg-blue-500 text-white" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700");

/** Frame profile and colour (the HALBE and Max Aab ranges) plus the passepartout of a picture. */
export const FrameControls = ({
    frameStyle, onFrameToggle, onFrameStyleChange, passepartout, onPassepartoutToggle, onPassepartoutChange, pictureCm,
}: FrameControlsProps) => {
    const style = frameStyleSpec(frameStyle);
    const hasPassepartout = !!style && passepartout.width > 0;
    // Last colour picked per maker and material (see frameLineOf), so switching
    // Alu → Holz → Alu comes back to it.
    const lastFinish = useRef<Partial<Record<string, FrameFinishId>>>({});
    const pickStyle = (id: FrameStyleId) => {
        const next = frameStyleSpec(id);
        if (next) lastFinish.current[frameLineOf(next.finish)] = next.finish.id;
        onFrameStyleChange(id);
    };
    const pickProfile = (profile: FrameProfileId) => {
        const spec = FRAME_PROFILES[profile];
        const line = frameLineOf(spec);
        if (style) lastFinish.current[frameLineOf(style.finish)] = style.finish.id;
        // Same maker and material: keep the colour where it exists. Other material: the colour
        // last used there. Other maker: the closest-looking colour (see styleForProfile).
        const otherMaker = !!style && style.profile.manufacturer !== spec.manufacturer;
        const preferred = style && frameLineOf(style.finish) === line
            ? style.finish.id
            : lastFinish.current[line] ?? (otherMaker ? style.finish.id : null);
        pickStyle(styleForProfile(profile, preferred));
    };
    const layout = framedArtworkLayout({
        width: pictureCm.w / 100,
        height: pictureCm.h / 100,
        frameStyle,
        passepartoutWidth: passepartout.width,
        passepartoutPlacement: passepartout.placement,
    });
    const outerW = (layout.right - layout.left) * 100;
    const outerH = (layout.top - layout.bottom) * 100;
    const openingW = layout.openingWidth * 100;
    const openingH = layout.openingHeight * 100;
    const formats = style?.profile.formats;
    const outsideFormats = !!style && !!formats && !profileFitsFormat(style.profile, openingW, openingH);

    return (
        <>
            <div className="space-y-2">
                <Label className="text-xs text-zinc-400 uppercase tracking-wider">Rahmen</Label>
                <div className="flex gap-1">
                    <Button variant="secondary" size="sm" onClick={() => onFrameToggle(true)} className={toggleClass(!!style)}>Gerahmt</Button>
                    <Button variant="secondary" size="sm" onClick={() => onFrameToggle(false)} className={toggleClass(!style)}>Ohne Rahmen</Button>
                </div>
                {style ? (
                    <>
                        <div className="space-y-1">
                            <Label className="text-[10px] text-zinc-500 uppercase">Profil</Label>
                            <select
                                value={style.profile.id}
                                onChange={(e) => pickProfile(e.target.value as FrameProfileId)}
                                className={selectClass}
                            >
                                {FRAME_LINES.map((line) => (
                                    <optgroup key={line.key} label={line.label}>
                                        {line.profiles.map((profile) => (
                                            <option key={profile.id} value={profile.id}>
                                                {profile.label} · {formatMm(profile.width)} × {formatMm(profile.depth)} mm
                                            </option>
                                        ))}
                                    </optgroup>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-1">
                            <div className="flex items-baseline justify-between">
                                <Label className="text-[10px] text-zinc-500 uppercase">Farbe</Label>
                                <span className="text-[11px] text-zinc-300">{style.finish.label}</span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                {PROFILE_FINISHES[style.profile.id].map((finish) => (
                                    <button
                                        key={finish}
                                        type="button"
                                        title={FRAME_FINISHES[finish].label}
                                        aria-label={FRAME_FINISHES[finish].label}
                                        aria-pressed={finish === style.finish.id}
                                        onClick={() => pickStyle(styleIdOf(style.profile.id, finish))}
                                        className={cn(
                                            "h-6 w-6 rounded-full border border-zinc-600 transition-shadow",
                                            finish === style.finish.id ? "ring-2 ring-blue-500 ring-offset-2 ring-offset-zinc-950" : "hover:ring-1 hover:ring-zinc-400",
                                        )}
                                        style={{ background: finishSwatch(finish) }}
                                    />
                                ))}
                            </div>
                        </div>
                        <p className="text-[10px] text-zinc-500">
                            Aufsichtsmaß {formatMm(style.profile.width)} mm, Profiltiefe {formatMm(style.profile.depth)} mm
                            {style.profile.objectDepth
                                ? `, ${formatMm(style.profile.objectDepth)} mm Raum zwischen Glas und Rückwand mit weißer Innenleiste`
                                : ''}
                        </p>
                        {outsideFormats && formats && (
                            <p className="text-[10px] text-amber-400">
                                {FRAME_MANUFACTURER_LABELS[style.profile.manufacturer]} fertigt {style.profile.label} für Bildmaße
                                von {formatCm(formats.min[0])} × {formatCm(formats.min[1])} bis {formatCm(formats.max[0])} × {formatCm(formats.max[1])} cm
                                {' '}— hier sind es {formatCm(openingW)} × {formatCm(openingH)} cm.
                            </p>
                        )}
                    </>
                ) : (
                    <p className="text-[10px] text-zinc-500 italic">Werk hängt ungerahmt an der Wand.</p>
                )}
            </div>
            {style && (
                <div className="space-y-2">
                    <Label className="text-xs text-zinc-400 uppercase tracking-wider">Passepartout</Label>
                    <div className="flex gap-1">
                        <Button variant="secondary" size="sm" onClick={() => onPassepartoutToggle(false)} className={toggleClass(!hasPassepartout)}>Ohne</Button>
                        <Button variant="secondary" size="sm" onClick={() => onPassepartoutToggle(true)} className={toggleClass(hasPassepartout)}>Mit Passepartout</Button>
                    </div>
                    {hasPassepartout && (
                        <>
                            <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                    <Label className="text-[10px] text-zinc-500 uppercase">Breite (cm)</Label>
                                    <NumericInput
                                        step="0.5"
                                        min="0.5"
                                        max={String(MAX_PASSEPARTOUT_WIDTH_CM)}
                                        value={passepartout.width}
                                        onChange={(raw) => {
                                            const width = parseFloat(raw.replace(',', '.'));
                                            if (!isNaN(width) && width > 0) onPassepartoutChange({ ...passepartout, width });
                                        }}
                                        className="h-8 text-xs bg-zinc-900 border-zinc-700 text-zinc-100"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-[10px] text-zinc-500 uppercase">Platzierung</Label>
                                    <select
                                        value={passepartout.placement}
                                        onChange={(e) => onPassepartoutChange({ ...passepartout, placement: e.target.value as PassepartoutPlacement })}
                                        className={selectClass}
                                    >
                                        {PASSEPARTOUT_PLACEMENTS.map((placement) => (
                                            <option key={placement.id} value={placement.id}>{placement.label}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <p className="text-[10px] text-zinc-500">
                                Weiß, 1,5 mm Museumskarton mit Schrägschnitt. Ränder oben {formatCm((layout.passepartout?.top ?? 0) * 100)} cm, unten {formatCm((layout.passepartout?.bottom ?? 0) * 100)} cm.
                            </p>
                        </>
                    )}
                    <p className="text-[11px] text-zinc-300">
                        Außenmaß {formatCm(outerW)} × {formatCm(outerH)} cm
                    </p>
                </div>
            )}
        </>
    );
};
