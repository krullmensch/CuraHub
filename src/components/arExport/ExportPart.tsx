import { Component, Suspense, useEffect, type ReactNode } from 'react';
import { useExportMode, type ExportSession } from '../../lib/arExport/exportMode';

interface BoundaryProps {
    part: string;
    session: ExportSession;
    children: ReactNode;
}

/** Catches a part that failed to load (a model 404, a broken GLB) so the rest still exports. */
class ExportPartBoundary extends Component<BoundaryProps, { failed: boolean }> {
    state = { failed: false };

    static getDerivedStateFromError(): { failed: boolean } {
        return { failed: true };
    }

    componentDidCatch(error: unknown): void {
        this.props.session.fail(this.props.part, error);
    }

    render(): ReactNode {
        return this.state.failed ? null : this.props.children;
    }
}

const Expect = ({ part, session }: { part: string; session: ExportSession }) => {
    useEffect(() => session.expect(part), [part, session]);
    return null;
};

const Ready = ({ part, session }: { part: string; session: ExportSession }) => {
    useEffect(() => session.ready(part), [part, session]);
    return null;
};

/**
 * Suspense boundary that reports to the AR export session: the part is expected as soon as the
 * boundary mounts, ready once its content mounted (it only commits after everything inside
 * resolved), failed when the content threw. Outside export mode just a Suspense boundary.
 */
export const ExportPart = ({ part, children }: { part: string; children: ReactNode }) => {
    const { session } = useExportMode();
    if (!session) return <Suspense fallback={null}>{children}</Suspense>;
    return (
        <ExportPartBoundary part={part} session={session}>
            <Expect part={part} session={session} />
            <Suspense fallback={null}>
                {children}
                <Ready part={part} session={session} />
            </Suspense>
        </ExportPartBoundary>
    );
};
