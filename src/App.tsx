import { Routes, Route, Navigate } from 'react-router-dom';
import { ViewerPage } from './pages/ViewerPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { ProtectedRoute } from './components/ProtectedRoute';
import { EditorLayout } from './components/EditorLayout';
import { AssetLibraryPage } from './pages/AssetLibraryPage';
import { Toaster } from "@/components/ui/toaster";
import './App.css';

function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Navigate to="/project" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        
        {/* Public Viewer */}
        <Route path="/exhibition/:slug" element={<ViewerPage />} />

        {/* Protected Routes */}
        <Route element={<ProtectedRoute />}>
           <Route element={<EditorLayout />}>
              <Route path="/project/:projectId/assets" element={<AssetLibraryPage />} />
              {/* Project editor — projectId selected via ProjectSelector in header */}
              <Route path="/project" element={null} />
              <Route path="/project/:projectId/edit" element={null} />
           </Route>
        </Route>
      </Routes>
      <Toaster />
    </>
  );
}

export default App;
