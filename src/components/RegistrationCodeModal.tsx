import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { Key } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';

interface RegistrationCodeModalProps {
  onValidate?: (code: string) => Promise<void>;
  onCancel?: () => void;
}

const RegistrationCodeModal = ({ onValidate, onCancel }: RegistrationCodeModalProps = {}) => {
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const { validateRegistrationCode, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) {
      setError('Por favor ingresa el código de registro');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      if (onValidate) {
        await onValidate(code);
      } else {
        await validateRegistrationCode(code);
      }
      setCode('');
    } catch (err: any) {
      setError(err.message || 'Error al validar el código');
      toast.error(err.message || 'Error al validar el código');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate('/');
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md animate-in fade-in-0 zoom-in-95 duration-300">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
            <Key className="h-6 w-6 text-blue-600" />
          </div>
          <CardTitle className="text-xl">Código de Registro Requerido</CardTitle>
          <CardDescription>
            Necesitas un código de registro para acceder al sistema por primera vez
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="registrationCode">Código de Registro</Label>
              <Input
                id="registrationCode"
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Ingresa el código proporcionado"
                className="h-11 text-center text-lg font-mono"
                autoFocus
                disabled={isLoading}
              />
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Button 
                type="submit" 
                className="w-full h-11" 
                disabled={isLoading || !code.trim()}
              >
                {isLoading ? 'Validando...' : 'Validar Código'}
              </Button>
            </div>
          </form>

                                <div className="mt-4 text-center space-y-2">
                        <p className="text-xs text-gray-500">
                          Contacta al administrador para obtener tu código de registro
                        </p>
                        <Button 
                          type="button" 
                          variant="outline" 
                          size="sm"
                          onClick={handleSignOut}
                          className="text-xs"
                        >
                          Cerrar Sesión
                        </Button>
                      </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default RegistrationCodeModal;
