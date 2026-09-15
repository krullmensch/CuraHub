import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { HomePage } from './pages/HomePage';
import { ProtectedRoute } from './components/ProtectedRoute';
import { GooeyToaster } from 'goey-toast';
import './App.css';

const ViewerPage = lazy(() => import('./pages/ViewerPage').then((m) => ({ default: m.ViewerPage })));
const EditorLayout = lazy(() => import('./components/EditorLayout').then((m) => ({ default: m.EditorLayout })));
const AssetLibraryPage = lazy(() => import('./pages/AssetLibraryPage').then((m) => ({ default: m.AssetLibraryPage })));
const ExhibitionsPage = lazy(() => import('./pages/ExhibitionsPage').then((m) => ({ default: m.ExhibitionsPage })));
const UsersPage = lazy(() => import('./pages/UsersPage').then((m) => ({ default: m.UsersPage })));
const KeinZugriffPage = lazy(() => import('./pages/KeinZugriffPage'));

const RouteFallback = () => (
  <div className="h-screen w-screen flex items-center justify-center bg-zinc-950 text-zinc-400 text-sm">
    Lädt …
  </div>
);

function App() {
  return (
    <>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/kein-zugriff" element={<KeinZugriffPage />} />
          <Route path="/exhibitions" element={<ExhibitionsPage />} />
          <Route path="/exhibition" element={<ExhibitionsPage />} />
          {/* Public Viewer */}
          <Route path="/exhibition/:slug" element={<ViewerPage />} />

          {/* Protected Routes — curator role required */}
          <Route element={<ProtectedRoute requiredRole="curator" />}>
             <Route element={<EditorLayout />}>
                <Route path="/exhibition/:projectSlug/assets" element={<AssetLibraryPage />} />
                {/* Project editor — projectSlug selected via ProjectSelector in header */}
                <Route path="/project" element={null} />
                <Route path="/exhibition/:projectSlug/edit" element={null} />
             </Route>
          </Route>

          {/* Protected Routes — admin only */}
          <Route element={<ProtectedRoute requiredRole="admin" />}>
            <Route path="/users" element={<UsersPage />} />
          </Route>

          {/* 404 */}
          <Route path="*" element={
            <div className="h-screen w-screen flex flex-col items-center justify-center bg-zinc-950 text-white">
              <h1 className="text-6xl font-bold mb-4">404</h1>
              <p className="text-zinc-400 mb-6">Diese Seite existiert nicht.</p>
              <a href="/" className="text-blue-500 hover:text-blue-400 underline">Zurück zur Startseite</a>
            </div>
          } />
        </Routes>
      </Suspense>
      <GooeyToaster position="bottom-right" theme="dark" preset="smooth" />
    </>
  );
}

export default App;
