import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { formatCurrencyNumber } from '@/lib/utils';
import { 
  X,
  FileText,
  Receipt,
  History,
  StickyNote,
  Handshake,
  Paperclip,
  FileCheck,
  Shield,
  Calendar,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Clock,
  CheckCircle,
  AlertCircle,
  Eye,
  BarChart3,
  PieChart
} from 'lucide-react';
import { LoanHistoryView } from './LoanHistoryView';
import { AccountStatement } from './AccountStatement';
import { InstallmentsTable } from './InstallmentsTable';
import { useNavigate } from 'react-router-dom';

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
  const [showDocuments, setShowDocuments] = useState(false);
  const [showGuarantees, setShowGuarantees] = useState(false);
  const [showInstallments, setShowInstallments] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (isOpen && loanId) {
      fetchLoanDetails();
      fetchPayments();
      fetchInstallments();
    }
  }, [isOpen, loanId]);

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
    } catch (error) {
      console.error('Error fetching installments:', error);
    }
  };

  if (!loan) {
    return null;
  }

  // Calcular estadísticas
  const totalPaid = payments.reduce((sum, p) => sum + (p.principal_amount || 0), 0);
  const totalInterestPaid = payments.reduce((sum, p) => sum + (p.interest_amount || 0), 0);
  const totalLateFeePaid = payments.reduce((sum, p) => sum + (p.late_fee || 0), 0);
  const capitalPending = loan.amount - totalPaid;
  
  // Calcular interés pendiente basado en cuotas no pagadas
  const interestPendingFromInstallments = installments
    .filter(inst => !inst.is_paid)
    .reduce((sum, inst) => sum + (inst.interest_amount || 0), 0);
  
  // Usar el cálculo de cuotas si está disponible, sino usar el cálculo estimado
  const interestPending = interestPendingFromInstallments > 0 
    ? interestPendingFromInstallments 
    : (loan.amount * loan.interest_rate / 100 * loan.term_months) - totalInterestPaid;
  
  const totalPending = capitalPending + interestPending + (loan.current_late_fee || 0);
  const amountToPay = loan.monthly_payment + (loan.current_late_fee || 0);
  const toSettle = loan.remaining_balance + (loan.current_late_fee || 0);

  // Calcular porcentaje pagado
  const paidPercentage = loan.amount > 0 ? (totalPaid / loan.amount) * 100 : 0;
  const pendingPercentage = 100 - paidPercentage;

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
                        <span className="text-gray-600">Capital:</span>
                        <div className="font-semibold">RD {loan.amount.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                      </div>
                      <div>
                        <span className="text-gray-600">Cuotas:</span>
                        <div className="font-semibold">RD {loan.monthly_payment.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                      </div>
                      <div>
                        <span className="text-gray-600">Fecha inicio:</span>
                        <div className="font-semibold">{new Date(loan.start_date).toLocaleDateString('es-DO')}</div>
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
                        <span className="text-gray-600">Interés generado al día de hoy:</span>
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
                        <div className="font-semibold">{new Date(loan.next_payment_date).toLocaleDateString('es-DO')}</div>
                      </div>
                      <div>
                        <span className="text-gray-600">Fecha final:</span>
                        <div className="font-semibold">{new Date(loan.end_date).toLocaleDateString('es-DO')}</div>
                      </div>
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
                            <span className="text-gray-600">Tipo de cálculo:</span>
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
                    <div>
                      <div className="text-sm text-gray-600">Interés pend. total</div>
                      <div className="text-lg font-semibold">RD {interestPending.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-600">Capital pend. total</div>
                      <div className="text-lg font-semibold">RD {loan.amount.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>PAGADO</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <div className="text-sm text-gray-600">Capital pagado</div>
                      <div className="text-lg font-semibold text-green-600">RD {totalPaid.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-600">Otros pagado</div>
                      <div className="text-lg font-semibold">RD 0.00</div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>RESUMEN</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <div className="text-sm text-gray-600">Mora pendiente</div>
                      <div className="text-lg font-semibold text-red-600">RD {(loan.current_late_fee || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-600">Otros pendiente</div>
                      <div className="text-lg font-semibold">RD {interestPending.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
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
                    <div className="text-2xl font-bold">RD {loan.monthly_payment.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
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
                            strokeDasharray={`${(paidPercentage / 100) * 502.4} 502.4`}
                            strokeLinecap="round"
                          />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="text-center">
                            <div className="text-2xl font-bold">{pendingPercentage.toFixed(1)}%</div>
                            <div className="text-sm text-gray-600">Pendiente</div>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span>Capital RD{totalPaid.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Pagado</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Capital RD{capitalPending.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Pendiente</span>
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
                <Button variant="outline" onClick={() => setShowDocuments(true)}>
                  <Paperclip className="h-4 w-4 mr-2" />
                  Ver adjuntos
                </Button>
                <Button variant="outline" onClick={() => setShowDocuments(true)}>
                  <FileCheck className="h-4 w-4 mr-2" />
                  Ver documentos
                </Button>
                <Button variant="outline" onClick={() => setShowGuarantees(true)}>
                  <Shield className="h-4 w-4 mr-2" />
                  Garantías
                </Button>
                <Button variant="outline" onClick={() => {
                  // Navegar a turnos con el día de pago como parámetro
                  navigate(`/turnos?date=${loan.next_payment_date}&loan_id=${loan.id}&client_id=${loan.client.dni}`);
                }}>
                  <Calendar className="h-4 w-4 mr-2" />
                  Agendas
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

      {/* Modales simples para notas, acuerdos, documentos, garantías */}
      {showNotes && (
        <Dialog open={showNotes} onOpenChange={setShowNotes}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Notas de Seguimiento</DialogTitle>
            </DialogHeader>
            <div className="p-4">
              <p className="text-gray-600">Funcionalidad de notas próximamente...</p>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {showAgreements && (
        <Dialog open={showAgreements} onOpenChange={setShowAgreements}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Acuerdos de Pago</DialogTitle>
            </DialogHeader>
            <div className="p-4">
              <p className="text-gray-600">Funcionalidad de acuerdos próximamente...</p>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {showDocuments && (
        <Dialog open={showDocuments} onOpenChange={setShowDocuments}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Documentos y Adjuntos</DialogTitle>
            </DialogHeader>
            <div className="p-4">
              <p className="text-gray-600">Funcionalidad de documentos próximamente...</p>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {showGuarantees && (
        <Dialog open={showGuarantees} onOpenChange={setShowGuarantees}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Garantías</DialogTitle>
            </DialogHeader>
            <div className="p-4">
              <p className="text-gray-600">Funcionalidad de garantías próximamente...</p>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
};

