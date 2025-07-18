
import { Routes, Route, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import LoginForm from '@/components/LoginForm'
import RegisterForm from '@/components/RegisterForm'
import Index from '@/pages/Index'
import NotFound from '@/pages/NotFound'

function App() {
  const { user, loading, signIn, signUp } = useAuth()
  const navigate = useNavigate()


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
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

export default App
