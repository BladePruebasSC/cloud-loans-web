
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Calculator, DollarSign, Percent, Calendar } from 'lucide-react';

interface LoanCalculatorProps {
  onSubmitLoan?: (loanData: LoanRequest) => void;
  onBack?: () => void;
}

interface LoanRequest {
  amount: number;
  interestRate: number;
  term: number;
  monthlyPayment: number;
  totalInterest: number;
  totalAmount: number;
}

const LoanCalculator = ({ onSubmitLoan, onBack }: LoanCalculatorProps) => {
  const [amount, setAmount] = useState(10000);
  const [interestRate, setInterestRate] = useState(12);
  const [term, setTerm] = useState(12);
  const [monthlyPayment, setMonthlyPayment] = useState(0);
  const [totalInterest, setTotalInterest] = useState(0);
  const [totalAmount, setTotalAmount] = useState(0);

  const calculateLoan = () => {
    const monthlyRate = interestRate / 100 / 12;
    const payment = amount * (monthlyRate * Math.pow(1 + monthlyRate, term)) / (Math.pow(1 + monthlyRate, term) - 1);
    const total = payment * term;
    const interest = total - amount;

    setMonthlyPayment(Math.round(payment * 100) / 100);
    setTotalAmount(Math.round(total * 100) / 100);
    setTotalInterest(Math.round(interest * 100) / 100);
  };

  useEffect(() => {
    calculateLoan();
  }, [amount, interestRate, term]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR'
    }).format(amount);
  };

  const handleSubmit = () => {
    if (onSubmitLoan) {
      onSubmitLoan({
        amount,
        interestRate,
        term,
        monthlyPayment,
        totalInterest,
        totalAmount
      });
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="bg-primary-500 p-2 rounded-lg">
            <Calculator className="h-6 w-6 text-white" />
          </div>
          <div>
            <h2 className="text-3xl font-bold text-gray-900">Calculadora de Préstamos</h2>
            <p className="text-gray-600">Simula tu préstamo y conoce las condiciones</p>
          </div>
        </div>
        {onBack && (
          <Button variant="outline" onClick={onBack}>
            Volver
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Calculator Form */}
        <Card>
          <CardHeader>
            <CardTitle>Parámetros del Préstamo</CardTitle>
            <CardDescription>
              Ajusta los valores para ver tu simulación
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Amount */}
            <div className="space-y-3">
              <Label className="flex items-center space-x-2">
                <DollarSign className="h-4 w-4" />
                <span>Monto del Préstamo</span>
              </Label>
              <div className="space-y-2">
                <Slider
                  value={[amount]}
                  onValueChange={(value) => setAmount(value[0])}
                  max={50000}
                  min={1000}
                  step={500}
                  className="w-full"
                />
                <Input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  min="1000"
                  max="50000"
                  step="500"
                />
              </div>
              <div className="text-sm text-gray-500">
                Entre €1,000 y €50,000
              </div>
            </div>

            {/* Interest Rate */}
            <div className="space-y-3">
              <Label className="flex items-center space-x-2">
                <Percent className="h-4 w-4" />
                <span>Tasa de Interés Anual</span>
              </Label>
              <div className="space-y-2">
                <Slider
                  value={[interestRate]}
                  onValueChange={(value) => setInterestRate(value[0])}
                  max={25}
                  min={5}
                  step={0.5}
                  className="w-full"
                />
                <Input
                  type="number"
                  value={interestRate}
                  onChange={(e) => setInterestRate(Number(e.target.value))}
                  min="5"
                  max="25"
                  step="0.5"
                />
              </div>
              <div className="text-sm text-gray-500">
                Entre 5% y 25% anual
              </div>
            </div>

            {/* Term */}
            <div className="space-y-3">
              <Label className="flex items-center space-x-2">
                <Calendar className="h-4 w-4" />
                <span>Plazo en Meses</span>
              </Label>
              <div className="space-y-2">
                <Slider
                  value={[term]}
                  onValueChange={(value) => setTerm(value[0])}
                  max={60}
                  min={6}
                  step={1}
                  className="w-full"
                />
                <Input
                  type="number"
                  value={term}
                  onChange={(e) => setTerm(Number(e.target.value))}
                  min="6"
                  max="60"
                  step="1"
                />
              </div>
              <div className="text-sm text-gray-500">
                Entre 6 y 60 meses
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Results */}
        <Card>
          <CardHeader>
            <CardTitle>Resumen del Préstamo</CardTitle>
            <CardDescription>
              Resultados de tu simulación
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-primary-50 p-4 rounded-lg">
              <div className="text-center">
                <p className="text-sm text-primary-600 font-medium">Pago Mensual</p>
                <p className="text-3xl font-bold text-primary-700">
                  {formatCurrency(monthlyPayment)}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-50 p-3 rounded-lg text-center">
                <p className="text-xs text-gray-500">Monto Solicitado</p>
                <p className="text-lg font-semibold text-gray-900">
                  {formatCurrency(amount)}
                </p>
              </div>
              <div className="bg-gray-50 p-3 rounded-lg text-center">
                <p className="text-xs text-gray-500">Total a Pagar</p>
                <p className="text-lg font-semibold text-gray-900">
                  {formatCurrency(totalAmount)}
                </p>
              </div>
            </div>

            <div className="bg-yellow-50 p-3 rounded-lg text-center">
              <p className="text-xs text-yellow-600">Total de Intereses</p>
              <p className="text-lg font-semibold text-yellow-700">
                {formatCurrency(totalInterest)}
              </p>
            </div>

            <div className="space-y-2 text-sm text-gray-600">
              <div className="flex justify-between">
                <span>Tasa de interés:</span>
                <span>{interestRate}% anual</span>
              </div>
              <div className="flex justify-between">
                <span>Plazo:</span>
                <span>{term} meses</span>
              </div>
              <div className="flex justify-between">
                <span>Tipo de amortización:</span>
                <span>Francesa</span>
              </div>
            </div>

            {onSubmitLoan && (
              <Button 
                onClick={handleSubmit}
                className="w-full mt-6"
                size="lg"
              >
                Solicitar Este Préstamo
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default LoanCalculator;
