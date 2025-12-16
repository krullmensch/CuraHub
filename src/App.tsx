import { Routes, Route, Navigate } from 'react-router-dom';
import { ViewerPage } from './pages/ViewerPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { ProtectedRoute } from './components/ProtectedRoute';
import { EditorLayout } from './components/EditorLayout';
import { EditorPage } from './pages/EditorPage';
import './App.css';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/exhibition/satellit" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      
      {/* Public Viewer */}
      <Route path="/exhibition/satellit" element={<ViewerPage />} />

      {/* Protected Routes */}
      <Route element={<ProtectedRoute />}>
         <Route element={<EditorLayout />}>
            <Route path="/exhibition/satellit/edit" element={<EditorPage />} />
         </Route>
      </Route>
    </Routes>
  );
}

export default App;
