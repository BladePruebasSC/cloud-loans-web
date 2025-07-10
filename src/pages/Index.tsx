import React, { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import LoginForm from '@/components/LoginForm';
import RegisterForm from '@/components/RegisterForm';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import Dashboard from '@/pages/Dashboard';
import CompanySettings from '@/components/company/CompanySettings';
import ClientForm from '@/components/clients/ClientForm';
import LoansModule from '@/components/loans/LoansModule';
import InventoryModule from '@/components/inventory/InventoryModule';
import RequestsModule from '@/components/requests/RequestsModule';
import BanksModule from '@/components/banks/BanksModule';
import UtilitiesModule from '@/components/utilities/UtilitiesModule';
import ShiftsModule from '@/components/shifts/ShiftsModule';

// Placeholder components para las rutas restantes
const Carteras = () => (
  <div className="p-6">
    <h1 className="text-3xl font-bold text-gray-900 mb-6">Gestión de Carteras</h1>
    <div className="bg-white rounded-lg shadow p-6">
      <p className="text-gray-600">Módulo de carteras en desarrollo...</p>
    </div>
  </div>
);

const Documentos = () => (
  <div className="p-6">
    <h1 className="text-3xl font-bold text-gray-900 mb-6">Gestión de Documentos</h1>
    <div className="bg-white rounded-lg shadow p-6">
      <p className="text-gray-600">Módulo de documentos en desarrollo...</p>
    </div>
  </div>
);

const Mapa = () => (
  <div className="p-6">
    <h1 className="text-3xl font-bold text-gray-900 mb-6">Mapa en Vivo</h1>
    <div className="bg-white rounded-lg shadow p-6">
      <p className="text-gray-600">Mapa en vivo en desarrollo...</p>
    </div>
  </div>
);

const Acuerdos = () => (
  <div className="p-6">
    <h1 className="text-3xl font-bold text-gray-900 mb-6">Acuerdos de Pagos</h1>
    <div className="bg-white rounded-lg shadow p-6">
      <p className="text-gray-600">Módulo de acuerdos en desarrollo...</p>
    </div>
  </div>
);

const Reportes = () => (
  <div className="p-6">
    <h1 className="text-3xl font-bold text-gray-900 mb-6">Reportes</h1>
    <div className="bg-white rounded-lg shadow p-6">
      <p className="text-gray-600">Módulo de reportes en desarrollo...</p>
    </div>
  </div>
);

const Ayuda = () => (
  <div className="p-6">
    <h1 className="text-3xl font-bold text-gray-900 mb-6">Centro de Ayuda</h1>
    <div className="bg-white rounded-lg shadow p-6">
      <p className="text-gray-600">Centro de ayuda en desarrollo...</p>
    </div>
  </div>
);

const Index = () => {
  const { user, profile, loading, signIn, signUp, signOut } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [error, setError] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogin = async (email: string, password: string) => {
    setAuthLoading(true);
    setError('');
    
    try {
      await signIn(email, password);
    } catch (err: any) {
      setError(err.message || 'Error al iniciar sesión');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleRegister = async (data: any) => {
    setAuthLoading(true);
    setError('');
    
    try {
      await signUp(data);
    } catch (err: any) {
      setError(err.message || 'Error al crear la cuenta');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  // Si el usuario no está logueado, mostrar formularios de autenticación
  if (!user) {
    if (isLogin) {
      return (
        <LoginForm
          onLogin={handleLogin}
          onSwitchToRegister={() => setIsLogin(false)}
          error={error}
          loading={authLoading}
        />
      );
    } else {
      return (
        <RegisterForm
          onRegister={handleRegister}
          onSwitchToLogin={() => setIsLogin(true)}
          error={error}
          loading={authLoading}
        />
      );
    }
  }

  const userForNav = profile ? {
    name: profile.full_name || user.email || 'Usuario',
    email: user.email || '',
  } : {
    name: user.email || 'Usuario',
    email: user.email || '',
  };

  return (
    <Router>
      <div className="min-h-screen bg-gray-50 flex">
        <Sidebar 
          isOpen={sidebarOpen} 
          onToggle={() => setSidebarOpen(!sidebarOpen)} 
        />
        
        <div className="flex-1 lg:ml-16">
          <Header 
            user={userForNav} 
            onLogout={handleLogout}
            onMenuToggle={() => setSidebarOpen(!sidebarOpen)}
          />
          
          <main className="flex-1">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/prestamos" element={<LoansModule />} />
              <Route path="/inventario" element={<InventoryModule />} />
              <Route path="/solicitudes" element={<RequestsModule />} />
              <Route path="/bancos" element={<BanksModule />} />
              <Route path="/utilidades" element={<UtilitiesModule />} />
              <Route path="/turnos" element={<ShiftsModule />} />
              <Route path="/carteras" element={<Carteras />} />
              <Route path="/documentos" element={<Documentos />} />
              <Route path="/mapa" element={<Mapa />} />
              <Route path="/acuerdos" element={<Acuerdos />} />
              <Route path="/reportes" element={<Reportes />} />
              <Route path="/empresa" element={<CompanySettings />} />
              <Route path="/clientes/nuevo" element={<ClientForm />} />
              <Route path="/ayuda" element={<Ayuda />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>
      </div>
    </Router>
  );
};

export default Index;
