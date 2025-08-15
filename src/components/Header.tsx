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
                className="w-8 h-8 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center transition-colors"
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
            <div className="sm:hidden">
              <Link
                to="/mi-empresa"
                className="w-8 h-8 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center transition-colors"
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

          {/* Botón de cerrar sesión */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSignOut}
            className="text-gray-700 hover:bg-gray-100 hidden sm:flex items-center gap-2"
          >
            <LogOut className="h-4 w-4" />
            Cerrar Sesión
          </Button>
          {/* Botón de cerrar sesión para móvil */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSignOut}
            className="text-gray-700 hover:bg-gray-100 sm:hidden p-2"
            title="Cerrar Sesión"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  );
};

export default Header;