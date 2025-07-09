
import React from 'react';
import { Button } from '@/components/ui/button';
import { LogOut, User, Menu, Bell } from 'lucide-react';

interface HeaderProps {
  user?: {
    name: string;
    email: string;
  };
  onLogout?: () => void;
  onMenuToggle?: () => void;
}

const Header = ({ user, onLogout, onMenuToggle }: HeaderProps) => {
  return (
    <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-30">
      <div className="flex items-center justify-between px-4 h-16">
        <div className="flex items-center space-x-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={onMenuToggle}
            className="lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </Button>
          
          <div className="hidden lg:block">
            <h2 className="text-xl font-semibold text-gray-900">Dashboard</h2>
          </div>
        </div>
        
        <div className="flex items-center space-x-4">
          <Button variant="ghost" size="sm">
            <Bell className="h-5 w-5" />
          </Button>
          
          {user && (
            <>
              <div className="flex items-center space-x-2">
                <User className="h-5 w-5 text-gray-400" />
                <div className="text-sm">
                  <p className="font-medium text-gray-900">{user.name}</p>
                  <p className="text-gray-500">{user.email}</p>
                </div>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={onLogout}
                className="flex items-center space-x-2"
              >
                <LogOut className="h-4 w-4" />
                <span>Salir</span>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
