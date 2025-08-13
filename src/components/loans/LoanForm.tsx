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
import { ArrowLeft, Calculator, Search, User, DollarSign, Calendar, Percent } from 'lucide-react';

  const loanSchema = z.object({
    client_id: z.string().min(1, 'Debe seleccionar un cliente'),
    amount: z.number().min(1, 'El monto debe ser mayor a 0'),
    interest_rate: z.number().min(0, 'La tasa de interés debe ser mayor o igual a 0'),
    term_months: z.number().min(1, 'El plazo debe ser al menos 1 mes'),
    loan_type: z.string().min(1, 'Debe seleccionar un tipo de préstamo'),
    amortization_type: z.string().default('simple'),
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

export const LoanForm = ({ onBack }: { onBack: () => void }) => {
  const [clients, setClients] = useState<Client[]>([]);
  const [filteredClients, setFilteredClients] = useState<Client[]>([]);
  const [clientSearch, setClientSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [totalAmount, setTotalAmount] = useState<number>(0);
  const [totalPayments, setTotalPayments] = useState<number>(0);
  const [excludedDays, setExcludedDays] = useState<string[]>([]);
  const { user, companyId } = useAuth();

  const form = useForm<LoanFormData>({
    resolver: zodResolver(loanSchema),
    defaultValues: {
      amount: 0,
      interest_rate: 15,
      term_months: 12,
      loan_type: 'personal',
      amortization_type: 'simple',
      payment_frequency: 'monthly',
      first_payment_date: new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString().split('T')[0],
      closing_costs: 0,
      minimum_payment_percentage: 100,
      minimum_payment_type: 'interest',
    },
  });

  useEffect(() => {
    fetchClients();
  }, []);

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
      setFilteredClients(clients);
      setShowClientDropdown(false);
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

  const calculatePayment = (amount: number, rate: number, term: number, amortizationType: string, frequency: string, fixedPayment?: number) => {
    if (amount <= 0 || rate < 0 || term <= 0) return { payment: 0, total: 0, totalPayments: 0 };
    
    // Convertir term y rate según la frecuencia
    let periods = term;
    let periodRate = rate / 100;
    
    switch (frequency) {
      case 'daily':
        periods = term * 30; // Aproximadamente 30 días por mes
        periodRate = periodRate / 365;
        break;
      case 'weekly':
        periods = term * 4; // 4 semanas por mes
        periodRate = periodRate / 52;
        break;
      case 'biweekly':
        periods = term * 2; // 2 quincenas por mes
        periodRate = periodRate / 24;
        break;
      case 'monthly':
      default:
        periods = term;
        periodRate = periodRate / 12;
        break;
    }

    if (fixedPayment && fixedPayment > 0) {
      // Cuota fija - calcular total basado en la cuota fija
      const total = fixedPayment * periods;
      return { 
        payment: Math.round(fixedPayment * 100) / 100, 
        total: Math.round(total * 100) / 100,
        totalPayments: periods
      };
    }
    
    if (amortizationType === 'simple') {
      // Interés simple
      const totalInterest = amount * periodRate * periods;
      const total = amount + totalInterest;
      const payment = total / periods;
      return { 
        payment: Math.round(payment * 100) / 100, 
        total: Math.round(total * 100) / 100,
        totalPayments: periods
      };
    } else {
      // Interés compuesto (amortización francesa)
      if (periodRate === 0) {
        const payment = amount / periods;
        return { 
          payment: Math.round(payment * 100) / 100, 
          total: Math.round(amount * 100) / 100,
          totalPayments: periods
        };
      }
      
      const payment = (amount * periodRate * Math.pow(1 + periodRate, periods)) / 
                     (Math.pow(1 + periodRate, periods) - 1);
      const total = payment * periods;
      
      return { 
        payment: Math.round(payment * 100) / 100, 
        total: Math.round(total * 100) / 100,
        totalPayments: periods
      };
    }
  };

  const watchedValues = form.watch(['amount', 'interest_rate', 'term_months', 'amortization_type', 'payment_frequency', 'fixed_payment_enabled', 'fixed_payment_amount']);
  
  useEffect(() => {
    const [amount, rate, months, amortizationType, frequency, fixedEnabled, fixedAmount] = watchedValues;
    const { payment, total, totalPayments } = calculatePayment(
      amount, 
      rate, 
      months, 
      amortizationType, 
      frequency,
      fixedEnabled ? fixedAmount : undefined
    );
    setPaymentAmount(payment);
    setTotalAmount(total);
    setTotalPayments(totalPayments);
  }, [watchedValues]);

  const handleExcludedDayChange = (day: string, checked: boolean) => {
    if (checked) {
      setExcludedDays(prev => [...prev, day]);
    } else {
      setExcludedDays(prev => prev.filter(d => d !== day));
    }
  };

  const onSubmit = async (data: LoanFormData) => {
    if (!user || !companyId || !selectedClient) return;

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
        monthly_payment: paymentAmount,
        total_amount: totalAmount,
        remaining_balance: totalAmount,
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

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Volver
        </Button>
        <h2 className="text-2xl font-bold">Crear Préstamo</h2>
        <p className="text-gray-600">¿No sabes como crear un préstamo?</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {/* Información Principal */}
              <Card>
                <CardHeader className="bg-blue-500 text-white">
                  <CardTitle className="text-lg">INFORMACIÓN PRINCIPAL</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 pt-6">
                  {/* Búsqueda de Cliente */}
                  <div className="space-y-2">
                    <FormLabel>Cliente:</FormLabel>
                    <div className="relative">
                      <div className="flex items-center">
                        <Search className="h-4 w-4 text-gray-400 absolute left-3 z-10" />
                        <Input
                          placeholder="Buscar cliente por nombre, cédula o teléfono..."
                          value={clientSearch}
                          onChange={(e) => handleClientSearch(e.target.value)}
                          className="pl-10"
                          onFocus={() => setShowClientDropdown(filteredClients.length > 0)}
                        />
                      </div>
                      
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

                  <div className="grid grid-cols-3 gap-4">
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
                                step="0.01"
                                placeholder="0"
                                {...field}
                                onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div>
                      <FormLabel>Cuota Calculada:</FormLabel>
                      <div className="p-2 bg-gray-100 rounded border">
                        <span className="font-semibold text-lg">
                          ${paymentAmount.toLocaleString()}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-end">
                      <Button 
                        type="button" 
                        className="w-full bg-blue-500 hover:bg-blue-600"
                        onClick={() => {
                          // Trigger calculation by updating watched values
                          const currentValues = form.getValues();
                          const { payment, total, totalPayments } = calculatePayment(
                            currentValues.amount,
                            currentValues.interest_rate,
                            currentValues.term_months,
                            currentValues.amortization_type,
                            currentValues.payment_frequency,
                            currentValues.fixed_payment_enabled ? currentValues.fixed_payment_amount : undefined
                          );
                          setPaymentAmount(payment);
                          setTotalAmount(total);
                          setTotalPayments(totalPayments);
                        }}
                      >
                        📊 CALCULAR PRÉSTAMO
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <FormLabel className="flex items-center gap-2">
                        Porcentaje interés:
                        <span className="text-blue-500 cursor-pointer">Lista de interés</span>
                      </FormLabel>
                      <FormField
                        control={form.control}
                        name="interest_rate"
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <Input
                                type="number"
                                step="0.01"
                                placeholder="0"
                                {...field}
                                onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

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
                                placeholder="1"
                                {...field}
                                onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
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
                                <SelectItem value="compound">COMPUESTO | FRANCÉS</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
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
                    <Button type="button" className="bg-blue-500 hover:bg-blue-600 px-8">
                      CUOTAS
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Información Adicional */}
              <Card>
                <CardHeader className="bg-blue-500 text-white">
                  <CardTitle className="text-lg">INFORMACIÓN ADICIONAL</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 pt-6">
                  {/* Días excluidos */}
                  <div>
                    <FormLabel>Días excluidos</FormLabel>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'].map((day) => (
                        <label key={day} className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={excludedDays.includes(day)}
                            onChange={(e) => handleExcludedDayChange(day, e.target.checked)}
                            className="rounded"
                          />
                          <span className="text-sm">{day}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
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
                                step="0.01"
                                placeholder="0"
                                {...field}
                                onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
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

                  {/* Configuraciones adicionales */}
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <FormLabel>Pago mínimo</FormLabel>
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
                                <SelectItem value="both">Ambos</SelectItem>
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
                                  placeholder="100"
                                  {...field}
                                  onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
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
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-3">
                      <FormField
                        control={form.control}
                        name="fixed_payment_enabled"
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
                            <FormLabel className="text-sm">Fijar Cuota</FormLabel>
                          </FormItem>
                        )}
                      />

                      {form.watch('fixed_payment_enabled') && (
                        <FormField
                          control={form.control}
                          name="fixed_payment_amount"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Monto Cuota Fija</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  step="0.01"
                                  placeholder="0.00"
                                  {...field}
                                  onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}

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

                      <div className="flex items-center space-x-2">
                        <input type="checkbox" defaultChecked className="rounded" />
                        <FormLabel className="text-sm">
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
                  disabled={loading || !selectedClient}
                  className="bg-green-500 hover:bg-green-600 px-12 py-3 text-lg"
                >
                  💰 CREAR PRÉSTAMO
                </Button>
              </div>
            </form>
          </Form>
        </div>

        {/* Panel de Cálculo */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calculator className="h-5 w-5" />
                Calculadora de Préstamo
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Cliente:</span>
                  <span className="font-semibold">{selectedClient?.full_name || 'No seleccionado'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Monto:</span>
                  <span className="font-semibold">${form.watch('amount')?.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Tasa:</span>
                  <span className="font-semibold">{form.watch('interest_rate')}%</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Plazo:</span>
                  <span className="font-semibold">{form.watch('term_months')} meses</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Amortización:</span>
                  <span className="font-semibold">
                    {form.watch('amortization_type') === 'simple' ? 'Simple' : 'Compuesto'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Frecuencia:</span>
                  <span className="font-semibold">
                    {form.watch('payment_frequency') === 'monthly' ? 'Mensual' :
                     form.watch('payment_frequency') === 'biweekly' ? 'Quincenal' :
                     form.watch('payment_frequency') === 'weekly' ? 'Semanal' : 'Diario'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Total de Pagos:</span>
                  <span className="font-semibold">{totalPayments} pagos</span>
                </div>
                {form.watch('fixed_payment_enabled') && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-blue-600">🔒 Cuota Fija:</span>
                    <span className="font-semibold text-blue-600">
                      ${form.watch('fixed_payment_amount')?.toLocaleString() || '0'}
                    </span>
                  </div>
                )}
                <hr />
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Cuota {form.watch('fixed_payment_enabled') ? 'Fija' : 'Calculada'}:</span>
                  <span className="font-bold text-lg text-green-600">
                    ${paymentAmount.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Total a Pagar:</span>
                  <span className="font-semibold">
                    ${totalAmount.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Intereses:</span>
                  <span className="font-semibold text-orange-600">
                    ${(totalAmount - form.watch('amount')).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Gastos de cierre:</span>
                  <span className="font-semibold">
                    ${((form.watch('amount') * form.watch('closing_costs')) / 100).toLocaleString()}
                  </span>
                </div>
              </div>

              {form.watch('guarantor_required') && (
                <div className="space-y-3 pt-4 border-t">
                  <h4 className="font-semibold">Información del Garante</h4>
                  <FormField
                    control={form.control}
                    name="guarantor_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nombre</FormLabel>
                        <FormControl>
                          <Input placeholder="Nombre del garante" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="guarantor_phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Teléfono</FormLabel>
                        <FormControl>
                          <Input placeholder="Teléfono del garante" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};