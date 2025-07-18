import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Eye, EyeOff, DollarSign, Building, Users } from 'lucide-react';

interface LoginFormProps {
  onLogin: (email: string, password: string) => Promise<void>;
  onSwitchToRegister: () => void;
  error?: string;
  loading?: boolean;
}

const LoginForm = ({ onLogin, onSwitchToRegister, error, loading }: LoginFormProps) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [activeTab, setActiveTab] = useState('owner');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setLoginError('');
    
    try {
      await onLogin(email, password);
    } catch (error: any) {
      setLoginError(error.message || 'Error al iniciar sesión');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-primary-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="bg-primary-500 p-3 rounded-xl inline-block mb-4">
            <DollarSign className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">PrestamosFácil</h1>
          <p className="text-gray-600 mt-2">Sistema de gestión de préstamos</p>
        </div>

        <Card className="animate-fade-in">
          <CardHeader>
            <CardTitle>Iniciar Sesión</CardTitle>
            <CardDescription>
              Accede a tu cuenta para gestionar préstamos
            </CardDescription>
          </CardHeader>
          
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="owner" className="flex items-center gap-2">
                  <Building className="h-4 w-4" />
                  Dueño de Empresa
                </TabsTrigger>
                <TabsTrigger value="employee" className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Empleado
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="owner" className="space-y-4 mt-4">
                <Alert>
                  <Building className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Dueños de Empresa:</strong> Usa el email y contraseña con los que te registraste para crear tu empresa.
                  </AlertDescription>
                </Alert>
              </TabsContent>
              
              <TabsContent value="employee" className="space-y-4 mt-4">
                <Alert>
                  <Users className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Empleados:</strong> Usa el email y contraseña que te proporcionó tu empresa. Si no puedes acceder, contacta a tu supervisor.
                  </AlertDescription>
                </Alert>
              </TabsContent>
            </Tabs>

            <form onSubmit={handleSubmit} className="space-y-4">
              {(error || loginError) && (
                <Alert className="border-red-200 bg-red-50">
                  <AlertDescription className="text-red-800">
                    {error || loginError}
                  </AlertDescription>
                </Alert>
              )}
              
              <div className="space-y-2">
                <Label htmlFor="email">Correo Electrónico</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="usuario@ejemplo.com"
                  required
                  className="h-11"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="password">Contraseña</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="h-11 pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4 text-gray-400" />
                    ) : (
                      <Eye className="h-4 w-4 text-gray-400" />
                    )}
                  </Button>
                </div>
              </div>
              
              <Button 
                type="submit" 
                className="w-full h-11"
                disabled={loading || isLoading}
              >
                {(loading || isLoading) ? 'Iniciando sesión...' : 'Iniciar Sesión'}
              </Button>
            </form>
          </CardContent>
          
          <CardFooter className="flex flex-col space-y-4">
            <div className="text-center">
              <Button
                type="button"
                variant="link"
                onClick={onSwitchToRegister}
                className="text-sm"
              >
                ¿No tienes cuenta? Regístrate como empresa
              </Button>
            </div>
            
            <div className="text-xs text-gray-500 text-center space-y-1">
              <p><strong>Nota para empleados:</strong></p>
              <p>Si eres empleado de una empresa, tu supervisor debe haberte proporcionado las credenciales de acceso.</p>
              <p>No puedes registrarte directamente como empleado.</p>
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
};

export default LoginForm;