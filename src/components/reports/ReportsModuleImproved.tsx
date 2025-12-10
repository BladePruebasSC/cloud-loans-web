import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { 
  BarChart3, 
  Download, 
  Calendar, 
  Users,
  CreditCard,
  DollarSign,
  TrendingUp,
  TrendingDown,
  FileText,
  Filter,
  Search,
  Eye,
  Printer,
  Mail,
  Receipt,
  X
} from 'lucide-react';

interface ReportData {
  clients: any[];
  loans: any[];
  payments: any[];
  expenses: any[];
  pawnTransactions: any[];
  pawnPayments: any[];
  products: any[];
  sales: any[];
}

export const ReportsModule = () => {
  const [activeTab, setActiveTab] = useState('prestamos');
  const [loading, setLoading] = useState(true);
  const [reportData, setReportData] = useState<ReportData>({
    clients: [],
    loans: [],
    payments: [],
    expenses: [],
    pawnTransactions: [],
    pawnPayments: [],
    products: [],
    sales: []
  });
  const [posSearch, setPosSearch] = useState('');
  const [dateRange, setDateRange] = useState({
    startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [clientSearchTerm, setClientSearchTerm] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [selectedPayment, setSelectedPayment] = useState<any>(null);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [selectedSale, setSelectedSale] = useState<any>(null);
  const [showSaleModal, setShowSaleModal] = useState(false);
  const { user, companyId } = useAuth();

  useEffect(() => {
    if (user) {
      fetchReportData();
    }
  }, [user, dateRange]);

  const fetchReportData = async () => {
    try {
      setLoading(true);
      
      // Fetch clients - Solo clientes de esta empresa (que tienen préstamos con este loan_officer_id)
      const { data: clientsData, error: clientsError } = await supabase
        .from('clients')
        .select(`
          *,
          loans!inner(
            id,
            loan_officer_id
          )
        `)
        .eq('loans.loan_officer_id', companyId || user?.id)
        .order('created_at', { ascending: false });

      if (clientsError) {
        console.error('Error fetching clients:', clientsError);
        // Si falla, intentar sin el join
        const { data: clientsDataAlt, error: clientsErrorAlt } = await supabase
          .from('clients')
          .select('*')
          .eq('user_id', companyId || user?.id)
          .order('created_at', { ascending: false });
        
        if (clientsErrorAlt) throw clientsErrorAlt;
        setReportData(prev => ({ ...prev, clients: clientsDataAlt || [] }));
      }

      // Fetch loans - Solo préstamos de esta empresa
      const { data: loansData, error: loansError } = await supabase
        .from('loans')
        .select(`
          *,
          clients (
            full_name,
            dni,
            phone
          )
        `)
        .eq('loan_officer_id', companyId || user?.id)
        .gte('created_at', dateRange.startDate)
        .lte('created_at', dateRange.endDate + 'T23:59:59')
        .order('created_at', { ascending: false });

      if (loansError) throw loansError;

      // Fetch payments - Solo pagos de préstamos de esta empresa
      const { data: paymentsData, error: paymentsError } = await supabase
        .from('payments')
        .select(`
          *,
          loans (
            id,
            amount,
            loan_officer_id,
            clients (
              full_name,
              dni
            )
          )
        `)
        .eq('loans.loan_officer_id', companyId || user?.id)
        .gte('payment_date', dateRange.startDate)
        .lte('payment_date', dateRange.endDate)
        .order('payment_date', { ascending: false });

      if (paymentsError) {
        console.error('Error fetching payments:', paymentsError);
        // Si falla con el join, intentar de otra forma
        const { data: allPayments, error: allPaymentsError } = await supabase
          .from('payments')
          .select(`
            *,
            loans (
              id,
              amount,
              loan_officer_id,
              clients (
                full_name,
                dni
              )
            )
          `)
          .gte('payment_date', dateRange.startDate)
          .lte('payment_date', dateRange.endDate)
          .order('payment_date', { ascending: false });
        
        if (allPaymentsError) throw allPaymentsError;
        // Filtrar por loan_officer_id en el cliente
        const filteredPayments = (allPayments || []).filter((p: any) => 
          p.loans?.loan_officer_id === (companyId || user?.id)
        );
        setReportData(prev => ({ ...prev, payments: filteredPayments }));
      }

      // Fetch expenses
      const { data: expensesData, error: expensesError } = await supabase
        .from('expenses')
        .select('*')
        .gte('expense_date', dateRange.startDate)
        .lte('expense_date', dateRange.endDate)
        .order('expense_date', { ascending: false });

      if (expensesError) throw expensesError;

      // Fetch products (inventario)
      const { data: productsData, error: productsError } = await supabase
        .from('products')
        .select('id, name, current_stock, selling_price, status, category, sku, brand')
        .order('name');

      if (productsError) throw productsError;

      // Fetch pawn transactions
      const { data: pawnTxData, error: pawnTxError } = await supabase
        .from('pawn_transactions')
        .select(`
          *,
          clients(id, full_name, phone)
        `)
        .gte('created_at', dateRange.startDate)
        .lte('created_at', dateRange.endDate + 'T23:59:59')
        .order('created_at', { ascending: false });

      if (pawnTxError) throw pawnTxError;

      // Fetch pawn payments
      const { data: pawnPaymentsData, error: pawnPaymentsError } = await supabase
        .from('pawn_payments')
        .select(`
          *,
          pawn_transactions!inner(
            id,
            product_name,
            clients(id, full_name)
          )
        `)
        .gte('payment_date', dateRange.startDate)
        .lte('payment_date', dateRange.endDate)
        .order('payment_date', { ascending: false });

      if (pawnPaymentsError) throw pawnPaymentsError;

      // Fetch Punto de Venta (POS) sales
      const { data: salesData, error: salesError } = await supabase
        .from('sales')
        .select('*')
        .eq('user_id', user?.id as any)
        .order('created_at', { ascending: false });

      if (salesError) throw salesError;

      setReportData({
        clients: clientsData || [],
        loans: loansData || [],
        payments: paymentsData || [],
        expenses: expensesData || [],
        pawnTransactions: pawnTxData || [],
        pawnPayments: pawnPaymentsData || [],
        products: productsData || [],
        sales: salesData || []
      });
      
      // Si clientsData no se estableció antes (por el error handling), establecerlo ahora
      if (clientsData && !clientsError) {
        // Ya está establecido en el setReportData
      }

    } catch (error) {
      console.error('Error fetching report data:', error);
      toast.error('Error al cargar datos de reportes');
    } finally {
      setLoading(false);
    }
  };

  // Función auxiliar para traducir métodos de pago
  const translatePaymentMethod = (method: string | null | undefined): string => {
    const translations: { [key: string]: string } = {
      'cash': 'Efectivo',
      'card': 'Tarjeta',
      'transfer': 'Transferencia',
      'check': 'Cheque',
      'financing': 'Financiamiento'
    };
    return translations[method || 'cash'] || method || 'Efectivo';
  };

  // Función auxiliar para calcular el total con ITBIS de una venta
  const calculateSaleTotalWithTax = (sale: any): number => {
    if (sale.sale_details && sale.sale_details.length > 0) {
      return sale.sale_details.reduce((sum: number, detail: any) => {
        const itbisRate = detail.products?.itbis_rate ?? detail.product?.itbis_rate ?? 18;
        const itemSubtotal = detail.total_price; // Sin ITBIS
        const itemTax = itemSubtotal * (itbisRate / 100);
        return sum + itemSubtotal + itemTax;
      }, 0);
    }
    // Si no hay detalles, usar total_amount (que debería tener ITBIS)
    return sale.total_amount || 0;
  };

  const exportToCSV = (data: any[], filename: string) => {
    if (data.length === 0) {
      toast.error('No hay datos para exportar');
      return;
    }

    const headers = Object.keys(data[0]).join(',');
    const csvContent = [
      headers,
      ...data.map(row => Object.values(row).map(value => 
        typeof value === 'string' && value.includes(',') ? `"${value}"` : value
      ).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${filename}_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast.success('Reporte exportado exitosamente');
  };

  // Función para generar recibo de venta de POS
  const generateReceiptFromSale = async (sale: any, format: 'A4' | 'POS80' | 'POS58' = 'POS80') => {
    // Obtener información de la empresa
    let companyName = 'SH Computers';
    let companyAddress = '';
    let companyPhone = '';
    
    try {
      const { data: companySettings } = await supabase
        .from('company_settings')
        .select('company_name, address, phone')
        .eq('user_id', companyId || user?.id)
        .maybeSingle();
      
      if (companySettings) {
        companyName = companySettings.company_name || companyName;
        companyAddress = companySettings.address || '';
        companyPhone = companySettings.phone || '';
      }
    } catch (error) {
      console.error('Error fetching company settings:', error);
    }
    
    const invoiceNumber = `${sale.id.substring(0, 8)}`;
    const money = (n: number) => new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(n || 0);
    
    const isThermal = format === 'POS80' || format === 'POS58';
    const isPOS58 = format === 'POS58';
    
    // Obtener detalles de la venta si no están incluidos
    let saleDetails = sale.sale_details || [];
    if (!saleDetails || saleDetails.length === 0) {
      const { data: details, error: detailsError } = await supabase
        .from('sale_details')
        .select(`
          *,
          products (
            id,
            name,
            sku,
            itbis_rate
          )
        `)
        .eq('sale_id', sale.id);
      
      if (!detailsError && details) {
        saleDetails = details;
      }
    }
    
    // Calcular subtotal e ITBIS desde los detalles
    let subtotal = 0;
    let totalTax = 0;
    
    const itemsRows = saleDetails.map((detail: any) => {
      const itbisRate = detail.products?.itbis_rate ?? detail.product?.itbis_rate ?? 18;
      
      // unit_price se guarda CON ITBIS, total_price se guarda SIN ITBIS (subtotal)
      const itemSubtotal = detail.total_price; // Ya es sin ITBIS
      const itemTax = itemSubtotal * (itbisRate / 100);
      const itemTotalWithTax = itemSubtotal + itemTax;
      
      subtotal += itemSubtotal;
      totalTax += itemTax;
      
      const unitPriceWithTax = detail.unit_price; // Ya tiene ITBIS
      
      const maxNameLength = isPOS58 ? 18 : 28;
      const productName = (detail.products?.name || detail.product?.name || 'Producto desconocido').length > maxNameLength 
        ? (detail.products?.name || detail.product?.name || 'Producto desconocido').substring(0, maxNameLength - 3) + '...' 
        : (detail.products?.name || detail.product?.name || 'Producto desconocido');
      
      const discountCol = isPOS58 ? '' : '<td class="right">0%</td>';
      const unitPrice = `<td class="right">${money(unitPriceWithTax)}</td>`;
      
      return `
        <tr>
          <td>${productName}</td>
          <td class="right">${detail.quantity}</td>
          ${unitPrice}
          ${discountCol}
          <td class="right">${money(itemTotalWithTax)}</td>
        </tr>
      `;
    }).join('');

    // CSS específico para cada formato
    const pageCss = format === 'A4'
      ? '@page { size: A4; margin: 18mm; } .invoice{max-width:800px;margin:0 auto;}'
      : format === 'POS80'
        ? '@page { size: 80mm auto; margin: 2mm 1mm; } .invoice{width:76mm;margin:0 auto;font-size:9px;}'
        : '@page { size: 58mm auto; margin: 2mm 1mm; } .invoice{width:54mm;margin:0 auto;font-size:8px;}';
    
    // CSS compacto para térmicas
    const thermalCss = isThermal ? `
      body { font-size: ${isPOS58 ? '8px' : '9px'}; font-family: 'Courier New', monospace; }
      .invoice { width: ${isPOS58 ? '54mm' : '76mm'}; margin: 0 auto; }
      .header { padding: 4px 0; border-bottom: 1px solid #000; text-align: center; }
      .brand-name { font-size: ${isPOS58 ? '10px' : '12px'}; font-weight: bold; margin: 2px 0; }
      .brand-meta { font-size: ${isPOS58 ? '7px' : '8px'}; margin: 1px 0; }
      .doc-type { font-size: ${isPOS58 ? '10px' : '12px'}; font-weight: bold; }
      .doc-number { font-size: ${isPOS58 ? '7px' : '8px'}; }
      .section { padding: 4px 0; margin: 4px 0; border: none; }
      .section-title { font-size: ${isPOS58 ? '8px' : '9px'}; font-weight: bold; margin-bottom: 2px; }
      .field { margin: 1px 0; font-size: ${isPOS58 ? '7px' : '8px'}; display: flex; justify-content: space-between; }
      .label { font-weight: bold; }
      table { width: 100%; border-collapse: collapse; margin: 4px 0; font-size: ${isPOS58 ? '7px' : '8px'}; }
      th, td { padding: 2px 1px; border-bottom: 1px dashed #ccc; }
      thead th { background: transparent; border-bottom: 1px solid #000; font-size: ${isPOS58 ? '7px' : '8px'}; }
      tbody td { font-size: ${isPOS58 ? '7px' : '8px'}; }
      .summary { padding: 4px 0; border-top: 1px solid #000; margin-top: 4px; }
      .sum-row { padding: 1px 0; font-size: ${isPOS58 ? '7px' : '8px'}; }
      .sum-row.total { border-top: 1px solid #000; padding-top: 2px; font-weight: bold; font-size: ${isPOS58 ? '9px' : '10px'}; }
      .footer { margin-top: 8px; font-size: ${isPOS58 ? '7px' : '8px'}; text-align: center; }
      .divider { border-top: 1px dashed #000; margin: 2px 0; }
    ` : '';

    // Generar HTML según el formato
    const receiptHTML = isThermal ? `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Factura</title>
        <style>
          ${pageCss}
          ${thermalCss}
          body { font-family: 'Courier New', monospace; color: #000; margin: 0; padding: 0; }
          .invoice { }
          .header { text-align: center; padding: 4px 0; border-bottom: 1px solid #000; }
          .brand-name { font-size: ${isPOS58 ? '10px' : '12px'}; font-weight: bold; margin: 2px 0; }
          .brand-meta { font-size: ${isPOS58 ? '7px' : '8px'}; margin: 1px 0; }
          .doc-type { font-size: ${isPOS58 ? '10px' : '12px'}; font-weight: bold; margin: 2px 0; }
          .doc-number { font-size: ${isPOS58 ? '7px' : '8px'}; }
          .section { padding: 2px 0; margin: 2px 0; }
          .section-title { font-size: ${isPOS58 ? '8px' : '9px'}; font-weight: bold; margin-bottom: 1px; }
          .field { margin: 1px 0; font-size: ${isPOS58 ? '7px' : '8px'}; display: flex; justify-content: space-between; }
          .label { font-weight: bold; }
          table { width: 100%; border-collapse: collapse; margin: 2px 0; font-size: ${isPOS58 ? '7px' : '8px'}; }
          th, td { padding: 1px 0; text-align: left; }
          th.right, td.right { text-align: right; }
          thead th { border-bottom: 1px solid #000; font-weight: bold; font-size: ${isPOS58 ? '7px' : '8px'}; }
          .summary { padding: 2px 0; border-top: 1px solid #000; margin-top: 2px; }
          .sum-row { display: flex; justify-content: space-between; padding: 1px 0; font-size: ${isPOS58 ? '7px' : '8px'}; }
          .sum-row.total { border-top: 1px solid #000; padding-top: 2px; font-weight: bold; font-size: ${isPOS58 ? '9px' : '10px'}; }
          .footer { margin-top: 4px; font-size: ${isPOS58 ? '7px' : '8px'}; text-align: center; }
          .divider { border-top: 1px dashed #000; margin: 2px 0; }
        </style>
      </head>
      <body>
        <div class="invoice">
          <div class="header">
            <div class="brand-name">${companyName}</div>
            ${companyAddress ? `<div class="brand-meta">${companyAddress}</div>` : ''}
            ${companyPhone ? `<div class="brand-meta">${companyPhone}</div>` : ''}
            <div class="doc-type">FACTURA</div>
            <div class="doc-number">Venta #${invoiceNumber}</div>
          </div>

          <div class="section">
            <div class="section-title">Cliente</div>
            <div class="field"><span class="label">Nombre:</span><span>${sale.clients?.full_name || sale.customer_name || 'Cliente General'}</span></div>
            ${sale.clients?.phone ? `<div class="field"><span class="label">Teléfono:</span><span>${sale.clients.phone}</span></div>` : ''}
            <div class="section-title" style="margin-top:4px;">Venta</div>
            <div class="field"><span class="label">Fecha:</span><span>${sale.sale_date ? new Date(sale.sale_date).toLocaleDateString('es-DO') + ' ' + new Date(sale.sale_date).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' }) : (sale.created_at ? new Date(sale.created_at).toLocaleDateString('es-DO') : 'N/A')}</span></div>
            <div class="field"><span class="label">Método de Pago:</span><span>${sale.payment_method || 'Efectivo'}</span></div>
          </div>

          <div class="divider"></div>

          <table>
            <thead>
              <tr>
                <th>Descripción</th>
                <th class="right">Cant</th>
                <th class="right">Precio</th>
                ${isPOS58 ? '' : '<th class="right">Desc%</th>'}
                <th class="right">Total</th>
              </tr>
            </thead>
            <tbody>
              ${itemsRows || '<tr><td colspan="5" class="text-center">No hay productos</td></tr>'}
            </tbody>
          </table>

          <div class="divider"></div>

          <div class="summary">
            <div class="sum-row"><span>Subtotal:</span><span>${money(subtotal)}</span></div>
            <div class="sum-row"><span>ITBIS:</span><span>${money(totalTax)}</span></div>
            <div class="sum-row total"><span>TOTAL:</span><span>${money(sale.total_amount || 0)}</span></div>
          </div>

          <div class="footer">
            <div>Gracias por su preferencia</div>
            <div>${sale.sale_date ? `${new Date(sale.sale_date).toLocaleDateString('es-DO')} ${new Date(sale.sale_date).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })}` : (sale.created_at ? `${new Date(sale.created_at).toLocaleDateString('es-DO')} ${new Date(sale.created_at).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })}` : new Date().toLocaleDateString('es-DO'))}</div>
          </div>
        </div>
      </body>
      </html>
    ` : `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Factura</title>
        <style>
          ${pageCss}
          body { font-family: Arial, sans-serif; font-size: 12px; color: #1f2937; }
          .invoice { }
          .header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 12px; border-bottom: 2px solid #111827; }
          .brand-name { font-size: 18px; font-weight: 700; }
          .doc-type { font-size: 22px; font-weight: 700; letter-spacing: 0.5px; }
          .doc-number { font-size: 12px; color: #374151; margin-top: 4px; }
          .section { margin-top: 14px; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; }
          table { width: 100%; border-collapse: collapse; margin-top: 12px; }
          th, td { padding: 10px; border-bottom: 1px solid #e5e7eb; }
          thead th { background: #f9fafb; font-size: 12px; text-align: left; }
          .right { text-align: right; }
          .summary { border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px; margin-top: 10px; }
          .sum-row { display: flex; justify-content: space-between; padding: 6px 0; }
          .sum-row.total { border-top: 2px solid #111827; margin-top: 6px; padding-top: 10px; font-weight: 800; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="invoice">
          <div class="header">
            <div class="brand-name">${companyName}</div>
            <div>
              <div class="doc-type">FACTURA</div>
              <div class="doc-number">Venta #${invoiceNumber}</div>
            </div>
          </div>
          <div class="section">
            <div><strong>Cliente:</strong> ${sale.clients?.full_name || sale.customer_name || 'Cliente General'}</div>
            <div><strong>Fecha:</strong> ${sale.sale_date ? `${new Date(sale.sale_date).toLocaleDateString('es-DO')} ${new Date(sale.sale_date).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })}` : (sale.created_at ? `${new Date(sale.created_at).toLocaleDateString('es-DO')} ${new Date(sale.created_at).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })}` : 'N/A')}</div>
            <div><strong>Método de pago:</strong> ${sale.payment_method || 'N/A'}</div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Descripción</th>
                <th class="right">Cant.</th>
                <th class="right">Precio</th>
                <th class="right">Importe</th>
              </tr>
            </thead>
            <tbody>
              ${itemsRows || '<tr><td colspan="4" class="text-center">No hay productos</td></tr>'}
            </tbody>
          </table>
          <div class="summary">
            <div class="sum-row"><span>Subtotal:</span><span>${money(subtotal)}</span></div>
            <div class="sum-row"><span>ITBIS:</span><span>${money(totalTax)}</span></div>
            <div class="sum-row total">
              <span>Total</span>
              <span>${money(sale.total_amount || 0)}</span>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(receiptHTML);
      printWindow.document.close();
      printWindow.print();
    }
  };

  // Función para descargar recibo de venta
  const downloadReceiptFromSale = async (sale: any) => {
    await generateReceiptFromSale(sale, 'POS80');
  };

  // Cálculos para estadísticas
  const totalLoans = reportData.loans.length;
  const totalLoanAmount = reportData.loans.reduce((sum, loan) => sum + loan.amount, 0);
  const totalPayments = reportData.payments.reduce((sum, payment) => sum + payment.amount, 0);
  const totalInterest = reportData.payments.reduce((sum, payment) => sum + payment.interest_amount, 0);
  const totalExpenses = reportData.expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const netProfit = totalInterest - totalExpenses;

  const activeLoans = reportData.loans.filter(loan => loan.status === 'active').length;
  const overdueLoans = reportData.loans.filter(loan => loan.status === 'overdue').length;
  const paidLoans = reportData.loans.filter(loan => loan.status === 'paid').length;

  // Filtros para pagos
  const filteredPayments = reportData.payments.filter(payment => {
    const matchesSearch = payment.loans?.clients?.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         payment.amount.toString().includes(searchTerm) ||
                         payment.payment_date.includes(searchTerm);
    
    const matchesFilter = paymentFilter === 'all' ||
                         (paymentFilter === 'with_fees' && payment.late_fee && payment.late_fee > 0) ||
                         (paymentFilter === 'without_fees' && (!payment.late_fee || payment.late_fee === 0)) ||
                         (paymentFilter === 'high_amount' && payment.amount > 5000);
    
    return matchesSearch && matchesFilter;
  });

  // Filtros para clientes
  const filteredClients = reportData.clients.filter(client => {
    return client.full_name.toLowerCase().includes(clientSearchTerm.toLowerCase()) ||
           client.dni.includes(clientSearchTerm) ||
           (client.phone && client.phone.includes(clientSearchTerm));
  });

  // Función para mostrar detalle de factura
  const showInvoiceDetails = (payment: any) => {
    setSelectedPayment(payment);
    setShowInvoiceModal(true);
  };

  // Función para imprimir factura
  // Función para generar HTML del recibo de pago
  const generatePaymentReceiptHTML = (payment: any): string => {
    const money = (n: number) => new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(n || 0);
    
    return `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Recibo de Pago</title>
        <style>
          @page { size: A4; margin: 18mm; }
          body { font-family: Arial, sans-serif; font-size: 12px; color: #1f2937; }
          .receipt { max-width: 800px; margin: 0 auto; }
          .header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 12px; border-bottom: 2px solid #111827; }
          .brand-name { font-size: 18px; font-weight: 700; }
          .doc-type { font-size: 22px; font-weight: 700; letter-spacing: 0.5px; }
          .doc-number { font-size: 12px; color: #374151; margin-top: 4px; }
          .section { margin-top: 14px; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; }
          table { width: 100%; border-collapse: collapse; margin-top: 12px; }
          th, td { padding: 10px; border-bottom: 1px solid #e5e7eb; }
          thead th { background: #f9fafb; font-size: 12px; text-align: left; }
          .summary { border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px; margin-top: 10px; }
          .sum-row { display: flex; justify-content: space-between; padding: 6px 0; }
          .sum-row.total { border-top: 2px solid #111827; margin-top: 6px; padding-top: 10px; font-weight: 800; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="receipt">
          <div class="header">
            <div class="brand-name">SH Computers</div>
            <div>
              <div class="doc-type">RECIBO DE PAGO</div>
              <div class="doc-number">Recibo #${payment.id.substring(0, 8)}</div>
            </div>
          </div>
          <div class="section">
            <div><strong>Cliente:</strong> ${payment.loans?.clients?.full_name || 'N/A'}</div>
            <div><strong>Préstamo #:</strong> ${payment.loans?.id?.substring(0, 8) || 'N/A'}</div>
            <div><strong>Monto del Préstamo:</strong> ${money(payment.loans?.amount || 0)}</div>
            <div><strong>Fecha:</strong> ${new Date(payment.payment_date).toLocaleDateString('es-DO')} ${new Date(payment.payment_date).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })}</div>
            <div><strong>Método de pago:</strong> ${translatePaymentMethod(payment.payment_method)}</div>
          </div>
          <div class="summary">
            <div class="sum-row"><span>Pago Principal:</span><span>${money(payment.principal_amount || 0)}</span></div>
            <div class="sum-row"><span>Intereses:</span><span>${money(payment.interest_amount || 0)}</span></div>
            ${payment.late_fee > 0 ? `<div class="sum-row"><span>Mora:</span><span>${money(payment.late_fee)}</span></div>` : ''}
            <div class="sum-row total">
              <span>Total</span>
              <span>${money(payment.amount || 0)}</span>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
  };

  const printInvoice = (payment: any) => {
    const receiptHTML = generatePaymentReceiptHTML(payment);
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(receiptHTML);
      printWindow.document.close();
      printWindow.print();
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Reportes y Análisis</h1>
        <div className="flex gap-2">
          <Button variant="outline">
            <Printer className="h-4 w-4 mr-2" />
            Imprimir
          </Button>
          <Button variant="outline">
            <Mail className="h-4 w-4 mr-2" />
            Enviar por Email
          </Button>
        </div>
      </div>

      {/* Filtros de Fecha */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Calendar className="h-5 w-5 mr-2" />
            Filtros de Fecha
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 items-end">
            <div>
              <Label htmlFor="startDate">Fecha Inicio</Label>
              <Input
                id="startDate"
                type="date"
                value={dateRange.startDate}
                onChange={(e) => setDateRange(prev => ({ ...prev, startDate: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="endDate">Fecha Fin</Label>
              <Input
                id="endDate"
                type="date"
                value={dateRange.endDate}
                onChange={(e) => setDateRange(prev => ({ ...prev, endDate: e.target.value }))}
              />
            </div>
            <Button onClick={fetchReportData}>
              <Search className="h-4 w-4 mr-2" />
              Actualizar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Resumen Ejecutivo */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Préstamos Totales</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalLoans}</div>
            <p className="text-xs text-muted-foreground">
              ${totalLoanAmount.toLocaleString()} prestados
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pagos Recibidos</CardTitle>
            <DollarSign className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">${totalPayments.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              ${totalInterest.toLocaleString()} en intereses
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Gastos</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">${totalExpenses.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              Gastos operativos
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ganancia Neta</CardTitle>
            <TrendingUp className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              ${netProfit.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              Intereses - Gastos
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-11">
          <TabsTrigger value="prestamos">Préstamos</TabsTrigger>
          <TabsTrigger value="pagos">Pagos</TabsTrigger>
          <TabsTrigger value="clientes">Clientes</TabsTrigger>
          <TabsTrigger value="financiero">Financiero</TabsTrigger>
          <TabsTrigger value="operativo">Operativo</TabsTrigger>
          <TabsTrigger value="facturas">Facturas</TabsTrigger>
          <TabsTrigger value="ventas">Ventas</TabsTrigger>
          <TabsTrigger value="compra_venta">Compra-Venta</TabsTrigger>
          <TabsTrigger value="inventario">Inventario</TabsTrigger>
          <TabsTrigger value="moras">Moras</TabsTrigger>
          <TabsTrigger value="clientes_top">Clientes Top</TabsTrigger>
        </TabsList>

        <TabsContent value="prestamos" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Reporte de Préstamos</CardTitle>
                <Button onClick={() => exportToCSV(reportData.loans, 'reporte_prestamos')}>
                  <Download className="h-4 w-4 mr-2" />
                  Exportar CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {/* Estadísticas de Préstamos */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">{activeLoans}</div>
                  <div className="text-sm text-gray-600">Préstamos Activos</div>
                </div>
                <div className="text-center p-4 bg-red-50 rounded-lg">
                  <div className="text-2xl font-bold text-red-600">{overdueLoans}</div>
                  <div className="text-sm text-gray-600">Préstamos Vencidos</div>
                </div>
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">{paidLoans}</div>
                  <div className="text-sm text-gray-600">Préstamos Pagados</div>
                </div>
              </div>

              {/* Lista de Préstamos */}
              <div className="space-y-4">
                {loading ? (
                  <div className="text-center py-8">Cargando datos...</div>
                ) : reportData.loans.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <CreditCard className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No hay préstamos en el período seleccionado</p>
                  </div>
                ) : (
                  reportData.loans.map((loan) => (
                    <div key={loan.id} className="border rounded-lg p-4">
                      <div className="flex justify-between items-start">
                        <div className="space-y-2">
                          <div className="flex items-center gap-3">
                            <h3 className="font-medium">{loan.clients?.full_name}</h3>
                            <Badge variant={
                              loan.status === 'active' ? 'default' :
                              loan.status === 'overdue' ? 'destructive' :
                              loan.status === 'paid' ? 'secondary' : 'outline'
                            }>
                              {loan.status === 'active' ? 'Activo' :
                               loan.status === 'overdue' ? 'Vencido' :
                               loan.status === 'paid' ? 'Pagado' : loan.status}
                            </Badge>
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-gray-600">
                            <div>Monto: ${loan.amount.toLocaleString()}</div>
                            <div>Balance: ${loan.remaining_balance.toLocaleString()}</div>
                            <div>Cuota: ${loan.monthly_payment.toLocaleString()}</div>
                            <div>Tasa: {loan.interest_rate}%</div>
                          </div>
                        </div>
                        <Button variant="outline" size="sm">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="inventario" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Inventario de Productos</CardTitle>
                <Button onClick={() => exportToCSV(reportData.products, 'reporte_inventario')}>
                  <Download className="h-4 w-4 mr-2" />
                  Exportar CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div className="text-center p-3 bg-blue-50 rounded">
                  <div className="text-xl font-bold text-blue-700">{reportData.products.length}</div>
                  <div className="text-xs text-gray-600">Productos</div>
                </div>
                <div className="text-center p-3 bg-green-50 rounded">
                  <div className="text-xl font-bold text-green-700">{reportData.products.reduce((s,p)=>s+(p.current_stock||0),0)}</div>
                  <div className="text-xs text-gray-600">Unidades en stock</div>
                </div>
                <div className="text-center p-3 bg-purple-50 rounded">
                  <div className="text-xl font-bold text-purple-700">{reportData.products.filter(p=>p.status==='active').length}</div>
                  <div className="text-xs text-gray-600">Activos</div>
                </div>
                <div className="text-center p-3 bg-yellow-50 rounded">
                  <div className="text-xl font-bold text-yellow-700">{reportData.products.filter(p=> (p.current_stock||0) <= 5).length}</div>
                  <div className="text-xs text-gray-600">Stock bajo</div>
                </div>
              </div>

              <div className="space-y-2">
                {reportData.products.map(p => (
                  <div key={p.id} className="border rounded p-3 flex items-center justify-between text-sm">
                    <div>
                      <div className="font-medium">{p.name}</div>
                      <div className="text-gray-600">{p.category || 'Sin categoría'} · {p.brand || '—'} · {p.sku || '—'}</div>
                    </div>
                    <div className="text-right">
                      <div>Stock: {p.current_stock}</div>
                      <div className="text-gray-600">Precio: ${Number(p.selling_price||0).toLocaleString()}</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="moras" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Préstamos con Mora</CardTitle>
                <Button onClick={() => exportToCSV(reportData.loans.filter(l=> (l.current_late_fee||0)>0), 'reporte_moras')}>
                  <Download className="h-4 w-4 mr-2" />
                  Exportar CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div className="text-center p-3 bg-red-50 rounded">
                  <div className="text-xl font-bold text-red-700">{reportData.loans.filter(l=> (l.current_late_fee||0)>0).length}</div>
                  <div className="text-xs text-gray-600">Préstamos en mora</div>
                </div>
                <div className="text-center p-3 bg-yellow-50 rounded">
                  <div className="text-xl font-bold text-yellow-700">${reportData.loans.reduce((s,l)=> s + (l.current_late_fee||0), 0).toLocaleString()}</div>
                  <div className="text-xs text-gray-600">Mora acumulada</div>
                </div>
              </div>

              <div className="space-y-2">
                {reportData.loans.filter(l=> (l.current_late_fee||0)>0).map(l => (
                  <div key={l.id} className="border rounded p-3 flex items-start justify-between text-sm">
                    <div>
                      <div className="font-medium">{l.clients?.full_name || 'Cliente'}</div>
                      <div className="text-gray-600">Próximo pago: {l.next_payment_date ? `${new Date(l.next_payment_date).toLocaleDateString('es-DO')} ${new Date(l.next_payment_date).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })}` : '—'}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-red-600">Mora: ${Number(l.current_late_fee||0).toLocaleString()}</div>
                      <div className="text-gray-600">Tasa mora: {l.late_fee_rate ? `${l.late_fee_rate}%` : '—'}</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="clientes_top" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Clientes Top (por monto pagado)</CardTitle>
                <Button onClick={() => {
                  const rows = Object.values(reportData.payments.reduce((acc: any, p: any) => {
                    const name = p.loans?.clients?.full_name || 'Cliente';
                    acc[name] = acc[name] || { cliente: name, total_pagado: 0, pagos: 0 };
                    acc[name].total_pagado += (p.amount||0);
                    acc[name].pagos += 1;
                    return acc;
                  }, {} as any));
                  exportToCSV(rows as any[], 'reporte_clientes_top');
                }}>
                  <Download className="h-4 w-4 mr-2" />
                  Exportar CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {(() => {
                const rows = Object.values(reportData.payments.reduce((acc: any, p: any) => {
                  const name = p.loans?.clients?.full_name || 'Cliente';
                  acc[name] = acc[name] || { name, total: 0, count: 0 };
                  acc[name].total += (p.amount||0);
                  acc[name].count += 1;
                  return acc;
                }, {} as any)) as Array<any>;
                const sorted = rows.sort((a,b) => b.total - a.total).slice(0, 20);
                return (
                  <div className="space-y-2">
                    {sorted.map((r) => (
                      <div key={r.name} className="border rounded p-3 flex items-center justify-between text-sm">
                        <div className="font-medium">{r.name}</div>
                        <div className="text-right">
                          <div>Total pagado: ${Number(r.total).toLocaleString()}</div>
                          <div className="text-gray-600">Pagos: {r.count}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="facturas" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Reporte de Facturas</CardTitle>
                <Button onClick={() => exportToCSV([...reportData.payments, ...reportData.sales], 'reporte_facturas')}>
                  <Download className="h-4 w-4 mr-2" />
                  Exportar CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <Label>Buscar Facturas de Punto de Venta</Label>
                  <Input value={posSearch} onChange={(e)=>setPosSearch(e.target.value)} placeholder="Cliente, código, método..." />
                </div>
                <div>
                  <Label>Desde</Label>
                  <Input type="date" value={dateRange.startDate} onChange={(e)=>setDateRange({...dateRange,startDate:e.target.value})} />
                </div>
                <div>
                  <Label>Hasta</Label>
                  <Input type="date" value={dateRange.endDate} onChange={(e)=>setDateRange({...dateRange,endDate:e.target.value})} />
                </div>
              </div>

              {(() => {
                const start = new Date(dateRange.startDate);
                const end = new Date(dateRange.endDate + 'T23:59:59');
                const inRange = (d?: string) => {
                  if (!d) return false;
                  const dt = new Date(d);
                  return dt >= start && dt <= end;
                };
                const posRows = (reportData.sales||[]).filter(s => inRange(s.sale_date || s.created_at))
                  .filter(s => {
                    const q = posSearch.toLowerCase();
                    if (!q) return true;
                    return (
                      (s.customer_name||'').toLowerCase().includes(q) ||
                      (s.payment_method||'').toLowerCase().includes(q) ||
                      (s.sale_number||'').toLowerCase().includes(q)
                    );
                  });
                const posTotal = posRows.reduce((sum: number, r: any) => sum + calculateSaleTotalWithTax(r), 0);
                return (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                      <div className="text-center p-3 bg-blue-50 rounded">
                        <div className="text-xl font-bold text-blue-700">{posRows.length}</div>
                        <div className="text-xs text-gray-600">Facturas Punto de Venta</div>
                      </div>
                      <div className="text-center p-3 bg-green-50 rounded">
                        <div className="text-xl font-bold text-green-700">${posTotal.toLocaleString()}</div>
                        <div className="text-xs text-gray-600">Total Punto de Venta</div>
                      </div>
                    </div>

                    <div className="font-semibold mb-2">Facturas de Punto de Venta</div>
                    {posRows.length === 0 ? (
                      <div className="text-sm text-gray-500 mb-6">No hay ventas de Punto de Venta en el período.</div>
                    ) : (
                      <div className="space-y-2 mb-6">
                        {posRows.map((s:any) => (
                          <div key={s.id} className="border rounded p-3 flex items-start justify-between">
                            <div className="text-sm flex-1">
                              <div className="font-medium">{s.clients?.full_name || s.customer_name || 'Cliente General'}</div>
                              <div className="text-gray-600">{new Date(s.sale_date || s.created_at).toLocaleDateString('es-DO')} {new Date(s.sale_date || s.created_at).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })} · {translatePaymentMethod(s.payment_method)}</div>
                              <div className="text-gray-500 text-xs mt-1">Venta #{s.id.substring(0, 8)}</div>
                            </div>
                            <div className="text-right text-sm mr-4">
                              <div><strong>Total:</strong> ${calculateSaleTotalWithTax(s).toFixed(2)}</div>
                            </div>
                            <div className="flex gap-2">
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => {
                                  setSelectedSale(s);
                                  setShowSaleModal(true);
                                }}
                              >
                                <Eye className="h-4 w-4 mr-1" />
                                Detalle
                              </Button>
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => generateReceiptFromSale(s, 'POS80')}
                              >
                                <Printer className="h-4 w-4 mr-1" />
                                Imprimir
                              </Button>
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => downloadReceiptFromSale(s)}
                              >
                                <Download className="h-4 w-4 mr-1" />
                                Descargar
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                );
              })()}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div className="text-center p-3 bg-blue-50 rounded">
                  <div className="text-xl font-bold text-blue-700">{reportData.payments.length}</div>
                  <div className="text-xs text-gray-600">Facturas (Préstamos)</div>
                </div>
                <div className="text-center p-3 bg-green-50 rounded">
                  <div className="text-xl font-bold text-green-700">${(reportData.payments.reduce((s,p)=>s+(p.amount||0),0)).toLocaleString()}</div>
                  <div className="text-xs text-gray-600">Total Pagado (Préstamos)</div>
                </div>
                <div className="text-center p-3 bg-yellow-50 rounded">
                  <div className="text-xl font-bold text-yellow-700">${reportData.payments.reduce((s,p)=>s+(p.interest_amount||0),0).toLocaleString()}</div>
                  <div className="text-xs text-gray-600">Intereses</div>
                </div>
                <div className="text-center p-3 bg-red-50 rounded">
                  <div className="text-xl font-bold text-red-700">${reportData.payments.reduce((s,p)=>s+(p.late_fee||0),0).toLocaleString()}</div>
                  <div className="text-xs text-gray-600">Mora</div>
                </div>
              </div>

              <div className="font-semibold mb-2">Facturas de Préstamos (Pagos)</div>
              {loading ? (
                <div className="text-center py-8">Cargando facturas...</div>
              ) : reportData.payments.length === 0 ? (
                <div className="text-center py-8 text-gray-500">No hay facturas en el período</div>
              ) : (
                <div className="space-y-3">
                  {reportData.payments.map((payment) => (
                    <div key={payment.id} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1 flex-1">
                          <div className="flex items-center gap-2">
                            <Receipt className="h-4 w-4" />
                            <span className="font-medium">{payment.loans?.clients?.full_name || 'Cliente'}</span>
                          </div>
                          <div className="text-sm text-gray-600">
                            {new Date(payment.payment_date).toLocaleDateString('es-DO')} {new Date(payment.payment_date).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })} · Recibo #{payment.id.substring(0, 8)}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            Préstamo #{payment.loans?.id?.substring(0, 8) || 'N/A'} · Monto: ${payment.loans?.amount?.toLocaleString() || 'N/A'}
                          </div>
                        </div>
                        <div className="text-right text-sm mr-4">
                          <div><strong>Total:</strong> ${payment.amount.toLocaleString()}</div>
                          <div className="text-gray-600">Interés: ${Number(payment.interest_amount||0).toLocaleString()}</div>
                          {payment.late_fee > 0 && (
                            <div className="text-red-600">Mora: ${Number(payment.late_fee).toLocaleString()}</div>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => {
                              setSelectedPayment(payment);
                              setShowInvoiceModal(true);
                            }}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            Detalle
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => printInvoice(payment)}
                          >
                            <Printer className="h-4 w-4 mr-1" />
                            Imprimir
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => {
                              // Descargar recibo de pago
                              const receiptHTML = generatePaymentReceiptHTML(payment);
                              const blob = new Blob([receiptHTML], { type: 'text/html' });
                              const url = URL.createObjectURL(blob);
                              const link = document.createElement('a');
                              link.href = url;
                              link.download = `recibo_pago_${payment.id.substring(0, 8)}.html`;
                              link.click();
                              URL.revokeObjectURL(url);
                            }}
                          >
                            <Download className="h-4 w-4 mr-1" />
                            Descargar
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ventas" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Ventas (Pagos + Punto de Venta)</CardTitle>
                <Button onClick={() => exportToCSV([...reportData.payments, ...reportData.sales], 'reporte_ventas')}>
                  <Download className="h-4 w-4 mr-2" />
                  Exportar CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8">Cargando ventas...</div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center p-3 bg-green-50 rounded">
                      <div className="text-xl font-bold text-green-700">${(reportData.payments.reduce((s,p)=>s+(p.amount||0),0) + reportData.sales.reduce((s,x)=> s + (x.total_amount||0), 0)).toLocaleString()}</div>
                      <div className="text-xs text-gray-600">Total Cobrado</div>
                    </div>
                    <div className="text-center p-3 bg-blue-50 rounded">
                      <div className="text-xl font-bold text-blue-700">{new Set([
                        ...reportData.payments.map(p=> (p.loans?.clients?.full_name||'N/A')),
                        ...reportData.sales.map(s=> s.customer_name || 'Cliente')
                      ]).size}</div>
                      <div className="text-xs text-gray-600">Clientes</div>
                    </div>
                    <div className="text-center p-3 bg-purple-50 rounded">
                      <div className="text-xl font-bold text-purple-700">{reportData.payments.length + reportData.sales.length}</div>
                      <div className="text-xs text-gray-600">Pagos</div>
                    </div>
                    <div className="text-center p-3 bg-yellow-50 rounded">
                      <div className="text-xl font-bold text-yellow-700">${reportData.payments.reduce((s,p)=>s+(p.interest_amount||0),0).toLocaleString()}</div>
                      <div className="text-xs text-gray-600">Intereses</div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="compra_venta" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Compra-Venta (Empeño)</CardTitle>
                <Button onClick={() => exportToCSV(reportData.pawnTransactions, 'reporte_compra_venta')}>
                  <Download className="h-4 w-4 mr-2" />
                  Exportar CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div className="text-center p-3 bg-blue-50 rounded">
                  <div className="text-xl font-bold text-blue-700">{reportData.pawnTransactions.length}</div>
                  <div className="text-xs text-gray-600">Transacciones</div>
                </div>
                <div className="text-center p-3 bg-green-50 rounded">
                  <div className="text-xl font-bold text-green-700">${reportData.pawnTransactions.reduce((s,t)=>s+Number(t.loan_amount||0),0).toLocaleString()}</div>
                  <div className="text-xs text-gray-600">Total Prestado</div>
                </div>
                <div className="text-center p-3 bg-purple-50 rounded">
                  <div className="text-xl font-bold text-purple-700">${reportData.pawnTransactions.reduce((s,t)=>s+Number(t.estimated_value||0),0).toLocaleString()}</div>
                  <div className="text-xs text-gray-600">Valor Estimado</div>
                </div>
                <div className="text-center p-3 bg-yellow-50 rounded">
                  <div className="text-xl font-bold text-yellow-700">${reportData.pawnPayments.reduce((s,p)=>s+Number(p.amount||0),0).toLocaleString()}</div>
                  <div className="text-xs text-gray-600">Pagos en período</div>
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <div className="font-semibold mb-2">Transacciones</div>
                  {reportData.pawnTransactions.length === 0 ? (
                    <div className="text-sm text-gray-500">Sin transacciones en el período.</div>
                  ) : (
                    <div className="space-y-2">
                      {reportData.pawnTransactions.map((tx) => (
                        <div key={tx.id} className="border rounded p-3 flex items-start justify-between">
                          <div className="text-sm">
                            <div className="font-medium">{tx.product_name}</div>
                            <div className="text-gray-600">{tx.clients?.full_name || 'Cliente'} · {new Date(tx.created_at).toLocaleDateString('es-DO')} {new Date(tx.created_at).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })}</div>
                          </div>
                          <div className="text-right text-sm">
                            <div>Préstamo: ${Number(tx.loan_amount||0).toLocaleString()}</div>
                            <div className="text-gray-600">Valor: ${Number(tx.estimated_value||0).toLocaleString()}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <div className="font-semibold mb-2">Pagos</div>
                  {reportData.pawnPayments.length === 0 ? (
                    <div className="text-sm text-gray-500">Sin pagos en el período.</div>
                  ) : (
                    <div className="space-y-2">
                      {reportData.pawnPayments.map((pp) => (
                        <div key={pp.id} className="border rounded p-3 flex items-start justify-between">
                          <div className="text-sm">
                            <div className="font-medium">{pp.pawn_transactions?.product_name || 'Artículo'}</div>
                            <div className="text-gray-600">{pp.pawn_transactions?.clients?.full_name || 'Cliente'} · {new Date(pp.payment_date).toLocaleDateString('es-DO')} {new Date(pp.payment_date).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })}</div>
                          </div>
                          <div className="text-right text-sm">
                            <div>Monto: ${Number(pp.amount||0).toLocaleString()}</div>
                            <div className="text-gray-600">Tipo: {pp.payment_type}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pagos" className="space-y-6">
          {/* Filtros de búsqueda para pagos */}
          <Card>
            <CardHeader>
              <CardTitle>Filtros de Búsqueda</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4">
                <div className="flex-1">
                  <Input
                    placeholder="Buscar por cliente, monto o fecha..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <Select value={paymentFilter} onValueChange={setPaymentFilter}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Filtrar por tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los pagos</SelectItem>
                    <SelectItem value="with_fees">Con mora</SelectItem>
                    <SelectItem value="without_fees">Sin mora</SelectItem>
                    <SelectItem value="high_amount">Monto alto</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Reporte de Pagos ({filteredPayments.length})</CardTitle>
                <Button onClick={() => exportToCSV(filteredPayments, 'reporte_pagos')}>
                  <Download className="h-4 w-4 mr-2" />
                  Exportar CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {loading ? (
                  <div className="text-center py-8">Cargando datos...</div>
                ) : filteredPayments.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <DollarSign className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No hay pagos que coincidan con los filtros</p>
                  </div>
                ) : (
                  filteredPayments.map((payment) => (
                    <div key={payment.id} className="border rounded-lg p-4">
                      <div className="flex justify-between items-start">
                        <div className="space-y-2 flex-1">
                          <div className="flex items-center gap-3">
                            <h3 className="font-medium">{payment.loans?.clients?.full_name || 'Cliente desconocido'}</h3>
                            <Badge variant={payment.status === 'completed' ? 'default' : 'secondary'}>
                              {payment.status === 'completed' ? 'Completado' : 'Pendiente'}
                            </Badge>
                            {payment.late_fee > 0 && (
                              <Badge variant="destructive">Con Mora</Badge>
                            )}
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm text-gray-600">
                            <div>
                              <span className="font-medium">Préstamo:</span> 
                              <span className="ml-1">#{payment.loans?.id?.substring(0, 8) || 'N/A'}</span>
                            </div>
                            <div>
                              <span className="font-medium">Monto Préstamo:</span> 
                              <span className="ml-1">${payment.loans?.amount?.toLocaleString() || 'N/A'}</span>
                            </div>
                            <div>
                              <span className="font-medium">Monto Pago:</span> 
                              <span className="ml-1">${payment.amount.toLocaleString()}</span>
                            </div>
                            <div>
                              <span className="font-medium">Principal:</span> 
                              <span className="ml-1">${payment.principal_amount.toLocaleString()}</span>
                            </div>
                            <div>
                              <span className="font-medium">Interés:</span> 
                              <span className="ml-1">${payment.interest_amount.toLocaleString()}</span>
                            </div>
                            <div>
                              <span className="font-medium">Fecha:</span> 
                              <span className="ml-1">{new Date(payment.payment_date).toLocaleDateString('es-DO')} {new Date(payment.payment_date).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                          </div>
                          {payment.late_fee > 0 && (
                            <div className="text-sm text-red-600">
                              <strong>Mora:</strong> ${payment.late_fee.toLocaleString()}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 ml-4">
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => showInvoiceDetails(payment)}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            Detalle
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => printInvoice(payment)}
                          >
                            <Printer className="h-4 w-4 mr-1" />
                            Imprimir
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="clientes" className="space-y-6">
          {/* Filtros de búsqueda para clientes */}
          <Card>
            <CardHeader>
              <CardTitle>Filtros de Búsqueda</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4">
                <div className="flex-1">
                  <Input
                    placeholder="Buscar por nombre, cédula o teléfono..."
                    value={clientSearchTerm}
                    onChange={(e) => setClientSearchTerm(e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Reporte de Clientes ({filteredClients.length})</CardTitle>
                <Button onClick={() => exportToCSV(filteredClients, 'reporte_clientes')}>
                  <Download className="h-4 w-4 mr-2" />
                  Exportar CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {/* Estadísticas de Clientes */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">{filteredClients.length}</div>
                  <div className="text-sm text-gray-600">Total Clientes</div>
                </div>
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">
                    {filteredClients.filter(c => c.status === 'active').length}
                  </div>
                  <div className="text-sm text-gray-600">Clientes Activos</div>
                </div>
                <div className="text-center p-4 bg-purple-50 rounded-lg">
                  <div className="text-2xl font-bold text-purple-600">
                    ${filteredClients.reduce((sum, c) => sum + (c.monthly_income || 0), 0).toLocaleString()}
                  </div>
                  <div className="text-sm text-gray-600">Ingresos Totales</div>
                </div>
              </div>

              <div className="space-y-4">
                {filteredClients.map((client) => (
                  <div key={client.id} className="border rounded-lg p-4">
                    <div className="flex justify-between items-start">
                      <div className="space-y-2">
                        <div className="flex items-center gap-3">
                          <h3 className="font-medium">{client.full_name}</h3>
                          <Badge variant={client.status === 'active' ? 'default' : 'secondary'}>
                            {client.status === 'active' ? 'Activo' : 'Inactivo'}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-gray-600">
                          <div>Cédula: {client.dni}</div>
                          <div>Teléfono: {client.phone}</div>
                          <div>Ciudad: {client.city || 'N/A'}</div>
                          <div>Ingresos: ${(client.monthly_income || 0).toLocaleString()}</div>
                        </div>
                      </div>
                      <Button variant="outline" size="sm">
                        <Eye className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="financiero" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Reporte Financiero</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-lg font-semibold mb-4">Ingresos</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span>Intereses cobrados:</span>
                      <span className="font-semibold text-green-600">${totalInterest.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Pagos recibidos:</span>
                      <span className="font-semibold">${totalPayments.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Moras cobradas:</span>
                      <span className="font-semibold">
                        ${reportData.payments.reduce((sum, p) => sum + (p.late_fee || 0), 0).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold mb-4">Egresos</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span>Gastos operativos:</span>
                      <span className="font-semibold text-red-600">${totalExpenses.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Capital prestado:</span>
                      <span className="font-semibold">${totalLoanAmount.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-6 border-t">
                <div className="flex justify-between text-lg font-bold">
                  <span>Ganancia Neta:</span>
                  <span className={netProfit >= 0 ? 'text-green-600' : 'text-red-600'}>
                    ${netProfit.toLocaleString()}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="operativo" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Reporte Operativo</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-lg font-semibold mb-4">Métricas de Préstamos</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span>Tasa de aprobación:</span>
                      <span className="font-semibold">
                        {totalLoans > 0 ? Math.round((activeLoans / totalLoans) * 100) : 0}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Tasa de morosidad:</span>
                      <span className="font-semibold text-red-600">
                        {totalLoans > 0 ? Math.round((overdueLoans / totalLoans) * 100) : 0}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Préstamo promedio:</span>
                      <span className="font-semibold">
                        ${totalLoans > 0 ? Math.round(totalLoanAmount / totalLoans).toLocaleString() : 0}
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold mb-4">Métricas de Cobranza</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span>Pagos puntuales:</span>
                      <span className="font-semibold text-green-600">
                        {reportData.payments.filter(p => !p.late_fee || p.late_fee === 0).length}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Pagos con mora:</span>
                      <span className="font-semibold text-red-600">
                        {reportData.payments.filter(p => p.late_fee && p.late_fee > 0).length}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Pago promedio:</span>
                      <span className="font-semibold">
                        ${reportData.payments.length > 0 ? Math.round(totalPayments / reportData.payments.length).toLocaleString() : 0}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Modal de detalle de factura de préstamo */}
      <Dialog open={showInvoiceModal} onOpenChange={setShowInvoiceModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Detalle de Factura
            </DialogTitle>
          </DialogHeader>
          {selectedPayment && (
            <div className="space-y-6">
              {/* Información del cliente */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="font-semibold mb-2">Información del Cliente</h4>
                  <div className="space-y-1 text-sm">
                    <p><strong>Nombre:</strong> {selectedPayment.loans?.clients?.full_name}</p>
                    <p><strong>Cédula:</strong> {selectedPayment.loans?.clients?.dni}</p>
                    <p><strong>Fecha:</strong> {new Date(selectedPayment.payment_date).toLocaleDateString('es-DO')} {new Date(selectedPayment.payment_date).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">Información del Pago</h4>
                  <div className="space-y-1 text-sm">
                    <p><strong>Recibo #:</strong> {selectedPayment.id}</p>
                    <p><strong>Préstamo #:</strong> {selectedPayment.loans?.id?.substring(0, 8) || 'N/A'}</p>
                    <p><strong>Monto Préstamo:</strong> ${selectedPayment.loans?.amount?.toLocaleString() || 'N/A'}</p>
                    <p><strong>Método:</strong> {selectedPayment.payment_method || 'Efectivo'}</p>
                    <p><strong>Estado:</strong> <Badge variant="default">Pagado</Badge></p>
                  </div>
                </div>
              </div>

              {/* Desglose del pago */}
              <div>
                <h4 className="font-semibold mb-3">Desglose del Pago</h4>
                <div className="border rounded-lg">
                  <div className="grid grid-cols-2 gap-4 p-3 border-b">
                    <span>Pago Principal:</span>
                    <span className="font-medium">${selectedPayment.principal_amount.toLocaleString()}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4 p-3 border-b">
                    <span>Intereses:</span>
                    <span className="font-medium">${selectedPayment.interest_amount.toLocaleString()}</span>
                  </div>
                  {selectedPayment.late_fee > 0 && (
                    <div className="grid grid-cols-2 gap-4 p-3 border-b">
                      <span>Mora:</span>
                      <span className="font-medium text-red-600">${selectedPayment.late_fee.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-4 p-3 bg-gray-50 font-bold">
                    <span>Total:</span>
                    <span>${selectedPayment.amount.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Acciones */}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowInvoiceModal(false)}>
                  Cerrar
                </Button>
                <Button onClick={() => printInvoice(selectedPayment)}>
                  <Printer className="h-4 w-4 mr-2" />
                  Imprimir Factura
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal de detalle de venta de POS */}
      <Dialog open={showSaleModal} onOpenChange={setShowSaleModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Detalle de Venta
            </DialogTitle>
          </DialogHeader>
          {selectedSale && (
            <div className="space-y-6">
              {/* Información del cliente */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="font-semibold mb-2">Información del Cliente</h4>
                  <div className="space-y-1 text-sm">
                    <p><strong>Nombre:</strong> {selectedSale.clients?.full_name || selectedSale.customer_name || 'Cliente General'}</p>
                    {selectedSale.clients?.phone && <p><strong>Teléfono:</strong> {selectedSale.clients.phone}</p>}
                    <p><strong>Fecha:</strong> {selectedSale.sale_date ? `${new Date(selectedSale.sale_date).toLocaleDateString('es-DO')} ${new Date(selectedSale.sale_date).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })}` : (selectedSale.created_at ? `${new Date(selectedSale.created_at).toLocaleDateString('es-DO')} ${new Date(selectedSale.created_at).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })}` : 'N/A')}</p>
                  </div>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">Información de la Venta</h4>
                  <div className="space-y-1 text-sm">
                    <p><strong>Venta #:</strong> {selectedSale.id.substring(0, 8)}</p>
                    <p><strong>Método:</strong> {selectedSale.payment_method || 'Efectivo'}</p>
                    <p><strong>Estado:</strong> <Badge variant="default">{selectedSale.status || 'Completada'}</Badge></p>
                  </div>
                </div>
              </div>

              {/* Productos */}
              <div>
                <h4 className="font-semibold mb-3">Productos</h4>
                <div className="border rounded-lg">
                  <div className="divide-y">
                    {selectedSale.sale_details && selectedSale.sale_details.length > 0 ? (
                      selectedSale.sale_details.map((detail: any) => {
                        const itbisRate = detail.products?.itbis_rate ?? detail.product?.itbis_rate ?? 18;
                        const itemSubtotal = detail.total_price; // Sin ITBIS
                        const itemTax = itemSubtotal * (itbisRate / 100);
                        const itemTotalWithTax = itemSubtotal + itemTax;
                        
                        return (
                          <div key={detail.id} className="grid grid-cols-4 gap-4 p-3">
                            <span className="col-span-2">{detail.products?.name || detail.product?.name || 'Producto desconocido'}</span>
                            <span className="text-right">Cant: {detail.quantity}</span>
                            <span className="text-right font-medium">${itemTotalWithTax.toFixed(2)}</span>
                          </div>
                        );
                      })
                    ) : (
                      <div className="p-3 text-sm text-gray-500">No hay productos disponibles</div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-4 p-3 bg-gray-50 font-bold border-t">
                    <span>Total:</span>
                    <span className="text-right">
                      ${(() => {
                        if (selectedSale.sale_details && selectedSale.sale_details.length > 0) {
                          return selectedSale.sale_details.reduce((sum: number, detail: any) => {
                            const itbisRate = detail.products?.itbis_rate ?? detail.product?.itbis_rate ?? 18;
                            const itemSubtotal = detail.total_price;
                            const itemTax = itemSubtotal * (itbisRate / 100);
                            return sum + itemSubtotal + itemTax;
                          }, 0).toFixed(2);
                        }
                        return (selectedSale.total_amount || 0).toFixed(2);
                      })()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Acciones */}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowSaleModal(false)}>
                  Cerrar
                </Button>
                <Button onClick={() => generateReceiptFromSale(selectedSale, 'POS80')}>
                  <Printer className="h-4 w-4 mr-2" />
                  Imprimir
                </Button>
                <Button variant="outline" onClick={() => downloadReceiptFromSale(selectedSale)}>
                  <Download className="h-4 w-4 mr-2" />
                  Descargar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
