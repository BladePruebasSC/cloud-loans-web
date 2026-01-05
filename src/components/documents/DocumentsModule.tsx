
import React, { useRef, useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { 
  FileText, 
  Upload, 
  Download, 
  Search, 
  Filter,
  FolderOpen,
  Plus,
  Eye,
  Trash2,
  X,
  User,
  FileCheck
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Checkbox } from '@/components/ui/checkbox';
import { PasswordVerificationDialog } from '@/components/common/PasswordVerificationDialog';

interface Document {
  id: string;
  title: string;
  file_name: string | null;
  file_url: string | null;
  description: string | null;
  document_type: string;
  file_size: number | null;
  mime_type: string | null;
  created_at: string;
  loan_id: string | null;
  client_id: string | null;
}

interface Loan {
  id: string;
  amount: number;
  status: string;
  clients: {
    full_name: string;
    dni: string;
    phone: string | null;
  } | null;
}

export const DocumentsModule = () => {
  const [activeTab, setActiveTab] = useState('todos');
  const { user, companyId } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [documentForm, setDocumentForm] = useState({
    title: '',
    file_name: '',
    description: '',
    document_type: 'general',
    file: null as File | null
  });
  
  // Estados para búsqueda de préstamo
  const [loanSearch, setLoanSearch] = useState('');
  const [loans, setLoans] = useState<Loan[]>([]);
  const [filteredLoans, setFilteredLoans] = useState<Loan[]>([]);
  const [selectedLoan, setSelectedLoan] = useState<Loan | null>(null);
  const [showLoanDropdown, setShowLoanDropdown] = useState(false);
  const [previewDocument, setPreviewDocument] = useState<Document | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  
  // Estados para generar documentos
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [selectedLoanForGeneration, setSelectedLoanForGeneration] = useState<Loan | null>(null);
  const [loanSearchForGeneration, setLoanSearchForGeneration] = useState('');
  const [filteredLoansForGeneration, setFilteredLoansForGeneration] = useState<Loan[]>([]);
  const [showLoanDropdownForGeneration, setShowLoanDropdownForGeneration] = useState(false);
  const [availableDocuments, setAvailableDocuments] = useState<string[]>([]);
  const [selectedDocumentsToGenerate, setSelectedDocumentsToGenerate] = useState<string[]>([]);
  const [generatingDocuments, setGeneratingDocuments] = useState(false);

  useEffect(() => {
    if (companyId) {
      fetchLoans();
    }
  }, [companyId]);

  useEffect(() => {
    if (companyId) {
      fetchDocuments();
    } else {
      setDocuments([]);
    }
  }, [companyId, activeTab, selectedLoan]);

  useEffect(() => {
    if (showGenerateDialog) {
      setFilteredLoansForGeneration(loans);
    }
  }, [showGenerateDialog, loans]);

  const fetchLoans = async () => {
    if (!companyId) return;

    try {
      const { data, error } = await supabase
        .from('loans')
        .select(`
          id,
          amount,
          status,
          clients (
            full_name,
            dni,
            phone
          )
        `)
        .eq('loan_officer_id', companyId)
        .neq('status', 'deleted')
        .order('created_at', { ascending: false });

      if (error) throw error;
      // Asegurar que clients sea un objeto único, no un array
      const processedLoans = (data || []).map((loan: any) => ({
        ...loan,
        clients: Array.isArray(loan.clients) ? loan.clients[0] : loan.clients
      }));
      setLoans(processedLoans);
      setFilteredLoans(processedLoans);
    } catch (error: any) {
      console.error('Error fetching loans:', error);
      toast.error('Error al cargar préstamos');
    }
  };

  const handleLoanSearch = (searchTerm: string) => {
    setLoanSearch(searchTerm);
    if (searchTerm.length === 0) {
      setFilteredLoans(loans);
      setShowLoanDropdown(false);
      return;
    }

    const filtered = loans.filter(loan =>
      loan.clients?.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      loan.clients?.dni?.includes(searchTerm) ||
      (loan.clients?.phone && loan.clients.phone.includes(searchTerm)) ||
      loan.id.toLowerCase().includes(searchTerm.toLowerCase())
    );
    
    setFilteredLoans(filtered);
    setShowLoanDropdown(filtered.length > 0);
  };

  const selectLoan = (loan: Loan) => {
    setSelectedLoan(loan);
    const clientName = loan.clients?.full_name || 'Sin cliente';
    const loanInfo = `${clientName} - RD$${loan.amount.toLocaleString()}`;
    setLoanSearch(loanInfo);
    setShowLoanDropdown(false);
  };

  const clearLoanSelection = () => {
    setSelectedLoan(null);
    setLoanSearch('');
    setFilteredLoans(loans);
    setShowLoanDropdown(false);
    // No limpiar documentos, se recargarán automáticamente con todos los documentos
  };

  const fetchDocuments = async () => {
    if (!companyId) return;
    
    try {
      setLoading(true);
      let query = supabase
        .from('documents')
        .select('*')
        .eq('user_id', companyId)
        .order('created_at', { ascending: false });

      // Si hay un préstamo seleccionado, filtrar por ese préstamo
      if (selectedLoan) {
        query = query.eq('loan_id', selectedLoan.id);
      }

      // Filtrar por tipo según el tab activo
      if (activeTab === 'contratos') {
        query = query.eq('document_type', 'contract');
      } else if (activeTab === 'comprobantes') {
        query = query.eq('document_type', 'receipt');
      } else if (activeTab === 'identificaciones') {
        query = query.eq('document_type', 'identification');
      }

      const { data, error } = await query;

      if (error) throw error;
      setDocuments(data || []);
    } catch (error: any) {
      console.error('Error fetching documents:', error);
      toast.error('Error al cargar documentos');
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setDocumentForm(prev => ({
        ...prev,
        file,
        file_name: prev.file_name || file.name
      }));
    }
  };

  const handleUploadDocument = async () => {
    if (!documentForm.file || !documentForm.title || !documentForm.file_name) {
      toast.error('Completa todos los campos requeridos');
      return;
    }

    if (!selectedLoan) {
      toast.error('Debes seleccionar un préstamo primero');
      return;
    }

    if (!user || !companyId) {
      toast.error('Debes iniciar sesión para subir documentos');
      return;
    }

    try {
      toast.loading('Subiendo documento...', { id: 'upload-doc' });

      // Subir archivo a storage
      const filePath = `user-${companyId}/loans/${selectedLoan.id}/${Date.now()}-${documentForm.file_name}`;
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, documentForm.file, {
          upsert: false,
        });

        if (uploadError) throw uploadError;

      // Guardar metadata en la tabla documents
      const { error: insertError } = await supabase
          .from('documents')
          .insert({
          user_id: companyId,
          loan_id: selectedLoan.id,
          client_id: null,
          title: documentForm.title,
          file_name: documentForm.file_name,
            file_url: filePath,
          description: documentForm.description || null,
          document_type: documentForm.document_type,
          mime_type: documentForm.file.type || null,
          file_size: documentForm.file.size || null,
            status: 'active',
          });

        if (insertError) throw insertError;

      toast.success('Documento subido correctamente', { id: 'upload-doc' });
      
      // Limpiar formulario
      setDocumentForm({
        title: '',
        file_name: '',
        description: '',
        document_type: 'general',
        file: null
      });
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      setShowUploadDialog(false);
      
      // Recargar documentos
      fetchDocuments();
    } catch (error: any) {
      console.error('Error al subir documento:', error);
      toast.error(error.message || 'Error al subir documento', { id: 'upload-doc' });
    }
  };

  const handlePreviewDocument = async (doc: Document) => {
    try {
      if (!doc.file_url) {
        toast.error('No hay URL de archivo disponible');
        return;
      }

      const { data, error } = await supabase.storage
        .from('documents')
        .createSignedUrl(doc.file_url, 3600); // URL válida por 1 hora

      if (error) throw error;

      setPreviewUrl(data.signedUrl);
      setPreviewDocument(doc);
    } catch (error: any) {
      console.error('Error al previsualizar documento:', error);
      toast.error('Error al previsualizar documento');
    }
  };

  const closePreview = () => {
    setPreviewDocument(null);
    setPreviewUrl(null);
  };

  const handleDownloadDocument = async (doc: Document) => {
    try {
      if (!doc.file_url) {
        toast.error('No hay URL de archivo disponible');
        return;
      }

      const { data, error } = await supabase.storage
        .from('documents')
        .download(doc.file_url);

      if (error) throw error;

      // Crear URL temporal y descargar
      const url = window.URL.createObjectURL(data);
      const a = window.document.createElement('a');
      a.href = url;
      a.download = doc.file_name || doc.title;
      window.document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      window.document.body.removeChild(a);
    } catch (error: any) {
      console.error('Error al descargar documento:', error);
      toast.error('Error al descargar documento');
    }
  };

  const handleDeleteDocument = (documentId: string, fileUrl: string | null) => {
    setDocumentToDelete({ id: documentId, fileUrl });
    setShowPasswordVerification(true);
  };

  const confirmDeleteDocument = async () => {
    if (!documentToDelete) return;

    try {
      // Eliminar de storage
      if (documentToDelete.fileUrl) {
        const { error: storageError } = await supabase.storage
          .from('documents')
          .remove([documentToDelete.fileUrl]);
        
        if (storageError) {
          console.error('Error eliminando archivo de storage:', storageError);
        }
      }

      // Eliminar de la base de datos
      const { error: deleteError } = await supabase
        .from('documents')
        .delete()
        .eq('id', documentToDelete.id);

      if (deleteError) throw deleteError;

      toast.success('Documento eliminado correctamente');
      fetchDocuments();
      setDocumentToDelete(null);
    } catch (error: any) {
      console.error('Error al eliminar documento:', error);
      toast.error('Error al eliminar documento');
      setDocumentToDelete(null);
    }
  };

  const filteredDocuments = documents.filter(doc =>
    doc.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (doc.description && doc.description.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (doc.file_name && doc.file_name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // Tipos de documentos disponibles
  const documentTypes: { [key: string]: string } = {
    'pagare_notarial': 'PAGARÉ NOTARIAL',
    'tabla_amortizacion': 'TABLA DE AMORTIZACIÓN',
    'contrato_bluetooth': 'CONTRATO IMPRESORA BLUETOOTH',
    'pagare_codeudor': 'PAGARÉ NOTARIAL CON CODEUDOR',
    'contrato_salarial': 'CONTRATO SALARIAL',
    'carta_intimacion': 'CARTA DE INTIMACIÓN',
    'carta_saldo': 'CARTA DE SALDO',
    'prueba_documento': 'PRUEBA DE DOCUMENTO'
  };

  // Verificar qué documentos ya están generados para un préstamo
  const checkAvailableDocuments = async (loanId: string) => {
    try {
      const { data: existingDocs, error } = await supabase
        .from('documents')
        .select('description')
        .eq('loan_id', loanId)
        .eq('document_type', 'loan_document');

      if (error) throw error;

      // Extraer los tipos de documentos ya generados desde la descripción
      const generatedTypes = new Set<string>();
      existingDocs?.forEach(doc => {
        if (doc.description) {
          const match = doc.description.match(/Tipo: (\w+)/);
          if (match) {
            generatedTypes.add(match[1]);
          }
        }
      });

      // Filtrar documentos disponibles (los que no están generados)
      const available = Object.keys(documentTypes).filter(
        docType => !generatedTypes.has(docType)
      );
      
      setAvailableDocuments(available);
      setSelectedDocumentsToGenerate([]);
    } catch (error: any) {
      console.error('Error checking available documents:', error);
      toast.error('Error al verificar documentos disponibles');
      setAvailableDocuments([]);
    }
  };

  // Manejar búsqueda de préstamo para generación
  const handleLoanSearchForGeneration = (searchTerm: string) => {
    setLoanSearchForGeneration(searchTerm);
    if (searchTerm.length === 0) {
      setFilteredLoansForGeneration(loans);
      setShowLoanDropdownForGeneration(false);
      return;
    }

    const filtered = loans.filter(loan =>
      loan.clients?.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      loan.clients?.dni?.includes(searchTerm) ||
      (loan.clients?.phone && loan.clients.phone.includes(searchTerm)) ||
      loan.id.toLowerCase().includes(searchTerm.toLowerCase())
    );
    
    setFilteredLoansForGeneration(filtered);
    setShowLoanDropdownForGeneration(filtered.length > 0);
  };

  // Seleccionar préstamo para generación
  const selectLoanForGeneration = (loan: Loan) => {
    setSelectedLoanForGeneration(loan);
    const clientName = loan.clients?.full_name || 'Sin cliente';
    const loanInfo = `${clientName} - RD$${loan.amount.toLocaleString()}`;
    setLoanSearchForGeneration(loanInfo);
    setShowLoanDropdownForGeneration(false);
    checkAvailableDocuments(loan.id);
  };

  // Generar documentos seleccionados
  const handleGenerateDocuments = async () => {
    if (!selectedLoanForGeneration || selectedDocumentsToGenerate.length === 0) {
      toast.error('Selecciona un préstamo y al menos un documento');
      return;
    }

    if (!companyId || !user) {
      toast.error('Debes iniciar sesión para generar documentos');
      return;
    }

    try {
      setGeneratingDocuments(true);
      toast.loading('Generando documentos...', { id: 'generate-docs' });

      // Obtener datos completos del préstamo
      const { data: loanData, error: loanError } = await supabase
        .from('loans')
        .select(`
          *,
          clients:client_id (
            id,
            full_name,
            dni,
            phone,
            email,
            address
          )
        `)
        .eq('id', selectedLoanForGeneration.id)
        .single();

      if (loanError || !loanData) {
        throw new Error('No se pudo obtener los datos del préstamo');
      }

      // Obtener configuración de la empresa
      const { data: companySettingsData } = await supabase
        .from('company_settings')
        .select('*')
        .eq('user_id', companyId)
        .maybeSingle();

      const companySettings = companySettingsData || {};

      // Importar la función de generación de documentos
      const { generateDocumentPDF } = await import('@/components/loans/LoanForm');
      
      let generatedCount = 0;
      let failedCount = 0;

      for (const docType of selectedDocumentsToGenerate) {
        try {
          console.log(`🔍 Generando documento: ${docType}`);

          // Generar PDF del documento
          const pdfBlob = await generateDocumentPDF(
            docType, 
            loanData, 
            {}, 
            companySettings, 
            companyId
          );

          if (!pdfBlob || pdfBlob.size === 0) {
            console.error(`❌ Error: No se pudo generar el PDF para ${docType}`);
            failedCount++;
            continue;
          }

          // Crear un File desde el PDF Blob
          const fileName = `${docType}_${selectedLoanForGeneration.id}_${Date.now()}.pdf`;
          const filePath = `user-${companyId}/loans/${selectedLoanForGeneration.id}/${fileName}`;
          const file = new File([pdfBlob], fileName, { type: 'application/pdf' });

          // Subir a storage
          const { error: uploadError } = await supabase.storage
            .from('documents')
            .upload(filePath, file, {
              contentType: 'application/pdf',
              upsert: false
            });

          if (uploadError) {
            console.error(`❌ Error subiendo ${docType}:`, uploadError);
            failedCount++;
            continue;
          }

          // Guardar metadata en la base de datos
          const documentMetadata = {
            user_id: companyId,
            loan_id: selectedLoanForGeneration.id,
            client_id: loanData.client_id,
            title: documentTypes[docType] || docType,
            file_name: fileName,
            file_url: filePath,
            description: `Documento generado automáticamente: ${documentTypes[docType]} (Tipo: ${docType})`,
            document_type: 'loan_document',
            mime_type: 'application/pdf',
            file_size: file.size,
            status: 'active'
          };

          const { error: insertError } = await supabase
            .from('documents')
            .insert(documentMetadata);

          if (insertError) {
            console.error(`❌ Error guardando metadata para ${docType}:`, insertError);
            failedCount++;
            continue;
          }

          generatedCount++;
        } catch (error: any) {
          console.error(`❌ Error generando ${docType}:`, error);
          failedCount++;
        }
      }

      if (generatedCount > 0) {
        toast.success(`${generatedCount} documento(s) generado(s) exitosamente`, { id: 'generate-docs' });
      }
      if (failedCount > 0) {
        toast.error(`${failedCount} documento(s) fallaron al generarse`, { id: 'generate-docs' });
      }
      if (generatedCount === 0 && failedCount === 0) {
        toast.error('No se pudo generar ningún documento', { id: 'generate-docs' });
      }

      // Recargar documentos y cerrar modal
      fetchDocuments();
      setShowGenerateDialog(false);
      setSelectedDocumentsToGenerate([]);
      setSelectedLoanForGeneration(null);
      setLoanSearchForGeneration('');
    } catch (error: any) {
      console.error('Error generando documentos:', error);
      toast.error(error.message || 'Error al generar documentos', { id: 'generate-docs' });
    } finally {
      setGeneratingDocuments(false);
    }
  };

  const documentStats = {
    total: documents.length,
    contracts: documents.filter(d => d.document_type === 'contract').length,
    receipts: documents.filter(d => d.document_type === 'receipt').length,
    identifications: documents.filter(d => d.document_type === 'identification').length,
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Gestión de Documentos</h1>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <Button 
            onClick={() => {
              setShowGenerateDialog(true);
              setSelectedLoanForGeneration(selectedLoan);
              if (selectedLoan) {
                setLoanSearchForGeneration(`${selectedLoan.clients?.full_name || 'Sin cliente'} - RD$${selectedLoan.amount.toLocaleString()}`);
                checkAvailableDocuments(selectedLoan.id);
              }
            }}
            variant="outline"
            className="w-full sm:w-auto"
          >
            <FileCheck className="h-4 w-4 mr-2" />
            Generar Documentos
          </Button>
          <Button 
            onClick={() => setShowUploadDialog(true)} 
            className="w-full sm:w-auto"
            disabled={!selectedLoan}
          >
            <Upload className="h-4 w-4 mr-2" />
            Subir Documento
          </Button>
        </div>
      </div>

      {/* Préstamo Selector */}
      <Card>
        <CardHeader>
          <CardTitle>Buscar Préstamo</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Buscar préstamo por cliente, DNI, teléfono o ID..."
              value={loanSearch}
              onChange={(e) => handleLoanSearch(e.target.value)}
              onFocus={() => {
                if (loanSearch && filteredLoans.length > 0) {
                  setShowLoanDropdown(true);
                }
              }}
              className="pl-10 pr-10"
            />
            {selectedLoan && (
              <button
                onClick={clearLoanSelection}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
            {showLoanDropdown && filteredLoans.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-auto">
                {filteredLoans.map((loan) => (
                  <div
                    key={loan.id}
                    onClick={() => selectLoan(loan)}
                    className="px-4 py-2 hover:bg-gray-100 cursor-pointer flex items-center justify-between"
                  >
                    <div>
                      <div className="font-medium">
                        {loan.clients?.full_name || 'Sin cliente'} - RD${loan.amount.toLocaleString()}
                      </div>
                      <div className="text-sm text-gray-500">
                        {loan.clients?.dni && `DNI: ${loan.clients.dni}`} 
                        {loan.clients?.phone && ` • Tel: ${loan.clients.phone}`}
                        <span className="ml-2">• Estado: {loan.status}</span>
                      </div>
                    </div>
                    <FileText className="h-4 w-4 text-gray-400" />
                  </div>
                ))}
              </div>
            )}
          </div>
          {selectedLoan && (
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md flex items-center justify-between">
              <div>
                <div className="font-medium text-blue-900">
                  {selectedLoan.clients?.full_name || 'Sin cliente'} - RD${selectedLoan.amount.toLocaleString()}
                </div>
                <div className="text-sm text-blue-700">
                  {selectedLoan.clients?.dni && `DNI: ${selectedLoan.clients.dni}`}
                  {selectedLoan.clients?.phone && ` • Tel: ${selectedLoan.clients.phone}`}
                  <span className="ml-2">• Estado: {selectedLoan.status}</span>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={clearLoanSelection}>
                <X className="h-4 w-4 mr-2" />
                Cambiar
              </Button>
            </div>
          )}
          {!selectedLoan && (
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
              <p className="text-sm text-blue-700">
                <strong>Mostrando todos los documentos.</strong> Selecciona un préstamo para filtrar por préstamo específico.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Documentos</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{documentStats.total}</div>
            <p className="text-xs text-muted-foreground">Documentos en total</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Contratos</CardTitle>
            <FolderOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{documentStats.contracts}</div>
            <p className="text-xs text-muted-foreground">Contratos activos</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Comprobantes</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{documentStats.receipts}</div>
            <p className="text-xs text-muted-foreground">Pagos documentados</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Identificaciones</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{documentStats.identifications}</div>
            <p className="text-xs text-muted-foreground">Documentos de identidad</p>
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
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Buscar documentos..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-8 w-64"
                    />
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8">Cargando documentos...</div>
              ) : filteredDocuments.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No hay documentos {searchTerm ? 'que coincidan con la búsqueda' : 'disponibles para este préstamo'}</p>
                </div>
              ) : (
              <div className="space-y-4">
                  {filteredDocuments.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center space-x-4">
                      <FileText className="h-8 w-8 text-blue-500" />
                      <div>
                          <h3 className="font-medium">{doc.title}</h3>
                          <p className="text-sm text-gray-500">
                            {doc.document_type} • {new Date(doc.created_at).toLocaleDateString('es-DO')} • 
                            {doc.file_size ? ` ${(doc.file_size / 1024).toFixed(2)} KB` : ''}
                          </p>
                          {doc.description && (
                            <p className="text-sm text-gray-600 mt-1">{doc.description}</p>
                          )}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handlePreviewDocument(doc)}
                          title="Previsualizar"
                        >
                        <Eye className="h-4 w-4" />
                      </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleDownloadDocument(doc)}
                          title="Descargar"
                        >
                        <Download className="h-4 w-4" />
                      </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleDeleteDocument(doc.id, doc.file_url)}
                          title="Eliminar"
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="contratos" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Contratos de Préstamo</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8">Cargando...</div>
              ) : filteredDocuments.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No hay contratos disponibles</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredDocuments.map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center space-x-4">
                        <FileText className="h-8 w-8 text-blue-500" />
                        <div>
                          <h3 className="font-medium">{doc.title}</h3>
                          <p className="text-sm text-gray-500">
                            {new Date(doc.created_at).toLocaleDateString('es-DO')} • 
                            {doc.file_size ? ` ${(doc.file_size / 1024).toFixed(2)} KB` : ''}
                          </p>
                          {doc.description && (
                            <p className="text-sm text-gray-600 mt-1">{doc.description}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handlePreviewDocument(doc)}
                          title="Previsualizar"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleDownloadDocument(doc)}
                          title="Descargar"
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleDeleteDocument(doc.id, doc.file_url)}
                          title="Eliminar"
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="comprobantes" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Comprobantes de Pago</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8">Cargando...</div>
              ) : filteredDocuments.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No hay comprobantes disponibles</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredDocuments.map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center space-x-4">
                        <FileText className="h-8 w-8 text-blue-500" />
                        <div>
                          <h3 className="font-medium">{doc.title}</h3>
                          <p className="text-sm text-gray-500">
                            {new Date(doc.created_at).toLocaleDateString('es-DO')} • 
                            {doc.file_size ? ` ${(doc.file_size / 1024).toFixed(2)} KB` : ''}
                          </p>
                          {doc.description && (
                            <p className="text-sm text-gray-600 mt-1">{doc.description}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handlePreviewDocument(doc)}
                          title="Previsualizar"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleDownloadDocument(doc)}
                          title="Descargar"
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleDeleteDocument(doc.id, doc.file_url)}
                          title="Eliminar"
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="identificaciones" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Documentos de Identificación</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8">Cargando...</div>
              ) : filteredDocuments.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No hay documentos de identificación disponibles</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredDocuments.map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center space-x-4">
                        <FileText className="h-8 w-8 text-blue-500" />
                        <div>
                          <h3 className="font-medium">{doc.title}</h3>
                          <p className="text-sm text-gray-500">
                            {new Date(doc.created_at).toLocaleDateString('es-DO')} • 
                            {doc.file_size ? ` ${(doc.file_size / 1024).toFixed(2)} KB` : ''}
                          </p>
                          {doc.description && (
                            <p className="text-sm text-gray-600 mt-1">{doc.description}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handlePreviewDocument(doc)}
                          title="Previsualizar"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleDownloadDocument(doc)}
                          title="Descargar"
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleDeleteDocument(doc.id, doc.file_url)}
                          title="Eliminar"
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Modal de Subir Documento */}
      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Subir Documento</DialogTitle>
          </DialogHeader>
          {!selectedLoan ? (
            <div className="p-4 text-center text-gray-500 bg-gray-50 rounded-md">
              <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>Debes seleccionar un préstamo primero para subir documentos</p>
            </div>
          ) : (
          <div className="space-y-4">
            <div>
              <Label htmlFor="doc-title">Nombre del Documento *</Label>
              <Input
                id="doc-title"
                value={documentForm.title}
                onChange={(e) => setDocumentForm(prev => ({ ...prev, title: e.target.value }))}
                placeholder="Ej: Contrato de préstamo, Comprobante de pago, etc."
              />
            </div>
            <div>
              <Label htmlFor="doc-file-name">Nombre de Guardado *</Label>
              <Input
                id="doc-file-name"
                value={documentForm.file_name}
                onChange={(e) => setDocumentForm(prev => ({ ...prev, file_name: e.target.value }))}
                placeholder="Ej: contrato_prestamo_001.pdf"
              />
              <p className="text-xs text-gray-500 mt-1">Nombre con el que se guardará el archivo</p>
            </div>
            <div>
              <Label htmlFor="doc-type">Tipo de Documento *</Label>
              <select
                id="doc-type"
                value={documentForm.document_type}
                onChange={(e) => setDocumentForm(prev => ({ ...prev, document_type: e.target.value }))}
                className="w-full px-3 py-2 border rounded-md"
              >
                <option value="general">General</option>
                <option value="contract">Contrato</option>
                <option value="receipt">Comprobante</option>
                <option value="identification">Identificación</option>
                <option value="loan_document">Documento de Préstamo</option>
              </select>
            </div>
            <div>
              <Label htmlFor="doc-description">Descripción</Label>
              <Textarea
                id="doc-description"
                value={documentForm.description}
                onChange={(e) => setDocumentForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Detalle de qué trata este documento..."
                rows={4}
              />
            </div>
            <div>
              <Label htmlFor="doc-file">Archivo *</Label>
              <Input
                id="doc-file"
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                className="cursor-pointer"
              />
              {documentForm.file && (
                <p className="text-sm text-gray-600 mt-1">
                  Archivo seleccionado: {documentForm.file.name} ({(documentForm.file.size / 1024).toFixed(2)} KB)
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => {
                setShowUploadDialog(false);
                setDocumentForm({
                  title: '',
                  file_name: '',
                  description: '',
                  document_type: 'general',
                  file: null
                });
                if (fileInputRef.current) {
                  fileInputRef.current.value = '';
                }
              }}>
                Cancelar
              </Button>
              <Button onClick={handleUploadDocument}>
                <Upload className="h-4 w-4 mr-2" />
                Subir
              </Button>
            </div>
          </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal de Previsualización de Documento */}
      <Dialog open={!!previewDocument} onOpenChange={(open) => !open && closePreview()}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>{previewDocument?.title || 'Previsualizar Documento'}</span>
              <Button variant="ghost" size="sm" onClick={closePreview}>
                <X className="h-4 w-4" />
              </Button>
            </DialogTitle>
          </DialogHeader>
          {previewUrl && previewDocument && (
            <div className="flex-1 overflow-auto">
              {(() => {
                const fileExtension = previewDocument.file_name?.split('.').pop()?.toLowerCase() || '';
                const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(fileExtension);
                const isPdf = fileExtension === 'pdf';
                
                if (isImage) {
                  return (
                    <div className="flex justify-center items-center min-h-[400px]">
                      <img 
                        src={previewUrl} 
                        alt={previewDocument.title}
                        className="max-w-full max-h-[70vh] object-contain"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = '';
                          toast.error('No se pudo cargar la imagen');
                        }}
                      />
                    </div>
                  );
                } else if (isPdf) {
                  return (
                    <div className="w-full h-[70vh]">
                      <iframe
                        src={previewUrl}
                        className="w-full h-full border-0"
                        title={previewDocument.title}
                      />
                    </div>
                  );
                } else {
                  return (
                    <div className="text-center py-12">
                      <FileText className="h-16 w-16 mx-auto mb-4 text-gray-400" />
                      <p className="text-gray-600 mb-4">
                        No se puede previsualizar este tipo de archivo ({fileExtension || 'desconocido'})
                      </p>
                      <Button onClick={() => handleDownloadDocument(previewDocument)}>
                        <Download className="h-4 w-4 mr-2" />
                        Descargar para ver
                      </Button>
                    </div>
                  );
                }
              })()}
            </div>
          )}
          {previewDocument && (
            <div className="border-t pt-4 mt-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium">Tipo:</span> {previewDocument.document_type}
                </div>
                <div>
                  <span className="font-medium">Tamaño:</span> {previewDocument.file_size ? `${(previewDocument.file_size / 1024).toFixed(2)} KB` : 'N/A'}
                </div>
                <div>
                  <span className="font-medium">Fecha:</span> {new Date(previewDocument.created_at).toLocaleDateString('es-DO')}
                </div>
                <div>
                  <span className="font-medium">Archivo:</span> {previewDocument.file_name || 'N/A'}
                </div>
              </div>
              {previewDocument.description && (
                <div className="mt-2">
                  <span className="font-medium">Descripción:</span>
                  <p className="text-gray-600 mt-1">{previewDocument.description}</p>
                </div>
              )}
              <div className="flex justify-end gap-2 mt-4">
                <Button variant="outline" onClick={closePreview}>
                  Cerrar
                </Button>
                <Button onClick={() => {
                  if (previewDocument) {
                    handleDownloadDocument(previewDocument);
                  }
                }}>
                  <Download className="h-4 w-4 mr-2" />
                  Descargar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal de Generar Documentos */}
      <Dialog open={showGenerateDialog} onOpenChange={setShowGenerateDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Generar Documentos</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Selección de préstamo */}
            <div>
              <Label htmlFor="loan-search-generation">Seleccionar Préstamo *</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  id="loan-search-generation"
                  placeholder="Buscar préstamo por cliente, DNI, teléfono o ID..."
                  value={loanSearchForGeneration}
                  onChange={(e) => handleLoanSearchForGeneration(e.target.value)}
                  onFocus={() => {
                    if (loanSearchForGeneration && filteredLoansForGeneration.length > 0) {
                      setShowLoanDropdownForGeneration(true);
                    }
                  }}
                  className="pl-10 pr-10"
                />
                {selectedLoanForGeneration && (
                  <button
                    onClick={() => {
                      setSelectedLoanForGeneration(null);
                      setLoanSearchForGeneration('');
                      setAvailableDocuments([]);
                      setSelectedDocumentsToGenerate([]);
                    }}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
                {showLoanDropdownForGeneration && filteredLoansForGeneration.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-auto">
                    {filteredLoansForGeneration.map((loan) => (
                      <div
                        key={loan.id}
                        onClick={() => selectLoanForGeneration(loan)}
                        className="px-4 py-2 hover:bg-gray-100 cursor-pointer flex items-center justify-between"
                      >
                        <div>
                          <div className="font-medium">
                            {loan.clients?.full_name || 'Sin cliente'} - RD${loan.amount.toLocaleString()}
                          </div>
                          <div className="text-sm text-gray-500">
                            {loan.clients?.dni && `DNI: ${loan.clients.dni}`} 
                            {loan.clients?.phone && ` • Tel: ${loan.clients.phone}`}
                            <span className="ml-2">• Estado: {loan.status}</span>
                          </div>
                        </div>
                        <FileText className="h-4 w-4 text-gray-400" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {selectedLoanForGeneration && (
                <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-md">
                  <div className="font-medium text-blue-900">
                    {selectedLoanForGeneration.clients?.full_name || 'Sin cliente'} - RD${selectedLoanForGeneration.amount.toLocaleString()}
                  </div>
                </div>
              )}
            </div>

            {/* Lista de documentos disponibles */}
            {selectedLoanForGeneration && (
              <div>
                <Label>Documentos Disponibles</Label>
                {availableDocuments.length === 0 ? (
                  <div className="mt-2 p-4 text-center text-gray-500 bg-gray-50 rounded-md">
                    <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>Todos los documentos para este préstamo ya han sido generados</p>
                  </div>
                ) : (
                  <div className="mt-2 space-y-2 max-h-60 overflow-y-auto border rounded-md p-4">
                    {availableDocuments.map((docType) => (
                      <div key={docType} className="flex items-center space-x-2 p-2 hover:bg-gray-50 rounded">
                        <Checkbox
                          id={docType}
                          checked={selectedDocumentsToGenerate.includes(docType)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedDocumentsToGenerate([...selectedDocumentsToGenerate, docType]);
                            } else {
                              setSelectedDocumentsToGenerate(selectedDocumentsToGenerate.filter(d => d !== docType));
                            }
                          }}
                        />
                        <Label 
                          htmlFor={docType} 
                          className="flex-1 cursor-pointer font-normal"
                        >
                          {documentTypes[docType] || docType}
                        </Label>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {!selectedLoanForGeneration && (
              <div className="p-4 text-center text-gray-500 bg-gray-50 rounded-md">
                <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Selecciona un préstamo para ver los documentos disponibles</p>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-4">
              <Button 
                variant="outline" 
                onClick={() => {
                  setShowGenerateDialog(false);
                  setSelectedLoanForGeneration(null);
                  setLoanSearchForGeneration('');
                  setAvailableDocuments([]);
                  setSelectedDocumentsToGenerate([]);
                }}
              >
                Cancelar
              </Button>
              <Button 
                onClick={handleGenerateDocuments}
                disabled={!selectedLoanForGeneration || selectedDocumentsToGenerate.length === 0 || generatingDocuments}
              >
                <FileCheck className="h-4 w-4 mr-2" />
                {generatingDocuments ? 'Generando...' : `Generar ${selectedDocumentsToGenerate.length} Documento(s)`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Diálogo de Verificación de Contraseña */}
      <PasswordVerificationDialog
        isOpen={showPasswordVerification}
        onClose={() => {
          setShowPasswordVerification(false);
          setDocumentToDelete(null);
        }}
        onVerify={() => {
          setShowPasswordVerification(false);
          confirmDeleteDocument();
        }}
        title="Verificar Contraseña"
        description="Por seguridad, ingresa tu contraseña para confirmar la eliminación del documento."
        entityName="documento"
      />
    </div>
  );
};
