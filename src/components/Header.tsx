import React from 'react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { LogOut, User, Building, Users } from 'lucide-react';
import { Link } from 'react-router-dom';

interface HeaderProps {
  onToggleSidebar: () => void;
}

const Header: React.FC<HeaderProps> = ({ onToggleSidebar }) => {
  const { user, profile, signOut } = useAuth();

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  return (
<<<<<<< HEAD
    <header className="bg-white border-b border-gray-200 px-4 py-3 shadow-sm">
      <div className="flex items-center justify-between">
        {/* Lado izquierdo - Menú hamburguesa y título */}
        <div className="flex items-center gap-4">
          {/* Botón hamburguesa limpio */}
          <button
            onClick={onToggleSidebar}
            className="lg:hidden p-1 text-gray-700 hover:text-gray-900 transition-colors focus:outline-none focus:ring-0"
            aria-label="Abrir menú"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          
          {/* Título */}
          <h1 className="text-lg font-semibold text-gray-900 truncate">
            {profile?.is_employee ? 'Panel de Empleado' : 'Panel de Control'}
          </h1>
        </div>

        {/* Lado derecho - Acciones */}
        <div className="flex items-center gap-2">
          {/* Perfil - Solo en desktop */}
          {profile && (
            <div className="hidden sm:flex items-center gap-3">
              <div className="text-right">
=======
    <header className="bg-white border-b border-gray-200 px-3 sm:px-6 py-3 sm:py-4 shadow-sm">
      <div className="flex items-center justify-between gap-2 sm:gap-4">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
          <button
            onClick={onToggleSidebar}
            className="lg:hidden hamburger-menu-button p-1.5 sm:p-2 rounded-md transition-colors duration-200 flex-shrink-0"
          >
            <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <h2 className="text-sm sm:text-lg lg:text-xl font-semibold text-gray-800 leading-tight truncate min-w-0">
            {profile?.is_employee ? 'Panel de Empleado' : 'PrestamosFácil'}
          </h2>
        </div>
        
        <div className="flex items-center gap-1 sm:gap-3 flex-shrink-0">
          {profile && (
            <div className="hidden md:flex items-center gap-3">
              <div className="text-right min-w-0">
>>>>>>> 7b51b0186edfaf68802c01d1e0fc3e6c458e588d
                <p className="text-sm font-medium text-gray-900 truncate">
                  {profile.full_name}
                </p>
                <p className="text-xs text-gray-500 flex items-center gap-1">
                  {profile.is_employee ? (
                    <>
                      <Users className="h-3 w-3 flex-shrink-0" />
                      <span className="truncate">
                        {profile.role === 'admin' ? 'Administrador' :
                         profile.role === 'manager' ? 'Gerente' :
                         profile.role === 'collector' ? 'Cobrador' :
                         profile.role === 'accountant' ? 'Contador' : 'Empleado'}
                      </span>
                    </>
                  ) : (
                    <>
                      <Building className="h-3 w-3 flex-shrink-0" />
                      <span className="truncate">Dueño de Empresa</span>
                    </>
                  )}
                </p>
              </div>
              
              <Link
                to="/mi-empresa"
<<<<<<< HEAD
                className="w-8 h-8 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center transition-colors"
=======
                className="w-8 h-8 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-gray-300 transition-colors duration-200 flex-shrink-0"
>>>>>>> 7b51b0186edfaf68802c01d1e0fc3e6c458e588d
                title="Ir a Mi Empresa"
              >
                {profile.is_employee ? (
                  <Users className="h-4 w-4 text-gray-700" />
                ) : (
                  <User className="h-4 w-4 text-gray-700" />
                )}
              </Link>
            </div>
          )}

          {/* Perfil móvil */}
          {profile && (
            <div className="md:hidden">
              <Link
                to="/mi-empresa"
<<<<<<< HEAD
                className="w-8 h-8 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center transition-colors"
=======
                className="w-8 h-8 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center transition-colors duration-200 flex-shrink-0"
>>>>>>> 7b51b0186edfaf68802c01d1e0fc3e6c458e588d
                title="Mi Perfil"
              >
                {profile.is_employee ? (
                  <Users className="h-4 w-4 text-gray-700" />
                ) : (
                  <User className="h-4 w-4 text-gray-700" />
                )}
              </Link>
            </div>
          )}

          {/* Botón cerrar sesión */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleSignOut}
<<<<<<< HEAD
            className="flex items-center gap-1 text-xs border-gray-300 hover:bg-gray-50"
=======
            className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm border-gray-300 hover:bg-gray-50 transition-colors duration-200 flex-shrink-0 px-2 sm:px-3"
>>>>>>> 7b51b0186edfaf68802c01d1e0fc3e6c458e588d
          >
            <LogOut className="h-4 w-4 text-gray-700 flex-shrink-0" />
            <span className="hidden sm:inline text-gray-700">Cerrar Sesión</span>
          </Button>
        </div>
      </div>

      {/* Información de empresa - Solo en desktop */}
      {profile?.company_name && (
        <div className="mt-2 text-xs text-gray-600 hidden sm:block px-1">
          Trabajando para: <Link to="/mi-empresa" className="font-medium hover:underline truncate">{profile.company_name}</Link>
        </div>
      )}
    </header>
  );
};

export default Header;