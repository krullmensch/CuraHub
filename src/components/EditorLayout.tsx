import { Outlet, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

export const EditorLayout = () => {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <header style={{ 
        padding: '1rem', 
        background: '#333', 
        color: 'white', 
        display: 'flex', 
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div>
           <span style={{ fontWeight: 'bold' }}>CuraHub Editor</span>
           <span style={{ marginLeft: '1rem', fontSize: '0.8rem', color: '#ccc' }}>
             {user?.email}
           </span>
        </div>
        <button 
          onClick={handleLogout}
          style={{ 
            padding: '0.5rem 1rem', 
            background: '#d9534f', 
            color: 'white', 
            border: 'none', 
            borderRadius: '4px',
            cursor: 'pointer' 
          }}
        >
          Logout
        </button>
      </header>
      <div style={{ flex: 1, position: 'relative' }}>
         <Outlet />
      </div>
    </div>
  );
};
