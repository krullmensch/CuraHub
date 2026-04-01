import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore, AppRole } from '../store/authStore';

const ROLE_HIERARCHY: Record<AppRole, number> = {
  user: 0,
  curator: 1,
  prof: 2,
  admin: 3,
};

interface ProtectedRouteProps {
  requiredRole?: AppRole;
}

export const ProtectedRoute = ({ requiredRole }: ProtectedRouteProps) => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const user = useAuthStore((state) => state.user);
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requiredRole && user) {
    const userLevel = ROLE_HIERARCHY[user.role] ?? 0;
    const requiredLevel = ROLE_HIERARCHY[requiredRole];
    if (userLevel < requiredLevel) {
      return <Navigate to="/kein-zugriff" replace />;
    }
  }

  return <Outlet />;
};
