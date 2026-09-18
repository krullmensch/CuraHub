import { memo } from 'react';
import type { Rect } from '@/lib/wallEditor/layout';
import { right, top } from '@/lib/wallEditor/layout';
import { formatCm } from '@/lib/wallEditor/format';
import { RULER_SIZE, type RulerGuide, type ViewTransform } from '@/store/wallEditorViewStore';
import { WE_COLORS, WE_FONT } from './theme';

const STEPS_CM = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000];
const MIN_MAJOR_PX = 56;
const MIN_MINOR_PX = 6;

function pickSteps(pxPerM: number): { major: number; minor: number } {
    const pxPerCm = pxPerM / 100;
    const major = STEPS_CM.find((s) => s * pxPerCm >= MIN_MAJOR_PX) ?? STEPS_CM[STEPS_CM.length - 1];
    const minor = [major / 10, major / 5, major / 2].find((s) => s * pxPerCm >= MIN_MINOR_PX && Number.isInteger(s * 2)) ?? major;
    return { major, minor };
}

interface RulersProps {
    vt: ViewTransform;
    width: number;
    height: number;
    /** x of the vertical ruler (right of a floating side panel). */
    left: number;
    selection: Rect | null;
    pointer: { u: number; v: number } | null;
    guides: RulerGuide[];
    onRulerPointerDown: (axis: 'x' | 'y', e: React.PointerEvent) => void;
}

const label = (cm: number) => String(Math.round(cm * 10) / 10).replace('.', ',');

/** Rulers along the top (cm from the wall's left edge) and left side (cm above the floor). */
export const WallEditorRulers = memo(({ vt, width, height, left, selection, pointer, guides, onRulerPointerDown }: RulersProps) => {
    const { major, minor } = pickSteps(vt.pxPerM);
    const R = RULER_SIZE;

    const hTicks: React.ReactNode[] = [];
    const uStart = vt.toWallU(R) * 100;
    const uEnd = vt.toWallU(width) * 100;
    for (let i = Math.floor(uStart / minor); i <= Math.ceil(uEnd / minor); i++) {
        const cm = i * minor;
        const x = vt.toScreenX(cm / 100);
        if (x < 0 || (x > left && x < left + R + 2)) continue;
        const isMajor = Math.abs(cm / major - Math.round(cm / major)) < 1e-6;
        hTicks.push(<line key={`t${i}`} x1={x} x2={x} y1={isMajor ? R - 9 : R - 4} y2={R} stroke={WE_COLORS.rulerTick} strokeWidth={1} />);
        if (isMajor) {
            hTicks.push(
                <text key={`l${i}`} x={x + 3} y={9} fill={WE_COLORS.rulerText} fontSize={9} fontFamily={WE_FONT} style={{ userSelect: 'none' }}>
                    {label(cm)}
                </text>,
            );
        }
    }

    const vTicks: React.ReactNode[] = [];
    const vStart = vt.toWallV(height) * 100;
    const vEnd = vt.toWallV(R) * 100;
    for (let i = Math.floor(vStart / minor); i <= Math.ceil(vEnd / minor); i++) {
        const cm = i * minor;
        const y = vt.toScreenY(cm / 100);
        if (y < R) continue;
        const isMajor = Math.abs(cm / major - Math.round(cm / major)) < 1e-6;
        vTicks.push(<line key={`t${i}`} y1={y} y2={y} x1={left + (isMajor ? R - 9 : R - 4)} x2={left + R} stroke={WE_COLORS.rulerTick} strokeWidth={1} />);
        if (isMajor) {
            vTicks.push(
                <text key={`l${i}`} transform={`translate(${left + 9} ${y - 3}) rotate(-90)`} fill={WE_COLORS.rulerText} fontSize={9} fontFamily={WE_FONT} style={{ userSelect: 'none' }}>
                    {label(cm)}
                </text>,
            );
        }
    }

    const selX1 = selection ? Math.max(0, vt.toScreenX(selection.x)) : 0;
    const selX2 = selection ? vt.toScreenX(right(selection)) : 0;
    const selY1 = selection ? Math.max(R, vt.toScreenY(top(selection))) : 0;
    const selY2 = selection ? vt.toScreenY(selection.y) : 0;

    return (
        <g>
            {/* Top ruler */}
            <g onPointerDown={(e) => onRulerPointerDown('x', e)} style={{ cursor: 'row-resize' }}>
                <rect x={0} y={0} width={width} height={R} fill={WE_COLORS.rulerBg} />
                {selection && selX2 > selX1 && (
                    <rect x={selX1} y={0} width={selX2 - selX1} height={R} fill={WE_COLORS.select} opacity={0.25} />
                )}
                {hTicks}
                {selection && selX2 > 0 && (
                    <>
                        <text x={selX1 + 3} y={R - 4} fill="#93c5fd" fontSize={9} fontWeight={600} fontFamily={WE_FONT} style={{ userSelect: 'none' }}>{formatCm(selection.x, false)}</text>
                        <text x={selX2 - 3} y={R - 4} textAnchor="end" fill="#93c5fd" fontSize={9} fontWeight={600} fontFamily={WE_FONT} style={{ userSelect: 'none' }}>{formatCm(right(selection), false)}</text>
                    </>
                )}
                {pointer && vt.toScreenX(pointer.u) > 0 && (
                    <line x1={vt.toScreenX(pointer.u)} x2={vt.toScreenX(pointer.u)} y1={0} y2={R} stroke="#fff" strokeWidth={1} opacity={0.7} />
                )}
                {guides.filter((g) => g.axis === 'x').map((g) => (
                    <path key={g.id} d={`M ${vt.toScreenX(g.value) - 4} ${R - 6} L ${vt.toScreenX(g.value) + 4} ${R - 6} L ${vt.toScreenX(g.value)} ${R} Z`} fill={WE_COLORS.guide} />
                ))}
                <line x1={0} x2={width} y1={R - 0.5} y2={R - 0.5} stroke="rgba(255,255,255,0.12)" />
            </g>

            {/* Left ruler */}
            <g onPointerDown={(e) => onRulerPointerDown('y', e)} style={{ cursor: 'col-resize' }}>
                <rect x={left} y={R} width={R} height={Math.max(0, height - R)} fill={WE_COLORS.rulerBg} />
                {selection && selY2 > selY1 && (
                    <rect x={left} y={selY1} width={R} height={selY2 - selY1} fill={WE_COLORS.select} opacity={0.25} />
                )}
                {vTicks}
                {pointer && vt.toScreenY(pointer.v) > R && (
                    <line y1={vt.toScreenY(pointer.v)} y2={vt.toScreenY(pointer.v)} x1={left} x2={left + R} stroke="#fff" strokeWidth={1} opacity={0.7} />
                )}
                {guides.filter((g) => g.axis === 'y').map((g) => (
                    <path key={g.id} d={`M ${left + R - 6} ${vt.toScreenY(g.value) - 4} L ${left + R - 6} ${vt.toScreenY(g.value) + 4} L ${left + R} ${vt.toScreenY(g.value)} Z`} fill={WE_COLORS.guide} />
                ))}
                <line y1={R} y2={height} x1={left + R - 0.5} x2={left + R - 0.5} stroke="rgba(255,255,255,0.12)" />
            </g>

            {/* Corner */}
            <rect x={left} y={0} width={R} height={R} fill={WE_COLORS.rulerBg} />
            <text x={left + R / 2} y={R / 2 + 0.5} textAnchor="middle" dominantBaseline="central" fill={WE_COLORS.rulerText} fontSize={8.5} fontFamily={WE_FONT} style={{ userSelect: 'none' }}>cm</text>
        </g>
    );
});
WallEditorRulers.displayName = 'WallEditorRulers';
