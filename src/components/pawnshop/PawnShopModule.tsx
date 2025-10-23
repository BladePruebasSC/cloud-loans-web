import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { formatDateTimeWithOffset } from '@/utils/dateUtils';
import { 
  DollarSign, 
  Plus, 
  Search, 
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Package,
  User,
  Calendar
} from 'lucide-react';

interface PawnTransaction {
  id: string;
  client_id: string;
  product_id: string | null;
  product_name: string;
  product_description: string | null;
  estimated_value: number;
  loan_amount: number;
  interest_rate: number;
  start_date: string;
  due_date: string;
  status: 'active' | 'redeemed' | 'forfeited' | 'extended';
  notes: string | null;
  created_at: string;
  clients?: {
    id: string;
    full_name: string;
    phone: string;
  };
  products?: {
    id: string;
    name: string;
  };
}

interface PawnPayment {
  id: string;
  pawn_transaction_id: string;
  amount: number;
  payment_date: string;
  payment_type: 'partial' | 'full' | 'interest';
  notes: string | null;
}

interface Client {
  id: string;
  full_name: string;
  phone: string;
}

interface Product {
  id: string;
  name: string;
  current_stock: number;
}

export const PawnShopModule = () => {
  const [transactions, setTransactions] = useState<PawnTransaction[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showTransactionForm, setShowTransactionForm] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<PawnTransaction | null>(null);
  const { user } = useAuth();

  const [formData, setFormData] = useState({
    client_id: '',
    product_id: '',
    product_name: '',
    product_description: '',
    estimated_value: 0,
    loan_amount: 0,
    interest_rate: 5.0,
    due_date: '',
    notes: ''
  });

  const [paymentData, setPaymentData] = useState({
    amount: 0,
    payment_type: 'partial' as 'partial' | 'full' | 'interest',
    notes: ''
  });

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      const [transactionsRes, clientsRes, productsRes] = await Promise.all([
        supabase
          .from('pawn_transactions')
          .select(`
            *,
            clients(id, full_name, phone),
            products(id, name)
          `)
          .order('created_at', { ascending: false }),
        supabase
          .from('clients')
          .select('id, full_name, phone')
          .order('full_name'),
        supabase
          .from('products')
          .select('id, name, current_stock')
          .eq('status', 'active')
          .order('name')
      ]);

      if (transactionsRes.error) throw transactionsRes.error;
      if (clientsRes.error) throw clientsRes.error;
      if (productsRes.error) throw productsRes.error;

      setTransactions(transactionsRes.data || []);
      setClients(clientsRes.data || []);
      setProducts(productsRes.data || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      const transactionData = {
        user_id: user.id,
        client_id: formData.client_id,
        product_id: formData.product_id || null,
        product_name: formData.product_name,
        product_description: formData.product_description,
        estimated_value: formData.estimated_value,
        loan_amount: formData.loan_amount,
        interest_rate: formData.interest_rate,
        due_date: formData.due_date,
        notes: formData.notes,
        status: 'active'
      };

      const { error } = await supabase
        .from('pawn_transactions')
        .insert([transactionData]);

      if (error) throw error;

      toast.success('Transacción creada exitosamente');
      setShowTransactionForm(false);
      resetForm();
      fetchData();
    } catch (error) {
      console.error('Error creating transaction:', error);
      toast.error('Error al crear transacción');
    }
  };

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTransaction) return;

    try {
      const payment = {
        pawn_transaction_id: selectedTransaction.id,
        amount: paymentData.amount,
        payment_type: paymentData.payment_type,
        notes: paymentData.notes
      };

      const { error: paymentError } = await supabase
        .from('pawn_payments')
        .insert([payment]);

      if (paymentError) throw paymentError;

      // Update transaction status if full payment
      if (paymentData.payment_type === 'full') {
        const { error: updateError } = await supabase
          .from('pawn_transactions')
          .update({ status: 'redeemed' })
          .eq('id', selectedTransaction.id);

        if (updateError) throw updateError;
      }

      toast.success('Pago registrado exitosamente');
      setShowPaymentForm(false);
      setSelectedTransaction(null);
      resetPaymentForm();
      fetchData();
    } catch (error) {
      console.error('Error processing payment:', error);
      toast.error('Error al procesar pago');
    }
  };

  const handleStatusChange = async (transactionId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('pawn_transactions')
        .update({ status: newStatus })
        .eq('id', transactionId);

      if (error) throw error;
      toast.success('Estado actualizado exitosamente');
      fetchData();
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('Error al actualizar estado');
    }
  };

  const resetForm = () => {
    setFormData({
      client_id: '',
      product_id: '',
      product_name: '',
      product_description: '',
      estimated_value: 0,
      loan_amount: 0,
      interest_rate: 5.0,
      due_date: '',
      notes: ''
    });
  };

  const resetPaymentForm = () => {
    setPaymentData({
      amount: 0,
      payment_type: 'partial',
      notes: ''
    });
  };

  const filteredTransactions = transactions.filter(transaction => {
    const matchesSearch = 
      transaction.product_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      transaction.clients?.full_name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || transaction.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const activeTransactions = transactions.filter(t => t.status === 'active');
  const totalLoanAmount = activeTransactions.reduce((sum, t) => sum + Number(t.loan_amount), 0);
  const totalEstimatedValue = activeTransactions.reduce((sum, t) => sum + Number(t.estimated_value), 0);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-blue-500"><Clock className="h-3 w-3 mr-1" /> Activo</Badge>;
      case 'redeemed':
        return <Badge className="bg-green-500"><CheckCircle2 className="h-3 w-3 mr-1" /> Redimido</Badge>;
      case 'forfeited':
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" /> Perdido</Badge>;
      case 'extended':
        return <Badge className="bg-yellow-500"><AlertCircle className="h-3 w-3 mr-1" /> Extendido</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Casa de Empeño</h1>
        <Button onClick={() => setShowTransactionForm(true)} className="w-full sm:w-auto">
          <Plus className="h-4 w-4 mr-2" />
          Nueva Transacción
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Transacciones Activas</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeTransactions.length}</div>
            <p className="text-xs text-muted-foreground">En proceso</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Prestado</CardTitle>
            <DollarSign className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">${totalLoanAmount.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Monto activo</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Valor Estimado</CardTitle>
            <Package className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">${totalEstimatedValue.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">En garantía</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Transacciones</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{transactions.length}</div>
            <p className="text-xs text-muted-foreground">Historial completo</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="activas">
        <TabsList>
          <TabsTrigger value="activas">Activas</TabsTrigger>
          <TabsTrigger value="todas">Todas</TabsTrigger>
          <TabsTrigger value="reportes">Reportes</TabsTrigger>
        </TabsList>

        <TabsContent value="activas" className="space-y-6">
          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle>Filtros</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4">
                <div className="flex-1 relative">
                  <Search className="h-4 w-4 absolute left-3 top-3 text-gray-400" />
                  <Input
                    placeholder="Buscar por cliente o artículo..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Estado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los estados</SelectItem>
                    <SelectItem value="active">Activo</SelectItem>
                    <SelectItem value="redeemed">Redimido</SelectItem>
                    <SelectItem value="forfeited">Perdido</SelectItem>
                    <SelectItem value="extended">Extendido</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Transactions List */}
          <Card>
            <CardHeader>
              <CardTitle>Lista de Transacciones ({filteredTransactions.filter(t => t.status === 'active').length})</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8">Cargando transacciones...</div>
              ) : filteredTransactions.filter(t => t.status === 'active').length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No hay transacciones activas</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredTransactions.filter(t => t.status === 'active').map((transaction) => (
                    <div key={transaction.id} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="font-semibold text-lg">{transaction.product_name}</h3>
                            {getStatusBadge(transaction.status)}
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-gray-600">
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4" />
                              <span><strong>Cliente:</strong> {transaction.clients?.full_name || 'N/A'}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <DollarSign className="h-4 w-4" />
                              <span><strong>Préstamo:</strong> ${Number(transaction.loan_amount).toLocaleString()}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Package className="h-4 w-4" />
                              <span><strong>Valor Estimado:</strong> ${Number(transaction.estimated_value).toLocaleString()}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4" />
                              <span><strong>Vencimiento:</strong> {formatDateTimeWithOffset(transaction.due_date)}</span>
                            </div>
                            <div>
                              <span><strong>Interés:</strong> {transaction.interest_rate}%</span>
                            </div>
                            <div>
                              <span><strong>Inicio:</strong> {formatDateTimeWithOffset(transaction.start_date)}</span>
                            </div>
                          </div>
                          {transaction.product_description && (
                            <p className="text-sm text-gray-500 mt-2">{transaction.product_description}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        <Button 
                          size="sm" 
                          onClick={() => {
                            setSelectedTransaction(transaction);
                            setShowPaymentForm(true);
                          }}
                        >
                          Registrar Pago
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => handleStatusChange(transaction.id, 'extended')}
                        >
                          Extender
                        </Button>
                        <Button 
                          size="sm" 
                          variant="destructive"
                          onClick={() => handleStatusChange(transaction.id, 'forfeited')}
                        >
                          Marcar como Perdido
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="todas">
          <Card>
            <CardHeader>
              <CardTitle>Todas las Transacciones ({filteredTransactions.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8">Cargando transacciones...</div>
              ) : filteredTransactions.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No hay transacciones registradas</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredTransactions.map((transaction) => (
                    <div key={transaction.id} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="font-semibold text-lg">{transaction.product_name}</h3>
                            {getStatusBadge(transaction.status)}
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-gray-600">
                            <div><strong>Cliente:</strong> {transaction.clients?.full_name || 'N/A'}</div>
                            <div><strong>Préstamo:</strong> ${Number(transaction.loan_amount).toLocaleString()}</div>
                            <div><strong>Valor:</strong> ${Number(transaction.estimated_value).toLocaleString()}</div>
                            <div><strong>Vence:</strong> {formatDateTimeWithOffset(transaction.due_date)}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reportes">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Resumen General</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <span>Transacciones activas:</span>
                    <span className="font-semibold">{activeTransactions.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Total prestado (activo):</span>
                    <span className="font-semibold">${totalLoanAmount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Valor en garantía:</span>
                    <span className="font-semibold">${totalEstimatedValue.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Total transacciones:</span>
                    <span className="font-semibold">{transactions.length}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Por Estado</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <span>Activas:</span>
                    <span className="font-semibold text-blue-600">
                      {transactions.filter(t => t.status === 'active').length}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Redimidas:</span>
                    <span className="font-semibold text-green-600">
                      {transactions.filter(t => t.status === 'redeemed').length}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Perdidas:</span>
                    <span className="font-semibold text-red-600">
                      {transactions.filter(t => t.status === 'forfeited').length}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Extendidas:</span>
                    <span className="font-semibold text-yellow-600">
                      {transactions.filter(t => t.status === 'extended').length}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Transaction Form Dialog */}
      <Dialog open={showTransactionForm} onOpenChange={setShowTransactionForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nueva Transacción de Empeño</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <Label htmlFor="client_id">Cliente *</Label>
                <Select value={formData.client_id} onValueChange={(value) => setFormData({...formData, client_id: value})}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map(client => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.full_name} - {client.phone}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="md:col-span-2">
                <Label htmlFor="product_id">Producto del Inventario (Opcional)</Label>
                <Select value={formData.product_id} onValueChange={(value) => {
                  const product = products.find(p => p.id === value);
                  setFormData({
                    ...formData, 
                    product_id: value,
                    product_name: product?.name || ''
                  });
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar producto (opcional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Ninguno</SelectItem>
                    {products.map(product => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.name} (Stock: {product.current_stock})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="md:col-span-2">
                <Label htmlFor="product_name">Nombre del Artículo *</Label>
                <Input
                  id="product_name"
                  value={formData.product_name}
                  onChange={(e) => setFormData({...formData, product_name: e.target.value})}
                  placeholder="Ej: Laptop Dell XPS 15"
                  required
                />
              </div>

              <div className="md:col-span-2">
                <Label htmlFor="product_description">Descripción del Artículo</Label>
                <Textarea
                  id="product_description"
                  value={formData.product_description}
                  onChange={(e) => setFormData({...formData, product_description: e.target.value})}
                  placeholder="Detalles, marca, modelo, estado, etc."
                  rows={3}
                />
              </div>

              <div>
                <Label htmlFor="estimated_value">Valor Estimado *</Label>
                <Input
                  id="estimated_value"
                  type="number"
                  step="0.01"
                  value={formData.estimated_value}
                  onChange={(e) => setFormData({...formData, estimated_value: parseFloat(e.target.value)})}
                  required
                />
              </div>

              <div>
                <Label htmlFor="loan_amount">Monto del Préstamo *</Label>
                <Input
                  id="loan_amount"
                  type="number"
                  step="0.01"
                  value={formData.loan_amount}
                  onChange={(e) => setFormData({...formData, loan_amount: parseFloat(e.target.value)})}
                  required
                />
              </div>

              <div>
                <Label htmlFor="interest_rate">Tasa de Interés (%) *</Label>
                <Input
                  id="interest_rate"
                  type="number"
                  step="0.01"
                  value={formData.interest_rate}
                  onChange={(e) => setFormData({...formData, interest_rate: parseFloat(e.target.value)})}
                  required
                />
              </div>

              <div>
                <Label htmlFor="due_date">Fecha de Vencimiento *</Label>
                <Input
                  id="due_date"
                  type="date"
                  value={formData.due_date}
                  onChange={(e) => setFormData({...formData, due_date: e.target.value})}
                  required
                />
              </div>

              <div className="md:col-span-2">
                <Label htmlFor="notes">Notas</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({...formData, notes: e.target.value})}
                  placeholder="Notas adicionales..."
                  rows={2}
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setShowTransactionForm(false)}>
                Cancelar
              </Button>
              <Button type="submit">Crear Transacción</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Payment Form Dialog */}
      <Dialog open={showPaymentForm} onOpenChange={setShowPaymentForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar Pago</DialogTitle>
          </DialogHeader>
          {selectedTransaction && (
            <div className="mb-4 p-4 bg-gray-50 rounded-lg">
              <p><strong>Artículo:</strong> {selectedTransaction.product_name}</p>
              <p><strong>Cliente:</strong> {selectedTransaction.clients?.full_name}</p>
              <p><strong>Monto prestado:</strong> ${Number(selectedTransaction.loan_amount).toLocaleString()}</p>
            </div>
          )}
          <form onSubmit={handlePayment} className="space-y-4">
            <div>
              <Label htmlFor="amount">Monto del Pago *</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                value={paymentData.amount}
                onChange={(e) => setPaymentData({...paymentData, amount: parseFloat(e.target.value)})}
                required
              />
            </div>

            <div>
              <Label htmlFor="payment_type">Tipo de Pago *</Label>
              <Select 
                value={paymentData.payment_type} 
                onValueChange={(value: 'partial' | 'full' | 'interest') => 
                  setPaymentData({...paymentData, payment_type: value})
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="partial">Pago Parcial</SelectItem>
                  <SelectItem value="full">Pago Completo (Redimir)</SelectItem>
                  <SelectItem value="interest">Solo Interés</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="payment_notes">Notas</Label>
              <Textarea
                id="payment_notes"
                value={paymentData.notes}
                onChange={(e) => setPaymentData({...paymentData, notes: e.target.value})}
                placeholder="Notas del pago..."
                rows={2}
              />
            </div>

            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setShowPaymentForm(false)}>
                Cancelar
              </Button>
              <Button type="submit">Registrar Pago</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PawnShopModule;
