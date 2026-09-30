import { createContext, forwardRef, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import HTMLFlipBook from 'react-pageflip';
import type * as pdfjs from 'pdfjs-dist';
import { MIN_PAGE_WIDTH, isNearPage, needsRerender, pageRenderScale } from '@/lib/book/flipPages';
import { stopRenderLoop } from '@/lib/book/flipRenderLoop';
import './BookFlipbook.css';

/**
 * The zine flipbook (matte curl, paper grain, spine shadow, centred covers) with pdf.js as
 * the page source instead of pre-rendered images.
 */

interface PageBox {
  width: number;
  height: number;
}

const CurrentPageContext = createContext(0);
/** Size of a page element on screen (CSS px); 0 until page-flip has laid the book out. */
const PageBoxContext = createContext<PageBox>({ width: 0, height: 0 });

interface PageProps {
  doc: pdfjs.PDFDocumentProxy;
  index: number;
  side: 'left' | 'right';
}

/** Canvas → compressed blob: a kept page costs its file size, not width × height × 4 bytes. */
function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  const encode = (type: string, quality: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  // Browsers that cannot encode WebP hand back a PNG blob (or null); ask for JPEG then.
  return encode('image/webp', 0.85).then((blob) => (blob && blob.type === 'image/webp' ? blob : encode('image/jpeg', 0.9)));
}

const Page = forwardRef<HTMLDivElement, PageProps>(({ doc, index, side }, ref) => {
  const current = useContext(CurrentPageContext);
  const box = useContext(PageBoxContext);
  const near = isNearPage(index, current);
  // Box the page is (to be) rendered for. Once set the image stays, so flipping back never shows a blank page.
  const [target, setTarget] = useState<PageBox | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const srcRef = useRef<string | null>(null);

  // Adjusted while rendering (guarded, so it settles at once): a page enters or outgrows its render box.
  if (near && box.width > 0 && box.height > 0 && needsRerender(target?.width ?? null, box.width)) {
    setTarget(box);
  }

  useEffect(() => {
    if (!target) return;
    let cancelled = false;
    let task: pdfjs.RenderTask | null = null;
    let pdfPage: pdfjs.PDFPageProxy | null = null;
    // Render off screen, then swap the finished image in, so a re-render at a larger size never blanks the page.
    const off = document.createElement('canvas');
    (async () => {
      pdfPage = await doc.getPage(index + 1);
      if (cancelled) return;
      const base = pdfPage.getViewport({ scale: 1 });
      const scale = pageRenderScale({
        baseWidth: base.width,
        baseHeight: base.height,
        boxWidth: target.width,
        boxHeight: target.height,
        dpr: window.devicePixelRatio || 1,
      });
      const viewport = pdfPage.getViewport({ scale });
      off.width = Math.max(1, Math.floor(viewport.width));
      off.height = Math.max(1, Math.floor(viewport.height));
      task = pdfPage.render({ canvas: off, viewport });
      await task.promise;
      if (cancelled) return;
      const blob = await canvasToBlob(off);
      if (cancelled || !blob) return;
      const url = URL.createObjectURL(blob);
      const previous = srcRef.current;
      srcRef.current = url;
      setSrc(url);
      if (previous) URL.revokeObjectURL(previous);
    })()
      .catch(() => undefined) // cancelled render or destroyed document
      .finally(() => {
        pdfPage?.cleanup();
        off.width = 0; // free the pixels now instead of at the next GC
        off.height = 0;
      });
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, index, target]);

  useEffect(
    () => () => {
      if (srcRef.current) URL.revokeObjectURL(srcRef.current);
      srcRef.current = null;
    },
    [],
  );

  return (
    <div className={`zf-page zf-page--${side}`} ref={ref} data-density="soft">
      {src && <img src={src} alt={`Seite ${index + 1}`} draggable={false} decoding="async" />}
      <div className="zf-page__paper" aria-hidden />
      <div className="zf-page__spine" aria-hidden />
    </div>
  );
});
Page.displayName = 'BookFlipbookPage';

/** The parts of page-flip's runtime API this component touches (react-pageflip types it as any). */
interface FlipRender {
  getRect(): { left: number; top: number; height: number; pageWidth: number };
  getDirection(): number;
  drawInnerShadow(): void;
  render: (timer: number) => void;
  shadow: { opacity: number };
  innerShadow: HTMLElement;
  __matte?: boolean;
}
interface FlipApi {
  flipNext(corner?: 'top' | 'bottom'): void;
  flipPrev(corner?: 'top' | 'bottom'): void;
  getCurrentPageIndex(): number;
  getPageCount(): number;
  getOrientation(): 'portrait' | 'landscape';
  getRender(): FlipRender | null;
  getPage(index: number): { setDensity(density: 'soft' | 'hard'): void };
  update(): void;
  destroy(): void;
}
type FlipBookHandle = { pageFlip: () => FlipApi | null | undefined };

/**
 * page-flip draws the curl shadow as dark → light → dark, which reads as a glossy
 * highlight. Replace it with a single soft falloff so the paper looks matte.
 */
function makeShadowsMatte(flip: FlipApi) {
  const render = flip.getRender();
  if (!render || render.__matte) return;
  const drawInnerShadow = render.drawInnerShadow.bind(render);
  render.drawInnerShadow = () => {
    drawInnerShadow();
    const forward = render.getDirection() === 0;
    const o = render.shadow.opacity;
    render.innerShadow.style.background = `linear-gradient(${forward ? 'to left' : 'to right'},
      rgba(45, 35, 25, ${o * 0.7}) 0%,
      rgba(45, 35, 25, ${o * 0.25}) 25%,
      rgba(45, 35, 25, 0) 100%)`;
  };
  render.__matte = true;
}

/**
 * react-pageflip 2.0.3 never destroys its PageFlip, and page-flip's render loop never stops on its
 * own. Stop the loop first (it would otherwise keep writing every page's style each frame), then
 * destroy: that removes the resize/mouse/touch listeners on window and the book's DOM.
 */
function teardownFlip(flip: FlipApi) {
  const render = flip.getRender();
  // Before loadFromHTML there is neither a render loop nor a UI, and destroy() would throw.
  if (!render) return;
  stopRenderLoop(render);
  flip.destroy();
}

type ShadowRect = { left: number; top: number; width: number; height: number };

/** Area covered by the visible pages, used for the drop shadow behind the book */
function shadowRect(flip: FlipApi, part: 'left' | 'right' | 'spread'): ShadowRect | null {
  const rect = flip.getRender()?.getRect();
  if (!rect) return null;
  const { left, top, height, pageWidth } = rect;
  return {
    left: part === 'right' ? left + pageWidth : left,
    top,
    width: part === 'spread' ? pageWidth * 2 : pageWidth,
    height,
  };
}

interface BookFlipbookProps {
  doc: pdfjs.PDFDocumentProxy;
  /** Layout size for page-flip, see `flipPageSize` */
  pageSize: { width: number; height: number };
}

export default function BookFlipbook({ doc, pageSize }: BookFlipbookProps) {
  const total = doc.numPages;
  const [current, setCurrent] = useState(0);
  const [portrait, setPortrait] = useState(false);
  const [offset, setOffset] = useState(0);
  const [shadow, setShadow] = useState<ShadowRect | null>(null);
  const [box, setBox] = useState<PageBox>({ width: 0, height: 0 });
  const bookRef = useRef<FlipBookHandle>(null);
  // The PageFlip instance once react-pageflip has created it; kept for teardown (bookRef is detached by then).
  const flipRef = useRef<FlipApi | null>(null);
  // False after unmount: page-flip callbacks must not touch state any more.
  const aliveRef = useRef(true);
  const stageRef = useRef<HTMLDivElement>(null);

  // Closed book (front/back cover) sits centered instead of hugging one half
  const updateOffset = useCallback((index: number) => {
    if (!aliveRef.current) return;
    const flip = bookRef.current?.pageFlip();
    if (flip) flipRef.current = flip;
    const rect = flip?.getRender()?.getRect();
    if (!flip || !rect) return;
    makeShadowsMatte(flip);
    // showCover forces front and back cover to 'hard'; turn them back into soft paper
    const count = flip.getPageCount();
    if (count > 0) {
      flip.getPage(0).setDensity('soft');
      flip.getPage(count - 1).setDensity('soft');
    }
    setBox((prev) =>
      prev.width === rect.pageWidth && prev.height === rect.height ? prev : { width: rect.pageWidth, height: rect.height },
    );
    const isPortrait = flip.getOrientation() === 'portrait';
    setPortrait(isPortrait);
    if (isPortrait) {
      setOffset(0);
      setShadow(shadowRect(flip, 'right'));
    } else if (index === 0) {
      setOffset(-rect.pageWidth / 2);
      setShadow(shadowRect(flip, 'right'));
    } else if (index >= flip.getPageCount() - 1) {
      setOffset(rect.pageWidth / 2);
      setShadow(shadowRect(flip, 'left'));
    } else {
      setOffset(0);
      setShadow(shadowRect(flip, 'spread'));
    }
  }, []);

  const onFlip = useCallback(
    (e: { data: number }) => {
      if (!aliveRef.current) return;
      setCurrent(e.data);
      updateOffset(e.data);
    },
    [updateOffset],
  );

  // Leaving a cover can only open the book, so start centering right away
  const onChangeState = useCallback((e: { data: string }) => {
    const flip = bookRef.current?.pageFlip();
    if (!aliveRef.current || !flip || e.data !== 'flipping' || flip.getOrientation() === 'portrait') return;
    const index = flip.getCurrentPageIndex();
    if (index === 0 || index >= flip.getPageCount() - 1) {
      setOffset(0);
      setShadow(shadowRect(flip, 'spread'));
    }
  }, []);

  const onInit = useCallback(() => updateOffset(0), [updateOffset]);
  const onChangeOrientation = useCallback(() => {
    const flip = bookRef.current?.pageFlip();
    if (flip) updateOffset(flip.getCurrentPageIndex());
  }, [updateOffset]);

  // Unmount: stop and destroy page-flip (react-pageflip does neither).
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      const flip = flipRef.current;
      flipRef.current = null;
      if (flip) teardownFlip(flip);
    };
  }, []);

  // page-flip only listens to window resize; also react to container changes
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const ro = new ResizeObserver(() => {
      const flip = bookRef.current?.pageFlip();
      if (!flip) return;
      flip.update();
      updateOffset(flip.getCurrentPageIndex());
    });
    ro.observe(stage);
    return () => ro.disconnect();
  }, [updateOffset]);

  const prev = useCallback(() => bookRef.current?.pageFlip()?.flipPrev('bottom'), []);
  const next = useCallback(() => bookRef.current?.pageFlip()?.flipNext('bottom'), []);

  // The only key listener (page-flip has none of its own)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prev();
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prev, next]);

  // Must stay referentially stable: react-pageflip re-initialises when children change
  const pages = useMemo(
    () =>
      Array.from({ length: total }, (_, i) => (
        <Page key={i} doc={doc} index={i} side={i === 0 || i % 2 === 0 ? 'right' : 'left'} />
      )),
    [doc, total],
  );

  const bookStyle = useMemo(() => ({ width: '100%', height: '100%' }), []);

  const atStart = current === 0;
  const atEnd = current >= total - 1;

  return (
    <div className={`zf-flipbook${portrait ? ' zf-flipbook--single' : ''}`}>
      <div className="zf-stage" ref={stageRef}>
        <CurrentPageContext.Provider value={current}>
          <PageBoxContext.Provider value={box}>
            <div className="zf-book" style={{ transform: `translateX(${offset}px)` }}>
              {shadow && <div className="zf-book__shadow" style={shadow} aria-hidden />}
              <HTMLFlipBook
                ref={bookRef}
                className="zf-book__flip"
                style={bookStyle}
                width={pageSize.width}
                height={pageSize.height}
                size="stretch"
                minWidth={MIN_PAGE_WIDTH}
                maxWidth={pageSize.width}
                minHeight={200}
                maxHeight={pageSize.height}
                autoSize={false}
                usePortrait={true}
                showCover={true}
                drawShadow={true}
                maxShadowOpacity={0.25}
                flippingTime={750}
                startPage={0}
                startZIndex={0}
                mobileScrollSupport={true}
                swipeDistance={20}
                clickEventForward={false}
                useMouseEvents={true}
                showPageCorners={true}
                disableFlipByClick={false}
                onFlip={onFlip}
                onInit={onInit}
                onChangeState={onChangeState}
                onChangeOrientation={onChangeOrientation}
              >
                {pages}
              </HTMLFlipBook>
            </div>
          </PageBoxContext.Provider>
        </CurrentPageContext.Provider>
      </div>

      <div className="zf-controls">
        <button type="button" className="zf-btn" onClick={prev} disabled={atStart} aria-label="Vorherige Seite">
          <svg viewBox="0 0 24 24" aria-hidden><path d="M15 5l-7 7 7 7" /></svg>
        </button>
        <button type="button" className="zf-btn" onClick={next} disabled={atEnd} aria-label="Nächste Seite">
          <svg viewBox="0 0 24 24" aria-hidden><path d="M9 5l7 7-7 7" /></svg>
        </button>
      </div>
    </div>
  );
}
