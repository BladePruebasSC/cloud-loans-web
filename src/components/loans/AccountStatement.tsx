import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { 
  FileText, 
  Download, 
  Calendar, 
  DollarSign, 
  CheckCircle, 
  Clock, 
  AlertTriangle,
  X,
  RefreshCw,
  Printer,
  Mail,
  Eye,
  Filter,
  Search,
  Receipt
} from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getLateFeeBreakdownFromInstallments } from '@/utils/lateFeeCalculator';

interface Payment {
  id: string;
  loan_id: string;
  amount: number;
  principal_amount: number;
  interest_amount: number;
  late_fee: number;
  payment_date: string;
  due_date: string;
  payment_method: string;
  reference_number?: string;
  notes?: string;
  status: string;
  created_at: string;
}

interface Installment {
  id: string;
  loan_id: string;
  installment_number: number;
  due_date: string;
  amount: number;
  principal_amount: number;
  interest_amount: number;
  late_fee_paid: number;
  is_paid: boolean;
  paid_date?: string;
  created_at: string;
  updated_at: string;
}

interface Loan {
  id: string;
  amount: number;
  remaining_balance: number;
  monthly_payment: number;
  interest_rate: number;
  term_months: number;
  start_date: string;
  next_payment_date: string;
  status: string;
  clients: {
    full_name: string;
    dni: string;
  };
}

interface AccountStatementProps {
  loanId: string;
  isOpen: boolean;
  onClose: () => void;
}

export const AccountStatement: React.FC<AccountStatementProps> = ({ 
  loanId, 
  isOpen, 
  onClose 
}) => {
  const [loading, setLoading] = useState(false);
  const [loan, setLoan] = useState<Loan | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [statementDate, setStatementDate] = useState(new Date().toISOString().split('T')[0]);
  const [filteredPayments, setFilteredPayments] = useState<Payment[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [methodFilter, setMethodFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [currentLateFee, setCurrentLateFee] = useState(0);
  const [amortizationPeriod, setAmortizationPeriod] = useState('all');
  const [amortizationSchedule, setAmortizationSchedule] = useState<any[]>([]);

  useEffect(() => {
    if (isOpen && loanId) {
      fetchAccountData();
    }
  }, [isOpen, loanId]);

  // Aplicar filtros a los pagos
  useEffect(() => {
    let filtered = [...payments];

    // Filtro por término de búsqueda
    if (searchTerm) {
      filtered = filtered.filter(payment => 
        payment.reference_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        payment.notes?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        payment.payment_method.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Filtro por estado
    if (statusFilter !== 'all') {
      filtered = filtered.filter(payment => payment.status === statusFilter);
    }

    // Filtro por método de pago
    if (methodFilter !== 'all') {
      filtered = filtered.filter(payment => payment.payment_method === methodFilter);
    }

    // Filtro por fecha
    if (dateFilter !== 'all') {
      const now = new Date();
      const filterDate = new Date();
      
      switch (dateFilter) {
        case 'today':
          filterDate.setHours(0, 0, 0, 0);
          filtered = filtered.filter(payment => {
            const paymentDate = new Date(payment.payment_date);
            return paymentDate >= filterDate;
          });
          break;
        case 'week':
          filterDate.setDate(filterDate.getDate() - 7);
          filtered = filtered.filter(payment => {
            const paymentDate = new Date(payment.payment_date);
            return paymentDate >= filterDate;
          });
          break;
        case 'month':
          filterDate.setMonth(filterDate.getMonth() - 1);
          filtered = filtered.filter(payment => {
            const paymentDate = new Date(payment.payment_date);
            return paymentDate >= filterDate;
          });
          break;
        case 'year':
          filterDate.setFullYear(filterDate.getFullYear() - 1);
          filtered = filtered.filter(payment => {
            const paymentDate = new Date(payment.payment_date);
            return paymentDate >= filterDate;
          });
          break;
      }
    }

    setFilteredPayments(filtered);
  }, [payments, searchTerm, statusFilter, methodFilter, dateFilter]);

  // Calcular tabla de amortización cuando se cargan los datos del préstamo y las cuotas
  useEffect(() => {
    const calculateSchedule = async () => {
      if (loan && installments.length > 0) {
        const schedule = await calculateAmortizationSchedule(loan, installments);
      setAmortizationSchedule(schedule);
    }
    };
    
    calculateSchedule();
  }, [loan, installments]);

  // Debug: Log cuando currentLateFee cambia
  useEffect(() => {
    console.log('🔍 AccountStatement: currentLateFee cambió a:', currentLateFee);
  }, [currentLateFee]);

  const fetchAccountData = async () => {
    setLoading(true);
    try {
      // Obtener información del préstamo
      const { data: loanData, error: loanError } = await supabase
        .from('loans')
        .select(`
          id,
          amount,
          remaining_balance,
          monthly_payment,
          interest_rate,
          term_months,
          start_date,
          next_payment_date,
          status,
          client_id,
          payment_frequency,
          late_fee_enabled,
          late_fee_rate,
          grace_period_days,
          max_late_fee,
          late_fee_calculation_type
        `)
        .eq('id', loanId)
        .single();

      if (loanError) throw loanError;

      // Obtener información del cliente por separado
      const { data: clientData, error: clientError } = await supabase
        .from('clients')
        .select('full_name, dni')
        .eq('id', loanData.client_id)
        .single();

      if (clientError) throw clientError;

      // Combinar los datos
      const combinedLoanData = {
        ...loanData,
        clients: clientData
      };

      setLoan(combinedLoanData as Loan);

      // Obtener todos los pagos del préstamo
      const { data: paymentsData, error: paymentsError } = await supabase
        .from('payments')
        .select('*')
        .eq('loan_id', loanId)
        .order('payment_date', { ascending: true });

      if (paymentsError) throw paymentsError;
      setPayments(paymentsData || []);

      // Obtener las cuotas del préstamo
      const { data: installmentsData, error: installmentsError } = await supabase
        .from('installments')
        .select('*')
        .eq('loan_id', loanId)
        .order('installment_number', { ascending: true });

      if (installmentsError) throw installmentsError;
      setInstallments(installmentsData || []);

      // Calcular la mora actual basándose en las cuotas reales del préstamo
      if (loanData && installmentsData) {
        try {
          console.log('🔍 AccountStatement: Calculando mora usando datos reales de cuotas...');
          console.log('🔍 AccountStatement: Datos del préstamo:', {
            id: loanData.id,
            amount: loanData.amount,
            interest_rate: loanData.interest_rate,
            term_months: loanData.term_months,
            monthly_payment: loanData.monthly_payment,
            remaining_balance: loanData.remaining_balance,
            next_payment_date: loanData.next_payment_date,
            start_date: loanData.start_date,
            late_fee_rate: loanData.late_fee_rate,
            grace_period_days: loanData.grace_period_days,
            max_late_fee: loanData.max_late_fee,
            late_fee_calculation_type: loanData.late_fee_calculation_type
          });

          // Calcular mora actual basándose en las cuotas reales
          const currentDate = new Date();
          let totalCurrentLateFee = 0;

          installmentsData.forEach((installment: any) => {
            const dueDate = new Date(installment.due_date);
            const daysOverdue = Math.max(0, Math.floor((currentDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)));
            
            console.log(`🔍 Cuota ${installment.installment_number}:`, {
              dueDate: installment.due_date,
              isPaid: installment.is_paid,
              daysOverdue,
              principalAmount: installment.principal_amount,
              lateFeePaid: installment.late_fee_paid
            });
            
            // Solo calcular mora para cuotas vencidas y no pagadas
            if (daysOverdue > 0 && !installment.is_paid) {
              const gracePeriod = loanData.grace_period_days || 0;
              const effectiveDaysOverdue = Math.max(0, daysOverdue - gracePeriod);
              
              if (effectiveDaysOverdue > 0) {
                const principalPerPayment = installment.principal_amount;
                const lateFeeRate = loanData.late_fee_rate || 2;
                
                let lateFee = 0;
                switch (loanData.late_fee_calculation_type) {
                  case 'daily':
                    lateFee = (principalPerPayment * lateFeeRate / 100) * effectiveDaysOverdue;
                    break;
                  case 'monthly':
                    const monthsOverdue = Math.ceil(effectiveDaysOverdue / 30);
                    lateFee = (principalPerPayment * lateFeeRate / 100) * monthsOverdue;
                    break;
                  case 'compound':
                    lateFee = principalPerPayment * (Math.pow(1 + lateFeeRate / 100, effectiveDaysOverdue) - 1);
                    break;
                  default:
                    lateFee = (principalPerPayment * lateFeeRate / 100) * effectiveDaysOverdue;
                }
                
                // Aplicar límite máximo de mora si está configurado
                if (loanData.max_late_fee && loanData.max_late_fee > 0) {
                  lateFee = Math.min(lateFee, loanData.max_late_fee);
                }
                
                // Restar la mora ya pagada de esta cuota
                const remainingLateFee = Math.max(0, lateFee - installment.late_fee_paid);
                totalCurrentLateFee += remainingLateFee;
                
                console.log(`🔍 Cuota ${installment.installment_number}: ${effectiveDaysOverdue} días vencida, mora calculada: RD$${lateFee.toFixed(2)}, mora ya pagada: RD$${installment.late_fee_paid}, mora pendiente: RD$${remainingLateFee.toFixed(2)}`);
              } else {
                console.log(`🔍 Cuota ${installment.installment_number}: Vencida pero dentro del período de gracia (${gracePeriod} días)`);
              }
            } else if (installment.is_paid) {
              console.log(`🔍 Cuota ${installment.installment_number}: Ya pagada - no se calcula mora`);
            } else {
              console.log(`🔍 Cuota ${installment.installment_number}: No vencida aún`);
            }
          });

          totalCurrentLateFee = Math.round(totalCurrentLateFee * 100) / 100;
          
          console.log('🔍 AccountStatement: Total mora actual calculado:', totalCurrentLateFee);

          // Usar el total de mora actual calculado desde las cuotas reales
          setCurrentLateFee(totalCurrentLateFee);
          console.log('🔍 AccountStatement: currentLateFee establecido a:', totalCurrentLateFee);
        } catch (lateFeeError) {
          console.error('🔍 AccountStatement: Error calculating late fee:', lateFeeError);
          setCurrentLateFee(0);
        }
      } else {
        console.log('🔍 AccountStatement: No se puede calcular mora - loanData:', !!loanData, 'installmentsData:', !!installmentsData);
      }

    } catch (error) {
      console.error('Error fetching account data:', error);
      toast.error('Error al cargar el estado de cuenta');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '-';
    try {
      return new Date(dateString).toLocaleDateString('es-DO', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch (error) {
      return '-';
    }
  };

  const formatDateTime = (dateString: string) => {
    if (!dateString) return '-';
    try {
      const date = new Date(dateString);
      return date.toLocaleString('es-DO', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      return '-';
    }
  };

  const calculateAmortizationSchedule = async (loanData: any, installmentsData: any[]) => {
    if (!loanData || !installmentsData) return [];

    console.log('🔍 AccountStatement: Calculando tabla de amortización interactiva...');
    console.log('🔍 AccountStatement: Datos de cuotas:', installmentsData);

    const schedule = [];
    const numberOfPayments = loanData.term_months;
    const principal = loanData.amount;
    
    // Modelo de préstamo con capital e interés fijos
    const monthlyPayment = loanData.monthly_payment;
    const fixedPrincipal = principal / numberOfPayments;
    const fixedInterest = monthlyPayment - fixedPrincipal;

    const startDate = new Date(loanData.start_date);

    // Crear un mapa de cuotas para acceso rápido
    const installmentsMap = new Map();
    installmentsData.forEach(installment => {
      installmentsMap.set(installment.installment_number, installment);
    });

    // Obtener todos los pagos del préstamo para calcular saldos pendientes
    const { data: payments, error } = await supabase
      .from('payments')
      .select('principal_amount, interest_amount, payment_date')
      .eq('loan_id', loanData.id)
      .order('payment_date', { ascending: true });

    if (error) {
      console.error('Error obteniendo pagos:', error);
    }

    // Calcular el capital total pagado para determinar el balance general
    const totalPrincipalPaid = payments?.reduce((sum, payment) => sum + (payment.principal_amount || 0), 0) || 0;

    console.log('🔍 AccountStatement: Mapa de cuotas creado:', installmentsMap);
    console.log('🔍 AccountStatement: Pagos encontrados:', payments);
    console.log('🔍 AccountStatement: Capital total pagado:', totalPrincipalPaid);

    for (let i = 1; i <= numberOfPayments; i++) {
      // Usar capital e interés fijos como base
      const originalPrincipal = fixedPrincipal;
      const originalInterest = fixedInterest;

      // Calcular fecha de vencimiento
      const dueDate = new Date(startDate);
      dueDate.setMonth(dueDate.getMonth() + i);

      // Obtener datos reales de la cuota si existe
      const realInstallment = installmentsMap.get(i);
      const isPaid = realInstallment ? realInstallment.is_paid : false;
      const paidDate = realInstallment ? realInstallment.paid_date : null;

      // Calcular cuánto se ha pagado de esta cuota específica
      // Aplicar pagos en orden secuencial, considerando pagos parciales
      let principalPaidForThisInstallment = 0;
      let interestPaidForThisInstallment = 0;
      
      if (payments) {
        let remainingPrincipalToAllocate = totalPrincipalPaid;
        let remainingInterestToAllocate = payments.reduce((sum, payment) => sum + (payment.interest_amount || 0), 0);
        
        // Aplicar pagos a las cuotas en orden secuencial
        for (let j = 1; j <= i; j++) {
          if (j === i) {
            // Esta es la cuota actual
            if (remainingPrincipalToAllocate > 0 || remainingInterestToAllocate > 0) {
              // Calcular cuánto se puede asignar a esta cuota
              const principalNeeded = originalPrincipal;
              const interestNeeded = originalInterest;
              
              // Asignar capital disponible
              const principalToAssign = Math.min(remainingPrincipalToAllocate, principalNeeded);
              principalPaidForThisInstallment = principalToAssign;
              remainingPrincipalToAllocate -= principalToAssign;
              
              // Asignar interés disponible
              const interestToAssign = Math.min(remainingInterestToAllocate, interestNeeded);
              interestPaidForThisInstallment = interestToAssign;
              remainingInterestToAllocate -= interestToAssign;
            }
          } else {
            // Cuotas anteriores - restar lo que se les asignó
            const principalForPreviousCuota = Math.min(remainingPrincipalToAllocate, originalPrincipal);
            const interestForPreviousCuota = Math.min(remainingInterestToAllocate, originalInterest);
            
            remainingPrincipalToAllocate -= principalForPreviousCuota;
            remainingInterestToAllocate -= interestForPreviousCuota;
          }
        }
      }

      // Calcular saldos pendientes
      const remainingPrincipal = Math.max(0, originalPrincipal - principalPaidForThisInstallment);
      const remainingInterest = Math.max(0, originalInterest - interestPaidForThisInstallment);
      const remainingPayment = remainingPrincipal + remainingInterest;

      // Determinar estado de la cuota
      let paymentStatus = 'pending';
      const totalPaidForThisInstallment = principalPaidForThisInstallment + interestPaidForThisInstallment;
      
      // Una cuota está pagada si se ha pagado al menos el monto total de la cuota
      if (totalPaidForThisInstallment >= monthlyPayment) {
        paymentStatus = 'paid';
      } else if (totalPaidForThisInstallment > 0) {
        paymentStatus = 'partial';
      }

      // Calcular el balance pendiente del préstamo después de esta cuota
      // El balance pendiente es el capital total menos el capital pagado hasta esta cuota
      const capitalPaidUpToThisInstallment = Math.min(totalPrincipalPaid, i * originalPrincipal);
      const remainingBalanceAfterThisInstallment = Math.max(0, principal - capitalPaidUpToThisInstallment);

      console.log(`🔍 Cuota ${i}:`, {
        exists: !!realInstallment,
        isPaid,
        paidDate,
        dueDate: dueDate.toISOString().split('T')[0],
        originalPrincipal,
        originalInterest,
        principalPaidForThisInstallment,
        interestPaidForThisInstallment,
        totalPaidForThisInstallment,
        monthlyPayment,
        remainingPrincipal,
        remainingInterest,
        remainingPayment,
        paymentStatus,
        capitalPaidUpToThisInstallment,
        remainingBalanceAfterThisInstallment
      });

      schedule.push({
        installment: i,
        dueDate: dueDate.toISOString().split('T')[0],
        monthlyPayment: monthlyPayment,
        principalPayment: originalPrincipal,
        interestPayment: originalInterest,
        principalPaid: principalPaidForThisInstallment,
        interestPaid: interestPaidForThisInstallment,
        remainingPrincipal: remainingPrincipal,
        remainingInterest: remainingInterest,
        remainingPayment: remainingPayment,
        remainingBalance: remainingBalanceAfterThisInstallment,
        isPaid: paymentStatus === 'paid',
        isPartial: paymentStatus === 'partial',
        paidDate: paidDate,
        hasRealData: !!realInstallment,
        paymentStatus
      });
    }

    console.log('🔍 AccountStatement: Tabla de amortización generada:', schedule);
    return schedule;
  };

  const formatCurrency = (amount: number) => {
    return `RD$${amount.toLocaleString()}`;
  };

  const getPaymentMethodLabel = (method: string) => {
    const methods = {
      cash: 'Efectivo',
      bank_transfer: 'Transferencia',
      check: 'Cheque',
      card: 'Tarjeta',
      online: 'En línea'
    };
    return methods[method as keyof typeof methods] || method;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <Badge variant="secondary" className="bg-green-100 text-green-800">
            <CheckCircle className="h-3 w-3 mr-1" />
            Completado
          </Badge>
        );
      case 'pending':
        return (
          <Badge variant="outline">
            <Clock className="h-3 w-3 mr-1" />
            Pendiente
          </Badge>
        );
      case 'failed':
        return (
          <Badge variant="destructive">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Fallido
          </Badge>
        );
      default:
        return (
          <Badge variant="outline">
            {status}
          </Badge>
        );
    }
  };

  const calculateTotals = () => {
    const totalPaid = payments.reduce((sum, payment) => sum + payment.amount, 0);
    const totalPrincipal = payments.reduce((sum, payment) => sum + payment.principal_amount, 0);
    const totalInterest = payments.reduce((sum, payment) => sum + payment.interest_amount, 0);
    const totalLateFee = payments.reduce((sum, payment) => sum + payment.late_fee, 0);
    
    return {
      totalPaid,
      totalPrincipal,
      totalInterest,
      totalLateFee
    };
  };

  const handleViewReceipt = (payment: Payment) => {
    setSelectedPayment(payment);
    setShowReceiptModal(true);
  };

  const printReceipt = (payment: Payment) => {
    if (!loan || !payment) return;

    const printWindow = window.open('', '_blank');
    
    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Recibo de Pago - ${loan.clients.full_name}</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 20px; }
              .header { text-align: center; margin-bottom: 30px; }
              .header h1 { color: #2563eb; margin: 0; }
              .header h2 { color: #666; margin: 5px 0; }
              .info { margin-bottom: 20px; }
              .info table { width: 100%; border-collapse: collapse; }
              .info td { padding: 5px; border-bottom: 1px solid #eee; }
              .info td:first-child { font-weight: bold; width: 30%; }
              .payment-details { background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0; }
              .payment-details h3 { margin-top: 0; color: #2563eb; }
              .payment-details table { width: 100%; }
              .payment-details td { padding: 5px; }
              .payment-details .total { font-weight: bold; font-size: 1.1em; }
              .footer { margin-top: 30px; text-align: center; color: #666; font-size: 0.9em; }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>RECIBO DE PAGO</h1>
              <h2>${loan.clients.full_name}</h2>
              <p>Fecha de emisión: ${formatDate(statementDate)}</p>
            </div>

            <div class="info">
              <table>
                <tr><td>Cliente:</td><td>${loan.clients.full_name}</td></tr>
                <tr><td>Cédula:</td><td>${loan.clients.dni}</td></tr>
                <tr><td>Fecha de Pago:</td><td>${formatDateTime(payment.created_at)}</td></tr>
                <tr><td>Método de Pago:</td><td>${getPaymentMethodLabel(payment.payment_method)}</td></tr>
                ${payment.reference_number ? `<tr><td>Referencia:</td><td>${payment.reference_number}</td></tr>` : ''}
              </table>
            </div>

            <div class="payment-details">
              <h3>Detalle del Pago</h3>
              <table>
                <tr><td>Monto Total:</td><td class="total">${formatCurrency(payment.amount)}</td></tr>
                <tr><td>A Principal:</td><td>${formatCurrency(payment.principal_amount)}</td></tr>
                <tr><td>A Intereses:</td><td>${formatCurrency(payment.interest_amount)}</td></tr>
                <tr><td>Mora:</td><td>${formatCurrency(payment.late_fee)}</td></tr>
                <tr><td>Estado:</td><td>${payment.status}</td></tr>
              </table>
            </div>

            ${payment.notes ? `
              <div class="payment-details">
                <h3>Notas</h3>
                <p>${payment.notes}</p>
              </div>
            ` : ''}

            <div class="footer">
              <p>Este recibo fue generado automáticamente el ${formatDate(statementDate)}</p>
              <p>Sistema de Gestión de Préstamos</p>
            </div>
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.print();
    }
  };

  const exportToPDF = () => {
    if (!loan) return;

    const totals = calculateTotals();
    const printWindow = window.open('', '_blank');
    
    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Estado de Cuenta - ${loan.clients.full_name}</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 20px; font-size: 12px; }
              .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #2563eb; padding-bottom: 15px; }
              .header h1 { color: #2563eb; margin: 0; font-size: 24px; }
              .header h2 { color: #666; margin: 5px 0; font-size: 18px; }
              .header p { color: #888; margin: 5px 0; }
              
              .section { margin-bottom: 25px; page-break-inside: avoid; }
              .section h3 { color: #2563eb; margin-bottom: 10px; font-size: 16px; border-bottom: 1px solid #ddd; padding-bottom: 5px; }
              
              .info-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
              .info-table td { padding: 8px; border-bottom: 1px solid #eee; }
              .info-table td:first-child { font-weight: bold; width: 30%; background-color: #f8f9fa; }
              
              .summary-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px; margin-bottom: 20px; }
              .summary-card { background: #f8f9fa; padding: 15px; border-radius: 5px; text-align: center; }
              .summary-card .amount { font-size: 18px; font-weight: bold; margin-bottom: 5px; }
              .summary-card .label { font-size: 12px; color: #666; }
              .summary-card.total-paid .amount { color: #2563eb; }
              .summary-card.principal .amount { color: #059669; }
              .summary-card.interest .amount { color: #ea580c; }
              .summary-card.late-fee-paid .amount { color: #dc2626; }
              .summary-card.current-late-fee .amount { color: #d97706; }
              .summary-card.payment-count .amount { color: #7c3aed; }
              
              .table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11px; }
              .table th, .table td { padding: 6px; text-align: left; border: 1px solid #ddd; }
              .table th { background-color: #f8f9fa; font-weight: bold; }
              .table tr:nth-child(even) { background-color: #f9f9f9; }
              
              .status-badge { padding: 2px 6px; border-radius: 3px; font-size: 10px; font-weight: bold; }
              .status-paid { background-color: #dcfce7; color: #166534; }
              .status-partial { background-color: #fed7aa; color: #c2410c; }
              .status-pending { background-color: #fef3c7; color: #92400e; }
              .status-failed { background-color: #fee2e2; color: #991b1b; }
              
              .footer { margin-top: 30px; text-align: center; color: #666; font-size: 10px; border-top: 1px solid #ddd; padding-top: 15px; }
              
              @media print {
                body { margin: 10px; }
                .section { page-break-inside: avoid; }
              }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>ESTADO DE CUENTA</h1>
              <h2>${loan.clients.full_name}</h2>
              <p>Cédula: ${loan.clients.dni} | Fecha de emisión: ${formatDate(statementDate)}</p>
            </div>

            <div class="section">
              <h3>Información del Préstamo</h3>
              <table class="info-table">
                <tr><td>Cliente:</td><td>${loan.clients.full_name}</td></tr>
                <tr><td>Cédula:</td><td>${loan.clients.dni}</td></tr>
                <tr><td>Monto Original:</td><td>${formatCurrency(loan.amount)}</td></tr>
                <tr><td>Balance Restante:</td><td>${formatCurrency(loan.remaining_balance)}</td></tr>
                <tr><td>Cuota Mensual:</td><td>${formatCurrency(loan.monthly_payment)}</td></tr>
                <tr><td>Tasa de Interés:</td><td>${loan.interest_rate}%</td></tr>
                <tr><td>Fecha de Inicio:</td><td>${formatDate(loan.start_date)}</td></tr>
                <tr><td>Próximo Pago:</td><td>${formatDate(loan.next_payment_date)}</td></tr>
                <tr><td>Estado:</td><td>${loan.status}</td></tr>
              </table>
            </div>

            <div class="section">
              <h3>Resumen de Pagos</h3>
              <div class="summary-grid">
                <div class="summary-card total-paid">
                  <div class="amount">${formatCurrency(totals.totalPaid)}</div>
                  <div class="label">Total Pagado</div>
                </div>
                <div class="summary-card principal">
                  <div class="amount">${formatCurrency(totals.totalPrincipal)}</div>
                  <div class="label">A Principal</div>
                </div>
                <div class="summary-card interest">
                  <div class="amount">${formatCurrency(totals.totalInterest)}</div>
                  <div class="label">A Intereses</div>
                </div>
                <div class="summary-card late-fee-paid">
                  <div class="amount">${formatCurrency(totals.totalLateFee)}</div>
                  <div class="label">Mora Pagada</div>
                </div>
                <div class="summary-card current-late-fee">
                  <div class="amount">${formatCurrency(currentLateFee)}</div>
                  <div class="label">Mora Actual</div>
                </div>
                <div class="summary-card payment-count">
                  <div class="amount">${payments.length}</div>
                  <div class="label">Número de Pagos</div>
                </div>
              </div>
            </div>

            <div class="section">
              <h3>Tabla de Amortización</h3>
              <table class="table">
                <thead>
                  <tr>
                    <th>Cuota</th>
                    <th>Fecha Vencimiento</th>
                    <th>Cuota Mensual</th>
                    <th>Capital</th>
                    <th>Interés</th>
                    <th>Balance Pendiente</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  ${amortizationSchedule.map(installment => `
                    <tr style="${installment.isPaid ? 'background-color: #f0fdf4;' : installment.isPartial ? 'background-color: #fef3c7;' : ''}">
                      <td style="padding: 6px; text-align: left; border: 1px solid #ddd; font-weight: bold;">
                        ${installment.installment}
                        ${installment.isPaid ? ' ✅' : installment.isPartial ? ' ⚠️' : ''}
                      </td>
                      <td style="padding: 6px; text-align: left; border: 1px solid #ddd;">${formatDate(installment.dueDate)}</td>
                      <td style="padding: 6px; text-align: left; border: 1px solid #ddd;">
                        <div style="${installment.isPaid ? 'color: #16a34a; text-decoration: line-through;' : installment.isPartial ? 'color: #ea580c;' : 'color: #2563eb; font-weight: bold;'}">
                          ${formatCurrency(installment.monthlyPayment)}
                        </div>
                        ${installment.isPaid && installment.paidDate ? `
                          <div style="font-size: 10px; color: #16a34a; margin-top: 2px;">
                            Pagado: ${formatDate(installment.paidDate)}
                          </div>
                        ` : ''}
                        ${installment.isPartial && installment.remainingPayment > 0 ? `
                          <div style="font-size: 10px; color: #ea580c; margin-top: 2px;">
                            Falta: ${formatCurrency(installment.remainingPayment)}
                          </div>
                        ` : ''}
                      </td>
                      <td style="padding: 6px; text-align: left; border: 1px solid #ddd; ${installment.isPaid ? 'color: #16a34a; text-decoration: line-through;' : installment.isPartial ? 'color: #ea580c;' : ''}">
                        ${formatCurrency(installment.principalPayment)}
                        ${installment.isPartial && installment.remainingPrincipal > 0 ? `
                          <div style="font-size: 10px; color: #ea580c; margin-top: 2px;">
                            Falta: ${formatCurrency(installment.remainingPrincipal)}
                          </div>
                        ` : ''}
                      </td>
                      <td style="padding: 6px; text-align: left; border: 1px solid #ddd; ${installment.isPaid ? 'color: #16a34a; text-decoration: line-through;' : installment.isPartial ? 'color: #ea580c;' : ''}">
                        ${formatCurrency(installment.interestPayment)}
                        ${installment.isPartial && installment.remainingInterest > 0 ? `
                          <div style="font-size: 10px; color: #ea580c; margin-top: 2px;">
                            Falta: ${formatCurrency(installment.remainingInterest)}
                          </div>
                        ` : ''}
                      </td>
                      <td style="padding: 6px; text-align: left; border: 1px solid #ddd; ${installment.isPaid ? 'color: #16a34a; text-decoration: line-through;' : ''}">
                        ${formatCurrency(installment.remainingBalance)}
                      </td>
                      <td style="padding: 6px; text-align: left; border: 1px solid #ddd;">
                        <span class="status-badge ${installment.isPaid ? 'status-paid' : installment.isPartial ? 'status-partial' : 'status-pending'}">
                          ${installment.isPaid ? 'Pagado' : installment.isPartial ? 'Parcial' : 'Pendiente'}
                        </span>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>

            <div class="section">
              <h3>Historial de Pagos</h3>
              ${payments.length > 0 ? `
                <table class="table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Monto</th>
                    <th>Principal</th>
                    <th>Interés</th>
                    <th>Mora</th>
                    <th>Método</th>
                    <th>Estado</th>
                      <th>Referencia</th>
                  </tr>
                </thead>
                <tbody>
                  ${payments.map(payment => `
                    <tr>
                      <td>${formatDateTime(payment.created_at)}</td>
                      <td>${formatCurrency(payment.amount)}</td>
                      <td>${formatCurrency(payment.principal_amount)}</td>
                      <td>${formatCurrency(payment.interest_amount)}</td>
                      <td>${formatCurrency(payment.late_fee)}</td>
                      <td>${getPaymentMethodLabel(payment.payment_method)}</td>
                        <td>
                          <span class="status-badge status-${payment.status}">
                            ${payment.status === 'completed' ? 'Completado' : 
                              payment.status === 'pending' ? 'Pendiente' : 
                              payment.status === 'failed' ? 'Fallido' : payment.status}
                          </span>
                        </td>
                        <td>${payment.reference_number || '-'}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
              ` : `
                <p style="text-align: center; color: #666; font-style: italic; padding: 20px;">
                  No se han registrado pagos para este préstamo
                </p>
              `}
            </div>

            <div class="footer">
              <p><strong>ESTADO DE CUENTA GENERADO AUTOMÁTICAMENTE</strong></p>
              <p>Fecha de emisión: ${formatDate(statementDate)} | Sistema de Gestión de Préstamos</p>
              <p>Este documento es válido únicamente en la fecha de emisión</p>
            </div>
          </body>
        </html>
      `);
      printWindow.document.close();
      
      // Esperar a que el contenido se cargue antes de imprimir
      setTimeout(() => {
      printWindow.print();
      }, 500);
    }
  };

  const printStatement = () => {
    if (!loan) return;

    const totals = calculateTotals();
    
    // Crear un elemento temporal para el contenido de impresión
    const printContent = document.createElement('div');
    printContent.style.position = 'absolute';
    printContent.style.left = '-9999px';
    printContent.style.top = '-9999px';
    printContent.innerHTML = `
      <div style="font-family: Arial, sans-serif; margin: 20px; font-size: 12px;">
        <div style="text-align: center; margin-bottom: 30px; border-bottom: 2px solid #2563eb; padding-bottom: 15px;">
          <h1 style="color: #2563eb; margin: 0; font-size: 24px;">ESTADO DE CUENTA</h1>
          <h2 style="color: #666; margin: 5px 0; font-size: 18px;">${loan.clients.full_name}</h2>
          <p style="color: #888; margin: 5px 0;">Cédula: ${loan.clients.dni} | Fecha de emisión: ${formatDate(statementDate)}</p>
        </div>

        <div style="margin-bottom: 25px;">
          <h3 style="color: #2563eb; margin-bottom: 10px; font-size: 16px; border-bottom: 1px solid #ddd; padding-bottom: 5px;">Información del Préstamo</h3>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold; width: 30%; background-color: #f8f9fa;">Cliente:</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${loan.clients.full_name}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold; background-color: #f8f9fa;">Cédula:</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${loan.clients.dni}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold; background-color: #f8f9fa;">Monto Original:</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${formatCurrency(loan.amount)}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold; background-color: #f8f9fa;">Balance Restante:</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${formatCurrency(loan.remaining_balance)}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold; background-color: #f8f9fa;">Cuota Mensual:</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${formatCurrency(loan.monthly_payment)}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold; background-color: #f8f9fa;">Tasa de Interés:</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${loan.interest_rate}%</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold; background-color: #f8f9fa;">Fecha de Inicio:</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${formatDate(loan.start_date)}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold; background-color: #f8f9fa;">Próximo Pago:</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${formatDate(loan.next_payment_date)}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold; background-color: #f8f9fa;">Estado:</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${loan.status}</td></tr>
          </table>
        </div>

        <div style="margin-bottom: 25px;">
          <h3 style="color: #2563eb; margin-bottom: 10px; font-size: 16px; border-bottom: 1px solid #ddd; padding-bottom: 5px;">Resumen de Pagos</h3>
          <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px; margin-bottom: 20px;">
            <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; text-align: center;">
              <div style="font-size: 18px; font-weight: bold; margin-bottom: 5px; color: #2563eb;">${formatCurrency(totals.totalPaid)}</div>
              <div style="font-size: 12px; color: #666;">Total Pagado</div>
            </div>
            <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; text-align: center;">
              <div style="font-size: 18px; font-weight: bold; margin-bottom: 5px; color: #059669;">${formatCurrency(totals.totalPrincipal)}</div>
              <div style="font-size: 12px; color: #666;">A Principal</div>
            </div>
            <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; text-align: center;">
              <div style="font-size: 18px; font-weight: bold; margin-bottom: 5px; color: #ea580c;">${formatCurrency(totals.totalInterest)}</div>
              <div style="font-size: 12px; color: #666;">A Intereses</div>
            </div>
            <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; text-align: center;">
              <div style="font-size: 18px; font-weight: bold; margin-bottom: 5px; color: #dc2626;">${formatCurrency(totals.totalLateFee)}</div>
              <div style="font-size: 12px; color: #666;">Mora Pagada</div>
            </div>
            <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; text-align: center;">
              <div style="font-size: 18px; font-weight: bold; margin-bottom: 5px; color: #d97706;">${formatCurrency(currentLateFee)}</div>
              <div style="font-size: 12px; color: #666;">Mora Actual</div>
            </div>
            <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; text-align: center;">
              <div style="font-size: 18px; font-weight: bold; margin-bottom: 5px; color: #7c3aed;">${payments.length}</div>
              <div style="font-size: 12px; color: #666;">Número de Pagos</div>
            </div>
          </div>
        </div>

        <div style="margin-bottom: 25px;">
          <h3 style="color: #2563eb; margin-bottom: 10px; font-size: 16px; border-bottom: 1px solid #ddd; padding-bottom: 5px;">Historial de Pagos</h3>
          ${payments.length > 0 ? `
            <table style="width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11px;">
              <thead>
                <tr>
                  <th style="padding: 6px; text-align: left; border: 1px solid #ddd; background-color: #f8f9fa; font-weight: bold;">Fecha</th>
                  <th style="padding: 6px; text-align: left; border: 1px solid #ddd; background-color: #f8f9fa; font-weight: bold;">Monto</th>
                  <th style="padding: 6px; text-align: left; border: 1px solid #ddd; background-color: #f8f9fa; font-weight: bold;">Principal</th>
                  <th style="padding: 6px; text-align: left; border: 1px solid #ddd; background-color: #f8f9fa; font-weight: bold;">Interés</th>
                  <th style="padding: 6px; text-align: left; border: 1px solid #ddd; background-color: #f8f9fa; font-weight: bold;">Mora</th>
                  <th style="padding: 6px; text-align: left; border: 1px solid #ddd; background-color: #f8f9fa; font-weight: bold;">Método</th>
                  <th style="padding: 6px; text-align: left; border: 1px solid #ddd; background-color: #f8f9fa; font-weight: bold;">Estado</th>
                </tr>
              </thead>
              <tbody>
                ${payments.map(payment => `
                  <tr style="background-color: #f9f9f9;">
                    <td style="padding: 6px; text-align: left; border: 1px solid #ddd;">${formatDateTime(payment.created_at)}</td>
                    <td style="padding: 6px; text-align: left; border: 1px solid #ddd;">${formatCurrency(payment.amount)}</td>
                    <td style="padding: 6px; text-align: left; border: 1px solid #ddd;">${formatCurrency(payment.principal_amount)}</td>
                    <td style="padding: 6px; text-align: left; border: 1px solid #ddd;">${formatCurrency(payment.interest_amount)}</td>
                    <td style="padding: 6px; text-align: left; border: 1px solid #ddd;">${formatCurrency(payment.late_fee)}</td>
                    <td style="padding: 6px; text-align: left; border: 1px solid #ddd;">${getPaymentMethodLabel(payment.payment_method)}</td>
                    <td style="padding: 6px; text-align: left; border: 1px solid #ddd;">${payment.status}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          ` : `
            <p style="text-align: center; color: #666; font-style: italic; padding: 20px;">
              No se han registrado pagos para este préstamo
            </p>
          `}
        </div>

        <div style="margin-top: 30px; text-align: center; color: #666; font-size: 10px; border-top: 1px solid #ddd; padding-top: 15px;">
          <p><strong>ESTADO DE CUENTA GENERADO AUTOMÁTICAMENTE</strong></p>
          <p>Fecha de emisión: ${formatDate(statementDate)} | Sistema de Gestión de Préstamos</p>
          <p>Este documento es válido únicamente en la fecha de emisión</p>
        </div>
      </div>
    `;

    document.body.appendChild(printContent);
    
    // Imprimir
    window.print();
    
    // Limpiar
    document.body.removeChild(printContent);
  };

  const totals = calculateTotals();

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Estado de Cuenta
              {loan && (
                <span className="text-sm font-normal text-gray-600">
                  - {loan.clients.full_name}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={fetchAccountData}
                disabled={loading}
                className="flex items-center gap-2"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Actualizar
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={printStatement}
                className="flex items-center gap-2"
              >
                <Printer className="h-4 w-4" />
                Imprimir
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={exportToPDF}
                className="flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                Exportar PDF
              </Button>
            </div>
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
              <p className="text-gray-600">Cargando estado de cuenta...</p>
            </div>
          </div>
        ) : !loan ? (
          <div className="flex items-center justify-center py-8">
            <div className="text-center">
              <FileText className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <p className="text-gray-600">No se encontró información del préstamo</p>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Información del préstamo */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Información del Préstamo</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Cliente:</span>
                    <div className="font-semibold">{loan.clients.full_name}</div>
                  </div>
                  <div>
                    <span className="text-gray-600">Cédula:</span>
                    <div className="font-semibold">{loan.clients.dni}</div>
                  </div>
                  <div>
                    <span className="text-gray-600">Monto Original:</span>
                    <div className="font-semibold">{formatCurrency(loan.amount)}</div>
                  </div>
                  <div>
                    <span className="text-gray-600">Balance Restante:</span>
                    <div className="font-semibold">{formatCurrency(loan.remaining_balance)}</div>
                  </div>
                  <div>
                    <span className="text-gray-600">Cuota Mensual:</span>
                    <div className="font-semibold">{formatCurrency(loan.monthly_payment)}</div>
                  </div>
                  <div>
                    <span className="text-gray-600">Tasa de Interés:</span>
                    <div className="font-semibold">{loan.interest_rate}%</div>
                  </div>
                  <div>
                    <span className="text-gray-600">Fecha de Inicio:</span>
                    <div className="font-semibold">{formatDate(loan.start_date)}</div>
                  </div>
                  <div>
                    <span className="text-gray-600">Próximo Pago:</span>
                    <div className="font-semibold">{formatDate(loan.next_payment_date)}</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Resumen de pagos */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Resumen de Pagos</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                  <div className="text-center p-3 bg-blue-50 rounded-lg">
                    <div className="text-2xl font-bold text-blue-600">{formatCurrency(totals.totalPaid)}</div>
                    <div className="text-sm text-gray-600">Total Pagado</div>
                  </div>
                  <div className="text-center p-3 bg-green-50 rounded-lg">
                    <div className="text-2xl font-bold text-green-600">{formatCurrency(totals.totalPrincipal)}</div>
                    <div className="text-sm text-gray-600">A Principal</div>
                  </div>
                  <div className="text-center p-3 bg-orange-50 rounded-lg">
                    <div className="text-2xl font-bold text-orange-600">{formatCurrency(totals.totalInterest)}</div>
                    <div className="text-sm text-gray-600">A Intereses</div>
                  </div>
                  <div className="text-center p-3 bg-red-50 rounded-lg">
                    <div className="text-2xl font-bold text-red-600">{formatCurrency(totals.totalLateFee)}</div>
                    <div className="text-sm text-gray-600">Mora Pagada</div>
                  </div>
                <div className="text-center p-3 bg-yellow-50 rounded-lg">
                  <div className="text-2xl font-bold text-yellow-600">{formatCurrency(currentLateFee)}</div>
                  <div className="text-sm text-gray-600">Mora Actual</div>
                </div>
                  <div className="text-center p-3 bg-purple-50 rounded-lg">
                    <div className="text-2xl font-bold text-purple-600">{payments.length}</div>
                    <div className="text-sm text-gray-600">Número de Pagos</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Tabla de Amortización */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Tabla de Amortización</CardTitle>
                <div className="flex flex-col sm:flex-row gap-4 mt-4">
                  {/* Filtro de período */}
                  <div className="flex gap-2">
                    <Select value={amortizationPeriod} onValueChange={setAmortizationPeriod}>
                      <SelectTrigger className="w-[160px]">
                        <SelectValue placeholder="Período" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Toda la Tabla</SelectItem>
                        <SelectItem value="2">Próximos 2 Meses</SelectItem>
                        <SelectItem value="3">Próximos 3 Meses</SelectItem>
                        <SelectItem value="6">Próximos 6 Meses</SelectItem>
                        <SelectItem value="12">Próximos 12 Meses</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="mt-2 text-sm text-gray-600 bg-blue-50 p-3 rounded-lg border border-blue-200">
                  💡 <strong>Tabla Interactiva:</strong> Las cuotas pagadas se marcan en verde y mantienen su numeración original. 
                  Al pagar una cuota, se actualiza automáticamente el estado sin cambiar las fechas de vencimiento.
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b bg-gray-50">
                        <th className="text-left p-3 font-semibold">Cuota</th>
                        <th className="text-left p-3 font-semibold">Fecha Vencimiento</th>
                        <th className="text-left p-3 font-semibold">Cuota Mensual</th>
                        <th className="text-left p-3 font-semibold">Capital</th>
                        <th className="text-left p-3 font-semibold">Interés</th>
                        <th className="text-left p-3 font-semibold">Balance Pendiente</th>
                        <th className="text-left p-3 font-semibold">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {amortizationSchedule
                        .filter((_, index) => {
                          if (amortizationPeriod === 'all') return true;
                          const limit = parseInt(amortizationPeriod);
                          return index < limit;
                        })
                        .map((installment) => (
                          <tr key={installment.installment} className={`border-b hover:bg-gray-50 ${installment.isPaid ? 'bg-green-50' : ''}`}>
                            <td className="p-3">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{installment.installment}</span>
                                {installment.isPaid && (
                                  <CheckCircle className="h-4 w-4 text-green-600" />
                                )}
                              </div>
                            </td>
                            <td className="p-3">{formatDate(installment.dueDate)}</td>
                            <td className="p-3">
                              <div className={`font-semibold ${installment.isPaid ? 'text-green-600 line-through' : installment.isPartial ? 'text-orange-600' : 'text-blue-600'}`}>
                              {formatCurrency(installment.monthlyPayment)}
                              </div>
                              {installment.isPaid && installment.paidDate && (
                                <div className="text-xs text-green-600 mt-1">
                                  Pagado: {formatDate(installment.paidDate)}
                                </div>
                              )}
                              {installment.isPartial && installment.remainingPayment > 0 && (
                                <div className="text-xs text-orange-600 mt-1">
                                  Falta: {formatCurrency(installment.remainingPayment)}
                                </div>
                              )}
                            </td>
                            <td className="p-3">
                              <div className={installment.isPaid ? 'text-green-600 line-through' : installment.isPartial ? 'text-orange-600' : ''}>
                                {formatCurrency(installment.principalPayment)}
                              </div>
                              {installment.isPartial && installment.remainingPrincipal > 0 && (
                                <div className="text-xs text-orange-600 mt-1">
                                  Falta: {formatCurrency(installment.remainingPrincipal)}
                                </div>
                              )}
                            </td>
                            <td className="p-3">
                              <div className={installment.isPaid ? 'text-green-600 line-through' : installment.isPartial ? 'text-orange-600' : ''}>
                                {formatCurrency(installment.interestPayment)}
                              </div>
                              {installment.isPartial && installment.remainingInterest > 0 && (
                                <div className="text-xs text-orange-600 mt-1">
                                  Falta: {formatCurrency(installment.remainingInterest)}
                                </div>
                              )}
                            </td>
                            <td className="p-3">
                              <div className={installment.isPaid ? 'text-green-600 line-through' : ''}>
                                {formatCurrency(installment.remainingBalance)}
                              </div>
                            </td>
                            <td className="p-3">
                              {installment.isPaid ? (
                                <Badge variant="secondary" className="bg-green-100 text-green-800 border-green-200">
                                  <CheckCircle className="h-3 w-3 mr-1" />
                                  Pagado
                                </Badge>
                              ) : installment.isPartial ? (
                                <Badge variant="outline" className="border-orange-200 text-orange-800 bg-orange-50">
                                  <Clock className="h-3 w-3 mr-1" />
                                  Parcial
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="border-orange-200 text-orange-800">
                                  <Clock className="h-3 w-3 mr-1" />
                                  Pendiente
                                </Badge>
                              )}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                  
                  {amortizationSchedule.length === 0 && (
                    <div className="text-center py-8">
                      <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                      <p className="text-gray-600">No hay datos de amortización disponibles</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Historial de pagos */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Historial de Pagos</CardTitle>
                <div className="flex flex-col sm:flex-row gap-4 mt-4">
                  {/* Búsqueda */}
                  <div className="flex-1">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                      <Input
                        placeholder="Buscar por referencia, notas o método..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>
                  
                  {/* Filtros */}
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="w-full sm:w-[140px]">
                        <SelectValue placeholder="Estado" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos los Estados</SelectItem>
                        <SelectItem value="completed">Completado</SelectItem>
                        <SelectItem value="pending">Pendiente</SelectItem>
                        <SelectItem value="failed">Fallido</SelectItem>
                      </SelectContent>
                    </Select>

                    <Select value={methodFilter} onValueChange={setMethodFilter}>
                      <SelectTrigger className="w-full sm:w-[140px]">
                        <SelectValue placeholder="Método" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos los Métodos</SelectItem>
                        <SelectItem value="cash">Efectivo</SelectItem>
                        <SelectItem value="bank_transfer">Transferencia</SelectItem>
                        <SelectItem value="check">Cheque</SelectItem>
                        <SelectItem value="card">Tarjeta</SelectItem>
                        <SelectItem value="online">En línea</SelectItem>
                      </SelectContent>
                    </Select>

                    <Select value={dateFilter} onValueChange={setDateFilter}>
                      <SelectTrigger className="w-full sm:w-[140px]">
                        <SelectValue placeholder="Fecha" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas las Fechas</SelectItem>
                        <SelectItem value="today">Hoy</SelectItem>
                        <SelectItem value="week">Última Semana</SelectItem>
                        <SelectItem value="month">Último Mes</SelectItem>
                        <SelectItem value="year">Último Año</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {filteredPayments.length === 0 ? (
                  <div className="text-center py-8">
                    <DollarSign className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                    <p className="text-gray-600">
                      {payments.length === 0 
                        ? "No se han registrado pagos para este préstamo"
                        : "No se encontraron pagos con los filtros aplicados"
                      }
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    {/* Vista móvil */}
                    <div className="block md:hidden space-y-3">
                      {filteredPayments.map((payment) => (
                        <div key={payment.id} className="border rounded-lg p-4 bg-white">
                          <div className="flex justify-between items-start mb-3">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-lg">{formatDateTime(payment.created_at)}</span>
                              {getStatusBadge(payment.status)}
                            </div>
                            <div className="text-right">
                              <div className="font-bold text-green-600">
                                {formatCurrency(payment.amount)}
                              </div>
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-2 text-sm text-gray-600">
                            <div>
                              <span className="font-medium">Principal:</span>
                              <div>{formatCurrency(payment.principal_amount)}</div>
                            </div>
                            <div>
                              <span className="font-medium">Interés:</span>
                              <div>{formatCurrency(payment.interest_amount)}</div>
                            </div>
                            <div>
                              <span className="font-medium">Mora:</span>
                              <div>{formatCurrency(payment.late_fee)}</div>
                            </div>
                            <div>
                              <span className="font-medium">Método:</span>
                              <div>{getPaymentMethodLabel(payment.payment_method)}</div>
                            </div>
                          </div>

                          {payment.reference_number && (
                            <div className="mt-2 pt-2 border-t text-sm text-gray-600">
                              <span className="font-medium">Referencia:</span> {payment.reference_number}
                            </div>
                          )}

                          {payment.notes && (
                            <div className="mt-2 pt-2 border-t text-sm text-gray-600">
                              <span className="font-medium">Notas:</span> {payment.notes}
                            </div>
                          )}

                          <div className="mt-3 pt-2 border-t">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleViewReceipt(payment)}
                              className="w-full"
                            >
                              <Eye className="h-4 w-4 mr-2" />
                              Ver Recibo
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Vista desktop */}
                    <div className="hidden md:block">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="border-b bg-gray-50">
                            <th className="text-left p-3 font-semibold">Fecha</th>
                            <th className="text-left p-3 font-semibold">Monto</th>
                            <th className="text-left p-3 font-semibold">Principal</th>
                            <th className="text-left p-3 font-semibold">Interés</th>
                            <th className="text-left p-3 font-semibold">Mora</th>
                            <th className="text-left p-3 font-semibold">Método</th>
                            <th className="text-left p-3 font-semibold">Estado</th>
                            <th className="text-left p-3 font-semibold">Referencia</th>
                            <th className="text-left p-3 font-semibold">Acciones</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredPayments.map((payment) => (
                            <tr key={payment.id} className="border-b hover:bg-gray-50">
                              <td className="p-3">{formatDateTime(payment.created_at)}</td>
                              <td className="p-3 font-semibold text-green-600">
                                {formatCurrency(payment.amount)}
                              </td>
                              <td className="p-3">{formatCurrency(payment.principal_amount)}</td>
                              <td className="p-3">{formatCurrency(payment.interest_amount)}</td>
                              <td className="p-3">{formatCurrency(payment.late_fee)}</td>
                              <td className="p-3">{getPaymentMethodLabel(payment.payment_method)}</td>
                              <td className="p-3">{getStatusBadge(payment.status)}</td>
                              <td className="p-3">{payment.reference_number || '-'}</td>
                              <td className="p-3">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleViewReceipt(payment)}
                                >
                                  <Eye className="h-4 w-4 mr-1" />
                                  Recibo
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button variant="outline" onClick={onClose}>
                <X className="h-4 w-4 mr-2" />
                Cerrar
              </Button>
            </div>
          </div>
        )}
      </DialogContent>

      {/* Modal de Recibo */}
      {selectedPayment && (
        <Dialog open={showReceiptModal} onOpenChange={setShowReceiptModal}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Receipt className="h-5 w-5" />
                Recibo de Pago
                {loan && (
                  <span className="text-sm font-normal text-gray-600">
                    - {loan.clients.full_name}
                  </span>
                )}
              </DialogTitle>
            </DialogHeader>

            {selectedPayment && loan && (
              <div className="space-y-6">
                {/* Información del cliente */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Información del Cliente</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-600">Cliente:</span>
                        <div className="font-semibold">{loan.clients.full_name}</div>
                      </div>
                      <div>
                        <span className="text-gray-600">Cédula:</span>
                        <div className="font-semibold">{loan.clients.dni}</div>
                      </div>
                      <div>
                        <span className="text-gray-600">Fecha de Pago:</span>
                        <div className="font-semibold">{formatDate(selectedPayment.payment_date)}</div>
                      </div>
                      <div>
                        <span className="text-gray-600">Método de Pago:</span>
                        <div className="font-semibold">{getPaymentMethodLabel(selectedPayment.payment_method)}</div>
                      </div>
                      {selectedPayment.reference_number && (
                        <div>
                          <span className="text-gray-600">Referencia:</span>
                          <div className="font-semibold">{selectedPayment.reference_number}</div>
                        </div>
                      )}
                      <div>
                        <span className="text-gray-600">Estado:</span>
                        <div>{getStatusBadge(selectedPayment.status)}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Detalle del pago */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Detalle del Pago</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Monto Total:</span>
                        <span className="font-bold text-lg text-green-600">
                          {formatCurrency(selectedPayment.amount)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">A Principal:</span>
                        <span className="font-semibold">{formatCurrency(selectedPayment.principal_amount)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">A Intereses:</span>
                        <span className="font-semibold">{formatCurrency(selectedPayment.interest_amount)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Mora:</span>
                        <span className="font-semibold">{formatCurrency(selectedPayment.late_fee)}</span>
                      </div>
                    </div>

                    {selectedPayment.notes && (
                      <div className="mt-4 pt-4 border-t">
                        <span className="text-gray-600 font-medium">Notas:</span>
                        <p className="mt-1 text-sm">{selectedPayment.notes}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setShowReceiptModal(false)}>
                    <X className="h-4 w-4 mr-2" />
                    Cerrar
                  </Button>
                  <Button onClick={() => printReceipt(selectedPayment)}>
                    <Printer className="h-4 w-4 mr-2" />
                    Imprimir Recibo
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}
    </Dialog>
  );
};
