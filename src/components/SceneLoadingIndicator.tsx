import { useProgress } from '@react-three/drei';

/**
 * Lightweight replacement for drei's <Loader />.
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

    if (!active) return null;

    return (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-20 pointer-events-none select-none">
            <div className="flex flex-col items-center gap-2 rounded-lg bg-black/60 px-4 py-2 backdrop-blur-sm">
                <div className="h-1 w-40 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full bg-white transition-all duration-300" style={{ width: `${progress}%` }} />
                </div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-white/60">Szene lädt … {progress} %</p>
            </div>
        </div>
    );
};
