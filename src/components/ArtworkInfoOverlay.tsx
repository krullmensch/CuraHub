import { useState, useEffect, useRef, useCallback, type CSSProperties } from 'react';
import { useEditorStore, videoRefMap } from '../store/editorStore';
import { Volume2, VolumeX } from 'lucide-react';

const MouseLeftIcon = ({ size = 20, color = "white" }: { size?: number, color?: string }) => (
    <svg 
        width={size} 
        height={size * 1.4} 
        viewBox="0 0 20 28" 
        fill="none" 
        style={{ display: 'block' }}
    >
        <rect x="1" y="1" width="18" height="26" rx="9" stroke={color} strokeWidth="2"/>
        <path d="M10 1V11" stroke={color} strokeWidth="2"/>
        <path d="M1 11H19" stroke={color} strokeWidth="2"/>
        <path 
            d="M10 1C5.02944 1 1 5.02944 1 10V11H10V1Z" 
            fill={color} 
            fillOpacity="0.4"
        />
    </svg>
);

/**
 * FPV Artwork Info Overlay
...
 * Shows artwork metadata when crosshair targets an artwork.
 * Left-click toggles the panel hidden while still looking at the artwork.
 * Looking at a different artwork resets visibility.
 */
export const ArtworkInfoOverlay = () => {
    const fpvHoveredInfo = useEditorStore((s) => s.fpvHoveredInfo);

    const [displayInfo, setDisplayInfo] = useState<typeof fpvHoveredInfo>(null);
    const [isActive, setIsActive] = useState(false);
    const [isLocked, setIsLocked] = useState(false);
    const [isMuted, setIsMuted] = useState(true);
    const [dismissed, setDismissed] = useState(false);

    const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const enterFrame = useRef<number | null>(null);
    const descRef = useRef<HTMLDivElement>(null);
    const dismissedForId = useRef<number | null>(null);

    // Refs for mousedown handler
    const fpvHoveredInfoRef = useRef(fpvHoveredInfo);
    const dismissedRef = useRef(dismissed);
    const isLockedRef = useRef(isLocked);
    fpvHoveredInfoRef.current = fpvHoveredInfo;
    dismissedRef.current = dismissed;
    isLockedRef.current = isLocked;

    // Track pointer lock state
    useEffect(() => {
        const handler = () => setIsLocked(!!document.pointerLockElement);
        document.addEventListener('pointerlockchange', handler);
        return () => document.removeEventListener('pointerlockchange', handler);
    }, []);

    // Track displayInfo for fade-out
    useEffect(() => {
        if (fpvHoveredInfo) {
            setDisplayInfo(fpvHoveredInfo);

            // Reset dismissed when looking at a new artwork
            if (fpvHoveredInfo.instanceId !== dismissedForId.current) {
                setDismissed(false);
                dismissedForId.current = null;
            }
        }
    }, [fpvHoveredInfo]);

    // Control panel visibility
    useEffect(() => {
        if (exitTimer.current) clearTimeout(exitTimer.current);
        if (enterFrame.current) cancelAnimationFrame(enterFrame.current);

        const shouldShow = !!fpvHoveredInfo && !dismissed;

        if (shouldShow) {
            enterFrame.current = requestAnimationFrame(() => {
                if (displayInfo?.assetType === 'video') {
                    const vid = videoRefMap.get(displayInfo.instanceId);
                    if (vid) setIsMuted(vid.muted);
                }
                requestAnimationFrame(() => setIsActive(true));
            });
        } else {
            setIsActive(false);
            exitTimer.current = setTimeout(() => {
                if (!fpvHoveredInfoRef.current) setDisplayInfo(null);
            }, 500);
        }

        return () => {
            if (exitTimer.current) clearTimeout(exitTimer.current);
            if (enterFrame.current) cancelAnimationFrame(enterFrame.current);
        };
    }, [displayInfo, dismissed, fpvHoveredInfo]);

    // Left-click: toggle panel visibility
    useEffect(() => {
        const onMouseDown = (e: MouseEvent) => {
            if (e.button !== 0 || !isLockedRef.current) return;
            const hovered = fpvHoveredInfoRef.current;
            if (!hovered) return;

            if (dismissedRef.current) {
                // Currently hidden → show it
                setDismissed(false);
                dismissedForId.current = null;
            } else {
                // Currently showing → hide it
                setDismissed(true);
                dismissedForId.current = hovered.instanceId;
            }
        };
        window.addEventListener('mousedown', onMouseDown);
        return () => window.removeEventListener('mousedown', onMouseDown);
    }, []);

    // "M" key — mute toggle
    const toggleMute = useCallback(() => {
        const info = useEditorStore.getState().fpvHoveredInfo;
        if (!info || info.assetType !== 'video') return;
        const vid = videoRefMap.get(info.instanceId);
        if (!vid) return;
        vid.muted = !vid.muted;
        setIsMuted(vid.muted);
    }, []);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
            if (e.key.toLowerCase() === 'm') toggleMute();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [toggleMute]);

    // Wheel forwarding to description scroll
    useEffect(() => {
        const onWheel = (e: WheelEvent) => {
            const el = descRef.current;
            if (!el || el.scrollHeight <= el.clientHeight) return;
            el.scrollTop += e.deltaY;
        };
        window.addEventListener('wheel', onWheel, { passive: true });
        return () => window.removeEventListener('wheel', onWheel);
    }, []);

    // ── Crosshair geometry ──
    const gap = 4;
    const armLen = 10;
    const lineWeight = 2;
    const lineColor = 'rgba(255, 255, 255, 0.85)';
    const ease = 'all 200ms ease-out';

    const arm = (axis: 'h' | 'v', sign: -1 | 1): CSSProperties => {
        const isH = axis === 'h';
        return {
            position: 'absolute',
            top: isH ? -(lineWeight / 2) : (sign === -1 ? -(gap + armLen) : gap),
            left: isH ? (sign === -1 ? -(gap + armLen) : gap) : -(lineWeight / 2),
            width: isH ? armLen : lineWeight,
            height: isH ? lineWeight : armLen,
            background: lineColor,
            transition: ease,
        };
    };

    const extensionStart = gap + armLen + 2;
    const extensionLen = 56;
    const panelLeft = extensionStart + extensionLen;
    const isVideo = displayInfo?.assetType === 'video';

    const Kbd = ({ children }: { children: React.ReactNode }) => (
        <span style={{
            display: 'inline-block',
            background: 'rgba(255, 255, 255, 0.12)',
            borderRadius: 3,
            padding: '2px 6px',
            marginRight: 6,
            fontSize: 10,
            fontWeight: 600,
            color: 'rgba(255, 255, 255, 0.75)',
            letterSpacing: '0.02em',
        }}>{children}</span>
    );

    return (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 10, overflow: 'hidden' }}>

            {/* ── Crosshair ── */}
            <div style={{ position: 'absolute', top: '50%', left: '50%', width: 0, height: 0 }}>
                <div style={arm('v', -1)} />
                <div style={arm('v', 1)} />
                <div style={arm('h', -1)} />
                <div style={arm('h', 1)} />
                <div style={{
                    position: 'absolute', top: -2, left: -2,
                    width: 4, height: 4, borderRadius: '50%',
                    background: 'rgba(255, 255, 255, 0.85)',
                }} />
            </div>

            {/* ── Extension line + Info panel ── */}
            {displayInfo && (
                <div style={{ position: 'absolute', top: '50%', left: '50%', width: 0, height: 0 }}>
                    {/* Extension line */}
                    <div style={{
                        position: 'absolute',
                        top: -(lineWeight / 2),
                        left: extensionStart,
                        height: lineWeight,
                        width: isActive ? extensionLen : 0,
                        background: 'rgba(255, 255, 255, 0.85)',
                        transition: `width 280ms cubic-bezier(0.22, 0.61, 0.36, 1)`,
                    }} />

                    {/* Info panel */}
                    <div style={{
                        position: 'absolute',
                        top: -(lineWeight / 2),
                        left: panelLeft,
                        transform: `translateX(${isActive ? 0 : -8}px)`,
                        opacity: isActive ? 1 : 0,
                        transition: `opacity 300ms ease-out ${isActive ? '140ms' : '0ms'}, transform 300ms ease-out ${isActive ? '140ms' : '0ms'}`,
                        background: 'rgba(0, 0, 0, 0.25)',
                        border: `${lineWeight}px solid rgba(255, 255, 255, 0.85)`,
                        backdropFilter: 'blur(10px)',
                        width: 221,
                        padding: '14px 12px 13px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 0,
                    }}>
                        {/* Title */}
                        <div style={{
                            fontFamily: '"Funnel Display", sans-serif',
                            fontSize: 28, fontWeight: 800,
                            color: 'white', lineHeight: 1.2, marginBottom: 8,
                        }}>
                            {displayInfo.title}
                        </div>

                        {/* Description */}
                        {displayInfo.description && (() => {
                            const isLong = displayInfo.description.length > 300;
                            return (
                                <div
                                    ref={descRef}
                                    className="fpv-desc-scroll"
                                    style={{
                                        fontFamily: '"Albert Sans", sans-serif',
                                        fontSize: 14, fontWeight: 400,
                                        color: 'white', lineHeight: 1.15,
                                        marginBottom: 10, whiteSpace: 'pre-wrap',
                                        ...(isLong ? {
                                            maxHeight: 140, overflowY: 'auto',
                                            pointerEvents: 'auto',
                                        } : { overflow: 'hidden' }),
                                    }}
                                >
                                    {displayInfo.description}
                                </div>
                            );
                        })()}

                        {/* Artist — Year */}
                        {(displayInfo.artist || displayInfo.year) && (
                            <div style={{
                                fontFamily: '"Albert Sans", sans-serif',
                                fontSize: 14, fontWeight: 800,
                                color: 'white', lineHeight: 1.2, marginTop: 'auto',
                            }}>
                                {displayInfo.artist}
                                {displayInfo.artist && displayInfo.year && ' — '}
                                {displayInfo.year}
                            </div>
                        )}

                        {/* Video mute indicator */}
                        {isVideo && (
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                marginTop: 10, paddingTop: 8,
                                borderTop: '1px solid rgba(255, 255, 255, 0.12)',
                            }}>
                                {isMuted
                                    ? <VolumeX size={14} color="rgba(255,255,255,0.6)" />
                                    : <Volume2 size={14} color="white" />
                                }
                                <span style={{
                                    fontFamily: '"Albert Sans", sans-serif',
                                    fontSize: 11, color: 'rgba(255, 255, 255, 0.5)',
                                    letterSpacing: '0.02em',
                                }}>
                                    <Kbd>M</Kbd>
                                    {isMuted ? 'Ton aktivieren' : 'Stummschalten'}
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── Hints (always visible, lower right) ── */}
            <div style={{
                position: 'absolute',
                bottom: 28,
                right: 28,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                fontFamily: '"Albert Sans", sans-serif',
                fontWeight: 600,
                fontSize: 20,
                color: 'white',
                background: 'rgba(0, 0, 0, 0.25)',
                border: '2px solid white',
                borderRadius: 14,
                padding: '8px 18px',
                backdropFilter: 'blur(10px)',
                letterSpacing: '0.02em',
            }}>
                <MouseLeftIcon size={18} />
                <span>Info</span>
            </div>
        </div>
    );
};
