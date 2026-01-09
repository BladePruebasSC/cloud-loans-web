import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  X,
  FileText,
  Receipt,
  History,
  StickyNote,
  Handshake,
  Calendar,
  Upload,
  FolderOpen,
  Download,
  Trash2,
  Eye,
  Phone,
  Mail,
  MessageSquare,
  MapPin,
  FileCheck,
  Clock,
  Edit
} from 'lucide-react';
import { LoanHistoryView } from './LoanHistoryView';
import { AccountStatement } from './AccountStatement';
import { InstallmentsTable } from './InstallmentsTable';
import { PaymentForm } from './PaymentForm';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { formatDateStringForSantoDomingo, getCurrentDateInSantoDomingo } from '@/utils/dateUtils';

interface LoanDetailsViewProps {
  loanId: string;
  isOpen: boolean;
  onClose: () => void;
  onRefresh?: () => void;
}

interface LoanDetails {
  id: string;
  amount: number;
  remaining_balance: number;
  total_amount?: number;
  monthly_payment: number;
  interest_rate: number;
  term_months: number;
  start_date: string;
  end_date: string;
  next_payment_date: string;
  first_payment_date: string;
  loan_type: string;
  amortization_type: string;
  payment_frequency: string;
  created_at: string;
  status: string;
  late_fee_enabled: boolean;
  late_fee_rate: number;
  grace_period_days: number;
  current_late_fee: number;
  late_fee_calculation_type?: string;
  max_late_fee?: number;
  client: {
    full_name: string;
    dni: string;
    phone: string;
    address: string;
  };
}

export const LoanDetailsView: React.FC<LoanDetailsViewProps> = ({
  loanId,
  isOpen,
  onClose,
  onRefresh
}) => {
  const [loan, setLoan] = useState<LoanDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState<any[]>([]);
  const [installments, setInstallments] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showStatement, setShowStatement] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [showAgreements, setShowAgreements] = useState(false);
  const [showInstallments, setShowInstallments] = useState(false);
  const [agreements, setAgreements] = useState<any[]>([]);
  const [selectedAgreement, setSelectedAgreement] = useState<any>(null);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [loanHistoryNotes, setLoanHistoryNotes] = useState<any[]>([]);
  const [trackingRecords, setTrackingRecords] = useState<any[]>([]);
  const [loadingTracking, setLoadingTracking] = useState(false);
  const [showDocuments, setShowDocuments] = useState(false);
  const [documents, setDocuments] = useState<any[]>([]);
  const [previewDocument, setPreviewDocument] = useState<any | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [nextPaymentDate, setNextPaymentDate] = useState<string | null>(null);
  const [capitalPayments, setCapitalPayments] = useState<any[]>([]);
  const [showUploadDocument, setShowUploadDocument] = useState(false);
  const [documentForm, setDocumentForm] = useState({
    title: '',
    file_name: '',
    description: '',
    document_type: 'loan_document',
    file: null as File | null
  });
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { user, companyId } = useAuth();
  const [pendingInterestForIndefinite, setPendingInterestForIndefinite] = useState<number>(0);
  
  // Estados para generar documentos
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [availableDocuments, setAvailableDocuments] = useState<string[]>([]);
  const [selectedDocumentsToGenerate, setSelectedDocumentsToGenerate] = useState<string[]>([]);
  const [generatingDocuments, setGeneratingDocuments] = useState(false);

  useEffect(() => {
    if (isOpen && loanId) {
      fetchLoanDetails();
      fetchPayments();
      fetchInstallments();
      fetchAgreements();
      fetchLoanHistoryNotes();
      fetchDocuments();
    }
  }, [isOpen, loanId]);

  // Cargar registros de seguimiento cuando se abre el modal de notas
  useEffect(() => {
    if (showNotes && loanId) {
      fetchTrackingRecords();
    }
  }, [showNotes, loanId]);

  // CORRECCIÓN: Verificar y corregir discrepancias en remaining_balance
  useEffect(() => {
    if (!loan || !installments || installments.length === 0 || !payments) return;
    if (loan.status === 'deleted' || loan.status === 'paid') return;
    
    // Calcular balance dinámicamente
    let calculatedBalance: number;
    if (loan.amortization_type === 'indefinite') {
      // Para indefinidos, el cálculo se hace en calculatePendingInterestForIndefinite
      return;
    } else {
      // CORRECCIÓN: Usar loan.total_amount como base (igual que InstallmentsTable)
      // Esto evita errores de redondeo al sumar cuotas individuales
      let correctTotalAmount = loan.total_amount;
      
      // Si no hay total_amount o es inválido, calcular usando la fórmula
      if (!correctTotalAmount || correctTotalAmount <= loan.amount) {
        const totalInterest = loan.amount * (loan.interest_rate / 100) * loan.term_months;
        correctTotalAmount = loan.amount + totalInterest;
      }
      
      // CORRECCIÓN: Calcular el total de TODOS los cargos (pagados y no pagados)
      // El "Total a Pagar" debe incluir TODOS los cargos (pagados y no pagados)
      // El balance pendiente será: (préstamo + TODOS los cargos) - total pagado
      const allCharges = installments.filter(inst => {
        const isCharge = Math.abs(inst.interest_amount || 0) < 0.01 && 
                        Math.abs((inst.principal_amount || 0) - (inst.total_amount || 0)) < 0.01;
        return isCharge;
      });
      const totalChargesAmount = allCharges.reduce((sum, inst) => sum + (inst.total_amount || 0), 0);
      
      // Calcular el total del préstamo incluyendo TODOS los cargos (pagados y no pagados)
      const totalAmountWithCharges = correctTotalAmount + totalChargesAmount;
      
      // Calcular el total pagado usando amount (igual que InstallmentsTable)
      const totalPaid = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
      
      // El balance restante es el total (préstamo + cargos) menos lo pagado
      calculatedBalance = Math.max(0, totalAmountWithCharges - totalPaid);
    }
    
    // Comparar con valor de BD
    const dbBalance = loan.remaining_balance || 0;
    const discrepancy = Math.abs(calculatedBalance - dbBalance);
    
    // Si hay discrepancia significativa, actualizar BD
    if (discrepancy > 0.01) {
      console.log('🔍 LoanDetailsView: Discrepancia detectada, actualizando BD:', {
        loanId: loan.id,
        calculated: calculatedBalance,
        db: dbBalance,
        discrepancy
      });
      
      // Forzar actualización en BD
      supabase.rpc('update_loan_remaining_balance', {
        p_loan_id: loan.id
      }).then(({ error }) => {
        if (error) {
          console.warn('Error actualizando balance en BD:', error);
        } else {
          // Refrescar datos del préstamo después de actualizar
          setTimeout(() => {
            fetchLoanDetails();
          }, 300);
        }
      });
    }
  }, [loan?.id, loan?.remaining_balance, installments?.length, payments?.length, loan?.status]);

  // Obtener abonos a capital
  useEffect(() => {
    const fetchCapitalPayments = async () => {
      if (!loan?.id) return;
      try {
        const { data, error } = await supabase
          .from('capital_payments')
          .select('amount')
          .eq('loan_id', loan.id);
        if (error) throw error;
        setCapitalPayments(data || []);
      } catch (error) {
        console.error('Error obteniendo abonos a capital:', error);
        setCapitalPayments([]);
      }
    };
    fetchCapitalPayments();
  }, [loan?.id]);

  // Calcular interés pendiente para préstamos indefinidos
  useEffect(() => {
    if (loan && loan.amortization_type === 'indefinite' && installments.length >= 0) {
      calculatePendingInterestForIndefinite();
    } else {
      setPendingInterestForIndefinite(0);
    }
  }, [loan, installments, payments]);

  // Función para calcular el interés pendiente total para préstamos indefinidos
  const calculatePendingInterestForIndefinite = async () => {
    if (!loan || loan.amortization_type !== 'indefinite') {
      setPendingInterestForIndefinite(0);
      return;
    }

    try {
      if (!loan.start_date) {
        console.warn('🔍 calculatePendingInterestForIndefinite: Falta start_date, no se puede calcular');
        setPendingInterestForIndefinite(0);
        return;
      }

      // Calcular interés por cuota para préstamos indefinidos
      const interestPerPayment = (loan.amount * loan.interest_rate) / 100;

      // SIEMPRE calcular dinámicamente cuántas cuotas deberían existir desde start_date hasta hoy
      const [startYear, startMonth, startDay] = loan.start_date.split('-').map(Number);
      const startDate = new Date(startYear, startMonth - 1, startDay);
      const currentDate = getCurrentDateInSantoDomingo();

      // Calcular meses transcurridos desde el inicio
      const monthsElapsed = Math.max(0, 
        (currentDate.getFullYear() - startDate.getFullYear()) * 12 + 
        (currentDate.getMonth() - startDate.getMonth())
      );

      console.log('🔍 LoanDetailsView - calculatePendingInterestForIndefinite: Cálculo dinámico', {
        loanId: loan.id,
        startDate: loan.start_date,
        currentDate: currentDate.toISOString().split('T')[0],
        monthsElapsed
      });

      // Calcular cuántas cuotas se han pagado
      let paidCount = 0;

      // Primero, intentar contar desde las cuotas en la BD
      if (installments && installments.length > 0) {
        paidCount = installments.filter((inst: any) => inst.is_paid).length;
        console.log('🔍 LoanDetailsView - calculatePendingInterestForIndefinite: Cuotas pagadas desde BD', {
          totalInBD: installments.length,
          paidInBD: paidCount
        });
      }

      // También verificar pagos para calcular cuántas cuotas de interés se han pagado
      if (payments && payments.length > 0) {
        const totalInterestPaid = payments.reduce((sum, p) => sum + (p.interest_amount || 0), 0);
        const paidFromPayments = Math.floor(totalInterestPaid / interestPerPayment);

        // Usar el mayor entre las cuotas pagadas en BD y las calculadas desde pagos
        paidCount = Math.max(paidCount, paidFromPayments);

        console.log('🔍 LoanDetailsView - calculatePendingInterestForIndefinite: Cuotas pagadas desde pagos', {
          totalInterestPaid,
          paidFromPayments,
          finalPaidCount: paidCount
        });
      }

      // CORRECCIÓN: El total esperado debe ser al menos (paidCount + 1) para asegurar que siempre hay 1 cuota pendiente
      // También debe ser al menos (monthsElapsed + 1) para reflejar el tiempo transcurrido
      const totalExpectedInstallments = Math.max(paidCount + 1, monthsElapsed + 1);

      // Cuotas pendientes = total esperadas - pagadas (siempre al menos 1)
      const unpaidCount = Math.max(1, totalExpectedInstallments - paidCount);

      // Calcular interés pendiente total
      const totalPendingInterest = unpaidCount * interestPerPayment;

      console.log('🔍 LoanDetailsView - calculatePendingInterestForIndefinite: Resumen final', {
        loanId: loan.id,
        totalExpectedInstallments,
        paidCount,
        unpaidCount,
        interestPerPayment,
        totalPendingInterest
      });

      setPendingInterestForIndefinite(totalPendingInterest);
    } catch (error) {
      console.error('❌ Error calculando interés pendiente para préstamo indefinido en LoanDetailsView:', error);
      setPendingInterestForIndefinite(0);
    }
  };

  const fetchLoanDetails = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('loans')
        .select(`
          *,
          client:client_id (
            full_name,
            dni,
            phone,
            address
          )
        `)
        .eq('id', loanId)
        .single();

      if (error) throw error;

      setLoan({
        ...data,
        client: {
          full_name: (data.client as any)?.full_name || '',
          dni: (data.client as any)?.dni || '',
          phone: (data.client as any)?.phone || '',
          address: (data.client as any)?.address || ''
        }
      });
    } catch (error) {
      console.error('Error fetching loan details:', error);
      toast.error('Error al cargar detalles del préstamo');
    } finally {
      setLoading(false);
    }
  };

  const fetchPayments = async () => {
    try {
      const { data, error } = await supabase
        .from('payments')
        .select('*')
        .eq('loan_id', loanId)
        .order('payment_date', { ascending: false });

      if (error) throw error;
      setPayments(data || []);
    } catch (error) {
      console.error('Error fetching payments:', error);
    }
  };

  const fetchInstallments = async () => {
    try {
      const { data, error } = await supabase
        .from('installments')
        .select('*')
        .eq('loan_id', loanId)
        .order('installment_number', { ascending: true });

      if (error) throw error;
      setInstallments(data || []);
      
      // Buscar la primera cuota/cargo pendiente ordenada por fecha de vencimiento
      const { data: firstUnpaid, error: unpaidError } = await supabase
        .from('installments')
        .select('due_date, is_paid')
        .eq('loan_id', loanId)
        .eq('is_paid', false)
        .order('due_date', { ascending: true })
        .limit(1);
      
      if (!unpaidError && firstUnpaid && firstUnpaid.length > 0) {
        const first = firstUnpaid[0];
        if (first.due_date) {
          setNextPaymentDate(first.due_date.split('T')[0]);
          return;
        }
      }
      
      // Si no se encontró, usar next_payment_date del préstamo
      if (loan?.next_payment_date) {
        setNextPaymentDate(loan.next_payment_date.split('T')[0]);
      } else {
        setNextPaymentDate(null);
      }
    } catch (error) {
      console.error('Error fetching installments:', error);
    }
  };

  const fetchAgreements = async () => {
    try {
      const { data, error } = await supabase
        .from('payment_agreements')
        .select('*')
        .eq('loan_id', loanId)
        .in('status', ['approved', 'active'])
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAgreements(data || []);
    } catch (error) {
      console.error('Error fetching agreements:', error);
    }
  };

  const fetchLoanHistoryNotes = async () => {
    try {
      const { data, error } = await supabase
        .from('loan_history')
        .select('*')
        .eq('loan_id', loanId)
        .not('description', 'is', null)
        .order('created_at', { ascending: false });

      if (error) {
        // Si la tabla no existe, simplemente no mostrar notas
        if (error.code === '42P01' || error.code === 'PGRST116') {
          setLoanHistoryNotes([]);
        } else {
          console.error('Error fetching loan history notes:', error);
          setLoanHistoryNotes([]);
        }
      } else {
        setLoanHistoryNotes(data || []);
      }
    } catch (error) {
      console.error('Error fetching loan history notes:', error);
      setLoanHistoryNotes([]);
    }
  };

  const fetchTrackingRecords = async () => {
    try {
      setLoadingTracking(true);
      const { data, error } = await supabase
        .from('collection_tracking')
        .select('*')
        .eq('loan_id', loanId)
        .order('contact_date', { ascending: false })
        .order('contact_time', { ascending: false });

      if (error) throw error;
      setTrackingRecords(data || []);
    } catch (error) {
      console.error('Error fetching tracking records:', error);
      toast.error('Error al cargar el historial de seguimiento');
    } finally {
      setLoadingTracking(false);
    }
  };

  const fetchDocuments = async () => {
    try {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('loan_id', loanId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching documents:', error);
        setDocuments([]);
      } else {
        setDocuments(data || []);
      }
    } catch (error) {
      console.error('Error fetching documents:', error);
      setDocuments([]);
    }
  };

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

  // Verificar qué documentos ya están generados para este préstamo
  const checkAvailableDocuments = async () => {
    if (!loanId) return;
    
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

  // Generar documentos seleccionados
  const handleGenerateDocuments = async () => {
    if (!loan || selectedDocumentsToGenerate.length === 0) {
      toast.error('Selecciona al menos un documento');
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
        .eq('id', loanId)
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
          const fileName = `${docType}_${loanId}_${Date.now()}.pdf`;
          const filePath = `user-${companyId}/loans/${loanId}/${fileName}`;
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
            loan_id: loanId,
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
    } catch (error: any) {
      console.error('Error generando documentos:', error);
      toast.error(error.message || 'Error al generar documentos', { id: 'generate-docs' });
    } finally {
      setGeneratingDocuments(false);
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

    if (!user || !companyId) {
      toast.error('Debes iniciar sesión para subir documentos');
      return;
    }

    try {
      toast.loading('Subiendo documento...', { id: 'upload-doc' });

      // Subir archivo a storage
      const filePath = `user-${companyId}/loans/${loanId}/${Date.now()}-${documentForm.file_name}`;
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
          loan_id: loanId,
          client_id: loan?.client?.dni ? null : null, // Se puede agregar si hay client_id disponible
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
        document_type: 'loan_document',
        file: null
      });
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      setShowUploadDocument(false);
      
      // Recargar documentos
      fetchDocuments();
    } catch (error: any) {
      console.error('Error al subir documento:', error);
      toast.error(error.message || 'Error al subir documento', { id: 'upload-doc' });
    }
  };

  const handleDownloadDocument = async (doc: any) => {
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

  const handlePreviewDocument = async (doc: any) => {
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

  const handleDeleteDocument = async (documentId: string, fileUrl: string) => {
    if (!confirm('¿Estás seguro de que deseas eliminar este documento?')) {
      return;
    }

    try {
      // Eliminar de storage
      if (fileUrl) {
        const { error: storageError } = await supabase.storage
          .from('documents')
          .remove([fileUrl]);
        
        if (storageError) {
          console.error('Error eliminando archivo de storage:', storageError);
        }
      }

      // Eliminar de la base de datos
      const { error: deleteError } = await supabase
        .from('documents')
        .delete()
        .eq('id', documentId);

      if (deleteError) throw deleteError;

      toast.success('Documento eliminado correctamente');
      fetchDocuments();
    } catch (error: any) {
      console.error('Error al eliminar documento:', error);
      toast.error('Error al eliminar documento');
    }
  };

  if (!loan) {
    return null;
  }

  // Calcular estadísticas
  // Separar pagos de capital del préstamo original de pagos de cargos
  // Los cargos son adicionales al capital original, así que no se restan del capital original
  
  // Primero calcular cargos (necesario para calcular totalPaid correctamente)
  // IMPORTANTE: Excluir cargos que sean penalidades de abonos a capital (no deben aparecer como cargos)
  const allCharges = installments.filter(inst => {
    // Un cargo es una cuota donde interest_amount === 0 y principal_amount === total_amount
    const isCharge = Math.abs(inst.interest_amount || 0) < 0.01 && 
                     Math.abs((inst.principal_amount || 0) - (inst.total_amount || 0)) < 0.01;
    return isCharge;
  });
  const totalChargesAmount = allCharges.reduce((sum, inst) => sum + (inst.total_amount || 0), 0);
  
  // CORRECCIÓN CRÍTICA: Calcular cargos pagados considerando pagos parciales
  // No usar is_paid directamente, sino calcular cuánto se ha pagado de cada cargo
  const paidChargesAmount = allCharges.reduce((sum, inst) => {
    const chargeDueDate = inst.due_date?.split('T')[0];
    if (!chargeDueDate) return sum;
    
    // Obtener cargos con la misma fecha para distribuir pagos correctamente
    const chargesWithSameDate = allCharges.filter(c => c.due_date?.split('T')[0] === chargeDueDate)
      .sort((a, b) => (a.installment_number || 0) - (b.installment_number || 0));
    
    // Obtener pagos asignados a cargos con esta fecha
    const paymentsForCharges = payments.filter(p => {
      const paymentDueDate = p.due_date?.split('T')[0];
      const hasNoInterest = Math.abs(p.interest_amount || 0) < 0.01;
      return paymentDueDate === chargeDueDate && hasNoInterest;
    });
    
    const totalPaidForDate = paymentsForCharges.reduce((s, p) => s + (p.principal_amount || p.amount || 0), 0);
    const chargeIndex = chargesWithSameDate.findIndex(c => c.id === inst.id);
    
    let principalPaidForThisCharge = 0;
    if (chargeIndex >= 0 && chargesWithSameDate.length > 0) {
      let remainingPayments = totalPaidForDate;
      for (let i = 0; i < chargeIndex; i++) {
        const prevCharge = chargesWithSameDate[i];
        remainingPayments -= Math.min(remainingPayments, prevCharge.total_amount || 0);
      }
      principalPaidForThisCharge = Math.min(remainingPayments, inst.total_amount || 0);
    } else {
      principalPaidForThisCharge = Math.min(totalPaidForDate, inst.total_amount || 0);
    }
    
    return sum + principalPaidForThisCharge;
  }, 0);
  
  const unpaidChargesAmount = totalChargesAmount - paidChargesAmount;
  
  // Calcular pagos y abonos
  const totalPaidFromPayments = payments.reduce((sum, p) => sum + (p.principal_amount || 0), 0);
  const totalInterestPaid = payments.reduce((sum, p) => sum + (p.interest_amount || 0), 0);
  const totalLateFeePaid = payments.reduce((sum, p) => sum + (p.late_fee || 0), 0);
  
  // Calcular total de abonos a capital
  const totalCapitalPayments = capitalPayments.reduce((sum, cp) => sum + (cp.amount || 0), 0);
  
  // Capital pagado = capital de TODOS los pagos (incluyendo pagos de cargos)
  // CORRECCIÓN: El capital pagado es simplemente la suma del principal_amount de todos los pagos
  // Los abonos a capital NO son "capital pagado" en el sentido de pagos, son reducciones de capital
  const capitalPaidFromLoan = totalPaidFromPayments;
  
  // Total pagado = capital + interés de los pagos (NO incluye abonos a capital)
  const totalPaidFromAllPayments = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  
  // Capital pendiente = suma del capital pendiente de todas las CUOTAS REGULARES (excluyendo cargos)
  // IMPORTANTE: Calcular desde TODAS las cuotas (no solo is_paid = false) para incluir pagos parciales
  // CORRECCIÓN CRÍTICA: Considerar pagos parciales - restar lo que ya se pagó de cada cuota
  // IMPORTANTE: Excluir cargos del capital pendiente - los cargos se calculan por separado como unpaidChargesAmount
  // Redondear cada valor individual antes de sumar para evitar diferencias de redondeo
  const capitalPendingFromInstallments = installments
    .filter(inst => {
      // Excluir cargos del capital pendiente
      const isCharge = Math.abs(inst.interest_amount || 0) < 0.01 && 
                      Math.abs((inst.principal_amount || 0) - (inst.total_amount || 0)) < 0.01;
      return !isCharge;
    })
    .reduce((sum, inst) => {
      const originalPrincipal = inst.principal_amount || 0;
      
      // Es una cuota regular: buscar pagos asignados a esta cuota
      const installmentDueDate = inst.due_date?.split('T')[0];
      
      let principalPaidForThisInstallment = 0;
      if (installmentDueDate) {
        // Obtener pagos asignados a esta cuota por due_date
        const paymentsForThisInstallment = payments.filter(p => {
          const paymentDueDate = p.due_date?.split('T')[0];
          return paymentDueDate === installmentDueDate;
        });
        
        // Sumar el principal_amount de los pagos asignados a esta cuota
        principalPaidForThisInstallment = paymentsForThisInstallment.reduce((s, p) => s + (p.principal_amount || 0), 0);
      }
      
      // Capital pendiente de esta cuota = principal original - principal ya pagado
      const remainingPrincipal = Math.max(0, originalPrincipal - principalPaidForThisInstallment);
      
      // Solo incluir en el capital pendiente si hay algo pendiente (remainingPrincipal > 0.01)
      // Esto asegura que cuotas completamente pagadas no se incluyan, pero cuotas parcialmente pagadas sí
      if (remainingPrincipal > 0.01) {
        return sum + Math.round(remainingPrincipal);
      }
      return sum;
    }, 0);
  
  // Si hay cuotas pendientes, usar ese cálculo; sino usar el cálculo tradicional
  const capitalPending = capitalPendingFromInstallments > 0 
    ? capitalPendingFromInstallments 
    : Math.round(loan.amount - capitalPaidFromLoan - totalCapitalPayments);
  
  // Calcular interés pendiente
  // Para préstamos indefinidos, usar el cálculo dinámico
  // Para otros tipos, usar el cálculo basado en cuotas
  // IMPORTANTE: Redondear cada valor individual antes de sumar para evitar diferencias de redondeo
  let interestPending = 0;
  if (loan.amortization_type === 'indefinite') {
    interestPending = Math.round(pendingInterestForIndefinite);
  } else {
    // Calcular interés pendiente basado en cuotas no pagadas (solo cuotas regulares, no cargos)
    // CORRECCIÓN CRÍTICA: Considerar pagos parciales - restar lo que ya se pagó de interés de cada cuota
    // IMPORTANTE: Redondear cada valor individual antes de sumar
    const interestPendingFromInstallments = installments
      .filter(inst => {
        // Excluir cargos y cuotas pagadas completamente
        const isCharge = Math.abs(inst.interest_amount || 0) < 0.01 && 
                        Math.abs((inst.principal_amount || 0) - (inst.total_amount || 0)) < 0.01;
        return !inst.is_paid && !isCharge;
      })
      .reduce((sum, inst) => {
        const originalInterest = inst.interest_amount || 0;
        
        // Calcular cuánto interés se ha pagado de esta cuota específica
        const installmentDueDate = inst.due_date?.split('T')[0];
        let interestPaidForThisInstallment = 0;
        
        if (installmentDueDate) {
          // Obtener pagos asignados a esta cuota por due_date
          const paymentsForThisInstallment = payments.filter(p => {
            const paymentDueDate = p.due_date?.split('T')[0];
            return paymentDueDate === installmentDueDate;
          });
          
          // Sumar el interest_amount de los pagos asignados a esta cuota
          interestPaidForThisInstallment = paymentsForThisInstallment.reduce((s, p) => s + (p.interest_amount || 0), 0);
        }
        
        // Interés pendiente de esta cuota = interés original - interés ya pagado
        const remainingInterest = Math.max(0, originalInterest - interestPaidForThisInstallment);
        
        return sum + Math.round(remainingInterest);
      }, 0);
    
    // Usar el cálculo de cuotas si está disponible, sino usar el cálculo estimado
    interestPending = interestPendingFromInstallments > 0 
      ? interestPendingFromInstallments 
      : Math.round((loan.amount * loan.interest_rate / 100 * loan.term_months) - totalInterestPaid);
  }
  
  // Calcular balance restante
  // CORRECCIÓN: Para préstamos indefinidos, incluir cargos y restar solo pagos de capital/cargos
  // Los pagos de interés NO reducen el balance en préstamos indefinidos
  // Para otros tipos: calcular basándose en total_amount o calcularlo
  let remainingBalance: number;
  if (loan.amortization_type === 'indefinite') {
    // CORRECCIÓN CRÍTICA: Solo restar pagos de capital/cargos, NO pagos de interés
    // IMPORTANTE: Redondear cada componente antes de sumar para evitar diferencias de redondeo
    const totalPaidCapital = payments.reduce((sum, p) => sum + Math.round(Number(p.principal_amount) || 0), 0);
    // Balance = capital - abonos a capital + interés pendiente + TODOS los cargos - pagos de capital/cargos
    remainingBalance = Math.max(0, Math.round(loan.amount - totalCapitalPayments + pendingInterestForIndefinite + totalChargesAmount - totalPaidCapital));
  } else {
    // CORRECCIÓN: Balance Pendiente = Capital Pendiente + Interés Pendiente + Cargos No Pagados
    // IMPORTANTE: El capital pendiente incluye el capital de cuotas regulares pendientes
    // IMPORTANTE: Los cargos parcialmente pagados se calculan por separado como unpaidChargesAmount
    // IMPORTANTE: El balance pendiente debe ser la suma exacta de capital + interés + cargos pendientes
    
    // Capital pendiente ya está calculado arriba desde las cuotas regulares pendientes - ya redondeado
    // Interés pendiente ya está calculado arriba - ya redondeado
    // Cargos pendientes (incluyendo parcialmente pagados) se calculan como unpaidChargesAmount - ya redondeado
    // Balance = Capital Pendiente (cuotas regulares) + Interés Pendiente + Cargos Pendientes (valores redondeados)
    // IMPORTANTE: Redondear el resultado final para evitar diferencias de redondeo acumulativo
    remainingBalance = Math.round(capitalPending + interestPending + unpaidChargesAmount);
    
    console.log('🔍 LoanDetailsView - Cálculo de balance (fixed-term, corregido):', {
      loanId: loan.id,
      capitalPending,
      interestPending,
      unpaidChargesAmount,
      calculatedBalance: remainingBalance,
      dbBalance: loan.remaining_balance,
      discrepancy: Math.abs(remainingBalance - loan.remaining_balance)
    });
  }
  
  // Log para préstamos indefinidos también
  if (loan.amortization_type === 'indefinite') {
    console.log('🔍 LoanDetailsView - Cálculo de balance (indefinite):', {
      loanId: loan.id,
      loanAmount: loan.amount,
      totalCapitalPayments,
      pendingInterestForIndefinite,
      totalChargesAmount,
      totalPaidCapital: payments.reduce((sum, p) => sum + (Number(p.principal_amount) || 0), 0),
      calculatedBalance: remainingBalance,
      dbBalance: loan.remaining_balance
    });
  }
  
  // Si el préstamo está saldado, la mora debe ser 0
  const isLoanSettled = loan.status === 'paid';
  // CORRECCIÓN: Calcular la mora actual si está en 0 o no está disponible
  let effectiveLateFee = isLoanSettled ? 0 : (loan.current_late_fee || 0);
  
  // Si la mora está habilitada pero el valor es 0, intentar calcularla desde las cuotas
  if (!isLoanSettled && loan.late_fee_enabled && effectiveLateFee === 0 && installments.length > 0) {
    const today = getCurrentDateInSantoDomingo();
    let calculatedLateFee = 0;
    
    installments.forEach((installment: any) => {
      if (installment.is_paid) return;
      
      // Parsear la fecha de vencimiento como fecha local para evitar problemas de zona horaria
      const [year, month, day] = installment.due_date.split('-').map(Number);
      const dueDate = new Date(year, month - 1, day);
      const daysOverdue = Math.max(0, Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)));
      const gracePeriod = loan.grace_period_days || 0;
      const effectiveDaysOverdue = Math.max(0, daysOverdue - gracePeriod);
      
      if (effectiveDaysOverdue > 0) {
        // Para préstamos indefinidos, usar interest_amount o total_amount
        const isIndefinite = loan.amortization_type === 'indefinite';
        const baseAmount = isIndefinite && installment.principal_amount === 0
          ? (installment.interest_amount || installment.total_amount || installment.amount || 0)
          : (installment.principal_amount || installment.total_amount || installment.amount || 0);
        const lateFeeRate = loan.late_fee_rate || 0;
        
        let lateFee = 0;
        switch (loan.late_fee_calculation_type) {
          case 'daily':
            lateFee = (baseAmount * lateFeeRate / 100) * effectiveDaysOverdue;
            break;
          case 'monthly':
            const monthsOverdue = Math.ceil(effectiveDaysOverdue / 30);
            lateFee = (baseAmount * lateFeeRate / 100) * monthsOverdue;
            break;
          case 'compound':
            lateFee = baseAmount * (Math.pow(1 + lateFeeRate / 100, effectiveDaysOverdue) - 1);
            break;
          default:
            lateFee = (baseAmount * lateFeeRate / 100) * effectiveDaysOverdue;
        }
        
        if (loan.max_late_fee && loan.max_late_fee > 0) {
          lateFee = Math.min(lateFee, loan.max_late_fee);
        }
        
        const remainingLateFee = Math.max(0, lateFee - (installment.late_fee_paid || 0));
        calculatedLateFee += remainingLateFee;
      }
    });
    
    effectiveLateFee = Math.round(calculatedLateFee * 100) / 100;
  }
  
  const totalPending = capitalPending + interestPending + effectiveLateFee;
  // IMPORTANTE: Redondear cada componente antes de sumar para evitar diferencias de redondeo
  const amountToPay = Math.round(loan.monthly_payment) + Math.round(effectiveLateFee);
  const toSettle = Math.round(remainingBalance) + Math.round(effectiveLateFee);

  // Calcular porcentaje pagado basándose en el total correcto (capital + interés + cargos)
  // Para préstamos indefinidos: total = capital + interés pendiente + todos los cargos
  // Para otros tipos: total = capital + interés total + todos los cargos
  let totalLoanAmount: number;
  if (loan.amortization_type === 'indefinite') {
    // Para indefinidos: capital + interés pendiente + todos los cargos
    totalLoanAmount = loan.amount + pendingInterestForIndefinite + totalChargesAmount;
  } else {
    // Para otros tipos: calcular total correcto
    let correctTotalAmount = (loan as any).total_amount;
    if (!correctTotalAmount || correctTotalAmount <= loan.amount) {
      const totalInterest = loan.amount * (loan.interest_rate / 100) * loan.term_months;
      correctTotalAmount = loan.amount + totalInterest;
    }
    totalLoanAmount = correctTotalAmount + totalChargesAmount;
  }
  
  // Calcular total pagado (solo pagos: capital + interés, NO incluye abonos a capital)
  // Los abonos a capital son reducciones de capital, no "pagos" en el sentido tradicional
  const totalPaidForPercentage = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  
  console.log('🔍 LoanDetailsView - Cálculo de total pagado:', {
    loanId: loan.id,
    totalPaidFromPayments,
    totalCapitalPayments,
    totalPaidForPercentage,
    totalLoanAmount
  });
  
  // Calcular porcentajes basándose en el total correcto
  const paidPercentage = totalLoanAmount > 0 ? (totalPaidForPercentage / totalLoanAmount) * 100 : 0;
  
  // Asegurar que el porcentaje esté entre 0 y 100
  const safePaidPercentage = Math.max(0, Math.min(100, paidPercentage));

  // Calcular balance por antigüedad
  const calculateBalanceByAge = () => {
    const today = new Date();
    const capitalRanges = {
      '1-30': 0,
      '31-60': 0,
      '61-90': 0,
      '91-120': 0,
      '121-150': 0,
      '151-180': 0,
      '181+': 0
    };

    const interestRanges = {
      '1-30': 0,
      '31-60': 0,
      '61-90': 0,
      '91-120': 0,
      '121-150': 0,
      '151-180': 0,
      '181+': 0
    };

    installments.forEach(inst => {
      if (!inst.is_paid && inst.due_date) {
        const dueDate = new Date(inst.due_date);
        const daysDiff = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
        
        let range: keyof typeof capitalRanges | null = null;
        if (daysDiff >= 1 && daysDiff <= 30) range = '1-30';
        else if (daysDiff >= 31 && daysDiff <= 60) range = '31-60';
        else if (daysDiff >= 61 && daysDiff <= 90) range = '61-90';
        else if (daysDiff >= 91 && daysDiff <= 120) range = '91-120';
        else if (daysDiff >= 121 && daysDiff <= 150) range = '121-150';
        else if (daysDiff >= 151 && daysDiff <= 180) range = '151-180';
        else if (daysDiff > 180) range = '181+';
        
        if (range) {
          capitalRanges[range] += inst.principal_amount || 0;
          interestRanges[range] += inst.interest_amount || 0;
        }
      }
    });

    return { capitalRanges, interestRanges };
  };

  const { capitalRanges, interestRanges } = calculateBalanceByAge();
  const totalCapitalByAge = Object.values(capitalRanges).reduce((sum, val) => sum + val, 0);
  const totalInterestByAge = Object.values(interestRanges).reduce((sum, val) => sum + val, 0);

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Detalles del Préstamo - {loan.client.full_name}</span>
              <Button variant="ghost" size="icon" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            </DialogTitle>
          </DialogHeader>

          {loading ? (
            <div className="text-center py-8">Cargando...</div>
          ) : (
            <div className="space-y-6">
              {/* Información Principal */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Columna Izquierda - Detalles */}
                <Card className="lg:col-span-2">
                  <CardHeader>
                    <CardTitle>DETALLES</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-600">Monto Prestado:</span>
                        <div className="font-semibold">RD {loan.amount.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                      </div>
                      <div>
                        <span className="text-gray-600">Cuotas:</span>
                        <div className="font-semibold">RD {Math.round(loan.monthly_payment).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                      </div>
                      <div>
                        <span className="text-gray-600">Balance restante:</span>
                        <div className="font-semibold text-orange-600">RD {remainingBalance.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                      </div>
                      <div>
                        <span className="text-gray-600">Estado:</span>
                        <div className="font-semibold">
                          {loan.status === 'active' ? 'Activo' :
                           loan.status === 'overdue' ? 'Vencido' :
                           loan.status === 'paid' ? 'Completado' :
                           loan.status === 'pending' ? 'Pendiente' :
                           loan.status === 'cancelled' ? 'Cancelado' :
                           loan.status === 'in_agreement' ? 'En Acuerdo' :
                           loan.status}
                        </div>
                      </div>
                      <div>
                        <span className="text-gray-600">Fecha inicio:</span>
                        <div className="font-semibold">{formatDateStringForSantoDomingo(loan.start_date)}</div>
                      </div>
                      <div>
                        <span className="text-gray-600">Tipo de préstamo:</span>
                        <div className="font-semibold">{loan.loan_type?.toUpperCase() || 'N/A'} | {loan.amortization_type?.toUpperCase() || 'N/A'}</div>
                      </div>
                      <div>
                        <span className="text-gray-600">Porcentaje de interés:</span>
                        <div className="font-semibold">{loan.interest_rate}%</div>
                      </div>
                      <div>
                        <span className="text-gray-600">Interés pagado:</span>
                        <div className="font-semibold">RD {totalInterestPaid.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                      </div>
                      <div>
                        <span className="text-gray-600">Último pago:</span>
                        <div className="font-semibold">
                          {payments.length > 0 
                            ? `RD ${payments[0].amount.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            : 'RD 0.00'}
                        </div>
                      </div>
                      <div>
                        <span className="text-gray-600">Frecuencia:</span>
                        <div className="font-semibold">
                          {loan.payment_frequency === 'monthly' ? 'Mensual' : 
                           loan.payment_frequency === 'weekly' ? 'Semanal' :
                           loan.payment_frequency === 'biweekly' ? 'Quincenal' :
                           loan.payment_frequency === 'daily' ? 'Diario' : loan.payment_frequency}
                        </div>
                      </div>
                      <div>
                        <span className="text-gray-600">Próxima cuota:</span>
                        <div className="font-semibold">
                          {(loan.status === 'paid' || remainingBalance === 0) 
                            ? 'N/A' 
                            : nextPaymentDate 
                              ? formatDateStringForSantoDomingo(nextPaymentDate)
                              : loan.next_payment_date 
                                ? formatDateStringForSantoDomingo(loan.next_payment_date.split('T')[0])
                                : 'N/A'}
                        </div>
                      </div>
                      {loan.amortization_type !== 'indefinite' && (
                      <>
                        <div>
                          <span className="text-gray-600">Fecha final:</span>
                          <div className="font-semibold">{new Date(loan.end_date).toLocaleDateString('es-DO')}</div>
                        </div>
                        <div>
                          <span className="text-gray-600">Cuotas pagadas:</span>
                          <div className="font-semibold">
                            {installments.filter((inst: any) => inst.is_paid).length} / {loan.term_months || installments.length}
                          </div>
                        </div>
                      </>
                      )}
                      <div>
                        <span className="text-gray-600">Fecha de creación:</span>
                        <div className="font-semibold">{new Date(loan.created_at).toLocaleDateString('es-DO')}</div>
                      </div>
                      {loan.late_fee_enabled && (
                        <>
                          <div>
                            <span className="text-gray-600">Tipo de mora:</span>
                            <div className="font-semibold">{loan.late_fee_rate}%</div>
                          </div>
                          <div>
                            <span className="text-gray-600">Período de gracia:</span>
                            <div className="font-semibold">{loan.grace_period_days} días</div>
                          </div>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Columna Derecha - Resumen Financiero */}
                <Card>
                  <CardHeader>
                    <CardTitle>PENDIENTES</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <div className="text-sm text-gray-600">Capital pend. hoy</div>
                      <div className="text-lg font-semibold">RD {capitalPending.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-600">Interés pend. hoy</div>
                      <div className="text-lg font-semibold">RD {interestPending.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    </div>
                    {effectiveLateFee > 0 && (
                      <div>
                        <div className="text-sm text-gray-600">Mora pendiente</div>
                        <div className="text-lg font-semibold text-red-600">RD {effectiveLateFee.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>PAGADO</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <div className="text-sm text-gray-600">Capital pagado</div>
                      <div className="text-lg font-semibold text-green-600">RD {capitalPaidFromLoan.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-600">Interés pagado</div>
                      <div className="text-lg font-semibold text-green-600">RD {totalInterestPaid.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-600">Total pagado</div>
                      <div className="text-lg font-semibold text-green-600">RD {totalPaidForPercentage.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>RESUMEN</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {!isLoanSettled && (
                      <div>
                        <div className="text-sm text-gray-600">Mora pendiente</div>
                        <div className="text-lg font-semibold text-red-600">RD {effectiveLateFee.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                      </div>
                    )}
                    <div>
                      <div className="text-sm text-gray-600">Otros pendientes</div>
                      <div className="text-lg font-semibold">RD {unpaidChargesAmount.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-600">Monto a pagar</div>
                      <div className="text-lg font-semibold">RD {amountToPay.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-600">A saldar</div>
                      <div className="text-lg font-semibold">RD {toSettle.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-600">Interés pagado</div>
                      <div className="text-lg font-semibold text-green-600">RD {totalInterestPaid.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-600">Total Pagos</div>
                      <div className="text-lg font-semibold text-green-600">RD {payments.reduce((sum, p) => sum + (p.amount || 0), 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Pago Mínimo */}
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <div className="text-sm text-gray-600">Pago mínimo</div>
                    <div className="text-2xl font-bold">RD {Math.round(loan.monthly_payment).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                  </div>
                </CardContent>
              </Card>

              {/* Gráficas */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Gráfica de Préstamo (Donut) */}
                <Card>
                  <CardHeader>
                    <CardTitle>GRÁFICA DE PRÉSTAMO</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-center">
                      <div className="relative w-48 h-48">
                        <svg className="transform -rotate-90 w-48 h-48">
                          <circle
                            cx="96"
                            cy="96"
                            r="80"
                            fill="none"
                            stroke="#e5e7eb"
                            strokeWidth="16"
                          />
                          <circle
                            cx="96"
                            cy="96"
                            r="80"
                            fill="none"
                            stroke="#3b82f6"
                            strokeWidth="16"
                            strokeDasharray={`${(safePaidPercentage / 100) * 502.4} 502.4`}
                            strokeLinecap="round"
                          />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="text-center">
                            <div className="text-2xl font-bold text-blue-600">{safePaidPercentage.toFixed(1)}%</div>
                            <div className="text-sm text-gray-600">Pagado</div>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 space-y-2 text-sm">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600">Total Pagado:</span>
                        <span className="font-semibold text-green-600">RD{totalPaidForPercentage.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600">Total Pendiente:</span>
                        <span className="font-semibold text-red-600">RD{(totalLoanAmount - totalPaidForPercentage).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between items-center pt-2 border-t">
                        <span className="text-gray-600 font-medium">Total del Préstamo:</span>
                        <span className="font-bold">RD{totalLoanAmount.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Balance de Capital por Antigüedad */}
                <Card>
                  <CardHeader>
                    <CardTitle>BALANCE DE CAPITAL POR ANTIGÜEDAD</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center p-2 bg-blue-50 rounded">
                        <span className="font-medium">Capital total RD {totalCapitalByAge.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        <Badge>1-30 Días de atraso</Badge>
                      </div>
                      {Object.entries(capitalRanges).map(([range, amount]) => (
                        <div key={range} className="flex justify-between items-center p-2">
                          <span className="text-sm text-gray-600">{range === '181+' ? 'Más de 181 Días de atraso' : `${range} Días de atraso`}</span>
                          <span className="font-semibold">RD {amount.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Balance de Interés por Antigüedad */}
              <Card>
                <CardHeader>
                  <CardTitle>BALANCE DE INTERÉS POR ANTIGÜEDAD</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center p-2 bg-blue-50 rounded">
                      <span className="font-medium">Total interés pendiente. RD {totalInterestByAge.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      <Badge>1-30 Días de atraso</Badge>
                    </div>
                    {Object.entries(interestRanges).map(([range, amount]) => (
                      <div key={range} className="flex justify-between items-center p-2">
                        <span className="text-sm text-gray-600">{range === '181+' ? 'Más de 181 Días de atraso' : `${range} Días de atraso`}</span>
                        <span className="font-semibold">RD {amount.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Botones de Acción */}
              <div className="flex flex-wrap gap-2 justify-center">
                <Button variant="outline" onClick={() => setShowInstallments(true)}>
                  <FileText className="h-4 w-4 mr-2" />
                  Ver cuotas
                </Button>
                <Button variant="outline" onClick={() => setShowStatement(true)}>
                  <Receipt className="h-4 w-4 mr-2" />
                  Ver recibos
                </Button>
                <Button variant="outline" onClick={() => setShowHistory(true)}>
                  <History className="h-4 w-4 mr-2" />
                  Historial
                </Button>
                <Button variant="outline" onClick={() => setShowNotes(true)}>
                  <StickyNote className="h-4 w-4 mr-2" />
                  Ver notas
                </Button>
                <Button variant="outline" onClick={() => setShowAgreements(true)}>
                  <Handshake className="h-4 w-4 mr-2" />
                  Ver acuerdos
                </Button>
                <Button variant="outline" onClick={() => {
                  // Navegar a turnos con el día de pago como parámetro
                  navigate(`/turnos?date=${loan.next_payment_date}&loan_id=${loan.id}&client_id=${loan.client.dni}`);
                }}>
                  <Calendar className="h-4 w-4 mr-2" />
                  Agendas
                </Button>
                <Button variant="outline" onClick={() => setShowDocuments(true)}>
                  <FolderOpen className="h-4 w-4 mr-2" />
                  Documentos
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modales */}
      {showHistory && (
        <LoanHistoryView
          loanId={loanId}
          isOpen={showHistory}
          onClose={() => setShowHistory(false)}
          onRefresh={fetchLoanDetails}
        />
      )}

      {showStatement && (
        <AccountStatement
          loanId={loanId}
          isOpen={showStatement}
          onClose={() => setShowStatement(false)}
        />
      )}

      {showInstallments && (
        <InstallmentsTable
          loanId={loanId}
          isOpen={showInstallments}
          onClose={() => setShowInstallments(false)}
        />
      )}

      {/* Modal de Notas de Seguimiento */}
      {showNotes && (
        <Dialog open={showNotes} onOpenChange={setShowNotes}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Notas de Seguimiento
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {loadingTracking ? (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-200 border-t-blue-600 mx-auto"></div>
                  <p className="text-gray-600 mt-4 font-medium">Cargando historial...</p>
                </div>
              ) : trackingRecords.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Clock className="h-10 w-10 text-gray-400" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-700 mb-2">Sin seguimientos</h3>
                  <p className="text-gray-500">No hay registros de seguimiento para este préstamo</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {trackingRecords.map((record) => {
                    const contactTypeIcons: Record<string, any> = {
                      phone: Phone,
                      email: Mail,
                      sms: MessageSquare,
                      visit: MapPin,
                      letter: FileText,
                      other: StickyNote
                    };
                    const contactTypeLabels: Record<string, string> = {
                      phone: 'Llamada Telefónica',
                      email: 'Correo Electrónico',
                      sms: 'Mensaje de Texto',
                      visit: 'Visita Personal',
                      letter: 'Carta',
                      other: 'Otro'
                    };
                    const contactTypeColors: Record<string, string> = {
                      phone: 'bg-blue-100 text-blue-800',
                      email: 'bg-green-100 text-green-800',
                      sms: 'bg-purple-100 text-purple-800',
                      visit: 'bg-orange-100 text-orange-800',
                      letter: 'bg-gray-100 text-gray-800',
                      other: 'bg-yellow-100 text-yellow-800'
                    };
                    
                    const Icon = contactTypeIcons[record.contact_type] || StickyNote;
                    const colorClass = contactTypeColors[record.contact_type] || 'bg-gray-100 text-gray-800';
                    
                    return (
                      <div key={record.id} className="bg-white border border-gray-200 rounded-xl p-6 hover:shadow-md transition-all duration-200">
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                          <div className="flex-1">
                            {/* Header del registro */}
                            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                                  <Icon className="h-5 w-5 text-gray-600" />
                                </div>
                                <Badge className={`${colorClass} px-3 py-1 text-sm font-semibold`}>
                                  {contactTypeLabels[record.contact_type] || 'Otro'}
                                </Badge>
                              </div>
                              <div className="text-sm text-gray-500 font-medium">
                                {new Date(record.contact_date).toLocaleDateString('es-DO')} a las {record.contact_time}
                              </div>
                            </div>

                            {/* Contenido del registro */}
                            <div className="space-y-4">
                              {record.client_response && (
                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                  <p className="text-sm font-semibold text-blue-800 mb-2">Respuesta del Cliente:</p>
                                  <p className="text-sm text-blue-700 leading-relaxed">{record.client_response}</p>
                                </div>
                              )}

                              {record.additional_notes && (
                                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                                  <p className="text-sm font-semibold text-gray-800 mb-2">Notas Adicionales:</p>
                                  <p className="text-sm text-gray-700 leading-relaxed">{record.additional_notes}</p>
                                </div>
                              )}

                              {record.next_contact_date && (
                                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                                  <div className="flex items-center gap-2">
                                    <Calendar className="h-4 w-4 text-orange-600" />
                                    <span className="text-sm font-semibold text-orange-800">
                                      Próximo contacto: {new Date(record.next_contact_date).toLocaleDateString('es-DO')}
                                    </span>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Modal de Acuerdos de Pago */}
      {showAgreements && (
        <Dialog open={showAgreements} onOpenChange={setShowAgreements}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Acuerdos de Pago</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {agreements.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Handshake className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No hay acuerdos de pago aprobados o activos para este préstamo</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {agreements.map((agreement) => (
                    <Card
                      key={agreement.id}
                      className="cursor-pointer hover:bg-gray-50 transition-colors"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setSelectedAgreement(agreement);
                        setShowAgreements(false);
                        setTimeout(() => {
                          setShowPaymentForm(true);
                        }, 100);
                      }}
                    >
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start">
                          <div className="space-y-1">
                            <div className="font-semibold">
                              Monto acordado: RD {(agreement.agreed_amount || agreement.agreed_payment_amount || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                            <div className="text-sm text-gray-600">
                              Monto original: RD {(agreement.original_amount || agreement.original_payment || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                            <div className="text-sm text-gray-600">
                              Frecuencia: {agreement.payment_frequency === 'monthly' ? 'Mensual' :
                                           agreement.payment_frequency === 'biweekly' ? 'Quincenal' :
                                           agreement.payment_frequency === 'weekly' ? 'Semanal' :
                                           agreement.payment_frequency === 'daily' ? 'Diario' : agreement.payment_frequency}
                            </div>
                            <div className="text-sm text-gray-600">
                              Período: {new Date(agreement.start_date).toLocaleDateString('es-DO')} - {agreement.end_date ? new Date(agreement.end_date).toLocaleDateString('es-DO') : 'Sin fecha de fin'}
                            </div>
                            {agreement.reason && (
                              <div className="text-sm text-gray-600">
                                Razón: {agreement.reason}
                              </div>
                            )}
                            {agreement.notes && (
                              <div className="text-sm text-gray-600 mt-2">
                                <strong>Notas:</strong> {agreement.notes}
                              </div>
                            )}
                          </div>
                          <Badge variant={agreement.status === 'approved' || agreement.status === 'active' ? 'default' : 'secondary'}>
                            {agreement.status === 'approved' ? 'Aprobado' : 
                             agreement.status === 'active' ? 'Activo' : 
                             agreement.status}
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
            </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* PaymentForm con datos del acuerdo */}
      {showPaymentForm && selectedAgreement && loan && (
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <PaymentForm
              onBack={() => {
                setShowPaymentForm(false);
                setSelectedAgreement(null);
              }}
              preselectedLoan={{
                id: loan.id,
                amount: loan.amount,
                remaining_balance: remainingBalance,
                monthly_payment: selectedAgreement.agreed_amount || selectedAgreement.agreed_payment_amount || loan.monthly_payment,
                interest_rate: loan.interest_rate,
                term_months: loan.term_months,
                next_payment_date: loan.next_payment_date,
                start_date: loan.start_date,
                late_fee_enabled: loan.late_fee_enabled || false,
                late_fee_rate: loan.late_fee_rate || 0,
                grace_period_days: loan.grace_period_days || 0,
                max_late_fee: (loan as any).max_late_fee || 0,
                late_fee_calculation_type: ((loan as any).late_fee_calculation_type || 'daily') as 'daily' | 'monthly' | 'compound',
                current_late_fee: loan.current_late_fee || 0,
                payment_frequency: loan.payment_frequency || 'monthly',
                client: loan.client
              }}
              onPaymentSuccess={() => {
                setShowPaymentForm(false);
                setSelectedAgreement(null);
                if (onRefresh) {
                  onRefresh();
                }
                fetchLoanDetails();
                fetchPayments();
                fetchInstallments();
              }}
            />
          </div>
            </div>
      )}

      {/* Modal de Documentos */}
      {showDocuments && (
        <Dialog open={showDocuments} onOpenChange={setShowDocuments}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center justify-between">
                <span>Documentos del Préstamo</span>
                <div className="flex gap-2">
                  <Button 
                    variant="outline"
                    onClick={() => {
                      setShowGenerateDialog(true);
                      checkAvailableDocuments();
                    }}
                  >
                    <FileCheck className="h-4 w-4 mr-2" />
                    Generar Documentos
                  </Button>
                  <Button onClick={() => setShowUploadDocument(true)}>
                    <Upload className="h-4 w-4 mr-2" />
                    Subir Documento
                  </Button>
                </div>
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {documents.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <FolderOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No hay documentos para este préstamo</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {documents.map((doc) => (
                    <Card key={doc.id}>
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <FileText className="h-5 w-5 text-blue-500" />
                              <h3 className="font-semibold">{doc.title}</h3>
                            </div>
                            <div className="text-sm text-gray-600 space-y-1">
                              <div><strong>Nombre de archivo:</strong> {doc.file_name || 'N/A'}</div>
                              {doc.description && (
                                <div><strong>Descripción:</strong> {doc.description}</div>
                              )}
                              <div>
                                <strong>Fecha:</strong> {new Date(doc.created_at || '').toLocaleDateString('es-DO', {
                                  year: 'numeric',
                                  month: 'long',
                                  day: 'numeric'
                                })}
                              </div>
                              {doc.file_size && (
                                <div>
                                  <strong>Tamaño:</strong> {(doc.file_size / 1024).toFixed(2)} KB
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-2">
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
                              onClick={() => handleDeleteDocument(doc.id, doc.file_url || '')}
                              title="Eliminar"
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Modal de Subir Documento */}
      {showUploadDocument && (
        <Dialog open={showUploadDocument} onOpenChange={setShowUploadDocument}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Subir Documento</DialogTitle>
            </DialogHeader>
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
                  <option value="loan_document">Documento de Préstamo</option>
                  <option value="contract">Contrato</option>
                  <option value="receipt">Comprobante</option>
                  <option value="identification">Identificación</option>
                  <option value="general">General</option>
                  <option value="invoice">Factura</option>
                  <option value="statement">Estado de Cuenta</option>
                  <option value="other">Otro</option>
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
                  setShowUploadDocument(false);
                  setDocumentForm({
                    title: '',
                    file_name: '',
                    description: '',
                    document_type: 'loan_document',
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
          </DialogContent>
        </Dialog>
      )}

      {/* Modal de Generar Documentos */}
      <Dialog open={showGenerateDialog} onOpenChange={setShowGenerateDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Generar Documentos</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Lista de documentos disponibles */}
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

            <div className="flex justify-end gap-2 pt-4">
              <Button 
                variant="outline" 
                onClick={() => {
                  setShowGenerateDialog(false);
                  setAvailableDocuments([]);
                  setSelectedDocumentsToGenerate([]);
                }}
              >
                Cancelar
              </Button>
              <Button 
                onClick={handleGenerateDocuments}
                disabled={selectedDocumentsToGenerate.length === 0 || generatingDocuments}
              >
                <FileCheck className="h-4 w-4 mr-2" />
                {generatingDocuments ? 'Generando...' : `Generar ${selectedDocumentsToGenerate.length} Documento(s)`}
              </Button>
            </div>
          </div>
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
    </>
  );
};

