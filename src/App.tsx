import { Routes, Route, Navigate } from 'react-router-dom';
import { ViewerPage } from './pages/ViewerPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { ProtectedRoute } from './components/ProtectedRoute';
// import { ViewModeControls } from '../components/ViewModeControls';
import { EditorLayout } from './components/EditorLayout';
import { AssetLibraryPage } from './pages/AssetLibraryPage';
import { Toaster } from "@/components/ui/toaster";
import './App.css';

function App() {
  console.log("DEBUG: App rendering...");
  return (
    <>
      <Routes>
        <Route path="/" element={<Navigate to="/exhibition/satellit" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        
        {/* Public Viewer */}
        <Route path="/exhibition/satellit" element={<ViewerPage />} />

        {/* Protected Routes */}
        <Route element={<ProtectedRoute />}>
           <Route element={<EditorLayout />}>
              <Route path="/dashboard/assets" element={<AssetLibraryPage />} />
              <Route path="/edit" element={<Navigate to="/exhibition/satellit/edit" replace />} />
              {/* Render null for the edit route because EditorPage is now manually managed in EditorLayout */}
              <Route path="/exhibition/satellit/edit" element={null} />
           </Route>
        </Route>
      </Routes>
      <Toaster />
    </>
  );
}

export default App;
