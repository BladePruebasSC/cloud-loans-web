import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { ArrowLeft, Calculator, Search, User, DollarSign, Calendar, Percent, FileText, Copy, Printer, Plus } from 'lucide-react';
import { createDateInSantoDomingo, getCurrentDateString, getCurrentDateInSantoDomingo, formatDateStringForSantoDomingo } from '@/utils/dateUtils';
import { formatCurrency, formatCurrencyNumber } from '@/lib/utils';
import { GuaranteeForm, GuaranteeFormData } from './GuaranteeForm';

// Función para generar el HTML de un documento
const generateDocumentHTML = (docType: string, loanData: any, formData: any, companySettings: any): string => {
  const client = loanData.clients as any;
  const today = new Date();
  const formattedDate = today.toLocaleDateString('es-DO', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
  
  const formatCurrency = (amount: number | null | undefined) => {
    if (amount === null || amount === undefined || isNaN(amount)) {
      return 'RD$0.00';
    }
    return new Intl.NumberFormat('es-DO', {
      style: 'currency',
      currency: 'DOP',
      minimumFractionDigits: 2
    }).format(amount);
  };
  
  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'N/A';
    try {
      const [year, month, day] = dateStr.split('-').map(Number);
      const date = new Date(year, month - 1, day);
      return date.toLocaleDateString('es-DO', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
    } catch {
      return dateStr;
    }
  };
  
  switch (docType) {
    case 'pagare_notarial':
      return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pagaré Notarial</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 40px; line-height: 1.6; }
    .header { text-align: center; margin-bottom: 30px; }
    .content { max-width: 800px; margin: 0 auto; }
    .section { margin-bottom: 20px; }
    .signature-section { margin-top: 60px; display: flex; justify-content: space-between; }
    .signature-box { width: 45%; text-align: center; border-top: 1px solid #000; padding-top: 10px; }
  </style>
</head>
<body>
  <div class="content">
    <div class="header">
      <h1>PAGARÉ NOTARIAL</h1>
    </div>
    <div class="section">
      <p>Por medio del presente documento, yo <strong>${client?.full_name || 'N/A'}</strong>, 
      con cédula de identidad No. <strong>${client?.dni || 'N/A'}</strong>, 
      me comprometo a pagar incondicionalmente a la orden de <strong>${companySettings?.company_name || 'LA EMPRESA'}</strong>, 
      la cantidad de <strong>${formatCurrency(loanData.amount)}</strong> (${(loanData.amount || 0).toLocaleString('es-DO')} pesos dominicanos).</p>
    </div>
    <div class="section">
      <p><strong>Condiciones del préstamo:</strong></p>
      <ul>
        <li>Monto del préstamo: ${formatCurrency(loanData.amount)}</li>
        <li>Tasa de interés: ${loanData.interest_rate}% mensual</li>
        <li>Plazo: ${loanData.term_months} meses</li>
        <li>Cuota mensual: ${formatCurrency(loanData.monthly_payment)}</li>
        <li>Fecha de inicio: ${formatDate(loanData.start_date)}</li>
        <li>Primera fecha de pago: ${formatDate(loanData.first_payment_date)}</li>
      </ul>
    </div>
    <div class="section">
      <p>El pago se realizará en ${loanData.term_months} cuotas mensuales de ${formatCurrency(loanData.monthly_payment)} cada una, 
      comenzando el ${formatDate(loanData.first_payment_date)}.</p>
    </div>
    <div class="section">
      <p>En caso de mora, se aplicará una tasa de mora del ${loanData.late_fee_rate || 0}% ${loanData.late_fee_calculation_type === 'daily' ? 'diario' : 'mensual'}.</p>
    </div>
    <div class="signature-section">
      <div class="signature-box">
        <p>Firma del Deudor</p>
        <p>${client?.full_name || 'N/A'}</p>
        <p>Cédula: ${client?.dni || 'N/A'}</p>
      </div>
      <div class="signature-box">
        <p>Fecha: ${formattedDate}</p>
      </div>
    </div>
  </div>
</body>
</html>`;
    
    case 'tabla_amortizacion':
      // Obtener tabla de amortización (simplificada)
      const installments = [];
      const loanAmount = loanData.amount || 0;
      const interestRate = loanData.interest_rate || 0;
      const monthlyPayment = loanData.monthly_payment || 0;
      const termMonths = loanData.term_months || 1;
      
      let balance = loanAmount;
      const monthlyInterest = loanAmount * (interestRate / 100);
      const monthlyPrincipal = monthlyPayment - monthlyInterest;
      
      for (let i = 1; i <= termMonths; i++) {
        const interest = monthlyInterest;
        const principal = monthlyPrincipal;
        balance -= principal;
        installments.push({ i, interest, principal, balance: Math.max(0, balance) });
      }
      
      return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tabla de Amortización</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 40px; }
    .header { text-align: center; margin-bottom: 30px; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th, td { border: 1px solid #ddd; padding: 10px; text-align: center; }
    th { background-color: #3b82f6; color: white; }
    .info-section { margin-bottom: 20px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>TABLA DE AMORTIZACIÓN</h1>
  </div>
  <div class="info-section">
    <p><strong>Cliente:</strong> ${client?.full_name || 'N/A'}</p>
    <p><strong>Cédula:</strong> ${client?.dni || 'N/A'}</p>
    <p><strong>Monto del préstamo:</strong> ${formatCurrency(loanAmount)}</p>
    <p><strong>Tasa de interés:</strong> ${interestRate}% mensual</p>
    <p><strong>Plazo:</strong> ${termMonths} meses</p>
    <p><strong>Cuota mensual:</strong> ${formatCurrency(monthlyPayment)}</p>
  </div>
  <table>
    <thead>
      <tr>
        <th>Cuota</th>
        <th>Interés</th>
        <th>Capital</th>
        <th>Total</th>
        <th>Saldo Pendiente</th>
      </tr>
    </thead>
    <tbody>
      ${installments.map(inst => `
        <tr>
          <td>${inst.i}</td>
          <td>${formatCurrency(inst.interest)}</td>
          <td>${formatCurrency(inst.principal)}</td>
          <td>${formatCurrency(monthlyPayment)}</td>
          <td>${formatCurrency(inst.balance)}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>
  <div style="margin-top: 20px; text-align: right;">
    <p><strong>Total a pagar:</strong> ${formatCurrency(loanData.total_amount || loanAmount)}</p>
    <p><strong>Total de intereses:</strong> ${formatCurrency((loanData.total_amount || loanAmount) - loanAmount)}</p>
  </div>
</body>
</html>`;
    
    case 'contrato_bluetooth':
      return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Contrato Impresora Bluetooth</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 40px; line-height: 1.6; }
    .header { text-align: center; margin-bottom: 30px; }
    .content { max-width: 800px; margin: 0 auto; }
    .section { margin-bottom: 20px; }
  </style>
</head>
<body>
  <div class="content">
    <div class="header">
      <h1>CONTRATO IMPRESORA BLUETOOTH</h1>
    </div>
    <div class="section">
      <p><strong>CONTRATANTE:</strong> ${client?.full_name || 'N/A'}, Cédula: ${client?.dni || 'N/A'}</p>
      <p><strong>CONTRATADO:</strong> ${companySettings?.company_name || 'LA EMPRESA'}</p>
    </div>
    <div class="section">
      <p>Por medio del presente contrato, las partes acuerdan lo siguiente:</p>
      <ol>
        <li>El contratante se compromete a pagar la cantidad de ${formatCurrency(loanData.amount)} en ${loanData.term_months} cuotas mensuales.</li>
        <li>La tasa de interés aplicable es del ${loanData.interest_rate}% mensual.</li>
        <li>El pago se realizará mediante impresora Bluetooth según los términos acordados.</li>
        <li>En caso de incumplimiento, se aplicarán las penalizaciones establecidas.</li>
      </ol>
    </div>
    <div class="section">
      <p>Fecha: ${formattedDate}</p>
    </div>
  </div>
</body>
</html>`;
    
    case 'pagare_codeudor':
      return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pagaré Notarial con Codeudor</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 40px; line-height: 1.6; }
    .header { text-align: center; margin-bottom: 30px; }
    .content { max-width: 800px; margin: 0 auto; }
    .section { margin-bottom: 20px; }
    .signature-section { margin-top: 60px; display: flex; justify-content: space-between; }
    .signature-box { width: 45%; text-align: center; border-top: 1px solid #000; padding-top: 10px; }
  </style>
</head>
<body>
  <div class="content">
    <div class="header">
      <h1>PAGARÉ NOTARIAL CON CODEUDOR</h1>
    </div>
    <div class="section">
      <p>Por medio del presente documento, yo <strong>${client?.full_name || 'N/A'}</strong>, 
      con cédula de identidad No. <strong>${client?.dni || 'N/A'}</strong>, 
      como deudor principal, y <strong>${formData.guarantor_name || 'N/A'}</strong>, 
      con cédula de identidad No. <strong>${formData.guarantor_dni || 'N/A'}</strong>, 
      como codeudor, nos comprometemos solidariamente a pagar a la orden de 
      <strong>${companySettings?.company_name || 'LA EMPRESA'}</strong>, 
      la cantidad de <strong>${formatCurrency(loanData.amount)}</strong>.</p>
    </div>
    <div class="section">
      <p><strong>Condiciones del préstamo:</strong></p>
      <ul>
        <li>Monto del préstamo: ${formatCurrency(loanData.amount)}</li>
        <li>Tasa de interés: ${loanData.interest_rate}% mensual</li>
        <li>Plazo: ${loanData.term_months} meses</li>
        <li>Cuota mensual: ${formatCurrency(loanData.monthly_payment)}</li>
      </ul>
    </div>
    <div class="signature-section">
      <div class="signature-box">
        <p>Firma del Deudor Principal</p>
        <p>${client?.full_name || 'N/A'}</p>
        <p>Cédula: ${client?.dni || 'N/A'}</p>
      </div>
      <div class="signature-box">
        <p>Firma del Codeudor</p>
        <p>${formData.guarantor_name || 'N/A'}</p>
        <p>Cédula: ${formData.guarantor_dni || 'N/A'}</p>
      </div>
    </div>
    <div style="margin-top: 40px; text-align: center;">
      <p>Fecha: ${formattedDate}</p>
    </div>
  </div>
</body>
</html>`;
    
    case 'contrato_salarial':
      return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Contrato Salarial</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 40px; line-height: 1.6; }
    .header { text-align: center; margin-bottom: 30px; }
    .content { max-width: 800px; margin: 0 auto; }
    .section { margin-bottom: 20px; }
  </style>
</head>
<body>
  <div class="content">
    <div class="header">
      <h1>CONTRATO SALARIAL</h1>
    </div>
    <div class="section">
      <p><strong>TRABAJADOR:</strong> ${client?.full_name || 'N/A'}, Cédula: ${client?.dni || 'N/A'}</p>
      <p><strong>EMPRESA:</strong> ${companySettings?.company_name || 'LA EMPRESA'}</p>
    </div>
    <div class="section">
      <p>Por medio del presente contrato salarial, se establece el siguiente acuerdo de préstamo:</p>
      <ul>
        <li>Monto del préstamo: ${formatCurrency(loanData.amount)}</li>
        <li>Tasa de interés: ${loanData.interest_rate}% mensual</li>
        <li>Plazo: ${loanData.term_months} meses</li>
        <li>Cuota mensual: ${formatCurrency(loanData.monthly_payment)}</li>
        <li>El pago se realizará mediante descuento salarial según lo acordado.</li>
      </ul>
    </div>
    <div class="section">
      <p>Fecha: ${formattedDate}</p>
    </div>
  </div>
</body>
</html>`;
    
    default:
      return `<html><body><h1>Documento: ${docType}</h1><p>Contenido no disponible</p></body></html>`;
  }
};

// Función para generar las cuotas originales del préstamo
const generateOriginalInstallments = async (loan: any, formData: LoanFormData) => {
  try {
    const installments = [];
    // Calcular la primera fecha de cobro basándose en la fecha de inicio + frecuencia
    // Parsear la fecha como fecha local (no UTC) para evitar problemas de zona horaria
    const startDateStr = loan.start_date.split('T')[0]; // Obtener solo la parte de fecha
    const [startYear, startMonth, startDay] = startDateStr.split('-').map(Number);
    const startDate = createDateInSantoDomingo(startYear, startMonth, startDay);
    const firstPaymentDate = new Date(startDate);
    
    // Ajustar la primera fecha de cobro según la frecuencia
    switch (loan.payment_frequency) {
      case 'daily':
        firstPaymentDate.setDate(startDate.getDate() + 1);
        break;
      case 'weekly':
        firstPaymentDate.setDate(startDate.getDate() + 7);
        break;
      case 'biweekly':
        firstPaymentDate.setDate(startDate.getDate() + 14);
        break;
      case 'monthly':
      default:
        firstPaymentDate.setMonth(startDate.getMonth() + 1);
        break;
    }
    
    // Extraer año, mes y día de firstPaymentDate para formatear correctamente
    const baseYear = firstPaymentDate.getFullYear();
    const baseMonth = firstPaymentDate.getMonth() + 1;
    const baseDay = firstPaymentDate.getDate();
    
    // Calcular cuotas según el tipo de amortización
    let principalPerPayment, interestPerPayment;
    
    if (loan.amortization_type === 'french') {
      // Amortización francesa - cuota fija, capital creciente, interés decreciente
      const periodRate = loan.interest_rate / 100;
      const totalPeriods = loan.term_months;
      
      if (periodRate > 0) {
        const fixedPayment = loan.amount * (periodRate * Math.pow(1 + periodRate, totalPeriods)) / (Math.pow(1 + periodRate, totalPeriods) - 1);
        // Para la primera cuota
        interestPerPayment = loan.amount * periodRate;
        principalPerPayment = fixedPayment - interestPerPayment;
      } else {
        principalPerPayment = loan.amount / totalPeriods;
        interestPerPayment = 0;
      }
    } else {
      // Amortización simple (por defecto)
      principalPerPayment = loan.monthly_payment - (loan.amount * loan.interest_rate / 100);
      interestPerPayment = loan.amount * loan.interest_rate / 100;
    }
    
    // Generar cada cuota
    let remainingBalance = loan.amount;
    
    // Para préstamos con plazo indefinido, generar solo una cuota inicial
    if (loan.amortization_type === 'indefinite') {
      // Solo intereses, sin capital
      const periodRate = loan.interest_rate / 100;
      const interestPerPayment = loan.amount * periodRate;
      
      // Formatear fecha correctamente usando la fecha local (no UTC) para evitar problemas de zona horaria
      const formattedDate = `${baseYear}-${String(baseMonth).padStart(2, '0')}-${String(baseDay).padStart(2, '0')}`;
      
      installments.push({
        loan_id: loan.id,
        installment_number: 1, // Siempre 1 para indefinidos
        due_date: formattedDate,
        principal_amount: 0,
        interest_amount: interestPerPayment,
        total_amount: interestPerPayment,
        is_paid: false
      });
    } else {
      // Para préstamos con plazo definido, generar todas las cuotas
      for (let i = 1; i <= loan.term_months; i++) {
        // Calcular la fecha de esta cuota basándose en firstPaymentDate
        const installmentDate = new Date(firstPaymentDate);
        const periodsToAdd = i - 1; // i-1 porque firstPaymentDate ya es la fecha de primera cuota
        
        // Ajustar fecha según la frecuencia de pago
        switch (loan.payment_frequency) {
          case 'daily':
            installmentDate.setDate(installmentDate.getDate() + (periodsToAdd * 1));
            break;
          case 'weekly':
            installmentDate.setDate(installmentDate.getDate() + (periodsToAdd * 7));
            break;
          case 'biweekly':
            installmentDate.setDate(installmentDate.getDate() + (periodsToAdd * 14));
            break;
          case 'monthly':
            installmentDate.setMonth(installmentDate.getMonth() + periodsToAdd);
            break;
          case 'quarterly':
            installmentDate.setMonth(installmentDate.getMonth() + (periodsToAdd * 3));
            break;
          case 'yearly':
            installmentDate.setFullYear(installmentDate.getFullYear() + periodsToAdd);
            break;
          default:
            installmentDate.setMonth(installmentDate.getMonth() + periodsToAdd);
        }
        
        // Formatear fecha correctamente usando la fecha local (no UTC) para evitar problemas de zona horaria
        const year = installmentDate.getFullYear();
        const month = installmentDate.getMonth() + 1;
        const day = installmentDate.getDate();
        const formattedDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        
        // Calcular cuota específica según el tipo de amortización
        let currentPrincipalAmount, currentInterestAmount, currentTotalAmount;
        
        if (loan.amortization_type === 'french') {
          // Amortización francesa - cuota fija, capital creciente, interés decreciente
          const periodRate = loan.interest_rate / 100;
          const totalPeriods = loan.term_months;
          
          if (periodRate > 0) {
            const fixedPayment = loan.amount * (periodRate * Math.pow(1 + periodRate, totalPeriods)) / (Math.pow(1 + periodRate, totalPeriods) - 1);
            currentInterestAmount = remainingBalance * periodRate;
            currentPrincipalAmount = fixedPayment - currentInterestAmount;
            currentTotalAmount = fixedPayment;
          } else {
            currentPrincipalAmount = loan.amount / totalPeriods;
            currentInterestAmount = 0;
            currentTotalAmount = currentPrincipalAmount;
          }
        } else {
          // Amortización simple (por defecto)
          currentPrincipalAmount = principalPerPayment;
          currentInterestAmount = interestPerPayment;
          currentTotalAmount = loan.monthly_payment;
        }
        
        installments.push({
          loan_id: loan.id,
          installment_number: i,
          due_date: formattedDate,
          principal_amount: currentPrincipalAmount,
          interest_amount: currentInterestAmount,
          total_amount: currentTotalAmount,
          is_paid: false
        });
        
        // Actualizar el balance restante para la siguiente cuota
        remainingBalance -= currentPrincipalAmount;
      }
    }
    
    // Insertar las cuotas en la base de datos
    const { error } = await supabase
      .from('installments')
      .insert(installments);
      
    if (error) {
      console.error('Error generando cuotas:', error);
      throw error;
    }
    
    console.log('✅ Cuotas originales generadas exitosamente:', installments.length);
  } catch (error) {
    console.error('Error generando cuotas originales:', error);
    throw error;
  }
};

const loanSchema = z.object({
  client_id: z.string().min(1, 'Debe seleccionar un cliente'),
  amount: z.number().min(1, 'El monto debe ser mayor a 0'),
  interest_rate: z.number().min(0, 'La tasa de interés debe ser mayor o igual a 0'),
  term_months: z.number().min(1, 'El plazo debe ser al menos 1 mes'),
  loan_type: z.string().min(1, 'Debe seleccionar un tipo de préstamo'),
  amortization_type: z.string().default('simple').refine((val) => ['simple', 'french', 'german', 'american', 'indefinite'].includes(val), {
    message: 'Tipo de amortización no válido'
  }),
  payment_frequency: z.string().default('monthly'),
  first_payment_date: z.string().min(1, 'Debe seleccionar la fecha del primer pago'),
  closing_costs: z.number().min(0).default(0),
  portfolio: z.string().default(''),
  comments: z.string().default(''),
  guarantor_required: z.boolean().default(false),
  loan_started: z.boolean().default(false),
  late_fee_enabled: z.boolean().default(false),
  late_fee_rate: z.number().min(0).max(100).default(2.0),
  grace_period_days: z.number().min(0).max(30).default(0),
  max_late_fee: z.number().min(0).default(0),
  late_fee_calculation_type: z.enum(['daily', 'monthly', 'compound']).default('daily'),
  add_expense: z.boolean().default(false),
  minimum_payment: z.boolean().default(true),
  minimum_payment_type: z.string().default('interest'),
  minimum_payment_percentage: z.number().default(100),
  guarantor_name: z.string().default(''),
  guarantor_phone: z.string().default(''),
  guarantor_dni: z.string().default(''),
  notes: z.string().default(''),
  fixed_payment_enabled: z.boolean().default(false),
  fixed_payment_amount: z.number().default(0),
  excluded_days: z.array(z.string()).default([]),
});

type LoanFormData = z.infer<typeof loanSchema>;

interface Client {
  id: string;
  full_name: string;
  dni: string;
  phone: string;
  email: string | null;
}

interface AmortizationRow {
  payment: number | string;
  date: string;
  interest: number;
  principal: number;
  totalPayment: number;
  remainingBalance: number;
}

interface LoanFormProps {
  onBack: () => void;
  onLoanCreated?: () => void;
  initialData?: {
    client_id?: string;
    amount?: number;
    purpose?: string;
    monthly_income?: number;
    existing_debts?: number;
    employment_status?: string;
    // Campos de préstamo
    interest_rate?: number;
    term_months?: number;
    loan_type?: string;
    amortization_type?: string;
    payment_frequency?: string;
    first_payment_date?: string;
    closing_costs?: number;
    late_fee_enabled?: boolean;
    late_fee_rate?: number;
    grace_period_days?: number;
    max_late_fee?: number;
    late_fee_calculation_type?: 'daily' | 'monthly' | 'compound';
    minimum_payment_type?: string;
    minimum_payment_percentage?: number;
    guarantor_required?: boolean;
    guarantor_name?: string;
    guarantor_phone?: string;
    guarantor_dni?: string;
    notes?: string;
  };
}

export const LoanForm = ({ onBack, onLoanCreated, initialData }: LoanFormProps) => {
  const [clients, setClients] = useState<Client[]>([]);
  const [filteredClients, setFilteredClients] = useState<Client[]>([]);
  const [clientSearch, setClientSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [globalLateFeeConfig, setGlobalLateFeeConfig] = useState({
    default_late_fee_enabled: false,
    default_late_fee_rate: 2.0,
    default_grace_period_days: 0,
    default_max_late_fee: 0,
    default_late_fee_calculation_type: 'daily' as 'daily' | 'monthly' | 'compound'
  });
  const [loading, setLoading] = useState(false);
  const [showAmortizationTable, setShowAmortizationTable] = useState(false);
  const [amortizationSchedule, setAmortizationSchedule] = useState<AmortizationRow[]>([]);
  const [calculatedValues, setCalculatedValues] = useState({
    monthlyPayment: 0,
    totalAmount: 0,
    totalInterest: 0,
    usdAmount: 0
  });
  const [excludedDays, setExcludedDays] = useState<string[]>([]);
  const [isFixingQuota, setIsFixingQuota] = useState(false);
  const [guaranteeData, setGuaranteeData] = useState<Partial<GuaranteeFormData>>({});
  const [showGenerateDocumentsDialog, setShowGenerateDocumentsDialog] = useState(false);
  const [showDocumentSelectionDialog, setShowDocumentSelectionDialog] = useState(false);
  const [createdLoanId, setCreatedLoanId] = useState<string | null>(null);
  const [selectedDocuments, setSelectedDocuments] = useState<string[]>([]);
  const { user, companyId, companySettings } = useAuth();

  // Cargar configuración global de mora
  useEffect(() => {
    const loadGlobalLateFeeConfig = async () => {
      try {
        const { data, error } = await supabase
          .from('system_settings')
          .select('*')
          .eq('key', 'default_late_fee_config')
          .single();

        if (data && !error) {
          const config = JSON.parse(data.value);
          setGlobalLateFeeConfig(config);
          
          // Actualizar el formulario con los valores por defecto
          form.setValue('late_fee_enabled', config.default_late_fee_enabled);
          form.setValue('late_fee_rate', config.default_late_fee_rate);
          form.setValue('grace_period_days', config.default_grace_period_days);
          form.setValue('max_late_fee', config.default_max_late_fee);
          form.setValue('late_fee_calculation_type', config.default_late_fee_calculation_type);
        }
      } catch (error) {
        console.error('Error loading global late fee config:', error);
      }
    };

    loadGlobalLateFeeConfig();
  }, []);

  // Función para verificar si una fecha cae en día excluido y ajustarla
  const adjustDateForExcludedDays = (date: Date) => {
    if (excludedDays.length === 0) return date;
    
    const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const adjustedDate = new Date(date);
    const dayIndex = adjustedDate.getDay();
    const dayName = dayNames[dayIndex];
    
    // Si la fecha no está excluida, devolverla tal como está
    if (!excludedDays.includes(dayName)) {
      return adjustedDate;
    }
    
    // Si está excluida, buscar el siguiente día hábil
    let attempts = 0;
    const maxAttempts = 30;
    
    while (attempts < maxAttempts) {
      adjustedDate.setDate(adjustedDate.getDate() + 1);
      const nextDayIndex = adjustedDate.getDay();
      const nextDayName = dayNames[nextDayIndex];
      
      if (!excludedDays.includes(nextDayName)) {
        break;
      }
      attempts++;
    }
    
    return adjustedDate;
  };

  // Función auxiliar para crear fechas en zona horaria de Santo Domingo
  const createLocalDate = (dateString: string): Date => {
    const [year, month, day] = dateString.split('-').map(Number);
    return createDateInSantoDomingo(year, month, day);
  };

  // Función para calcular la primera fecha de pago basada en la frecuencia y fecha de inicio
  const calculateFirstPaymentDate = (frequency: string, startDate?: string) => {
    const baseDate = startDate ? new Date(startDate) : new Date();
    const firstPaymentDate = new Date(baseDate);
    
    switch (frequency) {
      case 'daily':
        firstPaymentDate.setDate(baseDate.getDate() + 1);
        break;
      case 'weekly':
        firstPaymentDate.setDate(baseDate.getDate() + 7);
        break;
      case 'biweekly':
        firstPaymentDate.setDate(baseDate.getDate() + 14);
        break;
      case 'monthly':
      default:
        firstPaymentDate.setMonth(baseDate.getMonth() + 1);
        break;
    }
    
    return firstPaymentDate.toISOString().split('T')[0];
  };

  const form = useForm<LoanFormData>({
    resolver: zodResolver(loanSchema),
    defaultValues: {
      amount: companySettings?.min_loan_amount ?? 0,
      interest_rate: companySettings?.interest_rate_default ?? 0,
      term_months: companySettings?.min_term_months ?? 1,
      loan_type: 'personal',
      amortization_type: 'simple',
      payment_frequency: 'monthly',
      first_payment_date: getCurrentDateString(),
      closing_costs: 0,
      minimum_payment_percentage: 100,
      minimum_payment_type: 'interest',
      fixed_payment_enabled: false,
      fixed_payment_amount: 0,
      late_fee_enabled: false,
      late_fee_rate: companySettings?.default_late_fee_rate ?? 2.0,
      grace_period_days: companySettings?.grace_period_days ?? 0,
      max_late_fee: 0,
      late_fee_calculation_type: 'daily',
      portfolio: '',
      comments: '',
      guarantor_name: '',
      guarantor_phone: '',
      guarantor_dni: '',
      notes: '',
    },
  });

  // Solo actualizar valores por defecto una vez cuando se cargan las companySettings
  // No tocar amount ni term_months para permitir al usuario escribir cualquier valor
  useEffect(() => {
    if (companySettings && !form.formState.isDirty) {
      // Solo actualizar si el formulario no ha sido modificado por el usuario
      const currentValues = form.getValues();
      if (currentValues.interest_rate === 0 || currentValues.interest_rate === undefined) {
        form.setValue('interest_rate', companySettings.interest_rate_default ?? 0, { shouldDirty: false });
      }
      if (currentValues.late_fee_rate === 2.0 || currentValues.late_fee_rate === undefined) {
        form.setValue('late_fee_rate', companySettings.default_late_fee_rate ?? 2.0, { shouldDirty: false });
      }
      if (!currentValues.late_fee_enabled && companySettings.default_late_fee_rate) {
        form.setValue('late_fee_enabled', true, { shouldDirty: false });
      }
      if (currentValues.grace_period_days === 0 || currentValues.grace_period_days === undefined) {
        form.setValue('grace_period_days', companySettings.grace_period_days ?? 0, { shouldDirty: false });
      }
    }
  }, [companySettings, form]);

  const watchedAmount = form.watch('amount');
  const watchedTerm = form.watch('term_months');
  const [isAmountFocused, setIsAmountFocused] = useState(false);
  const [isTermFocused, setIsTermFocused] = useState(false);

  // Validación en tiempo real para mostrar errores sin bloquear la escritura
  // Solo validar cuando el campo no está siendo editado activamente
  useEffect(() => {
    if (!companySettings) return;
    if (watchedAmount === undefined || watchedAmount === null) return;
    if (isAmountFocused) return; // No validar mientras el usuario está escribiendo
    
    const min = companySettings.min_loan_amount;
    const max = companySettings.max_loan_amount;
    
    if (min !== null && min !== undefined && watchedAmount < min) {
      form.setError('amount', {
        type: 'manual',
        message: `El monto mínimo permitido es RD$${min.toLocaleString()}`
      });
    } else if (max !== null && max !== undefined && watchedAmount > max) {
      form.setError('amount', {
        type: 'manual',
        message: `El monto máximo permitido es RD$${max.toLocaleString()}`
      });
    } else {
      form.clearErrors('amount');
    }
  }, [watchedAmount, companySettings, form, isAmountFocused]);

  useEffect(() => {
    if (!companySettings) return;
    if (watchedTerm === undefined || watchedTerm === null) return;
    if (isTermFocused) return; // No validar mientras el usuario está escribiendo
    
    const min = companySettings.min_term_months;
    const max = companySettings.max_term_months;
    
    if (min !== null && min !== undefined && watchedTerm < min) {
      form.setError('term_months', {
        type: 'manual',
        message: `El plazo mínimo permitido es ${min} meses`
      });
    } else if (max !== null && max !== undefined && watchedTerm > max) {
      form.setError('term_months', {
        type: 'manual',
        message: `El plazo máximo permitido es ${max} meses`
      });
    } else {
      form.clearErrors('term_months');
    }
  }, [watchedTerm, companySettings, form, isTermFocused]);

  useEffect(() => {
    fetchClients();
  }, []);

  // Aplicar datos iniciales si se proporcionan (desde solicitud)
  useEffect(() => {
    if (initialData && clients.length > 0) {
      // Pre-seleccionar cliente si se proporciona
      if (initialData.client_id) {
        const client = clients.find(c => c.id === initialData.client_id);
        if (client) {
          setSelectedClient(client);
          setClientSearch(client.full_name);
          form.setValue('client_id', client.id);
          console.log('Initial client set:', client);
          console.log('Initial client_id set to:', client.id);
        }
      }

      // Pre-llenar campos del formulario
      if (initialData.amount) {
        form.setValue('amount', initialData.amount);
      }
      if (initialData.purpose) {
        form.setValue('comments', initialData.purpose);
      }
      if (initialData.interest_rate !== undefined) {
        form.setValue('interest_rate', initialData.interest_rate);
      }
      if (initialData.term_months !== undefined) {
        form.setValue('term_months', initialData.term_months);
      }
      if (initialData.loan_type) {
        form.setValue('loan_type', initialData.loan_type);
      }
      if (initialData.amortization_type) {
        form.setValue('amortization_type', initialData.amortization_type);
      }
      if (initialData.payment_frequency) {
        form.setValue('payment_frequency', initialData.payment_frequency);
      }
      if (initialData.first_payment_date) {
        form.setValue('first_payment_date', initialData.first_payment_date);
      }
      if (initialData.closing_costs !== undefined) {
        form.setValue('closing_costs', initialData.closing_costs);
      }
      if (initialData.late_fee_enabled !== undefined) {
        form.setValue('late_fee_enabled', initialData.late_fee_enabled);
      }
      if (initialData.late_fee_rate !== undefined) {
        form.setValue('late_fee_rate', initialData.late_fee_rate);
      }
      if (initialData.grace_period_days !== undefined) {
        form.setValue('grace_period_days', initialData.grace_period_days);
      }
      if (initialData.max_late_fee !== undefined) {
        form.setValue('max_late_fee', initialData.max_late_fee);
      }
      if (initialData.late_fee_calculation_type !== undefined) {
        form.setValue('late_fee_calculation_type', initialData.late_fee_calculation_type);
      }
      if (initialData.minimum_payment_type) {
        form.setValue('minimum_payment_type', initialData.minimum_payment_type);
      }
      if (initialData.minimum_payment_percentage !== undefined) {
        form.setValue('minimum_payment_percentage', initialData.minimum_payment_percentage);
      }
      if (initialData.guarantor_required !== undefined) {
        form.setValue('guarantor_required', initialData.guarantor_required);
      }
      if (initialData.guarantor_name) {
        form.setValue('guarantor_name', initialData.guarantor_name);
      }
      if (initialData.guarantor_phone) {
        form.setValue('guarantor_phone', initialData.guarantor_phone);
      }
      if (initialData.guarantor_dni) {
        form.setValue('guarantor_dni', initialData.guarantor_dni);
      }
      if (initialData.notes) {
        form.setValue('notes', initialData.notes);
      }
    }
  }, [initialData, clients]);

  // Función para calcular la tasa de interés basada en una cuota fija
  const calculateInterestFromQuota = (principal: number, quota: number, months: number) => {
    if (principal <= 0 || quota <= 0 || months <= 0) return 0;
    
    // Si la cuota es menor o igual al principal dividido por meses, es 0% interés
    if (quota <= principal / months) return 0;
    
    // Para interés simple mensual, calcular directamente
    const totalPayment = quota * months;
    const totalInterest = totalPayment - principal;
    
    // Calcular tasa de interés mensual
    const monthlyRate = (totalInterest / principal) / months * 100;
    return Math.max(0, Math.round(monthlyRate * 100) / 100);
  };

  const fetchClients = async () => {
    if (!user || !companyId) return;

    const { data, error } = await supabase
      .from('clients')
      .select('id, full_name, dni, phone, email')
      .eq('user_id', companyId)
      .eq('status', 'active')
      .order('full_name');

    if (error) {
      toast.error('Error al cargar clientes');
      return;
    }

    setClients(data || []);
    setFilteredClients(data || []);
  };

  const handleClientSearch = (searchTerm: string) => {
    setClientSearch(searchTerm);
    if (searchTerm.length === 0) {
      setFilteredClients([]);
      setShowClientDropdown(false);
      setSelectedClient(null);
      form.setValue('client_id', '');
      return;
    }

    const filtered = clients.filter(client =>
      client.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.dni.includes(searchTerm) ||
      client.phone.includes(searchTerm)
    );
    
    setFilteredClients(filtered);
    setShowClientDropdown(filtered.length > 0);
  };

  const selectClient = (client: Client) => {
    setSelectedClient(client);
    setClientSearch(client.full_name);
    setShowClientDropdown(false);
    form.setValue('client_id', client.id);
    console.log('Client selected:', client);
    console.log('client_id set to:', client.id);
  };

       const getMinimumPayment = () => {
    const formValues = form.getValues();
    const { amount, interest_rate, term_months, amortization_type, payment_frequency } = formValues;
    
    if (!amount || amount <= 0) return 0;
    
    // Para plazo indefinido no necesitamos term_months
    if (amortization_type !== 'indefinite' && (!term_months || term_months <= 0)) return 0;
    
         // Si no hay tasa de interés, el mínimo es solo el capital dividido por períodos
     if (!interest_rate || interest_rate <= 0) {
       return Math.ceil(amount / (amortization_type === 'indefinite' ? 1 : term_months));
     }
    
    // Calcular períodos totales según la frecuencia
    // El plazo ya está en la unidad correcta según la frecuencia seleccionada
    let totalPeriods = amortization_type === 'indefinite' ? 12 : term_months; // Para plazo indefinido usar 12 períodos como ejemplo
    let periodRate = interest_rate / 100; // Siempre tasa mensual
    
    switch (payment_frequency) {
      case 'daily':
        // Si el plazo es 12, son 12 días
        totalPeriods = term_months;
        // Para interés compuesto, convertir tasa mensual a diaria
        periodRate = Math.pow(1 + (interest_rate / 100), 1/30) - 1; // Tasa diaria basada en mensual
        break;
      case 'weekly':
        // Si el plazo es 12, son 12 semanas
        totalPeriods = term_months;
        // Para interés compuesto, convertir tasa mensual a semanal
        periodRate = Math.pow(1 + (interest_rate / 100), 1/4) - 1; // Tasa semanal basada en mensual
        break;
      case 'biweekly':
        // Si el plazo es 12, son 12 quincenas
        totalPeriods = term_months;
        // Para interés compuesto, convertir tasa mensual a quincenal
        periodRate = Math.pow(1 + (interest_rate / 100), 1/2) - 1; // Tasa quincenal basada en mensual
        break;
      case 'monthly':
      default:
        // Si el plazo es 12, son 12 meses
        totalPeriods = term_months;
        periodRate = interest_rate / 100; // Tasa mensual directa
        break;
    }

    let minimumPayment = 0;

         if (amortization_type === 'simple') {
       // Interés simple - el interés es mensual, no convertir a años
       let monthsEquivalent = term_months;
       switch (payment_frequency) {
         case 'daily':
           monthsEquivalent = term_months / 30; // Convertir días a meses
           break;
         case 'weekly':
           monthsEquivalent = term_months / 4; // Convertir semanas a meses
           break;
         case 'biweekly':
           monthsEquivalent = term_months / 2; // Convertir quincenas a meses
           break;
         case 'monthly':
         default:
           monthsEquivalent = term_months; // Ya está en meses
           break;
       }
       
       const totalInterest = amount * (interest_rate / 100) * monthsEquivalent;
       const totalAmount = amount + totalInterest;
       minimumPayment = totalAmount / totalPeriods;
     } else if (amortization_type === 'french') {
       // Amortización francesa - Cuota fija, capital creciente, interés decreciente
       // Usar la fórmula de anualidad para calcular la cuota fija
       if (periodRate > 0) {
         minimumPayment = amount * (periodRate * Math.pow(1 + periodRate, totalPeriods)) / (Math.pow(1 + periodRate, totalPeriods) - 1);
       } else {
         // Si no hay interés, es simplemente el capital dividido por períodos
         minimumPayment = amount / totalPeriods;
       }
     } else if (amortization_type === 'german') {
       // Amortización alemana - Cuota decreciente, usar la primera cuota como mínimo
       const principalPerPayment = amount / totalPeriods;
       const interestPayment = amount * periodRate;
       minimumPayment = principalPerPayment + interestPayment;
     } else if (amortization_type === 'american') {
       // Amortización americana - Solo intereses
       minimumPayment = amount * periodRate;
     } else if (amortization_type === 'indefinite') {
       // Plazo indefinido - Solo intereses
       minimumPayment = amount * periodRate;
     }
    
    // Redondear hacia arriba para evitar problemas con decimales muy pequeños
    return Math.ceil(minimumPayment);
  };

  const calculateAmortization = () => {
    const formValues = form.getValues();
    const { amount, interest_rate, term_months, amortization_type, payment_frequency, first_payment_date, fixed_payment_enabled, fixed_payment_amount, closing_costs } = formValues;
    
    // Extraer el día original del mes de la primera fecha de pago
    const originalDay = parseInt(first_payment_date.split('-')[2]);
    
    if (!amount || !interest_rate) {
      toast.error('Complete todos los campos requeridos para calcular');
      return;
    }

    // Para plazo indefinido no necesitamos term_months
    if (amortization_type !== 'indefinite' && !term_months) {
      toast.error('Complete todos los campos requeridos para calcular');
      return;
    }

    if (!selectedClient) {
      toast.error('Debe seleccionar un cliente');
      return;
    }

    // Validate fixed payment if enabled
    if (fixed_payment_enabled) {
      const minimumPayment = getMinimumPayment();
      if (!fixed_payment_amount || fixed_payment_amount <= 0) {
        toast.error('Debe ingresar una cuota fija válida');
        return;
      }
      // Permitir un margen de tolerancia del 1% para evitar problemas con decimales
      const tolerance = minimumPayment * 0.01;
      if (fixed_payment_amount < (minimumPayment - tolerance)) {
        toast.error(`La cuota fija debe ser al menos RD$${minimumPayment}`);
        return;
      }
    }



    // Función para obtener el siguiente día hábil considerando días excluidos
    const getNextBusinessDay = (currentDate: Date, frequency: string, originalDay?: number) => {
      let nextDate = new Date(currentDate);
      
      // Primero calcular la fecha base según la frecuencia
      switch (frequency) {
        case 'daily':
          nextDate.setDate(nextDate.getDate() + 1);
          break;
        case 'weekly':
          nextDate.setDate(nextDate.getDate() + 7);
          break;
        case 'biweekly':
          nextDate.setDate(nextDate.getDate() + 15);
          break;
        case 'monthly':
        default:
          // Para frecuencia mensual, usar el día original del mes si está disponible
          if (originalDay !== undefined) {
            // Usar el día original (ej: 18) en lugar del día actual
            nextDate.setMonth(nextDate.getMonth() + 1);
            nextDate.setDate(originalDay);
            
            // Si el día del mes no existe en el siguiente mes, usar el último día del mes
            const nextMonthDay = nextDate.getDate();
            if (nextMonthDay !== originalDay) {
              // El día cambió, significa que no existe en el siguiente mes
              // Volver al mes anterior y usar el último día
              nextDate.setMonth(nextDate.getMonth() - 1);
              nextDate.setDate(0); // Esto establece el último día del mes anterior
              nextDate.setMonth(nextDate.getMonth() + 1);
            }
          } else {
            // Fallback: mantener el mismo día del mes
            const currentDay = nextDate.getDate();
            nextDate.setMonth(nextDate.getMonth() + 1);
            
            // Si el día del mes no existe en el siguiente mes, usar el último día del mes
            const nextMonthDay = nextDate.getDate();
            if (nextMonthDay !== currentDay) {
              // El día cambió, significa que no existe en el siguiente mes
              // Volver al mes anterior y usar el último día
              nextDate.setMonth(nextDate.getMonth() - 1);
              nextDate.setDate(0); // Esto establece el último día del mes anterior
              nextDate.setMonth(nextDate.getMonth() + 1);
            }
          }
          break;
      }
      
      // Aplicar ajuste de días excluidos usando la función existente
      return adjustDateForExcludedDays(nextDate);
    };

    // Calcular períodos totales según la frecuencia
    // El plazo ya está en la unidad correcta según la frecuencia seleccionada
    let totalPeriods = amortization_type === 'indefinite' ? 1 : term_months; // Para plazo indefinido usar 1 período ya que no tiene plazo real
    let periodRate = interest_rate / 100; // Siempre tasa mensual
    
    switch (payment_frequency) {
      case 'daily':
        // Si el plazo es 12, son 12 días
        totalPeriods = amortization_type === 'indefinite' ? 1 : term_months;
        // Para interés compuesto, convertir tasa mensual a diaria
        periodRate = Math.pow(1 + (interest_rate / 100), 1/30) - 1; // Tasa diaria basada en mensual
        break;
      case 'weekly':
        // Si el plazo es 12, son 12 semanas
        totalPeriods = amortization_type === 'indefinite' ? 1 : term_months;
        // Para interés compuesto, convertir tasa mensual a semanal
        periodRate = Math.pow(1 + (interest_rate / 100), 1/4) - 1; // Tasa semanal basada en mensual
        break;
      case 'biweekly':
        // Si el plazo es 12, son 12 quincenas
        totalPeriods = amortization_type === 'indefinite' ? 1 : term_months;
        // Para interés compuesto, convertir tasa mensual a quincenal
        periodRate = Math.pow(1 + (interest_rate / 100), 1/2) - 1; // Tasa quincenal basada en mensual
        break;
      case 'monthly':
      default:
        // Si el plazo es 12, son 12 meses
        totalPeriods = amortization_type === 'indefinite' ? 1 : term_months;
        periodRate = interest_rate / 100; // Tasa mensual directa
        break;
    }

    let monthlyPayment = 0;
    let totalAmount = 0;
    let schedule: AmortizationRow[] = [];

         if (amortization_type === 'simple') {
       // Interés simple - el interés es mensual, no convertir a años
       let monthsEquivalent = term_months;
       switch (payment_frequency) {
         case 'daily':
           monthsEquivalent = term_months / 30; // Convertir días a meses
           break;
         case 'weekly':
           monthsEquivalent = term_months / 4; // Convertir semanas a meses
           break;
         case 'biweekly':
           monthsEquivalent = term_months / 2; // Convertir quincenas a meses
           break;
         case 'monthly':
         default:
           monthsEquivalent = term_months; // Ya está en meses
           break;
       }
       
       const totalInterest = amount * (interest_rate / 100) * monthsEquivalent;
       totalAmount = amount + totalInterest;
       monthlyPayment = fixed_payment_enabled && fixed_payment_amount ? fixed_payment_amount : totalAmount / totalPeriods;
       
       // Si hay cuota fija, recalcular el interés total basado en la cuota
       if (fixed_payment_enabled && fixed_payment_amount) {
         totalAmount = fixed_payment_amount * totalPeriods;
         const newTotalInterest = totalAmount - amount;
         
         // Generar tabla con interés distribuido
         let remainingBalance = amount;
         const interestPerPayment = newTotalInterest / totalPeriods;
         
         for (let i = 1; i <= totalPeriods; i++) {
           let paymentDate: Date;
           
          if (i === 1) {
            // Calcular la primera fecha de cobro basándose en la fecha de inicio + frecuencia
            const startDate = createLocalDate(first_payment_date);
            const firstPaymentDate = new Date(startDate);
            
            // Ajustar la primera fecha de cobro según la frecuencia
            switch (payment_frequency) {
              case 'daily':
                firstPaymentDate.setDate(startDate.getDate() + 1);
                break;
              case 'weekly':
                firstPaymentDate.setDate(startDate.getDate() + 7);
                break;
              case 'biweekly':
                firstPaymentDate.setDate(startDate.getDate() + 14);
                break;
              case 'monthly':
              default:
                firstPaymentDate.setMonth(startDate.getMonth() + 1);
                break;
            }
            
            paymentDate = adjustDateForExcludedDays(firstPaymentDate);
          } else {
             // Usar la función para calcular el siguiente día hábil
             const previousDate = schedule[i - 2] ? createLocalDate(schedule[i - 2].date) : createLocalDate(first_payment_date);
             paymentDate = getNextBusinessDay(previousDate, payment_frequency);
           }
           
           const principalPayment = fixed_payment_amount - interestPerPayment;
           const isLastPayment = i === totalPeriods;
           const totalPaymentWithClosingCosts = isLastPayment ? fixed_payment_amount + (closing_costs || 0) : fixed_payment_amount;
           
           schedule.push({
             payment: i,
             date: paymentDate.toISOString().split('T')[0],
             interest: interestPerPayment,
             principal: principalPayment,
             totalPayment: totalPaymentWithClosingCosts,
             remainingBalance: Math.max(0, remainingBalance - principalPayment)
           });
           
           remainingBalance -= principalPayment;
         }
       } else {
         // Generar tabla de amortización normal para interés simple
         let remainingBalance = amount;
         const interestPerPayment = totalInterest / totalPeriods;
         const principalPerPayment = amount / totalPeriods;
         
         for (let i = 1; i <= totalPeriods; i++) {
           let paymentDate: Date;
           
          if (i === 1) {
            // Calcular la primera fecha de cobro basándose en la fecha de inicio + frecuencia
            const startDate = createLocalDate(first_payment_date);
            const firstPaymentDate = new Date(startDate);
            
            // Ajustar la primera fecha de cobro según la frecuencia
            switch (payment_frequency) {
              case 'daily':
                firstPaymentDate.setDate(startDate.getDate() + 1);
                break;
              case 'weekly':
                firstPaymentDate.setDate(startDate.getDate() + 7);
                break;
              case 'biweekly':
                firstPaymentDate.setDate(startDate.getDate() + 14);
                break;
              case 'monthly':
              default:
                firstPaymentDate.setMonth(startDate.getMonth() + 1);
                break;
            }
            
            paymentDate = adjustDateForExcludedDays(firstPaymentDate);
          } else {
             // Usar la función para calcular el siguiente día hábil
             const previousDate = schedule[i - 2] ? createLocalDate(schedule[i - 2].date) : createLocalDate(first_payment_date);
             paymentDate = getNextBusinessDay(previousDate, payment_frequency, originalDay);
           }
           
           const isLastPayment = i === totalPeriods;
           const totalPaymentWithClosingCosts = isLastPayment ? monthlyPayment + (closing_costs || 0) : monthlyPayment;
           
           schedule.push({
             payment: i,
             date: paymentDate.toISOString().split('T')[0],
             interest: interestPerPayment,
             principal: principalPerPayment,
             totalPayment: totalPaymentWithClosingCosts,
             remainingBalance: Math.max(0, remainingBalance - principalPerPayment)
           });
           
           remainingBalance -= principalPerPayment;
         }
       }
     } else if (amortization_type === 'french') {
       // Amortización francesa - Cuota fija, capital creciente, interés decreciente
       // Calcular la cuota fija usando la fórmula de anualidad
       if (periodRate > 0) {
         monthlyPayment = amount * (periodRate * Math.pow(1 + periodRate, totalPeriods)) / (Math.pow(1 + periodRate, totalPeriods) - 1);
       } else {
         // Si no hay interés, es simplemente el capital dividido por períodos
         monthlyPayment = amount / totalPeriods;
       }
       
       let remainingBalance = amount;
       let totalPaid = 0;
       
       for (let i = 1; i <= totalPeriods; i++) {
         let paymentDate: Date;
         
          if (i === 1) {
            // Calcular la primera fecha de cobro basándose en la fecha de inicio + frecuencia
            const startDate = createLocalDate(first_payment_date);
            const firstPaymentDate = new Date(startDate);
            
            // Ajustar la primera fecha de cobro según la frecuencia
            switch (payment_frequency) {
              case 'daily':
                firstPaymentDate.setDate(startDate.getDate() + 1);
                break;
              case 'weekly':
                firstPaymentDate.setDate(startDate.getDate() + 7);
                break;
              case 'biweekly':
                firstPaymentDate.setDate(startDate.getDate() + 14);
                break;
              case 'monthly':
              default:
                firstPaymentDate.setMonth(startDate.getMonth() + 1);
                break;
            }
            
            paymentDate = adjustDateForExcludedDays(firstPaymentDate);
          } else {
           // Usar la función para calcular el siguiente día hábil
           const previousDate = schedule[i - 2] ? createLocalDate(schedule[i - 2].date) : createLocalDate(first_payment_date);
           paymentDate = getNextBusinessDay(previousDate, payment_frequency);
         }
         
         const interestPayment = remainingBalance * periodRate;
         const principalPayment = monthlyPayment - interestPayment;
         const actualPayment = monthlyPayment;
         const isLastPayment = i === totalPeriods;
         const totalPaymentWithClosingCosts = isLastPayment ? actualPayment + (closing_costs || 0) : actualPayment;
         
         totalPaid += totalPaymentWithClosingCosts;
         
         schedule.push({
           payment: i,
           date: paymentDate.toISOString().split('T')[0],
           interest: interestPayment,
           principal: principalPayment,
           totalPayment: totalPaymentWithClosingCosts,
           remainingBalance: Math.max(0, remainingBalance - principalPayment)
         });
         
         remainingBalance -= principalPayment;
       }
       
       totalAmount = totalPaid;
     } else if (amortization_type === 'german') {
       // Amortización alemana (insoluto) - Cuota decreciente
       // El capital se paga en partes iguales, el interés se calcula sobre el saldo insoluto
       const principalPerPayment = amount / totalPeriods;
       let remainingBalance = amount;
       let totalPaid = 0;
       
       for (let i = 1; i <= totalPeriods; i++) {
         let paymentDate: Date;
         
          if (i === 1) {
            // Calcular la primera fecha de cobro basándose en la fecha de inicio + frecuencia
            const startDate = createLocalDate(first_payment_date);
            const firstPaymentDate = new Date(startDate);
            
            // Ajustar la primera fecha de cobro según la frecuencia
            switch (payment_frequency) {
              case 'daily':
                firstPaymentDate.setDate(startDate.getDate() + 1);
                break;
              case 'weekly':
                firstPaymentDate.setDate(startDate.getDate() + 7);
                break;
              case 'biweekly':
                firstPaymentDate.setDate(startDate.getDate() + 14);
                break;
              case 'monthly':
              default:
                firstPaymentDate.setMonth(startDate.getMonth() + 1);
                break;
            }
            
            paymentDate = adjustDateForExcludedDays(firstPaymentDate);
          } else {
           // Usar la función para calcular el siguiente día hábil
           const previousDate = schedule[i - 2] ? createLocalDate(schedule[i - 2].date) : createLocalDate(first_payment_date);
           paymentDate = getNextBusinessDay(previousDate, payment_frequency);
         }
         
         const interestPayment = remainingBalance * periodRate;
         const actualPayment = principalPerPayment + interestPayment;
         const isLastPayment = i === totalPeriods;
         const totalPaymentWithClosingCosts = isLastPayment ? actualPayment + (closing_costs || 0) : actualPayment;
         totalPaid += totalPaymentWithClosingCosts;
         
         schedule.push({
           payment: i,
           date: paymentDate.toISOString().split('T')[0],
           interest: interestPayment,
           principal: principalPerPayment,
           totalPayment: totalPaymentWithClosingCosts,
           remainingBalance: Math.max(0, remainingBalance - principalPerPayment)
         });
         
         remainingBalance -= principalPerPayment;
       }
       
       totalAmount = totalPaid;
       monthlyPayment = totalAmount / totalPeriods; // Promedio de cuotas
       
     } else if (amortization_type === 'american') {
       // Amortización americana (línea de crédito) - Solo intereses, capital al final
       const interestPerPayment = amount * periodRate;
       let remainingBalance = amount;
       let totalPaid = 0;
       
       for (let i = 1; i <= totalPeriods; i++) {
         let paymentDate: Date;
         
          if (i === 1) {
            // Calcular la primera fecha de cobro basándose en la fecha de inicio + frecuencia
            const startDate = createLocalDate(first_payment_date);
            const firstPaymentDate = new Date(startDate);
            
            // Ajustar la primera fecha de cobro según la frecuencia
            switch (payment_frequency) {
              case 'daily':
                firstPaymentDate.setDate(startDate.getDate() + 1);
                break;
              case 'weekly':
                firstPaymentDate.setDate(startDate.getDate() + 7);
                break;
              case 'biweekly':
                firstPaymentDate.setDate(startDate.getDate() + 14);
                break;
              case 'monthly':
              default:
                firstPaymentDate.setMonth(startDate.getMonth() + 1);
                break;
            }
            
            paymentDate = adjustDateForExcludedDays(firstPaymentDate);
          } else {
           // Usar la función para calcular el siguiente día hábil
           const previousDate = schedule[i - 2] ? createLocalDate(schedule[i - 2].date) : createLocalDate(first_payment_date);
           paymentDate = getNextBusinessDay(previousDate, payment_frequency, originalDay);
         }
         
         const actualPayment = i === totalPeriods ? interestPerPayment + amount : interestPerPayment;
         const principalPayment = i === totalPeriods ? amount : 0;
         const isLastPayment = i === totalPeriods;
         const totalPaymentWithClosingCosts = isLastPayment ? actualPayment + (closing_costs || 0) : actualPayment;
         totalPaid += totalPaymentWithClosingCosts;
         
         schedule.push({
           payment: i,
           date: paymentDate.toISOString().split('T')[0],
           interest: interestPerPayment,
           principal: principalPayment,
           totalPayment: totalPaymentWithClosingCosts,
           remainingBalance: i === totalPeriods ? 0 : remainingBalance
         });
         
         if (i === totalPeriods) {
           remainingBalance = 0;
         }
       }
       
       totalAmount = totalPaid;
       monthlyPayment = interestPerPayment; // Cuota fija de intereses
       
    } else if (amortization_type === 'indefinite') {
      // Plazo indefinido - Solo intereses, sin fecha de vencimiento
      const interestPerPayment = amount * periodRate;
      
      // CORRECCIÓN: Calcular la primera fecha de pago correctamente
      // Para préstamos indefinidos, la primera cuota debe ser un período después de la fecha de inicio
      const startDate = createLocalDate(first_payment_date);
      const firstPaymentDate = new Date(startDate);
      
      // Ajustar la primera fecha de cobro según la frecuencia
      switch (payment_frequency) {
        case 'daily':
          firstPaymentDate.setDate(startDate.getDate() + 1);
          break;
        case 'weekly':
          firstPaymentDate.setDate(startDate.getDate() + 7);
          break;
        case 'biweekly':
          firstPaymentDate.setDate(startDate.getDate() + 14);
          break;
        case 'monthly':
        default:
          // Usar setFullYear para preservar el día exacto y evitar problemas de zona horaria
          firstPaymentDate.setFullYear(startDate.getFullYear(), startDate.getMonth() + 1, startDate.getDate());
          break;
      }
      
      const paymentDate = adjustDateForExcludedDays(firstPaymentDate);
      
      // Para plazo indefinido, mostrar solo 1 período con "1/X"
      const totalPaymentWithClosingCosts = interestPerPayment + (closing_costs || 0);
      schedule.push({
        payment: '1/X', // Mostrar 1/X para indicar que es indefinido
        date: paymentDate.toISOString().split('T')[0],
        interest: interestPerPayment,
        principal: 0,
        totalPayment: totalPaymentWithClosingCosts,
        remainingBalance: amount
      });
      
      totalAmount = amount + interestPerPayment;
      monthlyPayment = interestPerPayment;
    }

    const totalInterest = totalAmount - amount;
    const usdAmount = amount / 58.5; // Conversión a USD

    setCalculatedValues({
      monthlyPayment: Math.round(monthlyPayment * 100) / 100,
      totalAmount: Math.round(totalAmount * 100) / 100,
      totalInterest: Math.round(totalInterest * 100) / 100,
      usdAmount: Math.round(usdAmount * 100) / 100
    });

    setAmortizationSchedule(schedule);
    setShowAmortizationTable(true);
    
    // Mostrar mensaje informativo sobre días excluidos si los hay
    if (excludedDays.length > 0) {
      toast.success(`Préstamo calculado exitosamente. Días excluidos: ${excludedDays.join(', ')}`);
    } else {
      toast.success('Préstamo calculado exitosamente');
    }
  };

  const handleExcludedDayChange = (day: string, checked: boolean) => {
    if (checked) {
      setExcludedDays(prev => [...prev, day]);
    } else {
      setExcludedDays(prev => prev.filter(d => d !== day));
    }
  };

  const handleFixQuota = () => {
    const amount = form.getValues('amount');
    const months = form.getValues('term_months');
    const quotaRD = form.getValues('fixed_payment_amount');
    
    if (amount <= 0 || months <= 0) {
      toast.error('Debe ingresar el monto y plazo antes de fijar la cuota');
      return;
    }
    
    let newInterestRate = 0;
    
    // Usar la cuota fija
    if (quotaRD > 0) {
      newInterestRate = calculateInterestFromQuota(amount, quotaRD, months);
    } else {
      toast.error('Debe ingresar una cuota fija');
      return;
    }
    
    // Actualizar la tasa de interés
    form.setValue('interest_rate', newInterestRate);
    setIsFixingQuota(true);
    
    toast.success(`Tasa de interés ajustada a ${newInterestRate}% para la cuota fijada`);
    
    // Recalcular para asegurar consistencia
    setTimeout(() => {
      calculateAmortization();
      setIsFixingQuota(false);
    }, 100);
  };

  const onSubmit = async (data: LoanFormData) => {
    console.log('=== ONSUBMIT CALLED ===');
    console.log('Form data:', data);
    console.log('Selected client:', selectedClient);
    console.log('User:', user);
    console.log('Company ID:', companyId);
    console.log('Form valid:', form.formState.isValid);
    console.log('Form errors:', form.formState.errors);
    
    if (!user || !companyId || !selectedClient) {
      console.log('Validation failed: missing user, companyId, or selectedClient');
      toast.error('Debe seleccionar un cliente');
      return;
    }

    if (calculatedValues.monthlyPayment === 0) {
      toast.error('Debe calcular el préstamo antes de crearlo');
      return;
    }

    // Validaciones adicionales para información adicional
    if (data.guarantor_required && !data.guarantor_name) {
      toast.error('Debe ingresar el nombre del codeudor cuando se requiere garantía');
      return;
    }

    if (data.closing_costs < 0) {
      toast.error('Los gastos de cierre no pueden ser negativos');
      return;
    }

    if (data.minimum_payment_percentage < 0 || data.minimum_payment_percentage > 100) {
      toast.error('El porcentaje de pago mínimo debe estar entre 0% y 100%');
      return;
    }

    // Validar límites de monto y plazo según configuración de la empresa
    if (companySettings) {
      if (companySettings.min_loan_amount !== null && companySettings.min_loan_amount !== undefined && data.amount < companySettings.min_loan_amount) {
        toast.error(`El monto mínimo permitido es RD$${companySettings.min_loan_amount.toLocaleString()}`);
        form.setError('amount', {
          type: 'manual',
          message: `El monto mínimo permitido es RD$${companySettings.min_loan_amount.toLocaleString()}`
        });
        return;
      }
      if (companySettings.max_loan_amount !== null && companySettings.max_loan_amount !== undefined && data.amount > companySettings.max_loan_amount) {
        toast.error(`El monto máximo permitido es RD$${companySettings.max_loan_amount.toLocaleString()}`);
        form.setError('amount', {
          type: 'manual',
          message: `El monto máximo permitido es RD$${companySettings.max_loan_amount.toLocaleString()}`
        });
        return;
      }
      if (companySettings.min_term_months !== null && companySettings.min_term_months !== undefined && data.term_months < companySettings.min_term_months) {
        toast.error(`El plazo mínimo permitido es ${companySettings.min_term_months} meses`);
        form.setError('term_months', {
          type: 'manual',
          message: `El plazo mínimo permitido es ${companySettings.min_term_months} meses`
        });
        return;
      }
      if (companySettings.max_term_months !== null && companySettings.max_term_months !== undefined && data.term_months > companySettings.max_term_months) {
        toast.error(`El plazo máximo permitido es ${companySettings.max_term_months} meses`);
        form.setError('term_months', {
          type: 'manual',
          message: `El plazo máximo permitido es ${companySettings.max_term_months} meses`
        });
        return;
      }
    }

    // Evitar múltiples envíos
    if (loading) return;

    setLoading(true);
    try {
      // Usar la fecha de inicio seleccionada por el usuario
      const startDate = createLocalDate(data.first_payment_date);
      const endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + data.term_months);
      
      // Calcular la primera fecha de pago basándose en la fecha de inicio + frecuencia
      const startDateForCalculation = createLocalDate(data.first_payment_date);
      const firstPaymentDate = new Date(startDateForCalculation);
      
      // Ajustar la primera fecha de cobro según la frecuencia
      switch (data.payment_frequency) {
        case 'daily':
          firstPaymentDate.setDate(startDateForCalculation.getDate() + 1);
          break;
        case 'weekly':
          firstPaymentDate.setDate(startDateForCalculation.getDate() + 7);
          break;
        case 'biweekly':
          firstPaymentDate.setDate(startDateForCalculation.getDate() + 14);
          break;
        case 'monthly':
          // Preservar el día del mes al avanzar un mes
          const originalDay = startDateForCalculation.getDate();
          firstPaymentDate.setFullYear(startDateForCalculation.getFullYear(), startDateForCalculation.getMonth() + 1, originalDay);
          break;
        case 'quarterly':
          firstPaymentDate.setMonth(startDateForCalculation.getMonth() + 3);
          break;
        case 'yearly':
          firstPaymentDate.setFullYear(startDateForCalculation.getFullYear() + 1);
          break;
        default:
          // Preservar el día del mes al avanzar un mes
          const originalDayDefault = startDateForCalculation.getDate();
          firstPaymentDate.setFullYear(startDateForCalculation.getFullYear(), startDateForCalculation.getMonth() + 1, originalDayDefault);
      }
      
      // Formatear fechas correctamente para evitar problemas de zona horaria
      const startDateFormatted = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}`;
      const firstPaymentDateFormatted = `${firstPaymentDate.getFullYear()}-${String(firstPaymentDate.getMonth() + 1).padStart(2, '0')}-${String(firstPaymentDate.getDate()).padStart(2, '0')}`;
      
      console.log('🔍 LoanForm: Fecha de inicio seleccionada:', data.first_payment_date);
      console.log('🔍 LoanForm: Fecha de inicio que se enviará:', startDateFormatted);
      console.log('🔍 LoanForm: Fecha de primera cuota calculada:', firstPaymentDateFormatted);
      console.log('🔍 LoanForm: Frecuencia de pago:', data.payment_frequency);

      const loanData = {
        client_id: data.client_id,
        amount: data.amount,
        interest_rate: data.interest_rate,
        term_months: data.amortization_type === 'indefinite' ? 1 : data.term_months, // Para indefinidos usar 1
        loan_type: data.loan_type,
        purpose: data.comments || null,
        collateral: data.guarantor_required ? 'Garantía requerida' : null,
        loan_officer_id: companyId,
        monthly_payment: Math.round(calculatedValues.monthlyPayment),
        total_amount: Math.round(calculatedValues.totalAmount),
        remaining_balance: Math.round(calculatedValues.totalAmount),
        start_date: startDateFormatted, // Fecha de creación del préstamo (formateada como local)
        end_date: `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`,
        next_payment_date: firstPaymentDateFormatted, // Fecha de la primera cuota (calculada según frecuencia, formateada como local)
        first_payment_date: data.first_payment_date, // Fecha de inicio del préstamo (lo que seleccionó el usuario)
        status: data.loan_started ? 'active' : 'pending',
        guarantor_name: data.guarantor_name || null,
        guarantor_phone: data.guarantor_phone || null,
        guarantor_dni: data.guarantor_dni || null,
        notes: data.notes || null,
        // Campos de información adicional
        excluded_days: excludedDays,
        closing_costs: Math.round(data.closing_costs || 0),
        portfolio_id: data.portfolio === 'none' || data.portfolio === '' ? null : data.portfolio,
        amortization_type: data.amortization_type,
        payment_frequency: data.payment_frequency,
        minimum_payment_enabled: data.minimum_payment,
        minimum_payment_type: data.minimum_payment_type,
        minimum_payment_percentage: data.minimum_payment_percentage,
        late_fee_enabled: data.late_fee_enabled,
        late_fee_rate: data.late_fee_rate,
        grace_period_days: data.grace_period_days,
        max_late_fee: Math.round(data.max_late_fee || 0),
        late_fee_calculation_type: data.late_fee_calculation_type,
        add_expense_enabled: data.add_expense,
        fixed_payment_enabled: data.fixed_payment_enabled,
        fixed_payment_amount: Math.round(data.fixed_payment_amount || 0),
      };

      console.log('Loan data to insert:', loanData);
      
      // Verificar campos UUID antes de enviar
      console.log('UUID fields check:');
      console.log('client_id:', loanData.client_id, 'type:', typeof loanData.client_id);
      console.log('loan_officer_id:', loanData.loan_officer_id, 'type:', typeof loanData.loan_officer_id);
      console.log('portfolio_id:', loanData.portfolio_id, 'type:', typeof loanData.portfolio_id);
      
      const { data: insertedLoan, error } = await supabase
        .from('loans')
        .insert([loanData])
        .select()
        .single();

      if (error) {
        console.error('Database error:', error);
        throw error;
      }

      // Generar las cuotas originales del préstamo
      console.log('Generando cuotas originales para el préstamo:', insertedLoan.id);
      await generateOriginalInstallments(insertedLoan, data);

      // Si hay garantía, guardarla
      if (data.guarantor_required && guaranteeData.guarantee_type) {
        try {
          const guaranteeInsert = {
            loan_id: insertedLoan.id,
            guarantee_type: guaranteeData.guarantee_type,
            status: guaranteeData.status || 'available',
            process: guaranteeData.process || 'in_warehouse',
            holder: guaranteeData.holder || null,
            notes: guaranteeData.notes || null,
            created_by: user?.id || null,
            // Campos de vehículo
            vehicle_type: guaranteeData.vehicle_type || null,
            brand: guaranteeData.brand || null,
            model: guaranteeData.model || null,
            year: guaranteeData.year || null,
            automotive_power: guaranteeData.automotive_power || null,
            chassis: guaranteeData.chassis || null,
            engine_series: guaranteeData.engine_series || null,
            doors: guaranteeData.doors || null,
            cylinders: guaranteeData.cylinders || null,
            color: guaranteeData.color || null,
            license_plate: guaranteeData.license_plate || null,
            // Campos de edificaciones
            building_type: guaranteeData.building_type || null,
            address: guaranteeData.address || null,
            square_meters: guaranteeData.square_meters || null,
            construction_year: guaranteeData.construction_year || null,
            property_type: guaranteeData.property_type || null,
            property_number: guaranteeData.property_number || null,
            // Campos de otros
            other_type: guaranteeData.other_type || null,
            other_description: guaranteeData.other_description || null,
            // Precio de venta
            sale_price: guaranteeData.sale_price || null,
            sale_date: guaranteeData.sale_date || null,
            sale_down_payment: guaranteeData.sale_down_payment || null,
            sale_minimum_down_payment: guaranteeData.sale_minimum_down_payment || null,
            // Precio de compra
            purchase_date: guaranteeData.purchase_date || null,
            purchase_cost: guaranteeData.purchase_cost || null,
            purchase_invoice_url: guaranteeData.purchase_invoice_url || null,
            supplier_id: guaranteeData.supplier_id || null,
          };

          const { error: guaranteeError } = await supabase
            .from('guarantees')
            .insert([guaranteeInsert]);

          if (guaranteeError) {
            console.error('Error guardando garantía:', guaranteeError);
            toast.warning('Préstamo creado pero hubo un error al guardar la garantía');
          } else {
            console.log('Garantía guardada exitosamente');
          }
        } catch (guaranteeErr) {
          console.error('Error al guardar garantía:', guaranteeErr);
          toast.warning('Préstamo creado pero hubo un error al guardar la garantía');
        }
      }

      toast.success('Préstamo creado exitosamente');
      
      // Preguntar si quiere generar documentos
      setCreatedLoanId(insertedLoan.id);
      setShowGenerateDocumentsDialog(true);
    } catch (error) {
      console.error('Error creating loan:', error);
      toast.error('Error al crear el préstamo');
    } finally {
      setLoading(false);
    }
  };

  const copyAmortizationTable = () => {
    const headers = ['CUOTA', 'FECHA', 'INTERÉS', 'CAPITAL', 'A PAGAR', 'CAPITAL RESTANTE'];
    const rows = amortizationSchedule.map(row => [
      typeof row.payment === 'string' ? row.payment : `${row.payment}/${amortizationSchedule.length}`,
      row.date,
      formatCurrency(row.interest),
      formatCurrency(row.principal),
      formatCurrency(row.totalPayment),
      formatCurrency(row.remainingBalance)
    ]);
    
    const tableText = [headers.join('\t'), ...rows.map(row => row.join('\t'))].join('\n');
    navigator.clipboard.writeText(tableText);
    toast.success('Tabla copiada al portapapeles');
  };

  const printAmortizationTable = () => {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      const tableHTML = `
        <html>
          <head>
            <title>Tabla de Amortización</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 20px; }
              .header { text-align: center; margin-bottom: 30px; }
              table { width: 100%; border-collapse: collapse; }
              th, td { border: 1px solid #ddd; padding: 8px; text-align: center; }
              th { background-color: #3b82f6; color: white; }
              .totals { background-color: #f8f9fa; font-weight: bold; }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>Tabla de Amortización</h1>
              <p>Cliente: ${selectedClient?.full_name}</p>
              <p>Monto: {formatCurrency(form.getValues('amount'))}</p>
              <p>Tasa: ${form.getValues('interest_rate')}% | Plazo: ${form.getValues('term_months')} meses</p>
            </div>
            <table>
              <thead>
                <tr>
                  <th>CUOTA</th>
                  <th>FECHA</th>
                  <th>INTERÉS</th>
                  <th>CAPITAL</th>
                  <th>A PAGAR</th>
                  <th>CAPITAL RESTANTE</th>
                </tr>
              </thead>
              <tbody>
                ${amortizationSchedule.map(row => `
                  <tr>
                    <td>${typeof row.payment === 'string' ? row.payment : `${row.payment}/${amortizationSchedule.length}`}</td>
                    <td>${row.date}</td>
                    <td>${formatCurrencyNumber(row.interest)}</td>
                    <td>${formatCurrencyNumber(row.principal)}</td>
                    <td>${formatCurrencyNumber(row.totalPayment)}</td>
                    <td>${formatCurrencyNumber(row.remainingBalance)}</td>
                  </tr>
                `).join('')}
                ${form.getValues('amortization_type') !== 'indefinite' ? `
                <tr class="totals">
                  <td colspan="2">TOTALES</td>
                  <td>${formatCurrencyNumber(calculatedValues.totalInterest)}</td>
                  <td>${formatCurrencyNumber(form.getValues('amount'))}</td>
                  <td>${formatCurrencyNumber(calculatedValues.totalAmount)}</td>
                  <td>RD$0.00</td>
                </tr>
                ` : ''}
              </tbody>
            </table>
          </body>
        </html>
      `;
      printWindow.document.write(tableHTML);
      printWindow.document.close();
      printWindow.print();
    }
  };

  // Calcular USD automáticamente
  useEffect(() => {
    const amount = form.watch('amount');
    if (amount) {
      setCalculatedValues(prev => ({
        ...prev,
        usdAmount: Math.round((amount / 58.5) * 100) / 100
      }));
    }
  }, [form.watch('amount')]);

  // Recalcular tasa de interés cuando cambie la cuota fija
  useEffect(() => {
    const fixedPaymentEnabled = form.watch('fixed_payment_enabled');
    const fixedPaymentAmount = form.watch('fixed_payment_amount');
    const amount = form.watch('amount');
    const term_months = form.watch('term_months');
    
    if (fixedPaymentEnabled && fixedPaymentAmount && amount > 0 && term_months > 0) {
      const newInterestRate = calculateInterestFromQuota(amount, fixedPaymentAmount, term_months);
      form.setValue('interest_rate', newInterestRate);
      
      // Mostrar mensaje informativo
      toast.success(`Tasa de interés ajustada automáticamente a ${newInterestRate.toFixed(2)}% para la cuota fija de ${formatCurrency(fixedPaymentAmount)}`);
    } else if (!fixedPaymentEnabled) {
      // Si se desactiva la cuota fija, limpiar el campo de cuota fija
      form.setValue('fixed_payment_amount', 0);
    }
  }, [form.watch('fixed_payment_amount'), form.watch('fixed_payment_enabled'), form.watch('amount'), form.watch('term_months')]);

  // Actualizar el esquema cuando cambien los días excluidos
  useEffect(() => {
    form.setValue('excluded_days', excludedDays);
  }, [excludedDays, form]);

  // Actualizar la fecha de primera cuota cuando cambie la frecuencia
  useEffect(() => {
    const frequency = form.watch('payment_frequency');
    const startDate = form.watch('first_payment_date');
    if (startDate) {
      const newFirstPaymentDate = calculateFirstPaymentDate(frequency, startDate);
      // No actualizar automáticamente, solo mostrar la fecha calculada
      console.log('🔍 Fecha de primera cuota calculada:', newFirstPaymentDate);
    }
  }, [form.watch('payment_frequency'), form.watch('first_payment_date')]);

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header responsive */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4">
        <Button variant="outline" onClick={onBack} className="w-full sm:w-auto">
          <ArrowLeft className="h-4 w-4 mr-2" />
          VOLVER
        </Button>
        <div className="flex-1 text-center sm:text-left">
          <h2 className="text-xl md:text-2xl font-bold">CREAR PRÉSTAMO</h2>
          <p className="text-blue-600 cursor-pointer text-sm md:text-base">¿No sabes como crear un préstamo?</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 md:gap-6">
        <div className="space-y-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {/* Información Principal */}
              <Card>
                                 <CardHeader className="bg-blue-500 text-white">
                   <CardTitle className="text-base sm:text-lg">INFORMACIÓN PRINCIPAL</CardTitle>
                 </CardHeader>
                                  <CardContent className="space-y-3 sm:space-y-4 pt-4 sm:pt-6">
                    {/* Búsqueda de Cliente */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <FormLabel>Cliente:</FormLabel>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => window.location.href = '/clientes/nuevo'}
                        className="flex items-center gap-1 text-xs"
                      >
                        <Plus className="h-3 w-3" />
                        Crear Cliente
                      </Button>
                    </div>
                    <div className="relative">
                      <Input
                        placeholder="Buscar cliente por nombre..."
                        value={clientSearch}
                        onChange={(e) => handleClientSearch(e.target.value)}
                        className="w-full"
                      />
                      
                      {showClientDropdown && (
                        <div className="absolute top-full left-0 right-0 bg-white border border-gray-300 rounded-md shadow-lg z-20 max-h-60 overflow-y-auto">
                          {filteredClients.map((client) => (
                            <div
                              key={client.id}
                              className="p-3 hover:bg-gray-100 cursor-pointer border-b"
                              onClick={() => selectClient(client)}
                            >
                              <div className="font-medium">{client.full_name}</div>
                              <div className="text-sm text-gray-600">{client.dni} • {client.phone}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    
                    {selectedClient && (
                      <div className="flex items-center gap-2 p-2 bg-blue-50 rounded">
                        <User className="h-4 w-4 text-blue-600" />
                        <span className="font-medium">{selectedClient.full_name}</span>
                        <Badge variant="outline">{selectedClient.dni}</Badge>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <FormLabel>RD$</FormLabel>
                      <FormField
                        control={form.control}
                        name="amount"
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <Input
                                type="number"
                                placeholder="0"
                                value={field.value || ''}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  // Permitir decimales con hasta 2 decimales
                                  if (value === '' || /^\d*\.?\d{0,2}$/.test(value)) {
                                    const numValue = value === '' ? 0 : parseFloat(value) || 0;
                                    field.onChange(numValue);
                                  }
                                }}
                                onFocus={() => setIsAmountFocused(true)}
                                onBlur={() => {
                                  setIsAmountFocused(false);
                                  // Validar cuando el campo pierde el foco
                                  if (companySettings) {
                                    const min = companySettings.min_loan_amount;
                                    const max = companySettings.max_loan_amount;
                                    const currentValue = form.getValues('amount');
                                    if (min !== null && min !== undefined && currentValue < min) {
                                      form.setError('amount', {
                                        type: 'manual',
                                        message: `El monto mínimo permitido es RD$${min.toLocaleString()}`
                                      });
                                    } else if (max !== null && max !== undefined && currentValue > max) {
                                      form.setError('amount', {
                                        type: 'manual',
                                        message: `El monto máximo permitido es RD$${max.toLocaleString()}`
                                      });
                                    } else {
                                      form.clearErrors('amount');
                                    }
                                  }
                                  field.onBlur();
                                }}
                                className=""
                              />
                            </FormControl>
                            
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div>
                      <FormLabel>Cuota</FormLabel>
                      {form.watch('fixed_payment_enabled') ? (
                        <FormField
                          control={form.control}
                          name="fixed_payment_amount"
                          render={({ field }) => {
                            const minimumPayment = getMinimumPayment();
                            // Permitir un margen de tolerancia del 1% para evitar problemas con decimales
                            const tolerance = minimumPayment * 0.01;
                            const isBelow = field.value && field.value < (minimumPayment - tolerance);
                            
                            return (
                              <FormItem>
                                <FormControl>
                                  <div className="relative">
                                    <Input
                                      type="number"
                                      placeholder="0"
                                      value={field.value || ''}
                                      onChange={(e) => {
                                        const value = e.target.value;
                                        // Permitir decimales con hasta 2 decimales
                                        if (value === '' || /^\d*\.?\d{0,2}$/.test(value)) {
                                          const numValue = value === '' ? 0 : parseFloat(value) || 0;
                                          field.onChange(numValue);
                                        }
                                      }}
                                      onKeyPress={(e) => {
                                        // Permitir solo números, punto decimal y teclas de control
                                        const char = String.fromCharCode(e.which);
                                        if (!/[\d.]/.test(char) && e.which !== 8 && e.which !== 9 && e.which !== 37 && e.which !== 39) {
                                          e.preventDefault();
                                        }
                                      }}
                                      className={`h-10 ${isBelow ? "border-red-500 bg-red-50" : ""}`}
                                    />
                                    {isBelow && minimumPayment > 0 && (
                                      <span className="text-red-500 text-xs mt-1 block">
                                        Mínimo recomendado: RD${minimumPayment}
                                      </span>
                                    )}
                                    
                                  </div>
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            );
                          }}
                        />
                      ) : (
                        <Input
                          type="text"
                          value=""
                          disabled
                          className="h-10 bg-gray-100 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          placeholder="0"
                        />
                      )}
                    </div>

                    <div>
                      <FormLabel>FIJAR CUOTA</FormLabel>
                      <div className="flex items-center justify-center h-10">
                        <FormField
                          control={form.control}
                          name="fixed_payment_enabled"
                          render={({ field }) => (
                            <FormItem>
                              <FormControl>
                                <input
                                  type="checkbox"
                                  checked={field.value}
                                  onChange={field.onChange}
                                  className="rounded scale-125"
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>
                  </div>


                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <FormLabel className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                        <span>Porcentaje interés:</span>
                        <span className="text-blue-500 cursor-pointer text-sm">Lista de interés</span>
                      </FormLabel>
                      <FormField
                        control={form.control}
                        name="interest_rate"
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <Input
                                type="number"
                                placeholder="0"
                                value={field.value || ''}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  // Permitir decimales con hasta 2 decimales
                                  if (value === '' || /^\d*\.?\d{0,2}$/.test(value)) {
                                    const numValue = value === '' ? 0 : parseFloat(value) || 0;
                                    field.onChange(numValue);
                                  }
                                }}
                                className=""
                              />
                            </FormControl>
                            
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                                         {form.watch('amortization_type') !== 'indefinite' && (
                       <div>
                         <FormLabel>Plazo:</FormLabel>
                         <FormField
                           control={form.control}
                           name="term_months"
                           render={({ field }) => (
                             <FormItem>
                               <FormControl>
                                 <Input
                                   type="number"
                                   placeholder="0"
                                   value={field.value || ''}
                                   onChange={(e) => {
                                     const value = e.target.value;
                                     if (value === '' || /^\d*$/.test(value)) {
                                       field.onChange(value === '' ? 0 : parseInt(value) || 0);
                                     }
                                   }}
                                   onFocus={() => setIsTermFocused(true)}
                                   onBlur={() => {
                                     setIsTermFocused(false);
                                     // Validar cuando el campo pierde el foco
                                     if (companySettings) {
                                       const min = companySettings.min_term_months;
                                       const max = companySettings.max_term_months;
                                       const currentValue = form.getValues('term_months');
                                       if (min !== null && min !== undefined && currentValue < min) {
                                         form.setError('term_months', {
                                           type: 'manual',
                                           message: `El plazo mínimo permitido es ${min} meses`
                                         });
                                       } else if (max !== null && max !== undefined && currentValue > max) {
                                         form.setError('term_months', {
                                           type: 'manual',
                                           message: `El plazo máximo permitido es ${max} meses`
                                         });
                                       } else {
                                         form.clearErrors('term_months');
                                       }
                                     }
                                     field.onBlur();
                                   }}
                                   className=""
                                 />
                               </FormControl>
                               <FormMessage />
                             </FormItem>
                           )}
                         />
                       </div>
                     )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                         <div>
                       <FormLabel>Amortización:</FormLabel>
                       <FormField
                         control={form.control}
                         name="amortization_type"
                         render={({ field }) => (
                           <FormItem>
                             <Select onValueChange={field.onChange} defaultValue={field.value}>
                               <FormControl>
                                 <SelectTrigger>
                                   <SelectValue />
                                 </SelectTrigger>
                               </FormControl>
                               <SelectContent>
                                 <SelectItem value="simple">SIMPLE | ABSOLUTO</SelectItem>
                                 <SelectItem value="french">FRANCÉS | INSOLUTO FIJO</SelectItem>
                                 <SelectItem value="german">ALEMÁN | INSOLUTO</SelectItem>
                                 <SelectItem value="american">AMERICANO | LÍNEA DE CRÉDITO</SelectItem>
                                 <SelectItem value="indefinite">PLAZO INDEFINIDO</SelectItem>
                               </SelectContent>
                             </Select>
                             <FormMessage />
                             <div className="text-xs text-gray-500 mt-1">
                               <p><strong>Simple:</strong> Cuota fija, interés y capital distribuidos</p>
                               <p><strong>Francés:</strong> Cuota fija, capital creciente, interés decreciente</p>
                               <p><strong>Alemán:</strong> Cuota decreciente, capital fijo</p>
                               <p><strong>Americano:</strong> Solo intereses, capital al final</p>
                               <p><strong>Indefinido:</strong> Solo intereses, sin vencimiento</p>
                             </div>
                           </FormItem>
                         )}
                       />
                     </div>

                    <div>
                      <FormLabel>Frecuencia:</FormLabel>
                      <FormField
                        control={form.control}
                        name="payment_frequency"
                        render={({ field }) => (
                          <FormItem>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="daily">DIARIO</SelectItem>
                                <SelectItem value="weekly">SEMANAL</SelectItem>
                                <SelectItem value="biweekly">QUINCENAL</SelectItem>
                                <SelectItem value="monthly">MENSUAL</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div>
                      <FormLabel>Inicio de Préstamo:</FormLabel>
                      <FormField
                        control={form.control}
                        name="first_payment_date"
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <Input
                                type="date"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-center gap-2">
                    <Button 
                      type="button" 
                      className="bg-blue-500 hover:bg-blue-600 px-4 sm:px-8 py-2 sm:py-3 text-base sm:text-lg w-full sm:w-auto"
                      onClick={calculateAmortization}
                    >
                      📊 CALCULAR PRÉSTAMO
                    </Button>
                    

                  </div>
                </CardContent>
              </Card>

              {/* Información Adicional */}
                             <Card>
                 <CardHeader className="bg-blue-500 text-white">
                   <CardTitle className="text-base sm:text-lg">INFORMACIÓN ADICIONAL</CardTitle>
                 </CardHeader>
                                  <CardContent className="space-y-3 sm:space-y-4 pt-4 sm:pt-6">
                    {/* Días excluidos */}
                  <div>
                    <FormLabel>Días excluidos</FormLabel>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-7 gap-2 mt-2">
                      {['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'].map((day) => (
                        <label key={day} className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={excludedDays.includes(day)}
                            onChange={(e) => handleExcludedDayChange(day, e.target.checked)}
                            className="rounded"
                          />
                          <span className="text-xs sm:text-sm">{day}</span>
                        </label>
                      ))}
                    </div>

                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <FormLabel>Gastos de cierre: RD$</FormLabel>
                      <FormField
                        control={form.control}
                        name="closing_costs"
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <Input
                                type="number"
                                placeholder="0"
                                min="0"
                                step="0.01"
                                value={field.value || ''}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  // Permitir decimales con hasta 2 decimales
                                  if (value === '' || /^\d*\.?\d{0,2}$/.test(value)) {
                                    const numValue = value === '' ? 0 : parseFloat(value) || 0;
                                    field.onChange(Math.max(0, numValue));
                                  }
                                }}
                                className=""
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div>
                      <FormLabel>Cartera:</FormLabel>
                      <FormField
                        control={form.control}
                        name="portfolio"
                        render={({ field }) => (
                          <FormItem>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="SIN CARTERA" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="none">SIN CARTERA</SelectItem>
                                <SelectItem value="personal">Cartera Personal</SelectItem>
                                <SelectItem value="comercial">Cartera Comercial</SelectItem>
                                <SelectItem value="emergencia">Cartera Emergencia</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  <div>
                    <FormLabel>Codeudor:</FormLabel>
                    <FormField
                      control={form.control}
                      name="guarantor_name"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Input 
                              placeholder="Nombre del codeudor (opcional)" 
                              {...field}
                              className={form.watch('guarantor_required') && !field.value ? 'border-red-500' : ''}
                            />
                          </FormControl>
                          <FormMessage />
                          {form.watch('guarantor_required') && !field.value && (
                            <div className="text-xs text-red-500">
                              Nombre del codeudor es requerido cuando se solicita garantía
                            </div>
                          )}
                        </FormItem>
                      )}
                    />
                  </div>

                  <div>
                    <FormLabel>Tipo de préstamo:</FormLabel>
                    <FormField
                      control={form.control}
                      name="loan_type"
                      render={({ field }) => (
                        <FormItem>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="personal">PRÉSTAMO DE CONSUMO</SelectItem>
                              <SelectItem value="business">PRÉSTAMO COMERCIAL</SelectItem>
                              <SelectItem value="emergency">PRÉSTAMO DE EMERGENCIA</SelectItem>
                              <SelectItem value="vehicle">PRÉSTAMO VEHICULAR</SelectItem>
                              <SelectItem value="home">PRÉSTAMO HIPOTECARIO</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div>
                    <FormLabel>Comentarios</FormLabel>
                    <FormField
                      control={form.control}
                      name="comments"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Textarea placeholder="Comentarios adicionales..." {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Configuraciones de pago mínimo */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <FormLabel>Pago mínimo</FormLabel>
                      <FormField
                        control={form.control}
                        name="minimum_payment"
                        render={({ field }) => (
                          <FormItem>
                            <Select onValueChange={(value) => field.onChange(value === 'true')} defaultValue={field.value ? 'true' : 'false'}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="true">Sí</SelectItem>
                                <SelectItem value="false">No</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div>
                      <FormLabel>Tipo de pago mínimo</FormLabel>
                      <FormField
                        control={form.control}
                        name="minimum_payment_type"
                        render={({ field }) => (
                          <FormItem>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="interest">Pago al Interés</SelectItem>
                                <SelectItem value="principal">Pago al Principal</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div>
                      <FormLabel>Porcentaje pago mínimo</FormLabel>
                      <div className="flex items-center gap-2">
                        <FormField
                          control={form.control}
                          name="minimum_payment_percentage"
                          render={({ field }) => (
                            <FormItem className="flex-1">
                              <FormControl>
                                <Input
                                  type="number"
                                  placeholder="0"
                                  min="0"
                                  max="100"
                                  step="0.01"
                                  value={field.value || ''}
                                  onChange={(e) => {
                                    const value = e.target.value;
                                    // Permitir decimales con hasta 2 decimales
                                    if (value === '' || /^\d*\.?\d{0,2}$/.test(value)) {
                                      const numValue = value === '' ? 0 : parseFloat(value) || 0;
                                      // Validar que no exceda 100%
                                      field.onChange(Math.min(numValue, 100));
                                    }
                                  }}
                                  className=""
                                />
                              </FormControl>
                              <FormMessage />
                              {field.value > 0 && calculatedValues.monthlyPayment > 0 && (
                                <div className="text-xs text-gray-500">
                                  Pago mínimo: {formatCurrency((field.value / 100) * calculatedValues.monthlyPayment)}
                                </div>
                              )}
                            </FormItem>
                          )}
                        />
                        <span className="text-blue-500 font-bold">%</span>
                      </div>
                    </div>
                  </div>

                  {/* Checkboxes */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-3">
                      <FormField
                        control={form.control}
                        name="guarantor_required"
                        render={({ field }) => (
                          <FormItem className="flex items-center space-x-2">
                            <FormControl>
                              <input
                                type="checkbox"
                                checked={field.value}
                                onChange={field.onChange}
                                className="rounded"
                              />
                            </FormControl>
                            <FormLabel className="text-sm">Garantía</FormLabel>
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="loan_started"
                        render={({ field }) => (
                          <FormItem className="flex items-center space-x-2">
                            <FormControl>
                              <input
                                type="checkbox"
                                checked={field.value}
                                onChange={field.onChange}
                                className="rounded"
                              />
                            </FormControl>
                            <FormLabel className="text-sm">Préstamo ya iniciado</FormLabel>
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="late_fee_enabled"
                        render={({ field }) => (
                          <FormItem className="flex items-center space-x-2">
                            <FormControl>
                              <input
                                type="checkbox"
                                checked={field.value}
                                onChange={field.onChange}
                                className="rounded"
                              />
                            </FormControl>
                            <FormLabel className="text-sm">Mora</FormLabel>
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="space-y-3">
                      <FormField
                        control={form.control}
                        name="add_expense"
                        render={({ field }) => (
                          <FormItem className="flex items-center space-x-2">
                            <FormControl>
                              <input
                                type="checkbox"
                                checked={field.value}
                                onChange={field.onChange}
                                className="rounded"
                              />
                            </FormControl>
                            <FormLabel className="text-sm">Añadir Egreso</FormLabel>
                          </FormItem>
                        )}
                      />

                      <div className="flex items-start space-x-2">
                        <input type="checkbox" defaultChecked className="rounded mt-1" />
                        <FormLabel className="text-sm leading-tight">
                          Crear un gasto de tipo [Préstamo de caja chica] por el monto del total capital de este préstamo?
                        </FormLabel>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Formulario de Garantía - Mostrar solo si guarantor_required está activo */}
              {form.watch('guarantor_required') && (
                <GuaranteeForm
                  formData={guaranteeData}
                  onChange={(data) => setGuaranteeData(data)}
                />
              )}

              {/* Configuración de Mora */}
              <Card>
                <CardHeader className="bg-orange-500 text-white">
                  <CardTitle className="text-base sm:text-lg">CONFIGURACIÓN DE MORA</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 sm:space-y-4 pt-4 sm:pt-6">
                  {/* Habilitar/Deshabilitar mora */}
                  <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div>
                      <FormLabel className="text-base font-semibold">Habilitar Mora</FormLabel>
                      <p className="text-sm text-gray-600">Activar el cálculo automático de mora para este préstamo</p>
                    </div>
                    <FormField
                      control={form.control}
                      name="late_fee_enabled"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <input
                              type="checkbox"
                              checked={field.value}
                              onChange={field.onChange}
                              className="rounded scale-125"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>

                  {form.watch('late_fee_enabled') && (
                    <>
                      {/* Tasa de mora y días de gracia */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <FormLabel className="text-sm font-semibold">
                            Tasa de Mora por Día (%)
                          </FormLabel>
                          <FormField
                            control={form.control}
                            name="late_fee_rate"
                            render={({ field }) => (
                              <FormItem>
                                <FormControl>
                                  <Input
                                    type="number"
                                    step="0.1"
                                    min="0"
                                    max="100"
                                    value={field.value || ''}
                                    onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                                    className="h-12"
                                    placeholder="2.0"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <p className="text-xs text-gray-600">
                            Porcentaje diario sobre el balance pendiente
                          </p>
                        </div>

                        <div className="space-y-2">
                          <FormLabel className="text-sm font-semibold">
                            Días de Gracia
                          </FormLabel>
                          <FormField
                            control={form.control}
                            name="grace_period_days"
                            render={({ field }) => (
                              <FormItem>
                                <FormControl>
                                  <Input
                                    type="number"
                                    min="0"
                                    max="30"
                                    value={field.value || ''}
                                    onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                                    className="h-12"
                                    placeholder="0"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <p className="text-xs text-gray-600">
                            Días sin mora después del vencimiento
                          </p>
                        </div>
                      </div>

                      {/* Tipo de cálculo y límite máximo */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <FormLabel className="text-sm font-semibold">
                            Tipo de Cálculo
                          </FormLabel>
                          <FormField
                            control={form.control}
                            name="late_fee_calculation_type"
                            render={({ field }) => (
                              <FormItem>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                  <FormControl>
                                    <SelectTrigger className="h-12">
                                      <SelectValue />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="daily">Diario</SelectItem>
                                    <SelectItem value="monthly">Mensual</SelectItem>
                                    <SelectItem value="compound">Compuesto</SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <p className="text-xs text-gray-600">
                            {form.watch('late_fee_calculation_type') === 'daily' && 'Mora simple: Se calcula por cada día de retraso'}
                            {form.watch('late_fee_calculation_type') === 'monthly' && 'Mora mensual: Se calcula por mes completo de retraso'}
                            {form.watch('late_fee_calculation_type') === 'compound' && 'Mora compuesta: Interés sobre interés (crecimiento exponencial)'}
                          </p>
                        </div>

                        <div className="space-y-2">
                          <FormLabel className="text-sm font-semibold">
                            Mora Máxima (RD$)
                          </FormLabel>
                          <FormField
                            control={form.control}
                            name="max_late_fee"
                            render={({ field }) => (
                              <FormItem>
                                <FormControl>
                                  <Input
                                    type="number"
                                    min="0"
                                    value={field.value || ''}
                                    onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                                    className="h-12"
                                    placeholder="0 (sin límite)"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <p className="text-xs text-gray-600">
                            0 = Sin límite máximo
                          </p>
                        </div>
                      </div>

                      {/* Vista previa de cálculo */}
                      {form.watch('late_fee_rate') > 0 && (
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                          <h4 className="text-sm font-semibold text-blue-800 mb-3">Vista Previa de Cálculo</h4>
                          <p className="text-xs text-blue-600 mb-2">Ejemplo con un balance de RD$100,000</p>
                          <div className="grid grid-cols-3 gap-4 text-center">
                            <div className="p-3 bg-blue-100 rounded-lg">
                              <div className="text-lg font-bold text-blue-700">
                                ${formatCurrencyNumber(100000 * (form.watch('late_fee_rate') || 0) / 100)}
                              </div>
                              <div className="text-sm text-blue-600">Por día</div>
                            </div>
                            <div className="p-3 bg-orange-100 rounded-lg">
                              <div className="text-lg font-bold text-orange-700">
                                ${formatCurrencyNumber(100000 * (form.watch('late_fee_rate') || 0) / 100 * 7)}
                              </div>
                              <div className="text-sm text-orange-600">Por semana</div>
                            </div>
                            <div className="p-3 bg-red-100 rounded-lg">
                              <div className="text-lg font-bold text-red-700">
                                ${formatCurrencyNumber(100000 * (form.watch('late_fee_rate') || 0) / 100 * 30)}
                              </div>
                              <div className="text-sm text-red-600">Por mes</div>
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>

                             <div className="flex justify-center">
                 <Button 
                   type="submit" 
                   disabled={loading || !selectedClient || calculatedValues.monthlyPayment === 0}
                   className="bg-blue-500 hover:bg-blue-600 px-6 sm:px-12 py-2 sm:py-3 text-base sm:text-lg w-full sm:w-auto"
                 >
                   💰 CREAR PRÉSTAMO
                 </Button>
               </div>
            </form>
          </Form>
        </div>

        {/* Tabla de Amortización */}
        <div>
          {showAmortizationTable ? (
            <Card>
              <CardHeader className="bg-blue-500 text-white">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                  <CardTitle className="text-base sm:text-lg">Tabla de Amortización</CardTitle>
                                     <div className="flex gap-2 w-full sm:w-auto">
                     <Button 
                       variant="outline" 
                       size="sm" 
                       onClick={copyAmortizationTable} 
                       className="text-white border-white hover:bg-blue-600 active:bg-blue-700 flex-1 sm:flex-none bg-blue-500/30 shadow-sm transition-colors duration-200"
                       title="Copiar tabla"
                     >
                       <Copy className="h-4 w-4 mr-1" />
                       <span className="hidden sm:inline">Copiar</span>
                     </Button>
                     <Button 
                       variant="outline" 
                       size="sm" 
                       onClick={printAmortizationTable} 
                       className="text-white border-white hover:bg-blue-600 active:bg-blue-700 flex-1 sm:flex-none bg-blue-500/30 shadow-sm transition-colors duration-200"
                       title="Imprimir tabla"
                     >
                       <Printer className="h-4 w-4 mr-1" />
                       <span className="hidden sm:inline">Imprimir</span>
                     </Button>
                   </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-96 overflow-x-auto overflow-y-auto">
                  <table className="w-full text-xs sm:text-sm min-w-[600px]">
                    <thead className="bg-gray-100 sticky top-0">
                      <tr>
                        <th className="p-1 sm:p-2 text-left border">CUOTA</th>
                        <th className="p-1 sm:p-2 text-left border">FECHA</th>
                        <th className="p-1 sm:p-2 text-right border">INTERÉS</th>
                        <th className="p-1 sm:p-2 text-right border">CAPITAL</th>
                        <th className="p-1 sm:p-2 text-right border">A PAGAR</th>
                        <th className="p-1 sm:p-2 text-right border">CAPITAL RESTANTE</th>
                      </tr>
                    </thead>
                    <tbody>
                      {amortizationSchedule.map((row, index) => (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="p-1 sm:p-2 border">{typeof row.payment === 'string' ? row.payment : `${row.payment}/${amortizationSchedule.length}`}</td>
                          <td className="p-1 sm:p-2 border">{row.date}</td>
                          <td className="p-1 sm:p-2 text-right border">{formatCurrency(row.interest)}</td>
                          <td className="p-1 sm:p-2 text-right border">{formatCurrency(row.principal)}</td>
                          <td className="p-1 sm:p-2 text-right border font-semibold">{formatCurrency(row.totalPayment)}</td>
                          <td className="p-1 sm:p-2 text-right border">{formatCurrency(row.remainingBalance)}</td>
                        </tr>
                      ))}
                      {form.getValues('amortization_type') !== 'indefinite' && (
                        <tr className="bg-blue-50 font-bold">
                          <td className="p-1 sm:p-2 border" colSpan={2}>TOTALES</td>
                          <td className="p-1 sm:p-2 text-right border">{formatCurrency(calculatedValues.totalInterest)}</td>
                          <td className="p-1 sm:p-2 text-right border">{formatCurrency(form.getValues('amount'))}</td>
                          <td className="p-1 sm:p-2 text-right border">{formatCurrency(calculatedValues.totalAmount)}</td>
                          <td className="p-1 sm:p-2 text-right border">RD$0.00</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                
                <div className="p-2 sm:p-4 bg-gray-50 border-t">
                  <p className="text-xs sm:text-sm text-gray-600">
                    Mostrando registros del 1 al {amortizationSchedule.length} de un total de {amortizationSchedule.length} registros
                  </p>
                  {excludedDays.length > 0 && (
                    <p className="text-xs text-blue-600 mt-1">
                      <strong>Días excluidos:</strong> {excludedDays.join(', ')}
                    </p>
                  )}
                  {form.getValues('closing_costs') > 0 && (
                    <p className="text-xs text-orange-600 mt-1">
                      <strong>Gastos de cierre:</strong> {formatCurrency(form.getValues('closing_costs'))} (aplicado al último pago)
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calculator className="h-5 w-5" />
                  <span className="text-base sm:text-lg">Calculadora de Préstamo</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-center py-4 sm:py-8 text-gray-500">
                  <Calculator className="h-8 w-8 sm:h-12 sm:w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-sm sm:text-base">Haga clic en "CALCULAR PRÉSTAMO" para ver la tabla de amortización</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Diálogo: ¿Quiere generar documentos? */}
      <Dialog 
        open={showGenerateDocumentsDialog} 
        onOpenChange={(open) => {
          setShowGenerateDocumentsDialog(open);
          if (!open) {
            // Si se cierra el diálogo sin seleccionar, continuar con el flujo normal
            onLoanCreated?.();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generar Documentos</DialogTitle>
            <DialogDescription>
              ¿Desea generar documentos para este préstamo?
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <Button
              variant="outline"
              onClick={() => {
                setShowGenerateDocumentsDialog(false);
                onLoanCreated?.();
              }}
            >
              No, gracias
            </Button>
            <Button
              onClick={() => {
                setShowGenerateDocumentsDialog(false);
                setShowDocumentSelectionDialog(true);
              }}
            >
              Sí, generar documentos
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Diálogo: Seleccionar documentos a generar */}
      <Dialog 
        open={showDocumentSelectionDialog} 
        onOpenChange={(open) => {
          setShowDocumentSelectionDialog(open);
          if (!open) {
            // Si se cierra el diálogo sin generar, continuar con el flujo normal
            setSelectedDocuments([]);
            onLoanCreated?.();
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Seleccionar Documentos</DialogTitle>
            <DialogDescription>
              Seleccione los documentos que desea generar y luego haga clic en el botón "Generar".
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                { id: 'pagare_notarial', label: 'PAGARÉ NOTARIAL' },
                { id: 'tabla_amortizacion', label: 'TABLA AMORTIZACIÓN' },
                { id: 'contrato_bluetooth', label: 'CONTRATO IMPRESORA BLUETOOTH' },
                { id: 'pagare_codeudor', label: 'PAGARÉ NOTARIAL CON CODEUDOR' },
                { id: 'contrato_salarial', label: 'CONTRATO SALARIAL' },
                { id: 'carta_intimacion', label: 'CARTA DE INTIMACIÓN' },
                { id: 'carta_saldo', label: 'CARTA DE SALDO' },
                { id: 'prueba_documento', label: 'PRUEBA DE DOCUMENTO' },
              ].map((doc) => (
                <div key={doc.id} className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-gray-50">
                  <Checkbox
                    id={doc.id}
                    checked={selectedDocuments.includes(doc.id)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedDocuments([...selectedDocuments, doc.id]);
                      } else {
                        setSelectedDocuments(selectedDocuments.filter(id => id !== doc.id));
                      }
                    }}
                  />
                  <Label
                    htmlFor={doc.id}
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex-1"
                  >
                    {doc.label}
                  </Label>
                </div>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-6">
            <Button
              variant="outline"
              onClick={() => {
                setShowDocumentSelectionDialog(false);
                setSelectedDocuments([]);
                onLoanCreated?.();
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={async () => {
                if (selectedDocuments.length === 0) {
                  toast.error('Debe seleccionar al menos un documento');
                  return;
                }
                
                if (!createdLoanId || !user || !companyId) {
                  toast.error('Error: No se encontró información del préstamo');
                  return;
                }
                
                try {
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
                    .eq('id', createdLoanId)
                    .single();
                  
                  if (loanError || !loanData) {
                    throw new Error('No se pudo obtener los datos del préstamo');
                  }
                  
                  // Generar cada documento seleccionado
                  const documentTypes = {
                    'pagare_notarial': 'PAGARÉ NOTARIAL',
                    'tabla_amortizacion': 'TABLA DE AMORTIZACIÓN',
                    'contrato_bluetooth': 'CONTRATO IMPRESORA BLUETOOTH',
                    'pagare_codeudor': 'PAGARÉ NOTARIAL CON CODEUDOR',
                    'contrato_salarial': 'CONTRATO SALARIAL'
                  };
                  
                  let generatedCount = 0;
                  
                  for (const docType of selectedDocuments) {
                    try {
                      console.log(`🔍 Generando documento: ${docType}`);
                      
                      // Verificar que el tipo de documento esté soportado
                      if (!documentTypes[docType as keyof typeof documentTypes]) {
                        console.warn(`⚠️ Tipo de documento no soportado: ${docType}`);
                        continue;
                      }
                      
                      // Generar contenido HTML del documento
                      const documentContent = generateDocumentHTML(docType, loanData, form.getValues(), companySettings);
                      
                      if (!documentContent || documentContent.trim().length === 0) {
                        console.error(`❌ Error: No se pudo generar el contenido para ${docType}`);
                        continue;
                      }
                      
                      // Crear un File desde el contenido HTML (Supabase Storage requiere File, no Blob)
                      const fileName = `${docType}_${createdLoanId}_${Date.now()}.html`;
                      const filePath = `user-${companyId}/loans/${createdLoanId}/${fileName}`;
                      const file = new File([documentContent], fileName, { type: 'text/html' });
                      
                      console.log(`📤 Subiendo archivo: ${filePath}, tamaño: ${file.size} bytes`);
                      
                      // Subir a storage
                      const { error: uploadError } = await supabase.storage
                        .from('documents')
                        .upload(filePath, file, {
                          contentType: 'text/html',
                          upsert: false
                        });
                      
                      if (uploadError) {
                        console.error(`❌ Error subiendo ${docType}:`, uploadError);
                        toast.error(`Error al subir ${documentTypes[docType as keyof typeof documentTypes]}: ${uploadError.message}`, { duration: 5000 });
                        continue;
                      }
                      
                      console.log(`✅ Archivo subido exitosamente: ${filePath}`);
                      
                      // Mapear el tipo de documento a un valor permitido en la base de datos
                      // La base de datos solo permite: 'general', 'contract', 'receipt', 'identification', 'loan_document', 'invoice', 'statement', 'other'
                      const allowedDocumentType = 'loan_document'; // Usar 'loan_document' para todos los documentos de préstamos generados
                      
                      // Guardar metadata en la base de datos
                      const documentMetadata = {
                        user_id: companyId,
                        loan_id: createdLoanId,
                        client_id: loanData.client_id,
                        title: documentTypes[docType as keyof typeof documentTypes] || docType,
                        file_name: fileName,
                        file_url: filePath,
                        description: `Documento generado automáticamente: ${documentTypes[docType as keyof typeof documentTypes]} (Tipo: ${docType})`,
                        document_type: allowedDocumentType, // Usar el tipo permitido
                        mime_type: 'text/html',
                        file_size: file.size,
                        status: 'active'
                      };
                      
                      console.log(`💾 Guardando metadata:`, documentMetadata);
                      
                      const { error: insertError } = await supabase
                        .from('documents')
                        .insert([documentMetadata]);
                      
                      if (insertError) {
                        console.error(`❌ Error guardando metadata de ${docType}:`, insertError);
                        // Intentar eliminar el archivo de storage si falla la inserción
                        await supabase.storage.from('documents').remove([filePath]);
                        toast.error(`Error al guardar ${documentTypes[docType as keyof typeof documentTypes]}: ${insertError.message}`, { duration: 5000 });
                        continue;
                      }
                      
                      console.log(`✅ Documento ${docType} generado exitosamente`);
                      generatedCount++;
                    } catch (error: any) {
                      console.error(`❌ Error generando ${docType}:`, error);
                      toast.error(`Error al generar ${documentTypes[docType as keyof typeof documentTypes] || docType}: ${error.message || 'Error desconocido'}`, { duration: 5000 });
                    }
                  }
                  
                  if (generatedCount > 0) {
                    toast.success(`${generatedCount} de ${selectedDocuments.length} documento(s) generado(s) exitosamente`, { id: 'generate-docs' });
                  } else {
                    const errorDetails = selectedDocuments.length > 0 
                      ? `No se pudo generar ningún documento. Revise la consola para más detalles.`
                      : 'No se seleccionaron documentos para generar';
                    toast.error(errorDetails, { id: 'generate-docs', duration: 6000 });
                    console.error('❌ Resumen de errores: Se intentaron generar', selectedDocuments.length, 'documentos pero ninguno se generó exitosamente');
                  }
                  
                  setShowDocumentSelectionDialog(false);
                  setSelectedDocuments([]);
                  onLoanCreated?.();
                } catch (error: any) {
                  console.error('Error generando documentos:', error);
                  toast.error(error.message || 'Error al generar documentos', { id: 'generate-docs' });
                }
              }}
              disabled={selectedDocuments.length === 0}
            >
              Generar Documentos
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};