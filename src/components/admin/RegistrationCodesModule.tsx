import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, Copy, RefreshCw, Calendar, Building } from 'lucide-react';
import { formatDateTimeWithOffset } from '@/utils/dateUtils';
interface RegistrationCode {
  id: string;
  code: string;
  company_name: string;
  is_used: boolean;
  used_by?: string;
  used_at?: string;
  expires_at?: string;
  created_at: string;
}

const RegistrationCodesModule = () => {
  const [codes, setCodes] = useState<RegistrationCode[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [newCode, setNewCode] = useState({
    company_name: '',
    expires_at: ''
  });

  const loadCodes = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('registration_codes')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCodes(data || []);
    } catch (error: any) {
      toast.error('Error al cargar los códigos: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const generateCode = async () => {
    if (!newCode.company_name.trim()) {
      toast.error('El nombre de la empresa es requerido');
      return;
    }

    setGenerating(true);
    try {
      const { data, error } = await supabase
        .rpc('generate_registration_code');

      if (error) throw error;

      const { data: insertData, error: insertError } = await supabase
        .from('registration_codes')
        .insert({
          code: data,
          company_name: newCode.company_name,
          expires_at: newCode.expires_at || null
        })
        .select()
        .single();

      if (insertError) throw insertError;

      setCodes(prev => [insertData, ...prev]);
      setNewCode({ company_name: '', expires_at: '' });
      toast.success('Código generado exitosamente');
    } catch (error: any) {
      toast.error('Error al generar código: ' + error.message);
    } finally {
      setGenerating(false);
    }
  };

  const copyToClipboard = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success('Código copiado al portapapeles');
    } catch (error) {
      toast.error('Error al copiar el código');
    }
  };

const formatDate = (dateString: string) => formatDateTimeWithOffset(dateString);

  useEffect(() => {
    loadCodes();
  }, []);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Códigos de Registro</h1>
          <p className="text-gray-600 mt-2">
            Genera y gestiona códigos de registro para nuevas empresas
          </p>
        </div>
        <Button onClick={loadCodes} variant="outline" disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
      </div>

      {/* Formulario para generar nuevo código */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Generar Nuevo Código
          </CardTitle>
          <CardDescription>
            Crea un nuevo código de registro para una empresa
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="company_name">Nombre de la Empresa</Label>
              <Input
                id="company_name"
                value={newCode.company_name}
                onChange={(e) => setNewCode(prev => ({ ...prev, company_name: e.target.value }))}
                placeholder="Nombre de la empresa"
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="expires_at">Fecha de Expiración (Opcional)</Label>
              <Input
                id="expires_at"
                type="datetime-local"
                value={newCode.expires_at}
                onChange={(e) => setNewCode(prev => ({ ...prev, expires_at: e.target.value }))}
                className="h-11"
              />
            </div>
          </div>
          <Button 
            onClick={generateCode} 
            disabled={generating || !newCode.company_name.trim()}
            className="w-full md:w-auto"
          >
            {generating ? 'Generando...' : 'Generar Código'}
          </Button>
        </CardContent>
      </Card>

      {/* Lista de códigos */}
      <Card>
        <CardHeader>
          <CardTitle>Códigos Generados</CardTitle>
          <CardDescription>
            {codes.length} código{codes.length !== 1 ? 's' : ''} en total
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin mr-2" />
              <span>Cargando códigos...</span>
            </div>
          ) : codes.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No hay códigos generados aún
            </div>
          ) : (
            <div className="space-y-4">
              {codes.map((code) => (
                <div
                  key={code.id}
                  className="border rounded-lg p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <Building className="h-4 w-4 text-gray-500" />
                        <span className="font-medium">{code.company_name}</span>
                        <Badge variant={code.is_used ? "secondary" : "default"}>
                          {code.is_used ? 'Usado' : 'Disponible'}
                        </Badge>
                      </div>
                      
                      <div className="flex items-center gap-4 text-sm text-gray-600">
                        <div className="flex items-center gap-1">
                          <span className="font-mono bg-gray-100 px-2 py-1 rounded">
                            {code.code}
                          </span>
                          {!code.is_used && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => copyToClipboard(code.code)}
                              className="h-6 w-6 p-0"
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          <span>Creado: {formatDate(code.created_at)}</span>
                        </div>
                        
                        {code.expires_at && (
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            <span>Expira: {formatDate(code.expires_at)}</span>
                          </div>
                        )}
                        
                        {code.is_used && code.used_at && (
                          <div className="flex items-center gap-1">
                            <span>Usado: {formatDate(code.used_at)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default RegistrationCodesModule;
