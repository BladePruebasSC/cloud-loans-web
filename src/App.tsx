
import { Routes, Route } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import LoginForm from '@/components/LoginForm'
import RegisterForm from '@/components/RegisterForm'
import Index from '@/pages/Index'
import NotFound from '@/pages/NotFound'

function App() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/" element={<LoginForm />} />
        <Route path="/register" element={<RegisterForm />} />
        <Route path="*" element={<LoginForm />} />
      </Routes>
    )
  }

  return (
    <Routes>
      <Route path="/" element={<Index />} />
      <Route path="/prestamos" element={<Index />} />
      <Route path="/clientes" element={<Index />} />
      <Route path="/inventario" element={<Index />} />
      <Route path="/solicitudes" element={<Index />} />
      <Route path="/bancos" element={<Index />} />
      <Route path="/utilidades" element={<Index />} />
      <Route path="/turnos" element={<Index />} />
      <Route path="/mi-empresa" element={<Index />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

export default App
