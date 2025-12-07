import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ViewerPage } from './pages/ViewerPage';
import './App.css';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Navigate to="/exhibition/satellit" replace />} />
        <Route path="/exhibition/satellit" element={<ViewerPage />} />
      </Routes>
    </Router>
  );
}

export default App;
