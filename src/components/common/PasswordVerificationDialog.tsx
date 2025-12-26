import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Eye, EyeOff, Lock } from 'lucide-react';

interface PasswordVerificationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onVerify: () => void;
  title?: string;
  description?: string;
  entityName?: string;
}

export const PasswordVerificationDialog: React.FC<PasswordVerificationDialogProps> = ({
  isOpen,
  onClose,
  onVerify,
  title = 'Verificación de Contraseña',
  description = 'Por seguridad, ingresa tu contraseña para confirmar esta acción.',
  entityName
}) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState('');

  const handleVerify = async () => {
    if (!password.trim()) {
      setError('Por favor ingresa tu contraseña');
      return;
    }

    setIsVerifying(true);
    setError('');

    try {
      // Obtener el usuario actual
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      if (userError || !user || !user.email) {
        throw new Error('No se pudo obtener la información del usuario');
      }

      // Verificar la contraseña intentando iniciar sesión
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: password
      });

      if (signInError) {
        if (signInError.message.includes('Invalid login credentials') || 
            signInError.message.includes('Invalid credentials')) {
          setError('Contraseña incorrecta');
        } else {
          setError('Error al verificar la contraseña');
        }
        return;
      }

      // Contraseña correcta, ejecutar la acción
      setPassword('');
      onVerify();
      onClose();
    } catch (error: any) {
      console.error('Error verificando contraseña:', error);
      setError(error.message || 'Error al verificar la contraseña');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleClose = () => {
    if (!isVerifying) {
      setPassword('');
      setError('');
      onClose();
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isVerifying) {
      handleVerify();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-red-100 rounded-full">
              <Lock className="h-5 w-5 text-red-600" />
            </div>
            <DialogTitle className="text-xl">{title}</DialogTitle>
          </div>
          <DialogDescription className="text-base pt-2">
            {description}
            {entityName && (
              <span className="block mt-2 font-semibold text-red-600">
                Acción: Eliminar {entityName}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="password">Contraseña</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError('');
                }}
                onKeyPress={handleKeyPress}
                placeholder="Ingresa tu contraseña"
                disabled={isVerifying}
                className={error ? 'border-red-500' : ''}
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                disabled={isVerifying}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
            {error && (
              <p className="text-sm text-red-600 mt-1">{error}</p>
            )}
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
            <p className="text-sm text-yellow-800">
              <strong>⚠️ Advertencia:</strong> Esta acción no se puede deshacer. Asegúrate de que realmente deseas eliminar este elemento.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isVerifying}
          >
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={handleVerify}
            disabled={isVerifying || !password.trim()}
          >
            {isVerifying ? 'Verificando...' : 'Confirmar Eliminación'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

