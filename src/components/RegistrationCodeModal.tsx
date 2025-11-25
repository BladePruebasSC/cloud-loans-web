import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { Key, AlertCircle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

const RegistrationCodeModal = () => {
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isExpired, setIsExpired] = useState(false);
  const { validateRegistrationCode, signOut, user } = useAuth();
  const navigate = useNavigate();

  // Verificar si el código usado ha expirado al cargar el componente
  React.useEffect(() => {
    const checkCodeExpiration = async () => {
      if (!user) return;
      
      try {
        const { data: usedCode } = await supabase
          .from('registration_codes')
          .select('expires_at')
          .eq('used_by', user.id)
          .maybeSingle();

        if (usedCode?.expires_at) {
          const expirationDate = new Date(usedCode.expires_at);
          const now = new Date();
          
          if (expirationDate < now) {
            setIsExpired(true);
          }
        }
      } catch (error) {
        console.error('Error verificando expiración:', error);
      }
    };

    checkCodeExpiration();
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) {
      setError('Por favor ingresa el código de registro');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      await validateRegistrationCode(code);
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
          <CardTitle className="text-xl">
            {isExpired ? 'Código de Registro Expirado' : 'Código de Registro Requerido'}
          </CardTitle>
          <CardDescription>
            {isExpired 
              ? 'Tu código de registro ha expirado. Necesitas un nuevo código para continuar.'
              : 'Necesitas un código de registro para acceder al sistema por primera vez'}
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

            {isExpired && !error && (
              <Alert variant="destructive" className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Tu código de registro anterior ha expirado. Por favor, ingresa un nuevo código válido para continuar.
                </AlertDescription>
              </Alert>
            )}

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
