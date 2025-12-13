  
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useEffect, useState } from 'react'
import LoginForm from '@/components/LoginForm'
import RegisterForm from '@/components/RegisterForm'
import Index from '@/pages/Index'
import NotFound from '@/pages/NotFound'
import AdminCodesPanel from '@/components/admin/AdminCodesPanel'
import RegistrationCodeModal from '@/components/RegistrationCodeModal'
import LandingPage from '@/pages/LandingPage'

function App() {
  const { user, loading, signIn, signUp, signOut, needsRegistrationCode, validateRegistrationCode } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [loadingTime, setLoadingTime] = useState(0)

  // Efecto global para detectar Ctrl + Alt + A desde cualquier lugar
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ctrl + Alt + A (mayúscula o minúscula) para acceso directo al panel de códigos
      if (event.ctrlKey && event.altKey && (event.key === 'A' || event.key === 'a')) {
        event.preventDefault();
        // Redirigir directamente al panel de códigos
        navigate('/admin/codigos-registro');
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [navigate]);

  // Contador de tiempo de carga
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (loading) {
      setLoadingTime(0);
      interval = setInterval(() => {
        setLoadingTime(prev => prev + 1);
      }, 1000);
    } else {
      setLoadingTime(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [loading]);

  // Detectar si hay otras pestañas abiertas
  useEffect(() => {
    const handleBeforeUnload = () => {
      // Marcar que esta pestaña se está cerrando
      sessionStorage.setItem('tabClosing', Date.now().toString());
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  // Redirigir a la ruta principal si el usuario autenticado está en rutas públicas
  useEffect(() => {
    if (!user) return;

    const publicPaths = ['/login', '/register', '/logi', '/log'];
    if (publicPaths.includes(location.pathname)) {
      navigate('/', { replace: true });
    }
  }, [user, location.pathname, navigate]);



  // Mostrar pantalla de carga mientras se verifica la sesión
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600 mb-2">Cargando...</p>
          <p className="text-sm text-gray-500 mb-4">
            Tiempo transcurrido: {loadingTime}s
            {loadingTime > 5 && (
              <span className="block text-blue-600 mt-2">
                ℹ️ Verificando sesión y sincronizando con otras pestañas...
              </span>
            )}
            {loadingTime > 10 && (
              <span className="block text-orange-600 mt-2">
                ⚠️ La carga está tomando más tiempo del normal
              </span>
            )}
          </p>
          {loadingTime > 3 && (
            <div className="space-x-2">
              <button 
                onClick={() => window.location.reload()} 
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
              >
                Recargar Página
              </button>
              <button 
                onClick={() => window.location.href = '/'} 
                className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
              >
                Ir al Inicio
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  const handleSignUp = async (data: any) => {
    try {
      const success = await signUp(data);
      if (success) {
        // Redirigir inmediatamente después del registro exitoso
        navigate('/');
      }
    } catch (error) {
      // El error ya se maneja en el hook
    }
  };

  if (!user) {
    return (
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={
          <LoginForm 
            onLogin={signIn}
            onSwitchToRegister={() => navigate('/register')}
          />
        } />
        <Route path="/register" element={
          <RegisterForm 
            onRegister={handleSignUp}
            onSwitchToLogin={() => navigate('/login')}
          />
        } />
        <Route path="/admin/codigos-registro" element={<AdminCodesPanel />} />
        <Route path="*" element={<LandingPage />} />
      </Routes>
    )
  }

  // Si el usuario está autenticado pero necesita código de registro
  if (user && needsRegistrationCode && !loading) {
    console.log('🔍 App.tsx: Mostrando modal de código de registro');
    console.log('🔍 App.tsx: user =', user?.email);
    console.log('🔍 App.tsx: needsRegistrationCode =', needsRegistrationCode);
    return <RegistrationCodeModal />;
  }

  console.log('🔍 App.tsx: No se muestra modal, continuando con rutas normales');
  return (
    <Routes>
      <Route path="/" element={<Index />} />
      <Route path="/prestamos" element={<Index />} />
      <Route path="/prestamos/nuevo" element={<Index />} />
      <Route path="/carteras" element={<Index />} />
      <Route path="/clientes" element={<Index />} />
      <Route path="/clientes/nuevo" element={<Index />} />
      <Route path="/clientes/editar/:id" element={<Index />} />
      <Route path="/inventario" element={<Index />} />
      <Route path="/compra-venta" element={<Index />} />
      <Route path="/punto-venta" element={<Index />} />
      <Route path="/documentos" element={<Index />} />
      <Route path="/solicitudes" element={<Index />} />
      <Route path="/bancos" element={<Index />} />
      <Route path="/utilidades" element={<Index />} />
      <Route path="/turnos" element={<Index />} />
      <Route path="/mi-empresa" element={<Index />} />
      <Route path="/empresa" element={<Index />} />
      <Route path="/acuerdos" element={<Index />} />
      <Route path="/reportes" element={<Index />} />
      <Route path="/mapa" element={<Index />} />
      <Route path="/cobro-rapido" element={<Index />} />
      <Route path="/backup" element={<Index />} />
      <Route path="/admin/codigos-registro" element={<Index />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

export default App
