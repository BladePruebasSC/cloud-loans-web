import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Download,
  Upload,
  FileSpreadsheet,
  FileText,
  Database,
  Users,
  CreditCard,
  DollarSign,
  Package,
  ShoppingCart,
  Scale,
  File,
  FileText as FileTextIcon,
  Building2,
  Calendar,
  CheckCircle2,
  Loader2,
  AlertCircle,
  X
} from 'lucide-react';
import {
  exportToCSV,
  exportToExcel,
  exportToExcelMultiSheet,
  exportToPDF,
  formatDataForExport,
  importFromCSV,
  importFromExcel,
  importFromExcelMultiSheet,
  validateImportedData
} from '@/utils/exportUtils';

type ExportModule = 
  | 'clients'
  | 'loans'
  | 'payments'
  | 'inventory'
  | 'sales'
  | 'pawnshop'
  | 'documents'
  | 'requests'
  | 'agreements'
  | 'expenses'
  | 'all';

interface ExportOption {
  id: ExportModule;
  name: string;
  description: string;
  icon: React.ReactNode;
  color: string;
}

const exportOptions: ExportOption[] = [
  {
    id: 'clients',
    name: 'Clientes',
    description: 'Exportar todos los clientes registrados',
    icon: <Users className="h-5 w-5" />,
    color: 'bg-blue-500'
  },
  {
    id: 'loans',
    name: 'Préstamos',
    description: 'Exportar todos los préstamos',
    icon: <CreditCard className="h-5 w-5" />,
    color: 'bg-green-500'
  },
  {
    id: 'payments',
    name: 'Pagos',
    description: 'Exportar historial de pagos',
    icon: <DollarSign className="h-5 w-5" />,
    color: 'bg-yellow-500'
  },
  {
    id: 'inventory',
    name: 'Inventario',
    description: 'Exportar productos y stock',
    icon: <Package className="h-5 w-5" />,
    color: 'bg-purple-500'
  },
  {
    id: 'sales',
    name: 'Ventas',
    description: 'Exportar ventas del punto de venta',
    icon: <ShoppingCart className="h-5 w-5" />,
    color: 'bg-orange-500'
  },
  {
    id: 'pawnshop',
    name: 'Empeños',
    description: 'Exportar transacciones de empeños',
    icon: <Scale className="h-5 w-5" />,
    color: 'bg-red-500'
  },
  {
    id: 'documents',
    name: 'Documentos',
    description: 'Exportar lista de documentos',
    icon: <File className="h-5 w-5" />,
    color: 'bg-indigo-500'
  },
  {
    id: 'requests',
    name: 'Solicitudes',
    description: 'Exportar solicitudes de préstamos',
    icon: <FileTextIcon className="h-5 w-5" />,
    color: 'bg-pink-500'
  },
  {
    id: 'agreements',
    name: 'Acuerdos',
    description: 'Exportar acuerdos de pago',
    icon: <Calendar className="h-5 w-5" />,
    color: 'bg-teal-500'
  },
  {
    id: 'expenses',
    name: 'Gastos',
    description: 'Exportar registro de gastos',
    icon: <Building2 className="h-5 w-5" />,
    color: 'bg-gray-500'
  },
  {
    id: 'all',
    name: 'Backup Completo',
    description: 'Exportar todos los datos del sistema',
    icon: <Database className="h-5 w-5" />,
    color: 'bg-gradient-to-r from-blue-600 to-purple-600'
  }
];

export const BackupExportModule = () => {
  const { companyId, user } = useAuth();
  const [loading, setLoading] = useState<{ [key: string]: boolean }>({});
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [selectedExport, setSelectedExport] = useState<{ module: ExportModule; format: 'csv' | 'excel' | 'pdf' } | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importModule, setImportModule] = useState<ExportModule | null>(null);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showImportAllDialog, setShowImportAllDialog] = useState(false);
  const [importPreview, setImportPreview] = useState<any[]>([]);
  const [importAllPreview, setImportAllPreview] = useState<{ [key: string]: any[] }>({});

  const setLoadingState = (key: string, value: boolean) => {
    setLoading(prev => ({ ...prev, [key]: value }));
  };

  const fetchClients = async () => {
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('user_id', companyId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  };

  const fetchLoans = async () => {
    const { data, error } = await supabase
      .from('loans')
      .select(`
        *,
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
    return data || [];
  };

  const fetchPayments = async () => {
    const { data, error } = await supabase
      .from('payments')
      .select(`
        *,
        loans (
          id,
          amount,
          clients (
            full_name,
            dni
          )
        )
      `)
      .eq('created_by', companyId)
      .order('payment_date', { ascending: false });

    if (error) throw error;
    return data || [];
  };

  const fetchInventory = async () => {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('user_id', companyId)
      .order('name', { ascending: true });

    if (error) throw error;
    return data || [];
  };

  const fetchSales = async () => {
    const { data, error } = await supabase
      .from('sales')
      .select('*')
      .eq('user_id', companyId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  };

  const fetchPawnshop = async () => {
    const { data, error } = await supabase
      .from('pawn_transactions')
      .select(`
        *,
        clients (
          full_name,
          dni
        )
      `)
      .eq('user_id', companyId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  };

  const fetchDocuments = async () => {
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('user_id', companyId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  };

  const fetchRequests = async () => {
    const { data, error } = await supabase
      .from('loan_requests')
      .select(`
        *,
        clients (
          full_name,
          dni
        )
      `)
      .eq('user_id', companyId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  };

  const fetchAgreements = async () => {
    const { data, error } = await supabase
      .from('payment_agreements')
      .select(`
        *,
        loans (
          id,
          clients (
            full_name,
            dni
          )
        )
      `)
      .eq('user_id', companyId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  };

  const fetchExpenses = async () => {
    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .eq('created_by', companyId)
      .order('expense_date', { ascending: false });

    if (error) throw error;
    return data || [];
  };

  const handleExport = async (module: ExportModule, format: 'csv' | 'excel' | 'pdf') => {
    if (!companyId) {
      toast.error('No se pudo identificar la empresa');
      return;
    }

    const loadingKey = `${module}_${format}`;
    setLoadingState(loadingKey, true);

    try {
      let data: any[] = [];
      let filename = '';
      let title = '';

      switch (module) {
        case 'clients':
          data = await fetchClients();
          filename = 'clientes';
          title = 'Lista de Clientes';
          break;
        case 'loans':
          data = await fetchLoans();
          filename = 'prestamos';
          title = 'Lista de Préstamos';
          break;
        case 'payments':
          data = await fetchPayments();
          filename = 'pagos';
          title = 'Historial de Pagos';
          break;
        case 'inventory':
          data = await fetchInventory();
          filename = 'inventario';
          title = 'Inventario de Productos';
          break;
        case 'sales':
          data = await fetchSales();
          filename = 'ventas';
          title = 'Historial de Ventas';
          break;
        case 'pawnshop':
          data = await fetchPawnshop();
          filename = 'empenos';
          title = 'Transacciones de Empeños';
          break;
        case 'documents':
          data = await fetchDocuments();
          filename = 'documentos';
          title = 'Lista de Documentos';
          break;
        case 'requests':
          data = await fetchRequests();
          filename = 'solicitudes';
          title = 'Solicitudes de Préstamos';
          break;
        case 'agreements':
          data = await fetchAgreements();
          filename = 'acuerdos';
          title = 'Acuerdos de Pago';
          break;
        case 'expenses':
          data = await fetchExpenses();
          filename = 'gastos';
          title = 'Registro de Gastos';
          break;
        case 'all':
          await handleFullBackup(format);
          setLoadingState(loadingKey, false);
          return;
      }

      if (data.length === 0) {
        toast.warning(`No hay datos para exportar en ${title}`);
        setLoadingState(loadingKey, false);
        return;
      }

      // Formatear datos
      const formattedData = formatDataForExport(data);

      // Exportar según formato
      switch (format) {
        case 'csv':
          exportToCSV(formattedData, filename);
          break;
        case 'excel':
          exportToExcel(formattedData, filename, title);
          break;
        case 'pdf':
          exportToPDF(formattedData, filename, title);
          break;
      }

      toast.success(`${title} exportado exitosamente`);
    } catch (error: any) {
      console.error('Error exporting:', error);
      toast.error(`Error al exportar: ${error.message || 'Error desconocido'}`);
    } finally {
      setLoadingState(loadingKey, false);
    }
  };

  const handleFullBackup = async (format: 'csv' | 'excel' | 'pdf') => {
    const loadingKey = 'all_' + format;
    setLoadingState(loadingKey, true);

    try {
      // Obtener todos los datos
      const [
        clients,
        loans,
        payments,
        inventory,
        sales,
        pawnshop,
        documents,
        requests,
        agreements,
        expenses
      ] = await Promise.all([
        fetchClients(),
        fetchLoans(),
        fetchPayments(),
        fetchInventory(),
        fetchSales(),
        fetchPawnshop(),
        fetchDocuments(),
        fetchRequests(),
        fetchAgreements(),
        fetchExpenses()
      ]);

      // Log para debugging
      console.log('📊 Backup completo - Datos obtenidos:', {
        clients: clients?.length || 0,
        loans: loans?.length || 0,
        payments: payments?.length || 0,
        inventory: inventory?.length || 0,
        sales: sales?.length || 0,
        pawnshop: pawnshop?.length || 0,
        documents: documents?.length || 0,
        requests: requests?.length || 0,
        agreements: agreements?.length || 0,
        expenses: expenses?.length || 0
      });

      const allData = {
        clients: formatDataForExport(clients || []),
        loans: formatDataForExport(loans || []),
        payments: formatDataForExport(payments || []),
        inventory: formatDataForExport(inventory || []),
        sales: formatDataForExport(sales || []),
        pawnshop: formatDataForExport(pawnshop || []),
        documents: formatDataForExport(documents || []),
        requests: formatDataForExport(requests || []),
        agreements: formatDataForExport(agreements || []),
        expenses: formatDataForExport(expenses || [])
      };

      // Filtrar solo las hojas que tienen datos
      const sheetsWithData = [
        { name: 'Clientes', data: allData.clients },
        { name: 'Préstamos', data: allData.loans },
        { name: 'Pagos', data: allData.payments },
        { name: 'Inventario', data: allData.inventory },
        { name: 'Ventas', data: allData.sales },
        { name: 'Empeños', data: allData.pawnshop },
        { name: 'Documentos', data: allData.documents },
        { name: 'Solicitudes', data: allData.requests },
        { name: 'Acuerdos', data: allData.agreements },
        { name: 'Gastos', data: allData.expenses }
      ].filter(sheet => sheet.data.length > 0);

      if (sheetsWithData.length === 0) {
        toast.warning('No hay datos para exportar en el backup completo');
        setLoadingState(loadingKey, false);
        return;
      }

      const filename = `backup_completo_${new Date().toISOString().split('T')[0]}`;

      // Crear resumen de exportación
      const summary = sheetsWithData.map(sheet => `${sheet.name}: ${sheet.data.length} registros`).join(', ');

      switch (format) {
        case 'excel':
          exportToExcelMultiSheet(sheetsWithData, filename);
          toast.success(`Backup completo exportado exitosamente. ${summary}`);
          break;
        case 'csv':
          // Para CSV, exportar cada módulo por separado
          sheetsWithData.forEach((sheet) => {
            const keyMap: { [key: string]: string } = {
              'Clientes': 'clientes',
              'Préstamos': 'prestamos',
              'Pagos': 'pagos',
              'Inventario': 'inventario',
              'Ventas': 'ventas',
              'Empeños': 'empenos',
              'Documentos': 'documentos',
              'Solicitudes': 'solicitudes',
              'Acuerdos': 'acuerdos',
              'Gastos': 'gastos'
            };
            exportToCSV(sheet.data, `${filename}_${keyMap[sheet.name] || sheet.name.toLowerCase()}`);
          });
          toast.success(`Backup completo exportado exitosamente. ${summary}`);
          break;
        case 'pdf':
          // Para PDF, exportar cada módulo por separado
          sheetsWithData.forEach((sheet) => {
            exportToPDF(sheet.data, `${filename}_${sheet.name.toLowerCase()}`, sheet.name);
          });
          toast.success(`Backup completo exportado exitosamente. ${summary}`);
          break;
      }
    } catch (error: any) {
      console.error('Error in full backup:', error);
      toast.error(`Error al crear backup: ${error.message || 'Error desconocido'}`);
    } finally {
      setLoadingState(loadingKey, false);
    }
  };

  const handleExportClick = (module: ExportModule, format: 'csv' | 'excel' | 'pdf') => {
    if (module === 'all') {
      setSelectedExport({ module, format });
      setShowConfirmDialog(true);
    } else {
      handleExport(module, format);
    }
  };

  const confirmExport = () => {
    if (selectedExport) {
      handleExport(selectedExport.module, selectedExport.format);
      setShowConfirmDialog(false);
      setSelectedExport(null);
    }
  };

  const handleFilePreview = async (file: File) => {
    try {
      let data: any[] = [];
      if (file.name.endsWith('.csv')) {
        data = await importFromCSV(file);
      } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        data = await importFromExcel(file);
      } else {
        toast.error('Formato de archivo no soportado. Use CSV o Excel.');
        return;
      }
      setImportPreview(data.slice(0, 10)); // Mostrar solo los primeros 10
    } catch (error: any) {
      toast.error(`Error al leer el archivo: ${error.message}`);
      setImportPreview([]);
    }
  };

  const handleFilePreviewAll = async (file: File) => {
    try {
      if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
        toast.error('La importación completa solo soporta archivos Excel (.xlsx, .xls)');
        return;
      }
      
      const sheets = await importFromExcelMultiSheet(file);
      setImportAllPreview(sheets);
    } catch (error: any) {
      toast.error(`Error al leer el archivo: ${error.message}`);
      setImportAllPreview({});
    }
  };

  const handleImport = async () => {
    if (!importFile || !importModule || !companyId || !user) {
      toast.error('Faltan datos para importar');
      return;
    }

    const loadingKey = `import_${importModule}`;
    setLoadingState(loadingKey, true);

    try {
      let data: any[] = [];
      
      // Leer el archivo
      if (importFile.name.endsWith('.csv')) {
        data = await importFromCSV(importFile);
      } else if (importFile.name.endsWith('.xlsx') || importFile.name.endsWith('.xls')) {
        data = await importFromExcel(importFile);
      } else {
        throw new Error('Formato de archivo no soportado');
      }

      if (data.length === 0) {
        throw new Error('El archivo está vacío');
      }

      // Validar y mapear datos según el módulo
      let inserted = 0;
      let errors = 0;

      switch (importModule) {
        case 'clients':
          // Validar campos requeridos
          const clientValidation = validateImportedData(data, ['full_name', 'dni', 'phone']);
          if (!clientValidation.valid) {
            throw new Error(clientValidation.errors.join(', '));
          }
          
          for (const row of data) {
            try {
              const { error } = await supabase
                .from('clients')
                .upsert({
                  full_name: row.full_name,
                  dni: row.dni,
                  phone: row.phone || '',
                  email: row.email || null,
                  address: row.address || null,
                  city: row.city || null,
                  user_id: companyId,
                  updated_at: new Date().toISOString()
                }, {
                  onConflict: 'dni'
                });
              
              if (error) throw error;
              inserted++;
            } catch (err) {
              console.error('Error importing client:', err);
              errors++;
            }
          }
          break;

        case 'expenses':
          const expenseValidation = validateImportedData(data, ['category', 'description', 'amount']);
          if (!expenseValidation.valid) {
            throw new Error(expenseValidation.errors.join(', '));
          }
          
          for (const row of data) {
            try {
              const { error } = await supabase
                .from('expenses')
                .insert({
                  category: row.category,
                  description: row.description,
                  amount: parseFloat(row.amount) || 0,
                  expense_date: row.expense_date || new Date().toISOString().split('T')[0],
                  created_by: companyId,
                  status: 'approved'
                });
              
              if (error) throw error;
              inserted++;
            } catch (err) {
              console.error('Error importing expense:', err);
              errors++;
            }
          }
          break;

        case 'inventory':
          const inventoryValidation = validateImportedData(data, ['name']);
          if (!inventoryValidation.valid) {
            throw new Error(inventoryValidation.errors.join(', '));
          }
          
          for (const row of data) {
            try {
              const { error } = await supabase
                .from('products')
                .upsert({
                  name: row.name,
                  sku: row.sku || null,
                  barcode: row.barcode || null,
                  category: row.category || null,
                  brand: row.brand || null,
                  purchase_price: parseFloat(row.purchase_price) || 0,
                  selling_price: parseFloat(row.selling_price) || 0,
                  current_stock: parseFloat(row.current_stock) || 0,
                  user_id: companyId
                }, {
                  onConflict: 'sku'
                });
              
              if (error) throw error;
              inserted++;
            } catch (err) {
              console.error('Error importing product:', err);
              errors++;
            }
          }
          break;

        default:
          throw new Error(`Importación para ${importModule} aún no implementada`);
      }

      toast.success(`Importación completada: ${inserted} registros importados${errors > 0 ? `, ${errors} errores` : ''}`);
      setShowImportDialog(false);
      setImportFile(null);
      setImportPreview([]);
      setImportModule(null);
    } catch (error: any) {
      console.error('Error importing:', error);
      toast.error(`Error al importar: ${error.message || 'Error desconocido'}`);
    } finally {
      setLoadingState(loadingKey, false);
    }
  };

  const handleImportAll = async () => {
    if (!importFile || !companyId || !user) {
      toast.error('Faltan datos para importar');
      return;
    }

    const loadingKey = 'import_all';
    setLoadingState(loadingKey, true);

    try {
      // Leer todas las hojas del Excel
      const sheets = await importFromExcelMultiSheet(importFile);
      
      // Mapeo de nombres de hojas a módulos
      const sheetToModule: { [key: string]: ExportModule } = {
        'Clientes': 'clients',
        'Préstamos': 'loans',
        'Pagos': 'payments',
        'Inventario': 'inventory',
        'Ventas': 'sales',
        'Empeños': 'pawnshop',
        'Documentos': 'documents',
        'Solicitudes': 'requests',
        'Acuerdos': 'agreements',
        'Gastos': 'expenses'
      };

      const results: { [module: string]: { inserted: number; errors: number } } = {};
      let totalInserted = 0;
      let totalErrors = 0;

      // Importar cada hoja
      for (const [sheetName, data] of Object.entries(sheets)) {
        const module = sheetToModule[sheetName];
        if (!module || data.length === 0) {
          continue; // Saltar hojas no reconocidas o vacías
        }

        let inserted = 0;
        let errors = 0;

        try {
          switch (module) {
            case 'clients':
              for (const row of data) {
                try {
                  const { error } = await supabase
                    .from('clients')
                    .upsert({
                      full_name: row.full_name,
                      dni: row.dni,
                      phone: row.phone || '',
                      email: row.email || null,
                      address: row.address || null,
                      city: row.city || null,
                      user_id: companyId,
                      updated_at: new Date().toISOString()
                    }, {
                      onConflict: 'dni'
                    });
                  
                  if (error) throw error;
                  inserted++;
                } catch (err) {
                  console.error(`Error importing client:`, err);
                  errors++;
                }
              }
              break;

            case 'expenses':
              for (const row of data) {
                try {
                  const { error } = await supabase
                    .from('expenses')
                    .insert({
                      category: row.category,
                      description: row.description,
                      amount: parseFloat(row.amount) || 0,
                      expense_date: row.expense_date || new Date().toISOString().split('T')[0],
                      created_by: companyId,
                      status: 'approved'
                    });
                  
                  if (error) throw error;
                  inserted++;
                } catch (err) {
                  console.error(`Error importing expense:`, err);
                  errors++;
                }
              }
              break;

            case 'inventory':
              for (const row of data) {
                try {
                  const { error } = await supabase
                    .from('products')
                    .upsert({
                      name: row.name,
                      sku: row.sku || null,
                      barcode: row.barcode || null,
                      category: row.category || null,
                      brand: row.brand || null,
                      purchase_price: parseFloat(row.purchase_price) || 0,
                      selling_price: parseFloat(row.selling_price) || 0,
                      current_stock: parseFloat(row.current_stock) || 0,
                      user_id: companyId
                    }, {
                      onConflict: 'sku'
                    });
                  
                  if (error) throw error;
                  inserted++;
                } catch (err) {
                  console.error(`Error importing product:`, err);
                  errors++;
                }
              }
              break;

            // Otros módulos se pueden agregar aquí
            default:
              console.warn(`Importación para ${module} aún no implementada`);
          }

          results[sheetName] = { inserted, errors };
          totalInserted += inserted;
          totalErrors += errors;
        } catch (error) {
          console.error(`Error importing sheet ${sheetName}:`, error);
          results[sheetName] = { inserted: 0, errors: data.length };
          totalErrors += data.length;
        }
      }

      // Mostrar resumen
      const summary = Object.entries(results)
        .map(([sheet, result]) => `${sheet}: ${result.inserted} importados${result.errors > 0 ? `, ${result.errors} errores` : ''}`)
        .join('\n');

      toast.success(
        `Importación completa finalizada:\n${summary}\n\nTotal: ${totalInserted} registros importados${totalErrors > 0 ? `, ${totalErrors} errores` : ''}`,
        { duration: 8000 }
      );

      setShowImportAllDialog(false);
      setImportFile(null);
      setImportAllPreview({});
      setImportModule(null);
    } catch (error: any) {
      console.error('Error importing all:', error);
      toast.error(`Error al importar: ${error.message || 'Error desconocido'}`);
    } finally {
      setLoadingState(loadingKey, false);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Respaldo y Exportación</h1>
          <p className="text-gray-600 mt-1">
            Exporta tus datos en diferentes formatos para respaldo y análisis
          </p>
        </div>
      </div>

      <Tabs defaultValue="modules" className="space-y-4">
        <TabsList>
          <TabsTrigger value="modules">Exportar por Módulo</TabsTrigger>
          <TabsTrigger value="backup">Backup Completo</TabsTrigger>
          <TabsTrigger value="import">Importar Datos</TabsTrigger>
        </TabsList>

        <TabsContent value="modules" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {exportOptions.filter(opt => opt.id !== 'all').map((option) => (
              <Card key={option.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${option.color} text-white`}>
                      {option.icon}
                    </div>
                    <div className="flex-1">
                      <CardTitle className="text-lg">{option.name}</CardTitle>
                      <CardDescription className="text-xs mt-1">
                        {option.description}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleExportClick(option.id, 'csv')}
                      disabled={loading[`${option.id}_csv`]}
                      className="flex-1"
                    >
                      {loading[`${option.id}_csv`] ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <FileText className="h-4 w-4 mr-1" />
                      )}
                      CSV
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleExportClick(option.id, 'excel')}
                      disabled={loading[`${option.id}_excel`]}
                      className="flex-1"
                    >
                      {loading[`${option.id}_excel`] ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <FileSpreadsheet className="h-4 w-4 mr-1" />
                      )}
                      Excel
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleExportClick(option.id, 'pdf')}
                      disabled={loading[`${option.id}_pdf`]}
                      className="flex-1"
                    >
                      {loading[`${option.id}_pdf`] ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <FileText className="h-4 w-4 mr-1" />
                      )}
                      PDF
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="backup" className="space-y-4">
          <Card className="border-2 border-blue-200">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 text-white">
                  <Database className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <CardTitle className="text-xl">Backup Completo del Sistema</CardTitle>
                  <CardDescription>
                    Exporta todos los datos del sistema en un solo archivo
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
                  <div>
                    <p className="font-semibold text-blue-900 mb-1">Información del Backup</p>
                    <p className="text-sm text-blue-700">
                      El backup completo incluye: Clientes, Préstamos, Pagos, Inventario, Ventas, 
                      Empeños, Documentos, Solicitudes, Acuerdos y Gastos.
                    </p>
                    <p className="text-sm text-blue-600 mt-2">
                      <strong>Recomendación:</strong> Realiza backups regulares para proteger tus datos.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => handleExportClick('all', 'excel')}
                  disabled={loading['all_excel']}
                  className="h-24 flex-col"
                >
                  {loading['all_excel'] ? (
                    <Loader2 className="h-6 w-6 animate-spin mb-2" />
                  ) : (
                    <FileSpreadsheet className="h-6 w-6 mb-2" />
                  )}
                  <span className="font-semibold">Excel</span>
                  <span className="text-xs text-gray-500">Múltiples hojas</span>
                </Button>

                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => handleExportClick('all', 'csv')}
                  disabled={loading['all_csv']}
                  className="h-24 flex-col"
                >
                  {loading['all_csv'] ? (
                    <Loader2 className="h-6 w-6 animate-spin mb-2" />
                  ) : (
                    <FileText className="h-6 w-6 mb-2" />
                  )}
                  <span className="font-semibold">CSV</span>
                  <span className="text-xs text-gray-500">Archivos separados</span>
                </Button>

                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => handleExportClick('all', 'pdf')}
                  disabled={loading['all_pdf']}
                  className="h-24 flex-col"
                >
                  {loading['all_pdf'] ? (
                    <Loader2 className="h-6 w-6 animate-spin mb-2" />
                  ) : (
                    <FileText className="h-6 w-6 mb-2" />
                  )}
                  <span className="font-semibold">PDF</span>
                  <span className="text-xs text-gray-500">Archivos separados</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="import" className="space-y-4">
          <Card className="border-2 border-green-200">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-lg bg-green-600 text-white">
                  <Upload className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <CardTitle className="text-xl">Importar Datos</CardTitle>
                  <CardDescription>
                    Importa datos desde archivos CSV o Excel
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
                  <div>
                    <p className="font-semibold text-yellow-900 mb-1">Advertencia</p>
                    <p className="text-sm text-yellow-700">
                      La importación puede sobrescribir datos existentes. Se recomienda hacer un backup antes de importar.
                    </p>
                  </div>
                </div>
              </div>

              {/* Opción de Importar Todo */}
              <Card className="border-2 border-green-300 bg-green-50">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="p-3 rounded-lg bg-gradient-to-r from-green-600 to-emerald-600 text-white">
                      <Database className="h-6 w-6" />
                    </div>
                    <div className="flex-1">
                      <CardTitle className="text-lg">Importar Todo (Backup Completo)</CardTitle>
                      <CardDescription>
                        Importa todos los datos desde un archivo Excel con múltiples hojas
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <Button
                    size="lg"
                    variant="outline"
                    onClick={() => {
                      setImportModule('all');
                      setShowImportAllDialog(true);
                    }}
                    className="w-full border-green-300 hover:bg-green-100"
                  >
                    <Upload className="h-5 w-5 mr-2" />
                    Importar Backup Completo (Excel)
                  </Button>
                  <p className="text-xs text-gray-600 mt-2 text-center">
                    Requiere un archivo Excel con hojas: Clientes, Préstamos, Pagos, etc.
                  </p>
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {exportOptions.filter(opt => opt.id !== 'all').map((option) => (
                  <Card key={option.id} className="hover:shadow-lg transition-shadow">
                    <CardHeader>
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${option.color} text-white`}>
                          {option.icon}
                        </div>
                        <div className="flex-1">
                          <CardTitle className="text-base">{option.name}</CardTitle>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setImportModule(option.id);
                          setShowImportDialog(true);
                        }}
                        className="w-full"
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        Importar {option.name}
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog de importación */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Importar {importModule && exportOptions.find(o => o.id === importModule)?.name}</DialogTitle>
            <DialogDescription>
              Selecciona un archivo CSV o Excel para importar
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="import-file">Archivo</Label>
              <Input
                id="import-file"
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setImportFile(file);
                    handleFilePreview(file);
                  }
                }}
              />
            </div>

            {importPreview.length > 0 && (
              <div className="border rounded-lg p-4 max-h-64 overflow-y-auto">
                <p className="text-sm font-semibold mb-2">
                  Vista previa ({importPreview.length} registros)
                </p>
                <div className="text-xs overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-gray-100">
                        {Object.keys(importPreview[0]).slice(0, 5).map((key) => (
                          <th key={key} className="border p-1 text-left">{key}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {importPreview.slice(0, 5).map((row, idx) => (
                        <tr key={idx}>
                          {Object.values(row).slice(0, 5).map((val, vIdx) => (
                            <td key={vIdx} className="border p-1">{String(val || '')}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => {
                setShowImportDialog(false);
                setImportFile(null);
                setImportPreview([]);
              }}>
                Cancelar
              </Button>
              <Button
                onClick={handleImport}
                disabled={!importFile || loading[`import_${importModule}`]}
              >
                {loading[`import_${importModule}`] ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                Importar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog de importación completa */}
      <Dialog open={showImportAllDialog} onOpenChange={setShowImportAllDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Importar Backup Completo</DialogTitle>
            <DialogDescription>
              Selecciona un archivo Excel con múltiples hojas para importar todos los datos
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="import-all-file">Archivo Excel</Label>
              <Input
                id="import-all-file"
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setImportFile(file);
                    handleFilePreviewAll(file);
                  }
                }}
              />
              <p className="text-xs text-gray-500 mt-1">
                El archivo debe ser un Excel exportado desde "Backup Completo" con múltiples hojas
              </p>
            </div>

            {Object.keys(importAllPreview).length > 0 && (
              <div className="border rounded-lg p-4 max-h-96 overflow-y-auto">
                <p className="text-sm font-semibold mb-3">
                  Vista previa de hojas encontradas
                </p>
                <div className="space-y-3">
                  {Object.entries(importAllPreview).map(([sheetName, data]) => (
                    <div key={sheetName} className="border rounded p-3 bg-gray-50">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold text-sm">{sheetName}</span>
                        <Badge variant="outline">
                          {data.length} registros
                        </Badge>
                      </div>
                      {data.length > 0 && (
                        <div className="text-xs text-gray-600">
                          <p>Columnas: {Object.keys(data[0]).join(', ')}</p>
                          {data.length > 0 && (
                            <p className="mt-1 text-gray-500">
                              Primer registro: {JSON.stringify(data[0]).substring(0, 100)}...
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-red-600 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-red-900">Advertencia Importante</p>
                  <p className="text-xs text-red-700 mt-1">
                    Esta operación importará todos los datos del archivo. Los datos existentes pueden ser sobrescritos.
                    Se recomienda hacer un backup antes de continuar.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => {
                setShowImportAllDialog(false);
                setImportFile(null);
                setImportAllPreview({});
              }}>
                Cancelar
              </Button>
              <Button
                onClick={handleImportAll}
                disabled={!importFile || Object.keys(importAllPreview).length === 0 || loading['import_all']}
                className="bg-green-600 hover:bg-green-700"
              >
                {loading['import_all'] ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                Importar Todo
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog de confirmación para backup completo */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Backup Completo</DialogTitle>
            <DialogDescription>
              ¿Estás seguro de que deseas exportar todos los datos del sistema?
              Esta operación puede tardar varios minutos dependiendo de la cantidad de datos.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowConfirmDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={confirmExport}>
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Confirmar Exportación
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

