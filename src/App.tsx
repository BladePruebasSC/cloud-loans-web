
import { Routes, Route, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useEffect } from 'react'
import LoginForm from '@/components/LoginForm'
import RegisterForm from '@/components/RegisterForm'
import Index from '@/pages/Index'
import NotFound from '@/pages/NotFound'
import AdminCodesPanel from '@/components/admin/AdminCodesPanel'

function App() {
  const { user, loading, signIn, signUp } = useAuth()
  const navigate = useNavigate()

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

  // Mostrar pantalla de carga mientras se verifica la sesión
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/" element={
          <LoginForm 
            onLogin={signIn}
            onSwitchToRegister={() => navigate('/register')}
          />
        } />
        <Route path="/register" element={
          <RegisterForm 
            onRegister={signUp}
            onSwitchToLogin={() => navigate('/')}
          />
        } />
        <Route path="/admin/codigos-registro" element={<AdminCodesPanel />} />
        <Route path="*" element={
          <LoginForm 
            onLogin={signIn}
            onSwitchToRegister={() => navigate('/register')}
          />
        } />
      </Routes>
    )
  }

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
      <Route path="/admin/codigos-registro" element={<Index />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

export default App
