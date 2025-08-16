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
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { ArrowLeft, Calculator, Search, User, DollarSign, Calendar, Percent, FileText, Copy, Printer } from 'lucide-react';

const loanSchema = z.object({
  client_id: z.string().min(1, 'Debe seleccionar un cliente'),
  amount: z.number().min(1, 'El monto debe ser mayor a 0'),
  interest_rate: z.number().min(0, 'La tasa de interés debe ser mayor o igual a 0'),
  term_months: z.number().min(1, 'El plazo debe ser al menos 1 mes'),
  loan_type: z.string().min(1, 'Debe seleccionar un tipo de préstamo'),
  amortization_type: z.string().default('simple').refine((val) => ['simple', 'german', 'american', 'indefinite'].includes(val), {
    message: 'Tipo de amortización no válido'
  }),
  payment_frequency: z.string().default('monthly'),
  first_payment_date: z.string().min(1, 'Debe seleccionar la fecha del primer pago'),
  closing_costs: z.number().default(0),
  portfolio: z.string().optional(),
  comments: z.string().optional(),
  guarantor_required: z.boolean().default(false),
  loan_started: z.boolean().default(false),
  late_fee: z.boolean().default(false),
  add_expense: z.boolean().default(false),
  minimum_payment: z.boolean().default(true),
  minimum_payment_type: z.string().default('interest'),
  minimum_payment_percentage: z.number().default(100),
  guarantor_name: z.string().optional(),
  guarantor_phone: z.string().optional(),
  guarantor_dni: z.string().optional(),
  notes: z.string().optional(),
  fixed_payment_enabled: z.boolean().default(false),
  fixed_payment_amount: z.number().optional(),
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

export const LoanForm = ({ onBack }: { onBack: () => void }) => {
  const [clients, setClients] = useState<Client[]>([]);
  const [filteredClients, setFilteredClients] = useState<Client[]>([]);
  const [clientSearch, setClientSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [showClientDropdown, setShowClientDropdown] = useState(false);
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
  const { user, companyId } = useAuth();

  const form = useForm<LoanFormData>({
    resolver: zodResolver(loanSchema),
    defaultValues: {
      amount: 0,
      interest_rate: 0,
      term_months: 1,
      loan_type: 'personal',
      amortization_type: 'simple',
      payment_frequency: 'monthly',
      first_payment_date: new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString().split('T')[0],
      closing_costs: 0,
      minimum_payment_percentage: 100,
      minimum_payment_type: 'interest',
      fixed_payment_enabled: false,
      fixed_payment_amount: 0,
    },
  });

  useEffect(() => {
    fetchClients();
  }, []);

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
    const { amount, interest_rate, term_months, amortization_type, payment_frequency, first_payment_date, fixed_payment_enabled, fixed_payment_amount } = formValues;
    
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
           const paymentDate = new Date(first_payment_date);
           
           switch (payment_frequency) {
             case 'daily':
               paymentDate.setDate(paymentDate.getDate() + (i - 1));
               break;
             case 'weekly':
               paymentDate.setDate(paymentDate.getDate() + (i - 1) * 7);
               break;
             case 'biweekly':
               paymentDate.setDate(paymentDate.getDate() + (i - 1) * 15);
               break;
             case 'monthly':
             default:
               paymentDate.setMonth(paymentDate.getMonth() + (i - 1));
               break;
           }
           
           const principalPayment = fixed_payment_amount - interestPerPayment;
           
           schedule.push({
             payment: i,
             date: paymentDate.toISOString().split('T')[0],
             interest: interestPerPayment,
             principal: principalPayment,
             totalPayment: fixed_payment_amount,
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
           const paymentDate = new Date(first_payment_date);
           
           switch (payment_frequency) {
             case 'daily':
               paymentDate.setDate(paymentDate.getDate() + (i - 1));
               break;
             case 'weekly':
               paymentDate.setDate(paymentDate.getDate() + (i - 1) * 7);
               break;
             case 'biweekly':
               paymentDate.setDate(paymentDate.getDate() + (i - 1) * 15);
               break;
             case 'monthly':
             default:
               paymentDate.setMonth(paymentDate.getMonth() + (i - 1));
               break;
           }
           
           schedule.push({
             payment: i,
             date: paymentDate.toISOString().split('T')[0],
             interest: interestPerPayment,
             principal: principalPerPayment,
             totalPayment: monthlyPayment,
             remainingBalance: Math.max(0, remainingBalance - principalPerPayment)
           });
           
           remainingBalance -= principalPerPayment;
         }
       }
     } else if (amortization_type === 'german') {
       // Amortización alemana (insoluto) - Cuota decreciente
       // El capital se paga en partes iguales, el interés se calcula sobre el saldo insoluto
       const principalPerPayment = amount / totalPeriods;
       let remainingBalance = amount;
       let totalPaid = 0;
       
       for (let i = 1; i <= totalPeriods; i++) {
         const paymentDate = new Date(first_payment_date);
         
         switch (payment_frequency) {
           case 'daily':
             paymentDate.setDate(paymentDate.getDate() + (i - 1));
             break;
           case 'weekly':
             paymentDate.setDate(paymentDate.getDate() + (i - 1) * 7);
             break;
           case 'biweekly':
             paymentDate.setDate(paymentDate.getDate() + (i - 1) * 15);
             break;
           case 'monthly':
           default:
             paymentDate.setMonth(paymentDate.getMonth() + (i - 1));
             break;
         }
         
         const interestPayment = remainingBalance * periodRate;
         const actualPayment = principalPerPayment + interestPayment;
         totalPaid += actualPayment;
         
         schedule.push({
           payment: i,
           date: paymentDate.toISOString().split('T')[0],
           interest: interestPayment,
           principal: principalPerPayment,
           totalPayment: actualPayment,
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
         const paymentDate = new Date(first_payment_date);
         
         switch (payment_frequency) {
           case 'daily':
             paymentDate.setDate(paymentDate.getDate() + (i - 1));
             break;
           case 'weekly':
             paymentDate.setDate(paymentDate.getDate() + (i - 1) * 7);
             break;
           case 'biweekly':
             paymentDate.setDate(paymentDate.getDate() + (i - 1) * 15);
             break;
           case 'monthly':
           default:
             paymentDate.setMonth(paymentDate.getMonth() + (i - 1));
             break;
         }
         
         const actualPayment = i === totalPeriods ? interestPerPayment + amount : interestPerPayment;
         const principalPayment = i === totalPeriods ? amount : 0;
         totalPaid += actualPayment;
         
         schedule.push({
           payment: i,
           date: paymentDate.toISOString().split('T')[0],
           interest: interestPerPayment,
           principal: principalPayment,
           totalPayment: actualPayment,
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
       const paymentDate = new Date(first_payment_date);
       
       // Para plazo indefinido, mostrar solo 1 período con "1/X"
       schedule.push({
         payment: '1/X', // Mostrar 1/X para indicar que es indefinido
         date: paymentDate.toISOString().split('T')[0],
         interest: interestPerPayment,
         principal: 0,
         totalPayment: interestPerPayment,
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
    
    toast.success('Préstamo calculado exitosamente');
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
    if (!user || !companyId || !selectedClient) {
      toast.error('Debe seleccionar un cliente');
      return;
    }

    if (calculatedValues.monthlyPayment === 0) {
      toast.error('Debe calcular el préstamo antes de crearlo');
      return;
    }

    setLoading(true);
    try {
      const startDate = new Date();
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + data.term_months);
      
      const firstPaymentDate = new Date(data.first_payment_date);

      const loanData = {
        client_id: data.client_id,
        amount: data.amount,
        interest_rate: data.interest_rate,
        term_months: data.term_months,
        loan_type: data.loan_type,
        purpose: data.comments || null,
        collateral: data.guarantor_required ? 'Garantía requerida' : null,
        loan_officer_id: companyId,
        monthly_payment: calculatedValues.monthlyPayment,
        total_amount: calculatedValues.totalAmount,
        remaining_balance: calculatedValues.totalAmount,
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0],
        next_payment_date: firstPaymentDate.toISOString().split('T')[0],
        status: data.loan_started ? 'active' : 'pending',
        guarantor_name: data.guarantor_name || null,
        guarantor_phone: data.guarantor_phone || null,
        guarantor_dni: data.guarantor_dni || null,
        notes: data.notes || null,
      };

      const { error } = await supabase
        .from('loans')
        .insert([loanData]);

      if (error) throw error;

      toast.success('Préstamo creado exitosamente');
      onBack();
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
      `RD$${row.interest.toFixed(2)}`,
      `RD$${row.principal.toFixed(2)}`,
      `RD$${row.totalPayment.toFixed(2)}`,
      `RD$${row.remainingBalance.toFixed(2)}`
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
              <p>Monto: RD$${form.getValues('amount').toLocaleString()}</p>
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
                    <td>RD$${row.interest.toFixed(2)}</td>
                    <td>RD$${row.principal.toFixed(2)}</td>
                    <td>RD$${row.totalPayment.toFixed(2)}</td>
                    <td>RD$${row.remainingBalance.toFixed(2)}</td>
                  </tr>
                `).join('')}
                ${form.getValues('amortization_type') !== 'indefinite' ? `
                <tr class="totals">
                  <td colspan="2">TOTALES</td>
                  <td>RD$${calculatedValues.totalInterest.toFixed(2)}</td>
                  <td>RD$${form.getValues('amount').toFixed(2)}</td>
                  <td>RD$${calculatedValues.totalAmount.toFixed(2)}</td>
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
      toast.success(`Tasa de interés ajustada automáticamente a ${newInterestRate.toFixed(2)}% para la cuota fija de RD$${fixedPaymentAmount.toLocaleString()}`);
    } else if (!fixedPaymentEnabled) {
      // Si se desactiva la cuota fija, limpiar el campo de cuota fija
      form.setValue('fixed_payment_amount', 0);
    }
  }, [form.watch('fixed_payment_amount'), form.watch('fixed_payment_enabled'), form.watch('amount'), form.watch('term_months')]);

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
                    <FormLabel>Cliente:</FormLabel>
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
                                   {...field}
                                   value={field.value || ''}
                                   onChange={(e) => {
                                     const value = e.target.value;
                                     if (value === '' || /^\d*$/.test(value)) {
                                       field.onChange(value === '' ? 0 : parseInt(value) || 0);
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
                                 <SelectItem value="german">ALEMÁN | INSOLUTO</SelectItem>
                                 <SelectItem value="american">AMERICANO | LÍNEA DE CRÉDITO</SelectItem>
                                 <SelectItem value="indefinite">PLAZO INDEFINIDO</SelectItem>
                               </SelectContent>
                             </Select>
                             <FormMessage />
                             <div className="text-xs text-gray-500 mt-1">
                               <p><strong>Simple:</strong> Cuota fija, interés y capital distribuidos</p>
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
                      <FormLabel>Primera cuota:</FormLabel>
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

                  <div className="flex items-center justify-center">
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
                      <FormLabel>Gastos de cierre: %</FormLabel>
                      <FormField
                        control={form.control}
                        name="closing_costs"
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
                            <Input placeholder="Nombre del codeudor (opcional)" {...field} />
                          </FormControl>
                          <FormMessage />
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
                        name="late_fee"
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
                          <td className="p-1 sm:p-2 text-right border">RD${row.interest.toFixed(2)}</td>
                          <td className="p-1 sm:p-2 text-right border">RD${row.principal.toFixed(2)}</td>
                          <td className="p-1 sm:p-2 text-right border font-semibold">RD${row.totalPayment.toFixed(2)}</td>
                          <td className="p-1 sm:p-2 text-right border">RD${row.remainingBalance.toFixed(2)}</td>
                        </tr>
                      ))}
                      {form.getValues('amortization_type') !== 'indefinite' && (
                        <tr className="bg-blue-50 font-bold">
                          <td className="p-1 sm:p-2 border" colSpan={2}>TOTALES</td>
                          <td className="p-1 sm:p-2 text-right border">RD${calculatedValues.totalInterest.toFixed(2)}</td>
                          <td className="p-1 sm:p-2 text-right border">RD${form.getValues('amount').toFixed(2)}</td>
                          <td className="p-1 sm:p-2 text-right border">RD${calculatedValues.totalAmount.toFixed(2)}</td>
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
    </div>
  );
};