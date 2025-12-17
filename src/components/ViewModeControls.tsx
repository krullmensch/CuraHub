import { useEffect } from 'react';
import { useEditorStore, PlannerViewMode } from '../store/editorStore';

export const ViewModeControls = () => {
    const viewMode = useEditorStore(state => state.plannerViewMode);
    const setViewMode = useEditorStore(state => state.setPlannerViewMode);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

            switch(e.key.toLowerCase()) {
                case 'o':
                    setViewMode('orthographic');
                    break;
                case 'p':
                    setViewMode('perspective');
                    break;
                case 'v':
                    setViewMode('firstPerson');
                    break;
                case 'escape':
                    if (viewMode === 'firstPerson') {
                        setViewMode('orthographic');
                    }
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [setViewMode, viewMode]);

    const getButtonStyle = (mode: PlannerViewMode) => {
        const isActive = viewMode === mode;
        return `px-3 py-1.5 rounded text-sm font-medium transition-colors ${
            isActive 
                ? 'bg-blue-600 text-white shadow-sm' 
                : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
        }`;
    };

    return (
        <div className="flex items-center gap-2 mr-4 bg-white/90 p-1.5 rounded-md shadow-sm backdrop-blur-sm border border-gray-200">
            <button 
                onClick={() => setViewMode('orthographic')}
                className={getButtonStyle('orthographic')}
                title="Orthographic View (O)"
            >
                📐 Ortho
            </button>
            <button 
                onClick={() => setViewMode('perspective')}
                className={getButtonStyle('perspective')}
                title="Perspective View (P)"
            >
                📷 Persp
            </button>
            <div className="w-px h-4 bg-gray-300 mx-1"></div>
            <button 
                onClick={() => setViewMode('firstPerson')}
                className={getButtonStyle('firstPerson')}
                title="First Person Preview (V)"
            >
                👁️ Viewer
            </button>
        </div>
    );
};
