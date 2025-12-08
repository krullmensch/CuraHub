import { Routes, Route, Navigate } from 'react-router-dom';
import { ViewerPage } from './pages/ViewerPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { ProtectedRoute } from './components/ProtectedRoute';
import './App.css';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/exhibition/satellit" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      
      {/* Public Viewer */}
      <Route path="/exhibition/satellit" element={<ViewerPage />} />

      {/* Protected Routes (Placeholder for now) */}
      <Route element={<ProtectedRoute />}>
         <Route path="/exhibition/satellit/edit" element={<div style={{color:'white', padding: 50}}><h1>Editor Placeholder</h1></div>} />
      </Route>
    </Routes>
  );
}

export default App;
