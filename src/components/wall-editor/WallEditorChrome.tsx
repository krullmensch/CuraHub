import { useEffect, useState, type ReactNode } from 'react';
import {
    ArrowDownToLine,
    ArrowLeft,
    BetweenHorizontalStart,
    Check,
    ChevronDown,
    Eraser,
    Hand,
    Lock,
    Magnet,
    Minus,
    MousePointer2,
    Pencil,
    Plus,
    Ruler,
    RulerDimensionLine,
    Scan,
    SeparatorHorizontal,
    TriangleAlert,
    Unlock,
} from 'lucide-react';
import { gooeyToast } from 'goey-toast';
import { cn } from '@/lib/utils';
import { useEditorStore } from '@/store/editorStore';
import { useWallEditorView, type WallEditorTool } from '@/store/wallEditorViewStore';
import { useWallFace } from '@/hooks/use-wall-face';
import { formatCm } from '@/lib/wallEditor/format';
import { fitWallEditorView } from '@/lib/wallEditor/view';
import type { WallFace } from '@/lib/wallEditor/wallArtworks';
import { WALL_SIDE_LABELS, type WallSide } from '@/lib/wallEditor/geometry';
import { useFaceDirectory, type FaceEntry } from '@/hooks/use-face-directory';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { WallEditorOverlay } from './WallEditorOverlay';

/** CSS px per metre on a 96 dpi screen — for the "1:x" scale readout. */
const CSS_PX_PER_M = 96 / 0.0254;

const niceScale = (pxPerM: number) => {
    const ratio = CSS_PX_PER_M / pxPerM;
    if (ratio < 1) return `${Math.round(100 / ratio) / 100}:1`;
    return `1:${ratio >= 10 ? Math.round(ratio) : Math.round(ratio * 10) / 10}`;
};

interface ChromeButtonProps {
    icon: ReactNode;
    label: string;
    shortcut?: string;
    active?: boolean;
    disabled?: boolean;
    onClick: () => void;
    showLabel?: boolean;
    tone?: 'default' | 'primary';
}

const ChromeButton = ({ icon, label, shortcut, active, disabled, onClick, showLabel, tone = 'default' }: ChromeButtonProps) => (
    <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        title={shortcut ? `${label} (${shortcut})` : label}
        aria-label={label}
        aria-pressed={active}
        className={cn(
            'group relative h-8 min-w-8 px-2 flex items-center justify-center gap-1.5 rounded-lg text-xs font-medium transition-colors',
            tone === 'primary'
                ? 'bg-blue-600 text-white hover:bg-blue-500'
                : active
                    ? 'bg-blue-600/80 text-white'
                    : 'text-white/70 hover:bg-white/10 hover:text-white',
            disabled && 'opacity-30 pointer-events-none',
        )}
    >
        {icon}
        {showLabel && <span className="whitespace-nowrap">{label}</span>}
    </button>
);

const Separator = () => <div className="w-px h-5 bg-white/15 mx-1" />;

const barClass = 'flex items-center gap-0.5 p-1 rounded-xl border border-white/10 bg-black/60 backdrop-blur-md shadow-xl';

// ── Top bar ──────────────────────────────────────────────────────────────

const SIDE_TABS: { side: WallSide; short: string }[] = [
    { side: 'front', short: 'Vorne' },
    { side: 'back', short: 'Hinten' },
    { side: 'left', short: 'Links' },
    { side: 'right', short: 'Rechts' },
];

/** Dropdown to jump to any other wall (room walls and modular walls). */
const FaceSwitcher = ({ face }: { face: WallFace }) => {
    const entries = useFaceDirectory();
    const openWallEditor = useEditorStore((s) => s.openWallEditor);
    const currentKey = face.wall ? `wall:${face.wall.id}` : face.key;
    const title = face.wall ? (face.wall.label || 'Stellwand') : face.label;
    const groups: { group: FaceEntry['group']; title: string }[] = [
        { group: 'room', title: 'Raumwände' },
        { group: 'wall', title: 'Stellwände' },
    ];
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    className="h-8 px-2 flex items-center gap-1 rounded-lg text-sm font-semibold text-white hover:bg-white/10 transition-colors max-w-[14rem]"
                    title="Andere Wand öffnen"
                >
                    <span className="truncate">{title}</span>
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-white/60" />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-80 max-h-[60vh] overflow-y-auto bg-zinc-950 border-zinc-800 text-zinc-100 z-[60]">
                {groups.map(({ group, title: groupTitle }, gi) => {
                    const list = entries.filter((e) => e.group === group);
                    if (list.length === 0) return null;
                    return (
                        <div key={group}>
                            {gi > 0 && <DropdownMenuSeparator className="bg-zinc-800" />}
                            <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-zinc-500">{groupTitle}</DropdownMenuLabel>
                            {list.map((entry) => (
                                <DropdownMenuItem
                                    key={entry.key}
                                    onSelect={() => { if (entry.key !== currentKey) openWallEditor(entry.target); }}
                                    className={cn('flex items-center gap-2 text-xs cursor-pointer focus:bg-zinc-800 focus:text-white', entry.key === currentKey && 'bg-zinc-800/60')}
                                >
                                    <span className="flex-1 truncate">{entry.label}</span>
                                    <span className="text-[10px] text-zinc-500 whitespace-nowrap">{entry.detail}</span>
                                    <span className="w-5 text-right text-[10px] tabular-nums text-zinc-400">{entry.count}</span>
                                </DropdownMenuItem>
                            ))}
                        </div>
                    );
                })}
            </DropdownMenuContent>
        </DropdownMenu>
    );
};

const WallEditorTopBar = ({ face }: { face: WallFace }) => {
    const setSide = useEditorStore((s) => s.setWallEditorSide);
    const closeWallEditor = useEditorStore((s) => s.closeWallEditor);
    const updateWall = useEditorStore((s) => s.updateWall);
    const toggleWallLock = useEditorStore((s) => s.toggleWallLock);
    const pxPerM = useWallEditorView((s) => s.pxPerM);
    const [editingName, setEditingName] = useState(false);
    const [name, setName] = useState(face.wall?.label ?? '');
    const { wall } = face;

    const zoomBy = (factor: number) => {
        const v = useWallEditorView.getState();
        v.zoomAt(v.viewportW / 2, v.viewportH / 2, factor);
    };

    const commitName = () => {
        setEditingName(false);
        const trimmed = name.trim();
        if (wall && trimmed && trimmed !== wall.label) updateWall(wall.id, { label: trimmed });
        else setName(wall?.label ?? '');
    };

    return (
        <div className="absolute top-8 left-1/2 -translate-x-1/2 z-[16] flex items-center gap-2 pointer-events-none">
            <div className={cn(barClass, 'pointer-events-auto')}>
                <ChromeButton icon={<ArrowLeft className="h-4 w-4" />} label="3D-Ansicht" shortcut="Esc" onClick={closeWallEditor} showLabel />
                <Separator />
                <div className="pl-1 pr-2 flex items-center gap-1 text-white">
                    {editingName && wall ? (
                        <input
                            autoFocus
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            onBlur={commitName}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                                if (e.key === 'Escape') { setName(wall.label ?? ''); setEditingName(false); }
                            }}
                            className="w-28 bg-zinc-900 border border-zinc-600 rounded px-1.5 py-0.5 text-sm font-semibold outline-none focus:border-blue-500"
                        />
                    ) : (
                        <FaceSwitcher face={face} />
                    )}
                    {wall && !editingName && (
                        <button
                            type="button"
                            className="h-6 w-6 flex items-center justify-center rounded text-white/40 hover:text-white hover:bg-white/10"
                            title="Wand umbenennen"
                            aria-label="Wand umbenennen"
                            onClick={() => { setName(wall.label ?? ''); setEditingName(true); }}
                        >
                            <Pencil className="h-3 w-3" />
                        </button>
                    )}
                    <span className="text-[11px] text-white/50 whitespace-nowrap">
                        {formatCm(face.wallRect.w, false)} × {formatCm(face.wallRect.h)}
                    </span>
                </div>
                {wall && face.sideCounts && (
                    <>
                        <Separator />
                        <div className="flex rounded-lg bg-white/5 p-0.5" role="tablist" aria-label="Wandseite">
                            {SIDE_TABS.map(({ side, short }) => (
                                <button
                                    key={side}
                                    type="button"
                                    role="tab"
                                    aria-selected={face.side === side}
                                    aria-label={WALL_SIDE_LABELS[side]}
                                    title={side === 'left' || side === 'right' ? `${WALL_SIDE_LABELS[side]} (schmales Seitenteil)` : WALL_SIDE_LABELS[side]}
                                    onClick={() => setSide(side)}
                                    className={cn(
                                        'h-7 px-2 rounded-md text-xs font-medium transition-colors whitespace-nowrap',
                                        face.side === side ? 'bg-white text-zinc-900' : 'text-white/60 hover:text-white',
                                    )}
                                >
                                    {short}
                                    <span className={cn('ml-1 tabular-nums', face.side === side ? 'text-zinc-500' : 'text-white/40')}>
                                        {face.sideCounts![side]}
                                    </span>
                                </button>
                            ))}
                        </div>
                        <Separator />
                        {wall.isLocked ? (
                            <span className="px-2 flex items-center gap-1 text-[11px] text-amber-300/90 whitespace-nowrap" title="Wand ist gesperrt – Werke können platziert werden">
                                <Lock className="h-3.5 w-3.5" /> Gesperrt
                            </span>
                        ) : (
                            <button
                                type="button"
                                onClick={() => {
                                    toggleWallLock(wall.id);
                                    gooeyToast.success('Wand gesperrt', { description: 'Jetzt kannst du Werke aus der Bibliothek auf die Wand ziehen.' });
                                }}
                                className="px-2 h-7 flex items-center gap-1 rounded-md text-[11px] text-orange-300 hover:bg-orange-400/15 whitespace-nowrap"
                                title="Nur gesperrte Wände nehmen Werke auf"
                            >
                                <Unlock className="h-3.5 w-3.5" /> Sperren zum Platzieren
                            </button>
                        )}
                    </>
                )}
                {face.room && face.openings.length > 0 && (
                    <>
                        <Separator />
                        <span className="px-2 text-[11px] text-white/50 whitespace-nowrap">
                            {[
                                countLabel(face.openings.filter((o) => o.kind === 'window').length, 'Fenster', 'Fenster'),
                                countLabel(face.openings.filter((o) => o.kind === 'door').length, 'Tür', 'Türen'),
                            ].filter(Boolean).join(' · ')}
                        </span>
                    </>
                )}
                <Separator />
                <ChromeButton icon={<Minus className="h-4 w-4" />} label="Verkleinern" shortcut="−" onClick={() => zoomBy(0.8)} />
                <span className="w-14 text-center text-[11px] tabular-nums text-white/70" title="Maßstab auf dem Bildschirm (96 dpi)">
                    {niceScale(pxPerM)}
                </span>
                <ChromeButton icon={<Plus className="h-4 w-4" />} label="Vergrößern" shortcut="+" onClick={() => zoomBy(1.25)} />
                <ChromeButton icon={<Scan className="h-4 w-4" />} label="Wand einpassen" shortcut="⇧1" onClick={() => fitWallEditorView(face.wallRect)} />
            </div>
        </div>
    );
};

const countLabel = (n: number, one: string, many: string) => (n === 0 ? '' : `${n} ${n === 1 ? one : many}`);

// ── Bottom toolbar ───────────────────────────────────────────────────────

const TOOLS: { tool: WallEditorTool; label: string; shortcut: string; icon: ReactNode }[] = [
    { tool: 'select', label: 'Auswählen & verschieben', shortcut: 'V', icon: <MousePointer2 className="h-4 w-4" /> },
    { tool: 'hand', label: 'Ansicht verschieben', shortcut: 'H / Leertaste', icon: <Hand className="h-4 w-4" /> },
    { tool: 'measure', label: 'Messen', shortcut: 'M', icon: <Ruler className="h-4 w-4" /> },
];

const WallEditorToolbar = ({ face }: { face: WallFace }) => {
    const tool = useWallEditorView((s) => s.tool);
    const setTool = useWallEditorView((s) => s.setTool);
    const toggle = useWallEditorView((s) => s.toggle);
    const snapping = useWallEditorView((s) => s.snapping);
    const showRulers = useWallEditorView((s) => s.showRulers);
    const showFloorDistances = useWallEditorView((s) => s.showFloorDistances);
    const showGaps = useWallEditorView((s) => s.showGaps);
    const showHangingLine = useWallEditorView((s) => s.showHangingLine);
    const measurementCount = useWallEditorView((s) => s.measurements.length);
    const clearMeasurements = useWallEditorView((s) => s.clearMeasurements);
    const closeWallEditor = useEditorStore((s) => s.closeWallEditor);

    const r = face.wallRect;
    const hasProblems = face.items.some((i) => (
        i.rect.x < r.x - 0.0005 || i.rect.x + i.rect.w > r.x + r.w + 0.0005
        || i.rect.y < r.y - 0.0005 || i.rect.y + i.rect.h > r.y + r.h + 0.0005
    ));

    return (
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-[16] flex flex-col items-center gap-2 pointer-events-none">
            {tool === 'measure' && (
                <div className="px-3 py-1 rounded-full bg-black/70 text-[11px] text-white/80 backdrop-blur pointer-events-none whitespace-nowrap">
                    Ziehen zum Messen · ⇧ gerade · Werk überfahren zeigt Boden- und Nachbarabstände · Messwert anklicken zum Entfernen
                </div>
            )}
            {hasProblems && tool !== 'measure' && (
                <div className="px-3 py-1 rounded-full bg-orange-500/90 text-[11px] text-white flex items-center gap-1.5 pointer-events-none whitespace-nowrap">
                    <TriangleAlert className="h-3.5 w-3.5" /> Mindestens ein Werk ragt über die Wand hinaus
                </div>
            )}
            <div className={cn(barClass, 'pointer-events-auto')}>
                {TOOLS.map((t) => (
                    <ChromeButton key={t.tool} icon={t.icon} label={t.label} shortcut={t.shortcut} active={tool === t.tool} onClick={() => setTool(t.tool)} />
                ))}
                <Separator />
                <ChromeButton icon={<Magnet className="h-4 w-4" />} label="Einrasten" shortcut="⌘/Strg beim Ziehen umkehren" active={snapping} onClick={() => toggle('snapping')} />
                <ChromeButton icon={<RulerDimensionLine className="h-4 w-4" />} label="Lineale & Hilfslinien" active={showRulers} onClick={() => toggle('showRulers')} />
                <ChromeButton icon={<ArrowDownToLine className="h-4 w-4" />} label="Höhen über Boden anzeigen" active={showFloorDistances} onClick={() => toggle('showFloorDistances')} />
                <ChromeButton icon={<BetweenHorizontalStart className="h-4 w-4" />} label="Abstände zwischen Werken anzeigen" active={showGaps} onClick={() => toggle('showGaps')} />
                <ChromeButton icon={<SeparatorHorizontal className="h-4 w-4" />} label="Hängehöhe anzeigen" active={showHangingLine} onClick={() => toggle('showHangingLine')} />
                {measurementCount > 0 && (
                    <>
                        <Separator />
                        <ChromeButton icon={<Eraser className="h-4 w-4" />} label={`Messungen löschen (${measurementCount})`} onClick={clearMeasurements} />
                    </>
                )}
                <Separator />
                <ChromeButton icon={<Check className="h-4 w-4" />} label="Fertig" onClick={closeWallEditor} showLabel tone="primary" />
            </div>
        </div>
    );
};

// ── Root ─────────────────────────────────────────────────────────────────

/**
 * 2D wall editor on top of the editor canvas: overlay (once the camera has landed), top bar and
 * tool bar. The right-hand panel lives in PropertiesPanel (WallEditorPanel).
 */
export const WallEditor = () => {
    const wallEditor = useEditorStore((s) => s.wallEditor);
    const closeWallEditor = useEditorStore((s) => s.closeWallEditor);
    const phase = useWallEditorView((s) => s.phase);
    const face = useWallFace();

    // The wall was deleted or the version changed underneath the editor.
    useEffect(() => {
        if (wallEditor && !face) closeWallEditor();
    }, [wallEditor, face, closeWallEditor]);

    if (!wallEditor || !face) return null;
    return (
        <>
            {phase === 'active' && <WallEditorOverlay face={face} />}
            <WallEditorTopBar key={face.wall ? `wall:${face.wall.id}` : face.key} face={face} />
            <WallEditorToolbar face={face} />
        </>
    );
};
