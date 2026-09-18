import type { Measurement, Rect } from '@/lib/wallEditor/layout';
import { centerY, right, top } from '@/lib/wallEditor/layout';
import { formatCm } from '@/lib/wallEditor/format';
import type { ViewTransform } from '@/store/wallEditorViewStore';
import { PILL_FONT_SIZE, PILL_HEIGHT, WE_COLORS, WE_FONT } from './theme';
import { textWidth } from './textMetrics';

interface PillProps {
    x: number;
    y: number;
    text: string;
    color: string;
    /** Rotate by -90° (vertical dimension labels). */
    vertical?: boolean;
    /** Horizontal anchoring of the pill relative to x. */
    align?: 'center' | 'start' | 'end';
    textColor?: string;
    onPointerDown?: (e: React.PointerEvent) => void;
    cursor?: string;
    title?: string;
}

export const Pill = ({ x, y, text, color, vertical, align = 'center', textColor = '#fff', onPointerDown, cursor, title }: PillProps) => {
    const w = textWidth(text) + 10;
    const h = PILL_HEIGHT;
    const offset = align === 'center' ? -w / 2 : align === 'start' ? 0 : -w;
    const interactive = !!onPointerDown;
    return (
        <g
            transform={`translate(${x} ${y})${vertical ? ' rotate(-90)' : ''}`}
            pointerEvents={interactive ? 'auto' : 'none'}
            onPointerDown={onPointerDown}
            style={cursor ? { cursor } : undefined}
        >
            {title && <title>{title}</title>}
            <rect x={offset} y={-h / 2} width={w} height={h} rx={4} fill={color} />
            <text
                x={offset + w / 2}
                y={0.5}
                textAnchor="middle"
                dominantBaseline="central"
                fill={textColor}
                fontSize={PILL_FONT_SIZE}
                fontWeight={600}
                fontFamily={WE_FONT}
                style={{ userSelect: 'none' }}
            >
                {text}
            </text>
        </g>
    );
};

interface MeasureLineProps {
    m: Measurement;
    vt: ViewTransform;
    color?: string;
    label?: string;
    /** Draws a small x-shaped end marker instead of perpendicular caps (free measurements). */
    dots?: boolean;
    onLabelPointerDown?: (e: React.PointerEvent) => void;
    labelTitle?: string;
}

/** A dimension line with end caps and a centred value label. */
export const MeasureLine = ({ m, vt, color = WE_COLORS.measure, label, dots, onLabelPointerDown, labelTitle }: MeasureLineProps) => {
    const x1 = vt.toScreenX(m.x1);
    const y1 = vt.toScreenY(m.y1);
    const x2 = vt.toScreenX(m.x2);
    const y2 = vt.toScreenY(m.y2);
    const len = Math.hypot(x2 - x1, y2 - y1);
    if (len < 0.5) return null;
    const ux = (x2 - x1) / len;
    const uy = (y2 - y1) / len;
    const cap = 4;
    const nx = -uy * cap;
    const ny = ux * cap;
    const text = label ?? formatCm(m.value);
    const labelW = textWidth(text) + 10;
    const horizontal = Math.abs(uy) < 0.01;
    const vertical = Math.abs(ux) < 0.01;
    let lx = (x1 + x2) / 2;
    let ly = (y1 + y2) / 2;
    if (horizontal && len < labelW + 6) ly -= PILL_HEIGHT / 2 + 5;
    else if (vertical && len < PILL_HEIGHT + 6) lx += labelW / 2 + 6;
    else if (!horizontal && !vertical) {
        // Diagonal: put the label beside the line's midpoint
        lx += nx * 3;
        ly += ny * 3;
    }
    return (
        <g>
            {m.helpers?.map((h, i) => (
                <line
                    key={i}
                    x1={vt.toScreenX(h.x1)}
                    y1={vt.toScreenY(h.y1)}
                    x2={vt.toScreenX(h.x2)}
                    y2={vt.toScreenY(h.y2)}
                    stroke={color}
                    strokeWidth={1}
                    strokeDasharray="3 3"
                    pointerEvents="none"
                />
            ))}
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={1} pointerEvents="none" />
            {dots ? (
                <>
                    <circle cx={x1} cy={y1} r={2.5} fill={color} pointerEvents="none" />
                    <circle cx={x2} cy={y2} r={2.5} fill={color} pointerEvents="none" />
                </>
            ) : (
                <>
                    <line x1={x1 - nx} y1={y1 - ny} x2={x1 + nx} y2={y1 + ny} stroke={color} strokeWidth={1} pointerEvents="none" />
                    <line x1={x2 - nx} y1={y2 - ny} x2={x2 + nx} y2={y2 + ny} stroke={color} strokeWidth={1} pointerEvents="none" />
                </>
            )}
            <Pill
                x={lx}
                y={ly}
                text={text}
                color={color}
                onPointerDown={onLabelPointerDown}
                cursor={onLabelPointerDown ? 'pointer' : undefined}
                title={labelTitle}
            />
        </g>
    );
};

interface FloorChainProps {
    rect: Rect;
    vt: ViewTransform;
    viewportW: number;
    floorY?: number;
    color?: string;
}

/**
 * Ordinate dimensioning from the floor: one vertical line beside the artwork with ticks at the
 * bottom edge (UK), the centre (Mitte) and the top edge (OK), each labelled with its height.
 */
export const FloorChain = ({ rect, vt, viewportW, floorY = 0, color = WE_COLORS.measure }: FloorChainProps) => {
    const gap = 16;
    const rightX = vt.toScreenX(right(rect));
    const leftX = vt.toScreenX(rect.x);
    const onRight = rightX + gap + 90 < viewportW;
    const lineX = onRight ? rightX + gap : leftX - gap;
    const edgeX = onRight ? rightX : leftX;
    const floor = vt.toScreenY(floorY);
    const entries = [
        { key: 'ok', v: top(rect), text: `OK ${formatCm(top(rect) - floorY)}` },
        { key: 'm', v: centerY(rect), text: `Mitte ${formatCm(centerY(rect) - floorY)}` },
        { key: 'uk', v: rect.y, text: `UK ${formatCm(rect.y - floorY)}` },
    ].map((e) => ({ ...e, y: vt.toScreenY(e.v), labelY: vt.toScreenY(e.v) }));

    // Keep labels from overlapping (top → bottom)
    const minGap = PILL_HEIGHT + 2;
    for (let i = 1; i < entries.length; i++) {
        if (entries[i].labelY - entries[i - 1].labelY < minGap) entries[i].labelY = entries[i - 1].labelY + minGap;
    }

    const tick = 4;
    return (
        <g pointerEvents="none">
            <line x1={lineX} y1={floor} x2={lineX} y2={entries[0].y} stroke={color} strokeWidth={1} />
            <line x1={lineX - tick} y1={floor} x2={lineX + tick} y2={floor} stroke={color} strokeWidth={1} />
            {entries.map((e) => (
                <g key={e.key}>
                    <line x1={edgeX} y1={e.y} x2={lineX} y2={e.y} stroke={color} strokeWidth={1} strokeDasharray="2 3" />
                    <line x1={lineX - tick} y1={e.y} x2={lineX + tick} y2={e.y} stroke={color} strokeWidth={1} />
                    {e.labelY !== e.y && (
                        <line x1={lineX + tick} y1={e.y} x2={lineX + (onRight ? 8 : -8)} y2={e.labelY} stroke={color} strokeWidth={1} />
                    )}
                    <Pill
                        x={lineX + (onRight ? 8 : -8)}
                        y={e.labelY}
                        text={e.text}
                        color={color}
                        align={onRight ? 'start' : 'end'}
                    />
                </g>
            ))}
        </g>
    );
};
