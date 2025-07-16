
import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { ArrowLeft, Calculator } from 'lucide-react';

const loanSchema = z.object({
  client_id: z.string().min(1, 'Debe seleccionar un cliente'),
  amount: z.number().min(1, 'El monto debe ser mayor a 0'),
  interest_rate: z.number().min(0, 'La tasa de interés debe ser mayor o igual a 0'),
  term_months: z.number().min(1, 'El plazo debe ser al menos 1 mes'),
  loan_type: z.string().min(1, 'Debe seleccionar un tipo de préstamo'),
  purpose: z.string().optional(),
  collateral: z.string().optional(),
  guarantor_name: z.string().optional(),
  guarantor_phone: z.string().optional(),
  guarantor_address: z.string().optional(),
  guarantor_dni: z.string().optional(),
  notes: z.string().optional(),
});

type LoanFormData = z.infer<typeof loanSchema>;

interface Client {
  id: string;
  full_name: string;
  dni: string;
}

export const LoanForm = ({ onBack }: { onBack: () => void }) => {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(false);
  const [monthlyPayment, setMonthlyPayment] = useState<number>(0);
  const { user } = useAuth();

  const form = useForm<LoanFormData>({
    resolver: zodResolver(loanSchema),
    defaultValues: {
      amount: 0,
      interest_rate: 15,
      term_months: 12,
      loan_type: 'personal',
    },
  });

  React.useEffect(() => {
    fetchClients();
  }, []);

  const fetchClients = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('clients')
      .select('id, full_name, dni')
      .eq('user_id', companyId || user.id) // Use companyId for employees, user.id for owners
      .order('full_name');

    if (error) {
      toast.error('Error al cargar clientes');
      return;
    }

    setClients(data || []);
  };

  const calculateMonthlyPayment = (amount: number, rate: number, months: number) => {
    if (amount <= 0 || rate < 0 || months <= 0) return 0;
    
    const monthlyRate = (rate / 100) / 12;
    if (monthlyRate === 0) return amount / months;
    
    const payment = (amount * monthlyRate * Math.pow(1 + monthlyRate, months)) / 
                   (Math.pow(1 + monthlyRate, months) - 1);
    
    return Math.round(payment * 100) / 100;
  };

  const watchedValues = form.watch(['amount', 'interest_rate', 'term_months']);
  
  React.useEffect(() => {
    const [amount, rate, months] = watchedValues;
    const payment = calculateMonthlyPayment(amount, rate, months);
    setMonthlyPayment(payment);
  }, [watchedValues]);

  const onSubmit = async (data: LoanFormData) => {
    if (!user) return;

    setLoading(true);
    try {
      const totalAmount = monthlyPayment * data.term_months;
      const startDate = new Date();
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + data.term_months);
      
      const nextPaymentDate = new Date();
      nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 1);

      const loanData = {
        client_id: data.client_id,
        amount: data.amount,
        interest_rate: data.interest_rate,
        term_months: data.term_months,
        loan_type: data.loan_type,
        purpose: data.purpose || null,
        collateral: data.collateral || null,
        loan_officer_id: companyId || user.id, // Use companyId for employees, user.id for owners
        monthly_payment: monthlyPayment,
        total_amount: totalAmount,
        remaining_balance: totalAmount,
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0],
        next_payment_date: nextPaymentDate.toISOString().split('T')[0],
        status: 'active',
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
        <h2 className="text-2xl font-bold">Nuevo Préstamo</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Información del Préstamo</CardTitle>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="client_id"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Cliente</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Seleccionar cliente" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className="bg-white">
                              {clients.map((client) => (
                                <SelectItem key={client.id} value={client.id}>
                                  {client.full_name} - {client.dni}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="loan_type"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Tipo de Préstamo</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Seleccionar tipo" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className="bg-white">
                              <SelectItem value="personal">Personal</SelectItem>
                              <SelectItem value="business">Comercial</SelectItem>
                              <SelectItem value="emergency">Emergencia</SelectItem>
                              <SelectItem value="vehicle">Vehículo</SelectItem>
                              <SelectItem value="home">Vivienda</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="amount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Monto del Préstamo</FormLabel>
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

                    <FormField
                      control={form.control}
                      name="interest_rate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Tasa de Interés (%)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="15.00"
                              {...field}
                              onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="term_months"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Plazo (Meses)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              placeholder="12"
                              {...field}
                              onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="purpose"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Propósito</FormLabel>
                          <FormControl>
                            <Input placeholder="Propósito del préstamo" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="collateral"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Garantía/Colateral</FormLabel>
                        <FormControl>
                          <Textarea placeholder="Descripción de la garantía..." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold">Información del Garante (Opcional)</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="guarantor_name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Nombre del Garante</FormLabel>
                            <FormControl>
                              <Input placeholder="Nombre completo" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="guarantor_dni"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Cédula del Garante</FormLabel>
                            <FormControl>
                              <Input placeholder="000-0000000-0" {...field} />
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
                            <FormLabel>Teléfono del Garante</FormLabel>
                            <FormControl>
                              <Input placeholder="(809) 000-0000" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="guarantor_address"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Dirección del Garante</FormLabel>
                            <FormControl>
                              <Input placeholder="Dirección completa" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Notas Adicionales</FormLabel>
                        <FormControl>
                          <Textarea placeholder="Observaciones o notas adicionales..." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex gap-4">
                    <Button type="button" variant="outline" onClick={onBack}>
                      Cancelar
                    </Button>
                    <Button type="submit" disabled={loading}>
                      {loading ? 'Creando...' : 'Crear Préstamo'}
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calculator className="h-5 w-5" />
                Calculadora
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Monto:</span>
                  <span className="font-semibold">${form.watch('amount')?.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Tasa:</span>
                  <span className="font-semibold">{form.watch('interest_rate')}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Plazo:</span>
                  <span className="font-semibold">{form.watch('term_months')} meses</span>
                </div>
                <hr />
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Cuota Mensual:</span>
                  <span className="font-bold text-lg text-green-600">
                    ${monthlyPayment.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Total a Pagar:</span>
                  <span className="font-semibold">
                    ${(monthlyPayment * form.watch('term_months')).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Intereses:</span>
                  <span className="font-semibold text-orange-600">
                    ${((monthlyPayment * form.watch('term_months')) - form.watch('amount')).toLocaleString()}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};
