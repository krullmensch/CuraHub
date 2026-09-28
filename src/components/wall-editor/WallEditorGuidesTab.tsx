import { useState, type ReactNode } from 'react';
import { ArrowLeftRight, Eye, EyeOff, Lock, Plus, Trash2, Unlock } from 'lucide-react';
import { gooeyToast } from 'goey-toast';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useEditorStore } from '@/store/editorStore';
import { EMPTY_GUIDES, useWallEditorView } from '@/store/wallEditorViewStore';
import { roundMm } from '@/lib/wallEditor/format';
import { MAX_GUIDES_PER_FACE, clampGuideValue, flipGuide, hasGuideAt, newGuideValue, sortGuides, type GuideAxis } from '@/lib/wallEditor/guides';
import type { WallFace } from '@/lib/wallEditor/wallArtworks';
import { CmInput, Section } from './PanelPrimitives';

const AXIS_LABEL: Record<GuideAxis, string> = {
    h: 'Waagrechte Hilfslinie, Höhe über Boden',
    v: 'Senkrechte Hilfslinie, Abstand von der linken Kante',
};

const SmallButton = ({ label, onClick, active, disabled, children }: {
    label: string;
    onClick: () => void;
    active?: boolean;
    disabled?: boolean;
    children: ReactNode;
}) => (
    <button
        type="button"
        title={label}
        aria-label={label}
        aria-pressed={active}
        disabled={disabled}
        onClick={onClick}
        className={cn(
            'h-7 w-7 shrink-0 flex items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors',
            active && 'bg-zinc-800 text-white',
        )}
    >
        {children}
    </button>
);

const addButton = 'h-8 text-[11px] bg-zinc-800 text-zinc-200 hover:bg-zinc-700 gap-1 px-2';

/** "Linien" tab of the wall editor panel: the open face's ruler guides as an editable list. */
export const WallEditorGuidesTab = ({ face }: { face: WallFace }) => {
    const guides = useWallEditorView((s) => s.guidesByFace[face.key] ?? EMPTY_GUIDES);
    const hidden = useWallEditorView((s) => s.guidesHidden);
    const locked = useWallEditorView((s) => s.guidesLocked);
    const hoverId = useWallEditorView((s) => s.hoverGuideId);
    // The field of a guide added from here gets the focus, so its value can be typed right away.
    const [focusId, setFocusId] = useState<number | null>(null);
    const wall = face.wallRect;
    const store = useWallEditorView.getState;

    const guideLimitToast = () => gooeyToast.error(`Höchstens ${MAX_GUIDES_PER_FACE} Hilfslinien pro Wandseite`);

    const add = (axis: GuideAxis) => {
        const s = store();
        const id = s.addGuide(face.key, axis, newGuideValue(axis, { u: s.centerU, v: s.centerV }, wall));
        if (id === null) { guideLimitToast(); return; }
        setFocusId(id);
    };
    const addWallCentre = () => {
        const value = roundMm(wall.w / 2);
        if (hasGuideAt(guides, 'v', value)) return;
        if (store().addGuide(face.key, 'v', value) === null) guideLimitToast();
    };
    const clearAll = () => {
        const removed = guides;
        const versionId = useEditorStore.getState().activeVersionId;
        store().setFaceGuides(face.key, []);
        gooeyToast.success(removed.length === 1 ? 'Hilfslinie gelöscht' : `${removed.length} Hilfslinien gelöscht`, {
            action: {
                label: 'Rückgängig',
                onClick: () => {
                    // The active version changed since (e.g. a new version was created) — don't restore into it.
                    if (useEditorStore.getState().activeVersionId !== versionId) return;
                    store().setFaceGuides(face.key, [...removed, ...(store().guidesByFace[face.key] ?? [])]);
                },
            },
        });
    };

    return (
        <div className="space-y-4">
            <Section
                title="Hilfslinien"
                aside={(
                    <div className="flex gap-0.5">
                        <SmallButton label={hidden ? 'Hilfslinien einblenden' : 'Hilfslinien ausblenden'} active={hidden} onClick={() => store().toggleGuidesHidden()}>
                            {hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </SmallButton>
                        <SmallButton label={locked ? 'Hilfslinien entsperren' : 'Hilfslinien sperren'} active={locked} onClick={() => store().toggleGuidesLocked()}>
                            {locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                        </SmallButton>
                        <SmallButton label="Alle Hilfslinien löschen" disabled={guides.length === 0} onClick={clearAll}>
                            <Trash2 className="h-3.5 w-3.5" />
                        </SmallButton>
                    </div>
                )}
            >
                <div className="grid grid-cols-3 gap-1.5">
                    <Button variant="secondary" size="sm" className={addButton} onClick={() => add('h')}>
                        <Plus className="h-3.5 w-3.5" /> Waagrecht
                    </Button>
                    <Button variant="secondary" size="sm" className={addButton} onClick={() => add('v')}>
                        <Plus className="h-3.5 w-3.5" /> Senkrecht
                    </Button>
                    <Button variant="secondary" size="sm" className={addButton} onClick={addWallCentre} title="Senkrechte Hilfslinie auf der Wandmitte">
                        Wandmitte
                    </Button>
                </div>

                {guides.length === 0 ? (
                    <p className="text-xs text-zinc-500">Aus dem Lineal ziehen oder hier anlegen.</p>
                ) : (
                    <ul className="space-y-0.5">
                        {sortGuides(guides).map((g) => (
                            <li
                                key={g.id}
                                onMouseEnter={() => store().setHoverGuide(g.id)}
                                onMouseLeave={() => store().setHoverGuide(null)}
                                className={cn('flex items-center gap-1 rounded-md px-1 py-0.5', hoverId === g.id && 'bg-zinc-800/70')}
                            >
                                <span className="w-5 shrink-0 text-center text-sm text-cyan-400 select-none" title={AXIS_LABEL[g.axis]} aria-hidden>
                                    {g.axis === 'h' ? '―' : '│'}
                                </span>
                                <div className="flex-1 min-w-0">
                                    <CmInput
                                        ariaLabel={AXIS_LABEL[g.axis]}
                                        value={g.value}
                                        autoFocus={g.id === focusId}
                                        onCommit={(m) => store().updateGuide(face.key, g.id, { value: clampGuideValue(g.axis, roundMm(m), wall) })}
                                    />
                                </div>
                                <SmallButton
                                    label="Richtung wechseln"
                                    onClick={() => {
                                        const flipped = flipGuide(g, wall);
                                        store().updateGuide(face.key, g.id, { axis: flipped.axis, value: flipped.value });
                                    }}
                                >
                                    <ArrowLeftRight className="h-3.5 w-3.5" />
                                </SmallButton>
                                <SmallButton label="Hilfslinie löschen" onClick={() => store().removeGuide(face.key, g.id)}>
                                    <Trash2 className="h-3.5 w-3.5" />
                                </SmallButton>
                            </li>
                        ))}
                    </ul>
                )}

                <p className="text-[10px] text-zinc-500 leading-relaxed">
                    Waagrechte Linien messen ab Boden, senkrechte ab der linken Wandkante. Werke rasten an Hilfslinien ein.
                </p>
                {hidden && <p className="text-[10px] text-zinc-400">Ausgeblendet: Linien werden nicht gezeichnet, Werke rasten nicht an ihnen ein.</p>}
                {locked && <p className="text-[10px] text-amber-400">Gesperrt: Hilfslinien und Hängelinie lassen sich im Canvas nicht verschieben.</p>}
            </Section>
        </div>
    );
};
