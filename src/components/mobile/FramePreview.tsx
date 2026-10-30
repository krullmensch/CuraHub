import { useMemo } from 'react';
import { frameStyle as frameStyleSpec, framedArtworkLayout, type FrameStyleId } from '@/lib/frameStyles';
import { finishSwatch } from '@/lib/frameSwatch';
import type { PassepartoutValue } from '@/lib/passepartout';
import { framePreviewBoxes, type PreviewRect } from '@/lib/mobilePlanner/framePreview';
import type { SizeCm } from '@/lib/mobilePlanner/arSize';

interface FramePreviewProps {
  imageUrl: string;
  size: SizeCm;
  frameStyle: FrameStyleId;
  passepartout: PassepartoutValue;
}

const pct = (r: PreviewRect) => ({
  left: `${r.x * 100}%`,
  top: `${r.y * 100}%`,
  width: `${r.w * 100}%`,
  height: `${r.h * 100}%`,
});

/** Flat live preview of picture, passepartout and frame in their real proportions. */
export function FramePreview({ imageUrl, size, frameStyle, passepartout }: FramePreviewProps) {
  const boxes = useMemo(() => {
    const layout = framedArtworkLayout({
      width: size.w / 100,
      height: size.h / 100,
      frameStyle,
      passepartoutWidth: passepartout.width,
      passepartoutPlacement: passepartout.placement,
    });
    return framePreviewBoxes(layout, size.w / 100, size.h / 100);
  }, [size, frameStyle, passepartout]);
  const style = frameStyleSpec(frameStyle);

  return (
    <div className="flex h-56 items-center justify-center rounded-lg bg-zinc-800/60 p-4">
      <div
        className="relative shadow-[0_8px_24px_rgba(0,0,0,0.55)]"
        style={{
          aspectRatio: boxes.aspect,
          height: boxes.aspect >= 1 ? 'auto' : '100%',
          width: boxes.aspect >= 1 ? '100%' : 'auto',
          maxHeight: '100%',
          maxWidth: '100%',
          background: style ? finishSwatch(style.finish.id) : 'transparent',
        }}
      >
        <div className="absolute" style={{ ...pct(boxes.opening), background: '#f7f6f2', boxShadow: style ? 'inset 0 0 3px rgba(0,0,0,0.35)' : undefined }} />
        <img src={imageUrl} alt="" className="absolute object-cover" style={pct(boxes.picture)} />
      </div>
    </div>
  );
}
