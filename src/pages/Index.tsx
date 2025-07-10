
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

// Placeholder components para las rutas
const Bancos = () => <div className="p-6"><h1 className="text-2xl font-bold">Bancos</h1></div>;
const Utilidades = () => <div className="p-6"><h1 className="text-2xl font-bold">Utilidades</h1></div>;
const Turnos = () => <div className="p-6"><h1 className="text-2xl font-bold">Turnos</h1></div>;
const Carteras = () => <div className="p-6"><h1 className="text-2xl font-bold">Carteras</h1></div>;
const Documentos = () => <div className="p-6"><h1 className="text-2xl font-bold">Documentos</h1></div>;
const Mapa = () => <div className="p-6"><h1 className="text-2xl font-bold">Mapa en vivo</h1></div>;
const Acuerdos = () => <div className="p-6"><h1 className="text-2xl font-bold">Acuerdo de pagos</h1></div>;
const Reportes = () => <div className="p-6"><h1 className="text-2xl font-bold">Reportes</h1></div>;
const Ayuda = () => <div className="p-6"><h1 className="text-2xl font-bold">Ayuda</h1></div>;

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
        
        <div className="flex-1 lg:ml-64">
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
              <Route path="/bancos" element={<Bancos />} />
              <Route path="/utilidades" element={<Utilidades />} />
              <Route path="/turnos" element={<Turnos />} />
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
