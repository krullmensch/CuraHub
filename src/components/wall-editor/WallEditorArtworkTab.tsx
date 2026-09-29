import { useState } from 'react';
import { Link, Unlink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useEditorStore, type MediumType } from '@/store/editorStore';
import { FrameControls } from '@/components/properties/FrameControls';
import { DEFAULT_FRAME_STYLE, DEFAULT_PASSEPARTOUT_WIDTH_CM, frameStyleOf } from '@/lib/frameStyles';
import { passepartoutOf } from '@/lib/passepartout';
import { pictureSize } from '@/lib/wallEditor/footprint';
import { SCALE_STEP } from '@/lib/wallEditor/scale';
import { isPicture, isScalable, type WallFace } from '@/lib/wallEditor/wallArtworks';
import {
    scaleSelection,
    setSelectionFrameStyle,
    setSelectionMedium,
    setSelectionPassepartout,
    setSelectionPictureSize,
} from '@/lib/wallEditor/operations';
import { CmInput, Section } from './PanelPrimitives';

const VIDEO_MEDIA: { value: MediumType; label: string }[] = [
    { value: 'monitor', label: 'Monitor' },
    { value: 'beamer', label: 'Beamer' },
];

const secondaryButton = 'h-8 text-[11px] bg-zinc-800 text-zinc-200 hover:bg-zinc-700';

/** "Werk" tab of the wall editor panel: size, frame and passepartout of the selected artworks. */
export const WallEditorArtworkTab = ({ face }: { face: WallFace }) => {
    const selection = useEditorStore((s) => s.wallEditorSelection);
    const [aspectLocked, setAspectLocked] = useState(true);

    const selected = face.items.filter((i) => selection.includes(i.id));
    if (selected.length === 0) {
        return <p className="text-xs text-zinc-500">Wähle ein Werk aus, um Größe, Rahmen und Passepartout zu ändern.</p>;
    }

    const single = selected.length === 1 ? selected[0] : null;
    const pictures = selected.filter((i) => isPicture(i.inst));
    const scalableCount = selected.filter((i) => isScalable(i.inst)).length;
    const firstPicture = pictures[0] ?? null;
    const mixedFrames = new Set(pictures.map((i) => frameStyleOf(i.inst.frameStyle))).size > 1;
    const mixedPassepartouts = new Set(pictures.map((i) => {
        const p = passepartoutOf(i.inst);
        return `${p.width}|${p.placement}`;
    })).size > 1;
    const isVideo = single?.inst.artwork.asset.type === 'video';
    const isMonitor = !!single && isVideo && !isScalable(single.inst);
    const isBeamer = single?.inst.medium === 'beamer';
    const size = single ? pictureSize(single.inst) : null;
    const firstPictureSize = firstPicture ? pictureSize(firstPicture.inst) : null;

    const toggleFrame = (framed: boolean) => {
        if (!framed) {
            setSelectionFrameStyle('none');
            return;
        }
        const current = firstPicture ? frameStyleOf(firstPicture.inst.frameStyle) : 'none';
        const remembered = useEditorStore.getState().defaultFrameStyle;
        setSelectionFrameStyle(current !== 'none' ? current : remembered !== 'none' ? remembered : DEFAULT_FRAME_STYLE);
    };

    const togglePassepartout = (on: boolean) => {
        const current = firstPicture ? passepartoutOf(firstPicture.inst) : null;
        const remembered = useEditorStore.getState().defaultPassepartout.width;
        const width = !on ? 0 : current && current.width > 0 ? current.width : remembered > 0 ? remembered : DEFAULT_PASSEPARTOUT_WIDTH_CM;
        setSelectionPassepartout({ width, placement: current?.placement ?? 'center' });
    };

    return (
        <div className="space-y-5">
            {single ? (
                <div className="rounded-md bg-zinc-900 border border-zinc-800 p-2.5 space-y-0.5">
                    <div className="text-sm text-zinc-100 font-medium truncate" title={single.label}>{single.label}</div>
                    {(single.inst.artwork.artist || single.inst.artwork.year) && (
                        <div className="text-[11px] text-zinc-400 truncate">
                            {[single.inst.artwork.artist, single.inst.artwork.year].filter(Boolean).join(', ')}
                        </div>
                    )}
                </div>
            ) : (
                <div className="rounded-md bg-zinc-900 border border-zinc-800 p-2.5 space-y-0.5">
                    <div className="text-sm text-zinc-100 font-medium">{selected.length} Werke</div>
                    {pictures.length > 0 && pictures.length < selected.length && (
                        <div className="text-[11px] text-zinc-500">
                            Rahmen und Passepartout gelten für {pictures.length === 1 ? 'das Bild' : `${pictures.length} Bilder`} der Auswahl.
                        </div>
                    )}
                </div>
            )}

            {single && isVideo && (
                <Section title="Wiedergabe">
                    <select
                        value={isBeamer ? 'beamer' : 'monitor'}
                        onChange={(e) => setSelectionMedium(e.target.value as MediumType)}
                        className="w-full h-8 text-xs bg-zinc-900 border border-zinc-700 text-zinc-100 rounded-md px-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                        {VIDEO_MEDIA.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                </Section>
            )}

            <Section
                title="Größe"
                aside={single && !isMonitor && !isBeamer ? (
                    <button
                        type="button"
                        onClick={() => setAspectLocked((v) => !v)}
                        title={aspectLocked ? 'Seitenverhältnis lösen' : 'Seitenverhältnis festhalten'}
                        aria-label={aspectLocked ? 'Seitenverhältnis lösen' : 'Seitenverhältnis festhalten'}
                        aria-pressed={aspectLocked}
                        className="h-6 w-6 flex items-center justify-center rounded text-zinc-400 hover:text-white hover:bg-zinc-800"
                    >
                        {aspectLocked ? <Link className="h-3.5 w-3.5" /> : <Unlink className="h-3.5 w-3.5" />}
                    </button>
                ) : undefined}
            >
                {isMonitor ? (
                    <p className="text-xs text-zinc-500">Der Monitor hat eine feste Größe.</p>
                ) : (
                    <>
                        {single && size && (
                            <div className="grid grid-cols-2 gap-2">
                                <CmInput label="Breite" value={size.w} onCommit={(m) => setSelectionPictureSize('w', m, aspectLocked)} />
                                <CmInput label="Höhe" value={size.h} onCommit={(m) => setSelectionPictureSize('h', m, aspectLocked)} />
                            </div>
                        )}
                        <div className="grid grid-cols-2 gap-2">
                            <Button variant="secondary" size="sm" disabled={scalableCount === 0} onClick={() => scaleSelection(1 - SCALE_STEP)} className={secondaryButton}>
                                −5 %
                            </Button>
                            <Button variant="secondary" size="sm" disabled={scalableCount === 0} onClick={() => scaleSelection(1 + SCALE_STEP)} className={secondaryButton}>
                                +5 %
                            </Button>
                        </div>
                        <p className="text-[10px] text-zinc-500 leading-relaxed">
                            {single ? 'Bildmaß ohne Rahmen. ' : ''}Skaliert wird immer um die Bildmitte. Frei skalieren: S drücken oder an einer Ecke der Auswahl ziehen.
                        </p>
                    </>
                )}
            </Section>

            {firstPicture && firstPictureSize && (
                <>
                    <Separator className="bg-zinc-800" />
                    {(mixedFrames || mixedPassepartouts) && (
                        <p className="text-[10px] text-amber-400 leading-relaxed">
                            {mixedFrames ? 'Rahmen: Gemischt. ' : ''}{mixedPassepartouts ? 'Passepartout: Gemischt. ' : ''}Eine Änderung gilt für alle Bilder der Auswahl.
                        </p>
                    )}
                    <FrameControls
                        frameStyle={frameStyleOf(firstPicture.inst.frameStyle)}
                        onFrameToggle={toggleFrame}
                        onFrameStyleChange={setSelectionFrameStyle}
                        passepartout={passepartoutOf(firstPicture.inst)}
                        onPassepartoutToggle={togglePassepartout}
                        onPassepartoutChange={setSelectionPassepartout}
                        pictureCm={{ w: firstPictureSize.w * 100, h: firstPictureSize.h * 100 }}
                    />
                </>
            )}
        </div>
    );
};
