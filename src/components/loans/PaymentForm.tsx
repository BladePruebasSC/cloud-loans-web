
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
import { ArrowLeft, DollarSign } from 'lucide-react';

const paymentSchema = z.object({
  loan_id: z.string().min(1, 'Debe seleccionar un préstamo'),
  amount: z.number().min(0.01, 'El monto debe ser mayor a 0'),
  payment_method: z.string().min(1, 'Debe seleccionar un método de pago'),
  reference_number: z.string().optional(),
  notes: z.string().optional(),
});

type PaymentFormData = z.infer<typeof paymentSchema>;

interface Loan {
  id: string;
  amount: number;
  remaining_balance: number;
  monthly_payment: number;
  next_payment_date: string;
  client: {
    full_name: string;
    dni: string;
  };
}

export const PaymentForm = ({ onBack }: { onBack: () => void }) => {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [selectedLoan, setSelectedLoan] = useState<Loan | null>(null);
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();

  const form = useForm<PaymentFormData>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      payment_method: 'cash',
    },
  });

  React.useEffect(() => {
    fetchActiveLoans();
  }, []);

  const fetchActiveLoans = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('loans')
      .select(`
        id,
        amount,
        remaining_balance,
        monthly_payment,
        next_payment_date,
        clients (
          full_name,
          dni
        )
      `)
      .in('status', ['active', 'overdue'])
      .order('next_payment_date');

    if (error) {
      toast.error('Error al cargar préstamos');
      return;
    }

    setLoans(data || []);
  };

  const handleLoanSelect = (loanId: string) => {
    const loan = loans.find(l => l.id === loanId);
    setSelectedLoan(loan || null);
    if (loan) {
      form.setValue('amount', loan.monthly_payment);
    }
  };

  const onSubmit = async (data: PaymentFormData) => {
    if (!user || !selectedLoan) return;

    setLoading(true);
    try {
      // Calcular principal e intereses (simplificado)
      const monthlyPayment = selectedLoan.monthly_payment;
      const interestAmount = (selectedLoan.remaining_balance * 0.15) / 12; // Aproximado
      const principalAmount = data.amount - interestAmount;

      const paymentData = {
        loan_id: data.loan_id,
        amount: data.amount,
        principal_amount: Math.max(0, principalAmount),
        interest_amount: Math.min(data.amount, interestAmount),
        due_date: selectedLoan.next_payment_date,
        payment_method: data.payment_method,
        reference_number: data.reference_number,
        notes: data.notes,
        created_by: user.id,
      };

      const { error: paymentError } = await supabase
        .from('payments')
        .insert([paymentData]);

      if (paymentError) throw paymentError;

      // Actualizar el balance restante del préstamo
      const newBalance = Math.max(0, selectedLoan.remaining_balance - principalAmount);
      const nextPaymentDate = new Date(selectedLoan.next_payment_date);
      nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 1);

      const { error: loanError } = await supabase
        .from('loans')
        .update({
          remaining_balance: newBalance,
          next_payment_date: nextPaymentDate.toISOString().split('T')[0],
          status: newBalance <= 0 ? 'paid' : 'active',
        })
        .eq('id', data.loan_id);

      if (loanError) throw loanError;

      // Registrar movimiento de caja
      const { error: cashError } = await supabase
        .from('cash_movements')
        .insert([{
          user_id: user.id,
          type: 'in',
          amount: data.amount,
          description: `Pago de préstamo - ${selectedLoan.client?.full_name}`,
          category: 'loan_payment',
          reference_id: data.loan_id,
          reference_type: 'loan',
          created_by: user.id,
        }]);

      if (cashError) throw cashError;

      toast.success('Pago registrado exitosamente');
      onBack();
    } catch (error) {
      console.error('Error registering payment:', error);
      toast.error('Error al registrar el pago');
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
        <h2 className="text-2xl font-bold">Registrar Pago</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Información del Pago</CardTitle>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <FormField
                    control={form.control}
                    name="loan_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Préstamo</FormLabel>
                        <Select 
                          onValueChange={(value) => {
                            field.onChange(value);
                            handleLoanSelect(value);
                          }} 
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Seleccionar préstamo" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="bg-white">
                            {loans.map((loan) => (
                              <SelectItem key={loan.id} value={loan.id}>
                                {loan.client?.full_name} - Balance: ${loan.remaining_balance.toLocaleString()}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="amount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Monto del Pago</FormLabel>
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
                      name="payment_method"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Método de Pago</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Seleccionar método" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className="bg-white">
                              <SelectItem value="cash">Efectivo</SelectItem>
                              <SelectItem value="bank_transfer">Transferencia Bancaria</SelectItem>
                              <SelectItem value="check">Cheque</SelectItem>
                              <SelectItem value="card">Tarjeta</SelectItem>
                              <SelectItem value="online">Pago en línea</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="reference_number"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Número de Referencia (Opcional)</FormLabel>
                        <FormControl>
                          <Input placeholder="Número de comprobante, cheque, etc." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Notas</FormLabel>
                        <FormControl>
                          <Textarea placeholder="Observaciones adicionales..." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex gap-4">
                    <Button type="button" variant="outline" onClick={onBack}>
                      Cancelar
                    </Button>
                    <Button type="submit" disabled={loading || !selectedLoan}>
                      {loading ? 'Registrando...' : 'Registrar Pago'}
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>

        {selectedLoan && (
          <div>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  Información del Préstamo
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Cliente:</span>
                    <span className="font-semibold">{selectedLoan.client?.full_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Cédula:</span>
                    <span className="font-semibold">{selectedLoan.client?.dni}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Balance Pendiente:</span>
                    <span className="font-bold text-red-600">
                      ${selectedLoan.remaining_balance.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Cuota Mensual:</span>
                    <span className="font-semibold">
                      ${selectedLoan.monthly_payment.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Próximo Pago:</span>
                    <span className="font-semibold">
                      {new Date(selectedLoan.next_payment_date).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};
