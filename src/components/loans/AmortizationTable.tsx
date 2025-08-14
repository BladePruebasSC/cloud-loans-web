import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Calculator, 
  Copy, 
  Download, 
  Printer, 
  ArrowUpDown,
  Search,
  X
} from 'lucide-react';
import { toast } from 'sonner';

interface AmortizationRow {
  installment: number;
  date: string;
  interest: number;
  principal: number;
  payment: number;
  remainingBalance: number;
}

interface AmortizationTableProps {
  isOpen: boolean;
  onClose: () => void;
  loanData?: {
    amount: number;
    interestRate: number;
    frequency: string;
    term: number;
    startDate: string;
  };
}

export const AmortizationTable = ({ isOpen, onClose, loanData }: AmortizationTableProps) => {
  console.log('AmortizationTable renderizado, isOpen:', isOpen, 'loanData:', loanData);
  const [amount, setAmount] = useState(loanData?.amount || 10000);
  const [interestRate, setInterestRate] = useState(loanData?.interestRate || 8);
  const [frequency, setFrequency] = useState(loanData?.frequency || 'monthly');
  const [term, setTerm] = useState(loanData?.term || 12);
  const [startDate, setStartDate] = useState(loanData?.startDate || new Date().toISOString().split('T')[0]);
  const [amortizationData, setAmortizationData] = useState<AmortizationRow[]>([]);
  const [recordsPerPage, setRecordsPerPage] = useState(50);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortColumn, setSortColumn] = useState<string>('installment');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  
  // Nuevas variables para cuota fija
  const [fixedPaymentEnabled, setFixedPaymentEnabled] = useState(false);
  const [fixedPaymentAmount, setFixedPaymentAmount] = useState<number | ''>('');

  // Obtener frecuencia de pago y período
  const getFrequencyInfo = () => {
    switch (frequency) {
      case 'daily':
        return { periodsPerYear: 365, label: 'días', dateIncrement: 1 };
      case 'weekly':
        return { periodsPerYear: 52, label: 'semanas', dateIncrement: 7 };
      case 'biweekly':
        return { periodsPerYear: 26, label: 'quincenas', dateIncrement: 14 };
      case 'monthly':
        return { periodsPerYear: 12, label: 'meses', dateIncrement: 30 };
      case 'quarterly':
        return { periodsPerYear: 4, label: 'trimestres', dateIncrement: 90 };
      case 'yearly':
        return { periodsPerYear: 1, label: 'años', dateIncrement: 365 };
      default:
        return { periodsPerYear: 12, label: 'meses', dateIncrement: 30 };
    }
  };

  // Calcular tasa de interés ajustada para cuota fija
  const calculateAdjustedInterestRate = () => {
    if (!fixedPaymentEnabled || !fixedPaymentAmount || typeof fixedPaymentAmount !== 'number') {
      return interestRate;
    }

    // Calcular la tasa de interés necesaria para la cuota fija
    if (amount <= 0 || fixedPaymentAmount <= 0 || term <= 0) {
      return interestRate;
    }

    // Si la cuota es menor o igual al principal dividido por períodos, es 0% interés
    if (fixedPaymentAmount <= amount / term) {
      return 0;
    }

    // Para interés simple mensual, calcular directamente
    const totalPayment = fixedPaymentAmount * term;
    const totalInterest = totalPayment - amount;
    
    // Calcular tasa de interés mensual
    const monthlyRate = (totalInterest / amount) / term * 100;
    return Math.max(0, Math.round(monthlyRate * 100) / 100);
  };

  // Calcular tabla de amortización
  const calculateAmortization = () => {
    if (amount <= 0 || term <= 0) {
      setAmortizationData([]);
      return;
    }

    const { periodsPerYear, dateIncrement } = getFrequencyInfo();
    const adjustedInterestRate = calculateAdjustedInterestRate();
    
    // Convertir la tasa mensual a la frecuencia de pago correspondiente
    let periodRate: number;
    switch (frequency) {
      case 'daily':
        periodRate = adjustedInterestRate / 100 / 30; // Tasa diaria basada en mes de 30 días
        break;
      case 'weekly':
        periodRate = adjustedInterestRate / 100 / 4; // Tasa semanal (mes/4)
        break;
      case 'biweekly':
        periodRate = adjustedInterestRate / 100 / 2; // Tasa quincenal (mes/2)
        break;
      case 'monthly':
      default:
        periodRate = adjustedInterestRate / 100; // Tasa mensual directa
        break;
      case 'quarterly':
        periodRate = adjustedInterestRate / 100 * 3; // Tasa trimestral (mes*3)
        break;
      case 'yearly':
        periodRate = adjustedInterestRate / 100 * 12; // Tasa anual (mes*12)
        break;
    }
    
    let periodPayment: number;
    
    if (fixedPaymentEnabled && fixedPaymentAmount && typeof fixedPaymentAmount === 'number') {
      // Usar cuota fija
      periodPayment = fixedPaymentAmount;
    } else {
      // Calcular cuota normal
      if (periodRate === 0) {
        periodPayment = amount / term;
      } else {
        periodPayment = (amount * periodRate * Math.pow(1 + periodRate, term)) / 
                       (Math.pow(1 + periodRate, term) - 1);
      }
    }

    const rows: AmortizationRow[] = [];
    let remainingBalance = amount;
    const startDateObj = new Date(startDate);

    for (let i = 1; i <= term; i++) {
      const interest = remainingBalance * periodRate;
      const principal = periodPayment - interest;
      const payment = periodPayment;
      
      // Calcular fecha de pago según la frecuencia
      const paymentDate = new Date(startDateObj);
      paymentDate.setDate(paymentDate.getDate() + (dateIncrement * (i - 1)));

      rows.push({
        installment: i,
        date: paymentDate.toISOString().split('T')[0],
        interest: Math.round(interest * 100) / 100,
        principal: Math.round(principal * 100) / 100,
        payment: Math.round(payment * 100) / 100,
        remainingBalance: Math.round((remainingBalance - principal) * 100) / 100
      });

      remainingBalance -= principal;
    }

    setAmortizationData(rows);
  };

  useEffect(() => {
    if (isOpen) {
      calculateAmortization();
    }
  }, [isOpen, amount, interestRate, term, frequency, startDate, fixedPaymentEnabled, fixedPaymentAmount]);

  // Actualizar automáticamente la tasa de interés cuando cambie la cuota fija
  useEffect(() => {
    if (fixedPaymentEnabled && fixedPaymentAmount && typeof fixedPaymentAmount === 'number' && amount > 0 && term > 0) {
      const newInterestRate = calculateAdjustedInterestRate();
      if (newInterestRate !== interestRate) {
        setInterestRate(newInterestRate);
      }
    }
  }, [fixedPaymentAmount, fixedPaymentEnabled, amount, term]);

  // Filtrar y ordenar datos
  const filteredData = amortizationData.filter(row => {
    const searchLower = searchTerm.toLowerCase();
    return (
      row.installment.toString().includes(searchLower) ||
      row.date.includes(searchLower) ||
      row.interest.toString().includes(searchLower) ||
      row.principal.toString().includes(searchLower) ||
      row.payment.toString().includes(searchLower) ||
      row.remainingBalance.toString().includes(searchLower)
    );
  });

  const sortedData = [...filteredData].sort((a, b) => {
    let aValue: any = a[sortColumn as keyof AmortizationRow];
    let bValue: any = b[sortColumn as keyof AmortizationRow];

    if (sortColumn === 'date') {
      aValue = new Date(aValue).getTime();
      bValue = new Date(bValue).getTime();
    }

    if (sortDirection === 'asc') {
      return aValue > bValue ? 1 : -1;
    } else {
      return aValue < bValue ? 1 : -1;
    }
  });

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const copyToClipboard = () => {
    const tableData = sortedData.map(row => 
      `${row.installment}/${term}\t${row.date}\t${row.interest}\t${row.principal}\t${row.payment}\t${row.remainingBalance}`
    ).join('\n');
    
    navigator.clipboard.writeText(tableData);
    toast.success('Tabla copiada al portapapeles');
  };

  const exportToExcel = () => {
    const csvContent = [
      'CUOTA,FECHA,INTERES,CAPITAL,A PAGAR,CAPITAL RESTANTE',
      ...sortedData.map(row => 
        `${row.installment}/${term},${row.date},${row.interest},${row.principal},${row.payment},${row.remainingBalance}`
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `amortizacion_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Archivo Excel descargado');
  };

  const printTable = () => {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Tabla de Amortización</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 20px; }
              .header { text-align: center; margin-bottom: 30px; }
              table { width: 100%; border-collapse: collapse; margin-top: 20px; }
              th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
              th { background-color: #f2f2f2; font-weight: bold; }
              .totals { margin-top: 20px; font-weight: bold; }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>Tabla de Amortización</h1>
              <p>Monto: $${amount.toLocaleString()} | Tasa: ${calculateAdjustedInterestRate().toFixed(2)}% | Plazo: ${term} {getFrequencyInfo().label}</p>
              ${fixedPaymentEnabled ? `<p>Cuota Fija: $${fixedPaymentAmount}</p>` : ''}
            </div>
            <table>
              <thead>
                <tr>
                  <th>CUOTA</th>
                  <th>FECHA</th>
                  <th>INTERES</th>
                  <th>CAPITAL</th>
                  <th>A PAGAR</th>
                  <th>CAPITAL RESTANTE</th>
                </tr>
              </thead>
              <tbody>
                ${sortedData.map(row => `
                  <tr>
                    <td>${row.installment}/${term}</td>
                    <td>${row.date}</td>
                    <td>$${row.interest.toLocaleString()}</td>
                    <td>$${row.principal.toLocaleString()}</td>
                    <td>$${row.payment.toLocaleString()}</td>
                    <td>$${row.remainingBalance.toLocaleString()}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            <div class="totals">
              <p>Total Intereses: $${sortedData.reduce((sum, row) => sum + row.interest, 0).toLocaleString()}</p>
              <p>Total Capital: $${sortedData.reduce((sum, row) => sum + row.principal, 0).toLocaleString()}</p>
              <p>Total a Pagar: $${sortedData.reduce((sum, row) => sum + row.payment, 0).toLocaleString()}</p>
            </div>
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.print();
    }
  };

  if (!isOpen) return null;

  const totalInterest = sortedData.reduce((sum, row) => sum + row.interest, 0);
  const totalPrincipal = sortedData.reduce((sum, row) => sum + row.principal, 0);
  const totalPayment = sortedData.reduce((sum, row) => sum + row.payment, 0);
  const adjustedInterestRate = calculateAdjustedInterestRate();

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-7xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center gap-4">
            <Calculator className="h-6 w-6 text-blue-600" />
            <div>
              <h2 className="text-2xl font-bold">Tabla de Amortización</h2>
              <p className="text-gray-600">Cálculo detallado de pagos del préstamo</p>
            </div>
          </div>
          <Button variant="outline" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Controls */}
        <div className="p-6 border-b bg-gray-50">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Monto del Préstamo</label>
              <Input
                type="text"
                value={amount || ''}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === '' || /^\d*\.?\d*$/.test(value)) {
                    setAmount(value === '' ? 0 : parseFloat(value) || 0);
                  }
                }}
                placeholder="0"
                className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Tasa de Interés (%)</label>
              <Input
                type="text"
                value={interestRate || ''}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === '' || /^\d*\.?\d*$/.test(value)) {
                    setInterestRate(value === '' ? 0 : parseFloat(value) || 0);
                  }
                }}
                placeholder="0"
                className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <p className="text-xs text-gray-500 mt-1">Tasa mensual</p>
              {fixedPaymentEnabled && (
                <p className="text-xs text-blue-600 mt-1">
                  Tasa ajustada: {adjustedInterestRate.toFixed(2)}%
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Frecuencia de Pago</label>
              <Select value={frequency} onValueChange={setFrequency}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Diario</SelectItem>
                  <SelectItem value="weekly">Semanal</SelectItem>
                  <SelectItem value="biweekly">Quincenal</SelectItem>
                  <SelectItem value="monthly">Mensual</SelectItem>
                  <SelectItem value="quarterly">Trimestral</SelectItem>
                  <SelectItem value="yearly">Anual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Plazo ({getFrequencyInfo().label})
              </label>
              <Input
                type="text"
                value={term || ''}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === '' || /^\d*$/.test(value)) {
                    setTerm(value === '' ? 0 : parseInt(value) || 0);
                  }
                }}
                placeholder="0"
                className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Fecha de Inicio</label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            
            {/* Cuota Fija */}
            <div className="col-span-2">
                          setFixedPaymentAmount(value === '' ? '' : parseFloat(value) || 0);
                    type="checkbox"
                        placeholder="0.00"
                    className="rounded"
                  />
                  <label className="text-sm font-medium">Fijar Cuota</label>
                </div>
                {fixedPaymentEnabled && (
                  <div className="flex-1">
                    <Input
                      type="text"
                      value={fixedPaymentAmount || ''}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value === '' || /^\d*\.?\d*$/.test(value)) {
                          setFixedPaymentAmount(value === '' ? '' : parseFloat(value) || '');
                        }
                      }}
                      placeholder="0"
                      className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
                        type="number"
                        step="0.01"
                        min="0"

        {/* Table Controls */}
        <div className="p-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm">Mostrar</span>
              <Select value={recordsPerPage.toString()} onValueChange={(value) => setRecordsPerPage(parseInt(value))}>
                <SelectTrigger className="w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-sm">registros</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-gray-400" />
              <Input
                placeholder="Buscar..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-48"
              />
            </div>
            <Button variant="outline" onClick={copyToClipboard}>
              <Copy className="h-4 w-4 mr-2" />
              Copiar
            </Button>
            <Button variant="outline" onClick={exportToExcel}>
              <Download className="h-4 w-4 mr-2" />
              Excel
            </Button>
            <Button variant="outline" onClick={printTable}>
              <Printer className="h-4 w-4 mr-2" />
              Imprimir
            </Button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-auto max-h-[60vh]">
          <table className="w-full border-collapse">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="border p-3 text-left font-medium">
                  <button 
                    className="flex items-center gap-1 hover:bg-gray-100 p-1 rounded"
                    onClick={() => handleSort('installment')}
                  >
                    CUOTA
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="border p-3 text-left font-medium">
                  <button 
                    className="flex items-center gap-1 hover:bg-gray-100 p-1 rounded"
                    onClick={() => handleSort('date')}
                  >
                    FECHA
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="border p-3 text-left font-medium">
                  <button 
                    className="flex items-center gap-1 hover:bg-gray-100 p-1 rounded"
                    onClick={() => handleSort('interest')}
                  >
                    INTERES
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="border p-3 text-left font-medium">
                  <button 
                    className="flex items-center gap-1 hover:bg-gray-100 p-1 rounded"
                    onClick={() => handleSort('principal')}
                  >
                    CAPITAL
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="border p-3 text-left font-medium">
                  <button 
                    className="flex items-center gap-1 hover:bg-gray-100 p-1 rounded"
                    onClick={() => handleSort('payment')}
                  >
                    A PAGAR
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="border p-3 text-left font-medium">
                  <button 
                    className="flex items-center gap-1 hover:bg-gray-100 p-1 rounded"
                    onClick={() => handleSort('remainingBalance')}
                  >
                    CAPITAL RESTANTE
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedData.slice(0, recordsPerPage).map((row, index) => (
                <tr key={index} className="hover:bg-gray-50">
                  <td className="border p-3">{row.installment}/{term}</td>
                  <td className="border p-3">{row.date}</td>
                  <td className="border p-3">${row.interest.toLocaleString()}</td>
                  <td className="border p-3">${row.principal.toLocaleString()}</td>
                  <td className="border p-3">${row.payment.toLocaleString()}</td>
                  <td className="border p-3">${row.remainingBalance.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="p-4 border-t bg-gray-50">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <span className="text-sm text-gray-600">INTERES:</span>
              <div className="font-bold">${totalInterest.toLocaleString()}</div>
            </div>
            <div>
              <span className="text-sm text-gray-600">CAPITAL:</span>
              <div className="font-bold">${totalPrincipal.toLocaleString()}</div>
            </div>
            <div>
              <span className="text-sm text-gray-600">A PAGAR:</span>
              <div className="font-bold">${totalPayment.toLocaleString()}</div>
            </div>
          </div>
        </div>

        {/* Pagination Info */}
        <div className="p-4 border-t text-center text-sm text-gray-600">
          Mostrando registros del 1 al {Math.min(recordsPerPage, sortedData.length)} de un total de {sortedData.length} registros
        </div>
      </div>
    </div>
  );
};
