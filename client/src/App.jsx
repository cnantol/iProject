import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import AppLayout from './components/AppLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import OrderList from './pages/OrderList';
import OrderDetail from './pages/OrderDetail';
import OrderCreate from './pages/OrderCreate';
import MaterialList from './pages/MaterialList';
import CommissionPage from './pages/CommissionPage';
import SalesHistory from './pages/SalesHistory';
import TodoList from './pages/TodoList';
import Settings from './pages/Settings';

function PrivateRoute() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location }} replace />;
  return <AppLayout />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<PrivateRoute />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/orders" element={<OrderList />} />
        <Route path="/orders/new" element={<OrderCreate />} />
        <Route path="/orders/:id" element={<OrderDetail />} />
        <Route path="/materials" element={<MaterialList />} />
        <Route path="/commission" element={<CommissionPage />} />
        <Route path="/sales-history" element={<SalesHistory />} />
        <Route path="/todos" element={<TodoList />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
