const CHIP_SIZE = 36;
const CHIP_RADIUS = 8;

/**
 * Subtle drag image: a small rounded thumbnail chip (plus a count for multi-selections) instead
 * of the browser's full-size snapshot. Drawn into a canvas from the tile's already decoded
 * thumbnail; the canvas has to be in the document while the browser captures it (Firefox).
 */
export function setCompactDragImage(dataTransfer: DataTransfer, source: HTMLImageElement | null, count = 1) {
    try {
        const canvas = document.createElement('canvas');
        canvas.width = CHIP_SIZE;
        canvas.height = CHIP_SIZE;
        canvas.style.cssText = `position:fixed;top:-1000px;left:-1000px;width:${CHIP_SIZE}px;height:${CHIP_SIZE}px;pointer-events:none`;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.beginPath();
            ctx.roundRect(1, 1, CHIP_SIZE - 2, CHIP_SIZE - 2, CHIP_RADIUS);
            ctx.save();
            ctx.clip();
            ctx.fillStyle = '#27272a';
            ctx.fillRect(0, 0, CHIP_SIZE, CHIP_SIZE);
            if (source && source.complete && source.naturalWidth > 0) {
                // cover-crop to a square
                const side = Math.min(source.naturalWidth, source.naturalHeight);
                const sx = (source.naturalWidth - side) / 2;
                const sy = (source.naturalHeight - side) / 2;
                ctx.drawImage(source, sx, sy, side, side, 0, 0, CHIP_SIZE, CHIP_SIZE);
            }
            ctx.restore();
            ctx.lineWidth = 2;
            ctx.strokeStyle = '#3b82f6';
            ctx.stroke();
            if (count > 1) {
                ctx.beginPath();
                ctx.arc(CHIP_SIZE - 9, 9, 8, 0, Math.PI * 2);
                ctx.fillStyle = '#2563eb';
                ctx.fill();
                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 9px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(count > 99 ? '99+' : String(count), CHIP_SIZE - 9, 9.5);
            }
        }
        document.body.appendChild(canvas);
        dataTransfer.setDragImage(canvas, CHIP_SIZE / 2, CHIP_SIZE / 2);
        // Remove once the browser has captured the image.
        setTimeout(() => canvas.remove(), 0);
    } catch {
        // Keep the browser's default drag image.
    }
}
