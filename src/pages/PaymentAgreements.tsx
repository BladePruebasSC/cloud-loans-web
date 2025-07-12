import React, { useState, useEffect } from 'react';
import { supabase } from '../integrations/supabase/client';
import { Calendar, DollarSign, User, Clock, CheckCircle, XCircle, Plus, Edit, Trash2, FileText } from 'lucide-react';
import { Database } from '../types/supabase';

type Payment = Database['public']['Tables']['payments']['Row'];
type Loan = Database['public']['Tables']['loans']['Row'];
type Client = Database['public']['Tables']['clients']['Row'];

interface PaymentAgreementData {
  id: string;
  loan_id: string;
  client_name: string;
  loan_amount: number;
  agreed_payment_amount: number;
  payment_frequency: string;
  start_date: string;
  end_date: string;
  status: string;
  notes?: string;
  created_at: string;
}

interface PaymentFormData {
  loan_id: string;
  agreed_payment_amount: number;
  payment_frequency: string;
  start_date: string;
  end_date: string;
  notes?: string;
}

const PaymentAgreements: React.FC = () => {
  const [agreements, setAgreements] = useState<PaymentAgreementData[]>([]);
  const [loans, setLoans] = useState<(Loan & { client: Client })[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingAgreement, setEditingAgreement] = useState<PaymentAgreementData | null>(null);
  const [formData, setFormData] = useState<PaymentFormData>({
    loan_id: '',
    agreed_payment_amount: 0,
    payment_frequency: 'weekly',
    start_date: '',
    end_date: '',
    notes: ''
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Load loans with client information
      const { data: loansData, error: loansError } = await supabase
        .from('loans')
        .select(`
          *,
          client:clients(*)
        `)
        .eq('status', 'active');

      if (loansError) throw loansError;
      setLoans(loansData || []);

      // Load payment agreements (stored in payments table with special type)
      const { data: agreementsData, error: agreementsError } = await supabase
        .from('payments')
        .select(`
          *,
          loan:loans(
            *,
            client:clients(*)
          )
        `)
        .eq('payment_type', 'agreement');

      if (agreementsError) throw agreementsError;
      
      // Transform data for display
      const transformedAgreements = agreementsData?.map(agreement => ({
        id: agreement.id,
        loan_id: agreement.loan_id,
        client_name: agreement.loan?.client?.name || 'N/A',
        loan_amount: agreement.loan?.amount || 0,
        agreed_payment_amount: agreement.amount,
        payment_frequency: agreement.payment_method || 'weekly',
        start_date: agreement.payment_date,
        end_date: agreement.due_date || '',
        status: agreement.status || 'pending',
        notes: agreement.notes || '',
        created_at: agreement.created_at
      })) || [];

      setAgreements(transformedAgreements);
    } catch (err) {
      console.error('Error loading data:', err);
      setError('Error al cargar los datos');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setError(null);
      
      const paymentData = {
        loan_id: formData.loan_id,
        amount: formData.agreed_payment_amount,
        payment_date: formData.start_date,
        due_date: formData.end_date,
        payment_method: formData.payment_frequency,
        payment_type: 'agreement',
        status: 'pending',
        notes: formData.notes
      };

      if (editingAgreement) {
        const { error } = await supabase
          .from('payments')
          .update(paymentData)
          .eq('id', editingAgreement.id);
        
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('payments')
          .insert([paymentData]);
        
        if (error) throw error;
      }

      setShowForm(false);
      setEditingAgreement(null);
      setFormData({
        loan_id: '',
        agreed_payment_amount: 0,
        payment_frequency: 'weekly',
        start_date: '',
        end_date: '',
        notes: ''
      });
      
      loadData();
    } catch (err) {
      console.error('Error saving agreement:', err);
      setError('Error al guardar el acuerdo');
    }
  };

  const handleEdit = (agreement: PaymentAgreementData) => {
    setEditingAgreement(agreement);
    setFormData({
      loan_id: agreement.loan_id,
      agreed_payment_amount: agreement.agreed_payment_amount,
      payment_frequency: agreement.payment_frequency,
      start_date: agreement.start_date,
      end_date: agreement.end_date,
      notes: agreement.notes || ''
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Está seguro de que desea eliminar este acuerdo?')) return;
    
    try {
      const { error } = await supabase
        .from('payments')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      loadData();
    } catch (err) {
      console.error('Error deleting agreement:', err);
      setError('Error al eliminar el acuerdo');
    }
  };

  const updateStatus = async (id: string, status: string) => {
    try {
      const { error } = await supabase
        .from('payments')
        .update({ status })
        .eq('id', id);
      
      if (error) throw error;
      loadData();
    } catch (err) {
      console.error('Error updating status:', err);
      setError('Error al actualizar el estado');
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-DO', {
      style: 'currency',
      currency: 'DOP'
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-DO');
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Acuerdo de Pagos</h1>
        <button
          onClick={() => {
            setShowForm(true);
            setEditingAgreement(null);
            setFormData({
              loan_id: '',
              agreed_payment_amount: 0,
              payment_frequency: 'weekly',
              start_date: '',
              end_date: '',
              notes: ''
            });
          }}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Nuevo Acuerdo
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700">{error}</p>
        </div>
      )}

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <FileText className="w-8 h-8 text-blue-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Total Acuerdos</p>
              <p className="text-2xl font-bold text-gray-900">{agreements.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <CheckCircle className="w-8 h-8 text-green-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Activos</p>
              <p className="text-2xl font-bold text-gray-900">
                {agreements.filter(a => a.status === 'active').length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <Clock className="w-8 h-8 text-orange-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Pendientes</p>
              <p className="text-2xl font-bold text-gray-900">
                {agreements.filter(a => a.status === 'pending').length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <DollarSign className="w-8 h-8 text-purple-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Monto Total</p>
              <p className="text-2xl font-bold text-gray-900">
                {formatCurrency(
                  agreements.reduce((sum, agreement) => sum + agreement.agreed_payment_amount, 0)
                )}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Agreements Table */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-900">Acuerdos de Pago</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Cliente
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Monto Préstamo
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Pago Acordado
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Frecuencia
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Fecha Inicio
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Estado
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {agreements.map((agreement) => (
                <tr key={agreement.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <User className="w-4 h-4 text-gray-400 mr-2" />
                      <div className="text-sm font-medium text-gray-900">
                        {agreement.client_name}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {formatCurrency(agreement.loan_amount)}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {formatCurrency(agreement.agreed_payment_amount)}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900 capitalize">
                      {agreement.payment_frequency === 'weekly' ? 'Semanal' :
                       agreement.payment_frequency === 'monthly' ? 'Mensual' :
                       agreement.payment_frequency === 'biweekly' ? 'Quincenal' :
                       agreement.payment_frequency}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {formatDate(agreement.start_date)}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <select
                      value={agreement.status}
                      onChange={(e) => updateStatus(agreement.id, e.target.value)}
                      className={`text-xs px-2 py-1 rounded-full border-0 focus:ring-2 focus:ring-blue-500 ${
                        agreement.status === 'active' ? 'bg-green-100 text-green-800' :
                        agreement.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                        agreement.status === 'completed' ? 'bg-blue-100 text-blue-800' :
                        'bg-red-100 text-red-800'
                      }`}
                    >
                      <option value="pending">Pendiente</option>
                      <option value="active">Activo</option>
                      <option value="completed">Completado</option>
                      <option value="cancelled">Cancelado</option>
                    </select>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleEdit(agreement)}
                        className="text-indigo-600 hover:text-indigo-900"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(agreement.id)}
                        className="text-red-600 hover:text-red-900"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <h2 className="text-lg font-medium mb-4">
              {editingAgreement ? 'Editar Acuerdo' : 'Nuevo Acuerdo de Pago'}
            </h2>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Préstamo
                </label>
                <select
                  value={formData.loan_id}
                  onChange={(e) => setFormData({ ...formData, loan_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                >
                  <option value="">Seleccionar préstamo</option>
                  {loans.map((loan) => (
                    <option key={loan.id} value={loan.id}>
                      {loan.client?.name} - {formatCurrency(loan.amount)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Monto del Pago Acordado
                </label>
                <input
                  type="number"
                  value={formData.agreed_payment_amount}
                  onChange={(e) => setFormData({ ...formData, agreed_payment_amount: parseFloat(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                  step="0.01"
                  min="0"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Frecuencia de Pago
                </label>
                <select
                  value={formData.payment_frequency}
                  onChange={(e) => setFormData({ ...formData, payment_frequency: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                >
                  <option value="weekly">Semanal</option>
                  <option value="biweekly">Quincenal</option>
                  <option value="monthly">Mensual</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Fecha de Inicio
                </label>
                <input
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Fecha de Finalización
                </label>
                <input
                  type="date"
                  value={formData.end_date}
                  onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notas (Opcional)
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  rows={3}
                  placeholder="Notas adicionales sobre el acuerdo..."
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  {editingAgreement ? 'Actualizar' : 'Crear'} Acuerdo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default PaymentAgreements;
