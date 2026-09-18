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
  importFromCSV,
  importFromExcel,
  importFromExcelMultiSheet,
  validateImportedData
} from '@/utils/exportUtils';
import {
  BACKUP_SHEETS, fetchBackupSheetRows, fetchFullBackup, importClientRows, importLoanRows,
  restoreLoansWithChildren, serializeRowsForBackup, sheetKeyFromName,
  type BackupSheetKey, type RestoreContext,
} from '@/utils/backupData';

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

  /** Cada módulo de esta pantalla y la hoja del respaldo que lo contiene. */
  const MODULE_EXPORT: Record<Exclude<ExportModule, 'all'>, { key: BackupSheetKey; filename: string; title: string }> = {
    clients: { key: 'clients', filename: 'clientes', title: 'Lista de Clientes' },
    loans: { key: 'loans', filename: 'prestamos', title: 'Lista de Préstamos' },
    payments: { key: 'payments', filename: 'pagos', title: 'Historial de Pagos' },
    inventory: { key: 'inventory', filename: 'inventario', title: 'Inventario de Productos' },
    sales: { key: 'sales', filename: 'ventas', title: 'Historial de Ventas' },
    pawnshop: { key: 'pawnshop', filename: 'empenos', title: 'Transacciones de Empeños' },
    documents: { key: 'documents', filename: 'documentos', title: 'Lista de Documentos' },
    requests: { key: 'requests', filename: 'solicitudes', title: 'Solicitudes de Préstamos' },
    agreements: { key: 'agreements', filename: 'acuerdos', title: 'Acuerdos de Pago' },
    expenses: { key: 'expenses', filename: 'gastos', title: 'Registro de Gastos' },
  };

  const handleExport = async (module: ExportModule, format: 'csv' | 'excel' | 'pdf') => {
    if (!companyId) {
      toast.error('No se pudo identificar la empresa');
      return;
    }

    const loadingKey = `${module}_${format}`;
    setLoadingState(loadingKey, true);

    try {
      if (module === 'all') {
        await handleFullBackup(format);
        return;
      }

      const { key, filename, title } = MODULE_EXPORT[module];
      // Todas las filas (paginadas) y todas las columnas, igual que el respaldo completo.
      const data = await fetchBackupSheetRows(supabase as any, companyId, key);
      console.log(`[respaldo] exportando ${title}: ${data.length} filas`);

      if (data.length === 0) {
        toast.warning(`No hay datos para exportar en ${title}`);
        return;
      }

      // Formatear datos (las columnas JSON se conservan para poder volver a importarlas)
      const formattedData = serializeRowsForBackup(data);

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
      if (!companyId) throw new Error('No se pudo identificar la empresa');
      // Todas las tablas, completas (paginadas) y con todas sus columnas: clientes con cédula,
      // foto, dirección y ubicación; préstamos con sus cuotas, pagos, abonos y penalidades.
      const sheets = await fetchFullBackup(supabase as any, companyId);

      // Filtrar solo las hojas que tienen datos
      const sheetsWithData = sheets
        .map(s => ({ name: s.name, data: s.rows }))
        .filter(sheet => sheet.data.length > 0);

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
            // "Préstamos" → "prestamos", "Abonos a capital" → "abonos_a_capital"
            const slug = sheet.name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, '_');
            exportToCSV(sheet.data, `${filename}_${slug}`);
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

      const restoreCtx: RestoreContext = {
        supabase: supabase as any, companyId, userId: user.id,
        onProgress: (msg) => toast.loading(`Importando… ${msg}`, { id: 'import-progress' }),
      };
      let extraInfo = '';

      switch (importModule) {
        case 'clients': {
          // Validar campos requeridos
          const clientValidation = validateImportedData(data, ['full_name', 'dni']);
          if (!clientValidation.valid) {
            throw new Error(clientValidation.errors.join(', '));
          }
          // TODAS las columnas del archivo: tipo de documento y verificación JCE, foto,
          // provincia/municipio/distrito/sector, ubicación GPS, trabajo, banco… Antes solo 6.
          const { result } = await importClientRows(restoreCtx, data);
          inserted = result.inserted + result.updated;
          errors = result.errors;
          if (result.updated > 0) extraInfo = ` (${result.updated} ya existían y se actualizaron)`;
          if (result.messages.length > 0) console.warn('[respaldo] errores de clientes:', result.messages);
          break;
        }

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

        case 'loans': {
          const availableColumns = Object.keys(data[0] || {}).map(k => k.toLowerCase());
          // Detectar si el archivo es de clientes en lugar de préstamos
          const hasClientColumns = availableColumns.some(col => ['full_name', 'user_id', 'phone'].includes(col));
          const hasLoanColumns = availableColumns.some(col =>
            ['amount', 'monto', 'interest_rate', 'tasa', 'term_months', 'plazo'].includes(col));
          if (hasClientColumns && !hasLoanColumns) {
            throw new Error('El archivo parece ser de clientes, no de préstamos. Por favor, selecciona "Clientes" como módulo o exporta los préstamos correctamente.');
          }
          // Todas las columnas del préstamo, con los montos a 2 decimales (antes se redondeaban a
          // enteros). Las cuotas y los pagos solo vienen en el Backup Completo.
          const { result } = await importLoanRows(restoreCtx, data);
          inserted = result.inserted;
          errors = result.errors;
          if (result.skipped > 0) extraInfo = ` (${result.skipped} ya existían y no se duplicaron)`;
          extraInfo += '. Las cuotas y pagos se restauran con "Importar Backup Completo"';
          if (result.messages.length > 0) console.warn('[respaldo] errores de préstamos:', result.messages);
          break;
        }

        default:
          throw new Error(`Importación para ${importModule} aún no implementada`);
      }

      toast.dismiss('import-progress');
      toast.success(`Importación completada: ${inserted} registros importados${errors > 0 ? `, ${errors} errores (detalle en la consola)` : ''}${extraInfo}`, { duration: 8000 });
      setShowImportDialog(false);
      setImportFile(null);
      setImportPreview([]);
      setImportModule(null);
    } catch (error: any) {
      console.error('Error importing:', error);
      toast.dismiss('import-progress');
      toast.error(`Error al importar: ${error.message || 'Error desconocido'}`);
    } finally {
      setLoadingState(loadingKey, false);
    }
  };

  /** Gastos del archivo (mismo mapeo que la importación por módulo). */
  const importExpenseRows = async (rows: any[]) => {
    let inserted = 0;
    let errors = 0;
    for (const row of rows) {
      try {
        const { error } = await supabase
          .from('expenses')
          .insert({
            category: row.category,
            description: row.description,
            amount: parseFloat(row.amount) || 0,
            expense_date: row.expense_date || new Date().toISOString().split('T')[0],
            created_by: companyId,
            status: row.status || 'approved'
          } as any);
        if (error) throw error;
        inserted++;
      } catch (err) {
        console.error('Error importing expense:', err);
        errors++;
      }
    }
    return { inserted, errors };
  };

  /** Productos del archivo (mismo mapeo que la importación por módulo). */
  const importInventoryRows = async (rows: any[]) => {
    let inserted = 0;
    let errors = 0;
    for (const row of rows) {
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
          } as any, {
            onConflict: 'sku'
          });
        if (error) throw error;
        inserted++;
      } catch (err) {
        console.error('Error importing product:', err);
        errors++;
      }
    }
    return { inserted, errors };
  };

  const handleImportAll = async () => {
    if (!importFile || !companyId || !user) {
      toast.error('Faltan datos para importar');
      return;
    }

    const loadingKey = 'import_all';
    setLoadingState(loadingKey, true);

    try {
      // Leer todas las hojas del Excel y reconocerlas (también los nombres de versiones anteriores)
      const workbook = await importFromExcelMultiSheet(importFile);
      const sheets: Partial<Record<BackupSheetKey, any[]>> = {};
      const unknownSheets: string[] = [];
      for (const [sheetName, rows] of Object.entries(workbook)) {
        const key = sheetKeyFromName(sheetName);
        if (!key) { unknownSheets.push(sheetName); continue; }
        // Una hoja vacía se exporta con una fila "mensaje": no es un dato.
        sheets[key] = (rows || []).filter((r: any) => !(Object.keys(r).length === 1 && 'mensaje' in r));
      }
      console.log('[respaldo] hojas del archivo:', Object.fromEntries(
        Object.entries(sheets).map(([k, v]) => [k, (v || []).length]),
      ), unknownSheets.length ? { noReconocidas: unknownSheets } : '');

      const ctx: RestoreContext = {
        supabase: supabase as any, companyId, userId: user.id,
        onProgress: (msg) => toast.loading(`Importando… ${msg}`, { id: 'import-progress' }),
      };

      const lines: string[] = [];
      let totalInserted = 0;
      let totalErrors = 0;
      const addLine = (label: string, r: { inserted: number; errors: number; updated?: number; skipped?: number }) => {
        const parts = [`${r.inserted} importados`];
        if (r.updated) parts.push(`${r.updated} actualizados`);
        if (r.skipped) parts.push(`${r.skipped} omitidos`);
        if (r.errors) parts.push(`${r.errors} errores`);
        lines.push(`${label}: ${parts.join(', ')}`);
        totalInserted += r.inserted + (r.updated || 0);
        totalErrors += r.errors;
      };
      const allMessages: string[] = [];

      // 1) Clientes: con TODAS sus columnas (cédula, foto, dirección, ubicación…)
      let clientIdByOldId = new Map<string, string>();
      let clientIdByDni = new Map<string, string>();
      if ((sheets.clients || []).length > 0) {
        const r = await importClientRows(ctx, sheets.clients!);
        clientIdByOldId = r.clientIdByOldId;
        clientIdByDni = r.clientIdByDni;
        addLine(BACKUP_SHEETS.clients, r.result);
        allMessages.push(...r.result.messages);
      }

      // 2) Préstamos con sus cuotas, pagos, abonos a capital, historial y penalidades
      if ((sheets.loans || []).length > 0) {
        const r = await restoreLoansWithChildren(ctx, sheets, clientIdByOldId, clientIdByDni);
        (['loans', 'installments', 'payments', 'capitalPayments', 'history', 'penalties'] as BackupSheetKey[])
          .forEach(key => {
            const res = r[key];
            if (!res) return;
            addLine(BACKUP_SHEETS[key], res);
            allMessages.push(...res.messages);
          });
      }

      // 3) Gastos e inventario
      if ((sheets.expenses || []).length > 0) addLine(BACKUP_SHEETS.expenses, await importExpenseRows(sheets.expenses!));
      if ((sheets.inventory || []).length > 0) addLine(BACKUP_SHEETS.inventory, await importInventoryRows(sheets.inventory!));

      // Lo que el respaldo guarda pero todavía no se restaura
      const notRestored = (['sales', 'pawnshop', 'documents', 'requests', 'agreements'] as BackupSheetKey[])
        .filter(key => (sheets[key] || []).length > 0)
        .map(key => BACKUP_SHEETS[key]);
      if (notRestored.length > 0) lines.push(`No se restauran (solo quedan en el archivo): ${notRestored.join(', ')}`);

      if (allMessages.length > 0) console.warn('[respaldo] errores de la importación:', allMessages);
      console.log('[respaldo] importación completa:', lines);

      toast.dismiss('import-progress');
      toast.success(
        `Importación completa finalizada:\n${lines.join('\n')}\n\nTotal: ${totalInserted} registros${totalErrors > 0 ? `, ${totalErrors} errores (detalle en la consola)` : ''}`,
        { duration: 12000 }
      );

      setShowImportAllDialog(false);
      setImportFile(null);
      setImportAllPreview({});
      setImportModule(null);
    } catch (error: any) {
      console.error('Error importing all:', error);
      toast.dismiss('import-progress');
      toast.error(`Error al importar: ${error.message || 'Error desconocido'}`);
    } finally {
      setLoadingState(loadingKey, false);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 w-full">
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
                      El backup completo incluye: Clientes (con cédula, verificación JCE, foto, dirección
                      y ubicación GPS), Préstamos con sus Cuotas, Pagos, Abonos a capital, Penalidades e
                      Historial, Inventario, Ventas, Empeños, Documentos, Solicitudes, Acuerdos y Gastos.
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
                    Restaura clientes (todos sus datos), préstamos con sus cuotas, pagos, abonos a capital,
                    penalidades e historial, gastos e inventario. Un préstamo que ya existe no se duplica.
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

