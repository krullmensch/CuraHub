import { Routes, Route } from 'react-router-dom';
import { ViewerPage } from './pages/ViewerPage';
import { LoginPage } from './pages/LoginPage';
import { HomePage } from './pages/HomePage';
import { ProtectedRoute } from './components/ProtectedRoute';
import { EditorLayout } from './components/EditorLayout';
import { AssetLibraryPage } from './pages/AssetLibraryPage';
import KeinZugriffPage from './pages/KeinZugriffPage';
import { ExhibitionsPage } from './pages/ExhibitionsPage';
import { Toaster } from "@/components/ui/toaster";
import './App.css';

function App() {
  return (
    <>
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
              <Route path="/:projectSlug/assets" element={<AssetLibraryPage />} />
              {/* Project editor — projectSlug selected via ProjectSelector in header */}
              <Route path="/project" element={null} />
              <Route path="/:projectSlug/edit" element={null} />
           </Route>
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
      <Toaster />
    </>
  );
}

export default App;
