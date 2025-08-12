
import React, { useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  FileText, 
  Upload, 
  Download, 
  Search, 
  Filter,
  FolderOpen,
  Plus,
  Eye,
  Trash2
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export const DocumentsModule = () => {
  const [activeTab, setActiveTab] = useState('todos');
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUploadClick = () => fileInputRef.current?.click();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    if (!user) {
      toast.error('Debes iniciar sesión para subir documentos');
      return;
    }
    toast.loading('Subiendo documentos...', { id: 'upload-docs' });
    try {
      for (const file of Array.from(files)) {
        const filePath = `user-${user.id}/${Date.now()}-${file.name}`;
        const { error: uploadError } = await supabase.storage.from('documents').upload(filePath, file, {
          upsert: false,
        });
        if (uploadError) throw uploadError;

        // Save metadata in documents table
        const { error: insertError } = await (supabase as any)
          .from('documents')
          .insert({
            user_id: user.id,
            title: file.name,
            document_type: 'general',
            file_url: filePath,
            file_name: file.name,
            mime_type: file.type || null,
            file_size: file.size || null,
            status: 'active',
          });
        if (insertError) throw insertError;
      }
      toast.success('Documentos subidos correctamente', { id: 'upload-docs' });
    } catch (err: any) {
      console.error('Error al subir documentos:', err);
      toast.error(err.message || 'Error al subir documentos', { id: 'upload-docs' });
    } finally {
      e.target.value = '';
    }
  };

  const mockDocuments = [
    { id: 1, name: 'Contrato Préstamo #001', type: 'Contrato', date: '2024-01-15', size: '2.4 MB' },
    { id: 2, name: 'Comprobante Pago Cliente A', type: 'Comprobante', date: '2024-01-14', size: '1.2 MB' },
    { id: 3, name: 'Identificación Cliente B', type: 'Identificación', date: '2024-01-13', size: '0.8 MB' },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Gestión de Documentos</h1>
        <div className="flex gap-2">
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Descargar Todos
          </Button>
          <Button onClick={handleUploadClick}>
            <Upload className="h-4 w-4 mr-2" />
            Subir Documento
          </Button>
          <input type="file" ref={fileInputRef} onChange={handleFileChange} multiple className="hidden" />
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Documentos</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">156</div>
            <p className="text-xs text-muted-foreground">+12 este mes</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Contratos</CardTitle>
            <FolderOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">45</div>
            <p className="text-xs text-muted-foreground">Contratos activos</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Comprobantes</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">89</div>
            <p className="text-xs text-muted-foreground">Pagos documentados</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Espacio Usado</CardTitle>
            <Upload className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">2.4GB</div>
            <p className="text-xs text-muted-foreground">de 10GB disponibles</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full overflow-x-auto">
          <TabsTrigger value="todos">Todos</TabsTrigger>
          <TabsTrigger value="contratos">Contratos</TabsTrigger>
          <TabsTrigger value="comprobantes">Comprobantes</TabsTrigger>
          <TabsTrigger value="identificaciones">Identificaciones</TabsTrigger>
        </TabsList>

        <TabsContent value="todos" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Lista de Documentos</CardTitle>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm">
                    <Search className="h-4 w-4 mr-2" />
                    Buscar
                  </Button>
                  <Button variant="outline" size="sm">
                    <Filter className="h-4 w-4 mr-2" />
                    Filtrar
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {mockDocuments.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center space-x-4">
                      <FileText className="h-8 w-8 text-blue-500" />
                      <div>
                        <h3 className="font-medium">{doc.name}</h3>
                        <p className="text-sm text-gray-500">{doc.type} • {doc.date} • {doc.size}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button variant="outline" size="sm">
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="sm">
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="sm">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="contratos">
          <Card>
            <CardContent className="text-center py-8">
              <FileText className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <h3 className="text-lg font-medium mb-2">Contratos de Préstamo</h3>
              <p className="text-gray-600">Gestiona todos los contratos de préstamo</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="comprobantes">
          <Card>
            <CardContent className="text-center py-8">
              <FileText className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <h3 className="text-lg font-medium mb-2">Comprobantes de Pago</h3>
              <p className="text-gray-600">Comprobantes y recibos de pagos</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="identificaciones">
          <Card>
            <CardContent className="text-center py-8">
              <FileText className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <h3 className="text-lg font-medium mb-2">Documentos de Identificación</h3>
              <p className="text-gray-600">Cédulas y documentos de identidad</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
