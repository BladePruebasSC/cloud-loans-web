import React from 'react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { LogOut, User, Building, Users } from 'lucide-react';

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
    <header className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <h2 className="text-xl font-semibold text-gray-800">
            {profile?.is_employee ? 'Panel de Empleado' : 'Panel de Control'}
          </h2>
        </div>
        
        <div className="flex items-center space-x-4">
          {profile && (
            <div className="flex items-center space-x-3">
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
                       profile.role === 'accountant' ? 'Contador' : 'Empleado'} • Empresa
                    </>
                  ) : (
                    <>
                      <Building className="h-3 w-3" />
                      Dueño de Empresa
                    </>
                  )}
                </p>
              </div>
              <div className="w-8 h-8 bg-primary-500 rounded-full flex items-center justify-center">
                {profile.is_employee ? (
                  <Users className="h-4 w-4 text-white" />
                ) : (
                  <User className="h-4 w-4 text-white" />
                )}
              </div>
            </div>
          )}
          
          <Button
            variant="outline"
            size="sm"
            onClick={handleSignOut}
            className="flex items-center space-x-2"
          >
            <LogOut className="h-4 w-4" />
            <span>Cerrar Sesión</span>
          </Button>
        </div>
      </div>
      
      {profile?.is_employee && profile.company_name && (
        <div className="mt-2 text-xs text-gray-600">
          Trabajando para: <span className="font-medium">{profile.company_name}</span>
        </div>
      )}
    </header>
  );
};

export default Header;