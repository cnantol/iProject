import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import { useAuth } from './context/AuthContext';
import AppLayout from './components/AppLayout';

const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const OrderList = lazy(() => import('./pages/OrderList'));
const OrderDetail = lazy(() => import('./pages/OrderDetail'));
const OrderCreate = lazy(() => import('./pages/OrderCreate'));
const MaterialList = lazy(() => import('./pages/MaterialList'));
const CommissionPage = lazy(() => import('./pages/CommissionPage'));
const SalesHistory = lazy(() => import('./pages/SalesHistory'));
const TodoList = lazy(() => import('./pages/TodoList'));
const Settings = lazy(() => import('./pages/Settings'));

function PrivateRoute() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location }} replace />;
  return <AppLayout />;
}

export default function App() {
  return (
    <Suspense
      fallback={
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 12 }}>
          <CircularProgress />
        </Box>
      }
    >
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
    </Suspense>
  );
}
