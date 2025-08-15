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
    <header className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4 sm:py-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4 sm:space-x-6">
          <button
            onClick={onToggleSidebar}
            className="lg:hidden hamburger-menu-button p-2 rounded-md transition-colors duration-200 flex-shrink-0"
          >
            <svg className="w-5 h-5 sm:w-6 sm:h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <h2 className="text-base sm:text-lg lg:text-xl font-semibold text-gray-800 leading-tight flex-shrink-0">
            {profile?.is_employee ? 'Panel de Empleado' : 'Panel de Control'}
          </h2>
        </div>
        
        <div className="flex items-center space-x-2 sm:space-x-4">
          {profile && (
            <div className="hidden sm:flex items-center space-x-3">
              <div className="text-right">
                <p className="text-sm font-medium text-gray-900">
                  {profile.full_name}
                </p>
                <p className="text-xs text-gray-500 flex items-center gap-1">
                  {profile.is_employee ? (
                    <>
                      <Users className="h-3 w-3" />
                      {profile.role === 'admin' ? 'Administrador' :
                       profile.role === 'manager' ? 'Gerente' :
                       profile.role === 'collector' ? 'Cobrador' :
                       profile.role === 'accountant' ? 'Contador' : 'Empleado'}
                    </>
                  ) : (
                    <>
                      <Building className="h-3 w-3" />
                      Dueño de Empresa
                    </>
                  )}
                </p>
              </div>
              <Link
                to="/mi-empresa"
                className="w-8 h-8 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-gray-300 transition-colors duration-200"
                title="Ir a Mi Empresa"
                aria-label="Ir a Mi Empresa"
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
                className="w-8 h-8 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center transition-colors duration-200"
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
          
          <Button
            variant="outline"
            size="sm"
            onClick={handleSignOut}
            className="flex items-center space-x-1 sm:space-x-2 text-xs sm:text-sm border-gray-300 hover:bg-gray-50 transition-colors duration-200"
          >
            <LogOut className="h-4 w-4 text-gray-700" />
            <span className="hidden sm:inline text-gray-700">Cerrar Sesión</span>
          </Button>
        </div>
      </div>
      
      {profile?.company_name && (
        <div className="mt-2 text-xs text-gray-600 hidden sm:block">
          Trabajando para: <Link to="/mi-empresa" className="font-medium hover:underline">{profile.company_name}</Link>
        </div>
      )}
    </header>
  );
};

export default Header;