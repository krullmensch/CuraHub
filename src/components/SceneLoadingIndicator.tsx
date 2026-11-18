import { useProgress } from '@react-three/drei';
import { useArtworkLoadProgress } from '../lib/artworkLoadProgress';
import { sceneLoadingState } from '../lib/loading/sceneLoading';
import { ProgressBar } from './ui/loading';

/**
 * Lightweight replacement for drei's <Loader />, plus the artworks' first texture tiers (which
 * `artworkTextureManager` loads outside three's LoadingManager, so drei never sees them).
 *
 * drei's LoadingManager store updates on every finished texture/model. Subscribing to the
 * whole store re-renders on each update; when many cached textures finish in the same task
 * this produced more than 50 nested synchronous updates and React threw error #185
 * ("Maximum update depth exceeded"), which could leave the loading state stuck.
 * Selecting only `active` and progress in 5 % steps keeps re-renders to at most ~20.
 */
export const SceneLoadingIndicator = () => {
    const active = useProgress((s) => s.active);
    const progress = useProgress((s) => Math.floor(s.progress / 5) * 5);
    const artworks = useArtworkLoadProgress();
    const state = sceneLoadingState({ modelsActive: active, modelsPercent: progress, artworks });

    if (!state) return null;

    return (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-20 pointer-events-none select-none">
            <div role="status" aria-live="polite" className="flex flex-col items-center gap-2 rounded-lg bg-black/60 px-4 py-2 backdrop-blur-sm">
                <ProgressBar value={state.fraction} className="w-40" label={state.label} />
                <p className="text-[10px] uppercase tracking-[0.2em] text-white/60">{state.label} … {state.detail}</p>
            </div>
        </div>
    );
};
