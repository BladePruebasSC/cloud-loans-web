
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
import { 
  Zap, 
  Plus, 
  Calculator,
  FileText,
  DollarSign,
  Calendar,
  AlertCircle,
  Settings,
  TrendingUp,
  Receipt,
  Edit,
  Trash2,
  Printer,
  Download,
  Eye,
  FileEdit,
  Upload,
  Save
} from 'lucide-react';

interface Expense {
  id: string;
  amount: number;
  description: string;
  category: string;
  status: string;
  expense_date: string;
  receipt_url: string | null;
  created_at: string;
  created_by: string;
}

const UtilitiesModule = () => {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('calculadora');
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const { user, companyId } = useAuth();

  // Calculator configuration state
  const [defaultInterestRate, setDefaultInterestRate] = useState(15);
  const [defaultTermMonths, setDefaultTermMonths] = useState(12);
  const [loadingConfig, setLoadingConfig] = useState(false);

  // Calculator state
  const [loanAmount, setLoanAmount] = useState(100000);
  const [interestRate, setInterestRate] = useState(15);
  const [termMonths, setTermMonths] = useState(12);
  const [calculatedPayment, setCalculatedPayment] = useState(0);
  
  // Simple Interest Calculator
  const [simpleInterest, setSimpleInterest] = useState({
    principal: 100000,
    rate: 15,
    time: 12,
    result: 0
  });
  
  // Profitability Calculator
  const [profitability, setProfitability] = useState({
    initialInvestment: 100000,
    finalValue: 120000,
    timeMonths: 12,
    result: 0
  });
  
  // Currency Converter
  const [currency, setCurrency] = useState({
    amount: 1000,
    fromCurrency: 'DOP',
    toCurrency: 'USD',
    result: 0,
    exchangeRate: 58.5 // DOP to USD
  });
  
  const [showSimpleInterest, setShowSimpleInterest] = useState(false);
  const [showProfitability, setShowProfitability] = useState(false);
  const [showCurrencyConverter, setShowCurrencyConverter] = useState(false);

  // Report filters
  const [reportDateFrom, setReportDateFrom] = useState<string>('');
  const [reportDateTo, setReportDateTo] = useState<string>('');
  const [reportCategoryFilter, setReportCategoryFilter] = useState<string>('all');

  // Expense categories management
  const [expenseCategories, setExpenseCategories] = useState<string[]>(['Oficina', 'Marketing', 'Transporte', 'Servicios', 'Equipos', 'Otros']);
  const [editingCategoryIndex, setEditingCategoryIndex] = useState<number | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState<string>('');
  const [newCategoryName, setNewCategoryName] = useState<string>('');
  const [showAddCategory, setShowAddCategory] = useState(false);

  // Expense editing
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [showEditExpenseForm, setShowEditExpenseForm] = useState(false);

  // Print format selection
  const [showPrintFormatDialog, setShowPrintFormatDialog] = useState(false);
  const [expenseToPrint, setExpenseToPrint] = useState<Expense | null>(null);

  // Expense form
  const [expenseForm, setExpenseForm] = useState({
    amount: 0,
    description: '',
    category: '',
    expense_date: new Date().toISOString().split('T')[0]
  });

  // Templates state
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<any | null>(null);
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  const [templateContent, setTemplateContent] = useState<string>('');
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  useEffect(() => {
    if (user) {
      fetchExpenses();
      fetchCalculatorConfig();
    }
  }, [user, companyId]);

  const fetchCalculatorConfig = async () => {
    if (!companyId) return;
    
    try {
      const { data, error } = await supabase
        .from('company_settings')
        .select('interest_rate_default, min_term_months, expense_categories')
        .eq('user_id', companyId)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching calculator config:', error);
        return;
      }

      if (data) {
        if (data.interest_rate_default) {
          setDefaultInterestRate(Number(data.interest_rate_default));
          setInterestRate(Number(data.interest_rate_default));
        }
        if (data.min_term_months) {
          setDefaultTermMonths(Number(data.min_term_months));
          setTermMonths(Number(data.min_term_months));
        }
        // Cargar categorías de gastos desde la base de datos
        if (data.expense_categories && Array.isArray(data.expense_categories) && data.expense_categories.length > 0) {
          setExpenseCategories(data.expense_categories);
        } else {
          // Si no hay categorías guardadas, usar las por defecto y guardarlas
          const defaultCategories = ['Oficina', 'Marketing', 'Transporte', 'Servicios', 'Equipos', 'Otros'];
          setExpenseCategories(defaultCategories);
          // Guardar las categorías por defecto en la base de datos
          try {
            const { data: existing } = await supabase
              .from('company_settings')
              .select('id')
              .eq('user_id', companyId)
              .maybeSingle();
            
            if (existing) {
              await supabase
                .from('company_settings')
                .update({ expense_categories: defaultCategories })
                .eq('user_id', companyId);
            } else {
              await supabase
                .from('company_settings')
                .insert({
                  user_id: companyId,
                  company_name: 'Mi Empresa',
                  expense_categories: defaultCategories
                });
            }
          } catch (error) {
            console.error('Error saving default categories:', error);
          }
        }
      }
    } catch (error) {
      console.error('Error loading calculator config:', error);
    }
  };

  const saveExpenseCategories = async () => {
    if (!companyId) {
      toast.error('No se pudo identificar la empresa');
      return;
    }

    try {
      // Verificar si existe configuración
      const { data: existing } = await supabase
        .from('company_settings')
        .select('id')
        .eq('user_id', companyId)
        .maybeSingle();

      const updateData = {
        expense_categories: expenseCategories,
        updated_at: new Date().toISOString()
      };

      let error;
      if (existing) {
        // Actualizar
        const { error: updateError } = await supabase
          .from('company_settings')
          .update(updateData)
          .eq('user_id', companyId);
        error = updateError;
      } else {
        // Crear (necesitamos al menos company_name)
        const { error: insertError } = await supabase
          .from('company_settings')
          .insert({
            user_id: companyId,
            company_name: 'Mi Empresa',
            ...updateData
          });
        error = insertError;
      }

      if (error) throw error;
    } catch (error) {
      console.error('Error saving expense categories:', error);
      throw error;
    }
  };

  const saveCalculatorConfig = async () => {
    if (!companyId) {
      toast.error('No se pudo identificar la empresa');
      return;
    }

    try {
      setLoadingConfig(true);
      
      // Verificar si existe configuración
      const { data: existing } = await supabase
        .from('company_settings')
        .select('id')
        .eq('user_id', companyId)
        .maybeSingle();

      const configData = {
        interest_rate_default: defaultInterestRate,
        min_term_months: defaultTermMonths,
        expense_categories: expenseCategories,
        updated_at: new Date().toISOString()
      };

      let error;
      if (existing) {
        // Actualizar
        const { error: updateError } = await supabase
          .from('company_settings')
          .update(configData)
          .eq('user_id', companyId);
        error = updateError;
      } else {
        // Crear (necesitamos al menos company_name)
        const { error: insertError } = await supabase
          .from('company_settings')
          .insert({
            user_id: companyId,
            company_name: 'Mi Empresa',
            ...configData
          });
        error = insertError;
      }

      if (error) throw error;

      // Actualizar valores en la calculadora
      setInterestRate(defaultInterestRate);
      setTermMonths(defaultTermMonths);

      toast.success('Configuración guardada exitosamente');
    } catch (error) {
      console.error('Error saving calculator config:', error);
      toast.error('Error al guardar configuración');
    } finally {
      setLoadingConfig(false);
    }
  };

  const fetchExpenses = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setExpenses(data || []);
    } catch (error) {
      console.error('Error fetching expenses:', error);
      toast.error('Error al cargar gastos');
    } finally {
      setLoading(false);
    }
  };

  const calculateLoanPayment = () => {
    const principal = loanAmount;
    const monthlyRate = (interestRate / 100) / 12;
    const numPayments = termMonths;

    if (monthlyRate === 0) {
      setCalculatedPayment(principal / numPayments);
      return;
    }

    const payment = principal * (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) / 
                   (Math.pow(1 + monthlyRate, numPayments) - 1);
    
    setCalculatedPayment(Math.round(payment * 100) / 100);
  };

  const handleExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    // Validar que el monto sea mayor a 0
    if (!expenseForm.amount || expenseForm.amount <= 0) {
      toast.error('El monto debe ser mayor a 0');
      return;
    }

    // Validar que se haya seleccionado una categoría
    if (!expenseForm.category || expenseForm.category.trim() === '') {
      toast.error('Debe seleccionar una categoría');
      return;
    }

    try {
      const { data: newExpense, error } = await supabase
        .from('expenses')
        .insert([{
          ...expenseForm,
          created_by: user.id,
          status: 'approved'
        }])
        .select()
        .single();

      if (error) throw error;

      toast.success('Gasto registrado exitosamente');
      setShowExpenseForm(false);
      resetExpenseForm();
      fetchExpenses();
      
      // Abrir diálogo para seleccionar formato de impresión
      if (newExpense) {
        setTimeout(() => {
          setExpenseToPrint(newExpense);
          setShowPrintFormatDialog(true);
        }, 500);
      }
    } catch (error) {
      console.error('Error creating expense:', error);
      toast.error('Error al registrar gasto');
    }
  };

  const resetExpenseForm = () => {
    setExpenseForm({
      amount: 0,
      description: '',
      category: '',
      expense_date: new Date().toISOString().split('T')[0]
    });
  };

  const deleteExpense = async (expenseId: string) => {
    if (!confirm('¿Estás seguro de que deseas eliminar este gasto?')) return;

    try {
      const { error } = await supabase
        .from('expenses')
        .delete()
        .eq('id', expenseId);

      if (error) throw error;

      toast.success('Gasto eliminado exitosamente');
      fetchExpenses();
    } catch (error) {
      console.error('Error deleting expense:', error);
      toast.error('Error al eliminar gasto');
    }
  };

  const totalExpenses = expenses.reduce((sum, exp) => sum + exp.amount, 0);
  const monthlyExpenses = expenses
    .filter(exp => new Date(exp.expense_date).getMonth() === new Date().getMonth())
    .reduce((sum, exp) => sum + exp.amount, 0);
  
  // Categorías: combinar las configuradas con las de los gastos existentes
  const expenseCategoriesFromData = [...new Set(expenses.map(exp => exp.category).filter(Boolean))];
  const categories = [...new Set([...expenseCategories, ...expenseCategoriesFromData])].sort();

  // Filtered expenses for reports
  const filteredExpenses = expenses.filter(exp => {
    const expenseDate = new Date(exp.expense_date);
    
    // Date filter
    if (reportDateFrom) {
      const fromDate = new Date(reportDateFrom);
      fromDate.setHours(0, 0, 0, 0);
      if (expenseDate < fromDate) return false;
    }
    if (reportDateTo) {
      const toDate = new Date(reportDateTo);
      toDate.setHours(23, 59, 59, 999);
      if (expenseDate > toDate) return false;
    }
    
    // Category filter
    if (reportCategoryFilter !== 'all' && exp.category !== reportCategoryFilter) {
      return false;
    }
    
    return true;
  });

  const filteredTotalExpenses = filteredExpenses.reduce((sum, exp) => sum + exp.amount, 0);
  const filteredPeriodExpenses = filteredExpenses
    .filter(exp => {
      if (!reportDateFrom && !reportDateTo) return true;
      const expenseDate = new Date(exp.expense_date);
      if (reportDateFrom) {
        const fromDate = new Date(reportDateFrom);
        fromDate.setHours(0, 0, 0, 0);
        if (expenseDate < fromDate) return false;
      }
      if (reportDateTo) {
        const toDate = new Date(reportDateTo);
        toDate.setHours(23, 59, 59, 999);
        if (expenseDate > toDate) return false;
      }
      return true;
    })
    .reduce((sum, exp) => sum + exp.amount, 0);
  const filteredCategories = [...new Set(filteredExpenses.map(exp => exp.category).filter(Boolean))];

  // Funciones para previsualizar, imprimir y descargar PDF
  const generateExpenseReportHTML = () => {
    const money = (n: number) => new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(n || 0);
    
    const periodText = reportDateFrom && reportDateTo
      ? `del ${new Date(reportDateFrom).toLocaleDateString('es-DO')} al ${new Date(reportDateTo).toLocaleDateString('es-DO')}`
      : reportDateFrom
        ? `desde ${new Date(reportDateFrom).toLocaleDateString('es-DO')}`
        : reportDateTo
          ? `hasta ${new Date(reportDateTo).toLocaleDateString('es-DO')}`
          : 'Todos los períodos';
    
    const categoryText = reportCategoryFilter !== 'all' ? reportCategoryFilter : 'Todas las categorías';
    
    const tableRows = filteredExpenses.map(expense => `
      <tr>
        <td>${new Date(expense.expense_date).toLocaleDateString('es-DO')}</td>
        <td>${expense.description}</td>
        <td>${expense.category}</td>
        <td class="text-right">${money(expense.amount)}</td>
        <td>${expense.status === 'approved' ? 'Aprobado' : expense.status}</td>
      </tr>
    `).join('');

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <title>Reporte de Gastos</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            .header { text-align: center; margin-bottom: 30px; }
            .header h1 { color: #2563eb; margin: 0; }
            .header h2 { color: #666; margin: 5px 0; }
            .info { margin-bottom: 20px; padding: 15px; background: #f8f9fa; border-radius: 5px; }
            .info p { margin: 5px 0; }
            table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
            th { background-color: #2563eb; color: white; font-weight: bold; }
            .text-right { text-align: right; }
            .summary { margin-top: 30px; padding: 15px; background: #f8f9fa; border-radius: 5px; }
            .summary h3 { margin-top: 0; color: #2563eb; }
            .summary-row { display: flex; justify-content: space-between; padding: 5px 0; }
            .total { font-weight: bold; font-size: 1.1em; border-top: 2px solid #2563eb; padding-top: 10px; margin-top: 10px; }
            .footer { margin-top: 30px; text-align: center; color: #666; font-size: 0.9em; }
            @media print {
              body { margin: 0; }
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>REPORTE DE GASTOS</h1>
            <h2>${new Date().toLocaleDateString('es-DO', { year: 'numeric', month: 'long', day: 'numeric' })}</h2>
          </div>
          
          <div class="info">
            <p><strong>Período:</strong> ${periodText}</p>
            <p><strong>Categoría:</strong> ${categoryText}</p>
            <p><strong>Total de gastos:</strong> ${filteredExpenses.length}</p>
          </div>

          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Descripción</th>
                <th>Categoría</th>
                <th class="text-right">Monto</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows || '<tr><td colspan="5" style="text-align: center;">No hay gastos en este período</td></tr>'}
            </tbody>
            <tfoot>
              <tr class="total">
                <td colspan="3"><strong>TOTAL</strong></td>
                <td class="text-right"><strong>${money(filteredTotalExpenses)}</strong></td>
                <td></td>
              </tr>
            </tfoot>
          </table>

          <div class="summary">
            <h3>Resumen</h3>
            <div class="summary-row">
              <span>Total de gastos:</span>
              <span><strong>${filteredExpenses.length}</strong></span>
            </div>
            <div class="summary-row">
              <span>Monto total:</span>
              <span><strong>${money(filteredTotalExpenses)}</strong></span>
            </div>
            <div class="summary-row">
              <span>Promedio por gasto:</span>
              <span><strong>${money(filteredExpenses.length > 0 ? filteredTotalExpenses / filteredExpenses.length : 0)}</strong></span>
            </div>
            ${filteredCategories.length > 0 ? `
              <div style="margin-top: 15px;">
                <h4>Gastos por Categoría:</h4>
                ${filteredCategories.map(cat => {
                  const catExpenses = filteredExpenses.filter(exp => exp.category === cat);
                  const catTotal = catExpenses.reduce((sum, exp) => sum + exp.amount, 0);
                  return `<div class="summary-row"><span>${cat}:</span><span>${money(catTotal)}</span></div>`;
                }).join('')}
              </div>
            ` : ''}
          </div>

          <div class="footer">
            <p>Generado el ${new Date().toLocaleString('es-DO')}</p>
          </div>
        </body>
      </html>
    `;
  };

  const previewExpenseReport = () => {
    const html = generateExpenseReportHTML();
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
    }
  };

  const printExpenseReport = () => {
    const html = generateExpenseReportHTML();
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      setTimeout(() => {
        printWindow.print();
      }, 250);
    }
  };

  const downloadExpenseReportPDF = async () => {
    try {
      const { default: jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');
      
      const money = (n: number) => new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(n || 0);
      
      // Obtener información de la empresa
      const { data: companySettings } = await supabase
        .from('company_settings')
        .select('company_name, address, phone')
        .eq('user_id', user?.id)
        .maybeSingle();
      
      const companyName = companySettings?.company_name || 'Mi Empresa';
      const companyAddress = companySettings?.address || '';
      const companyPhone = companySettings?.phone || '';

      const periodText = reportDateFrom && reportDateTo
        ? `del ${new Date(reportDateFrom).toLocaleDateString('es-DO')} al ${new Date(reportDateTo).toLocaleDateString('es-DO')}`
        : reportDateFrom
          ? `desde ${new Date(reportDateFrom).toLocaleDateString('es-DO')}`
          : reportDateTo
            ? `hasta ${new Date(reportDateTo).toLocaleDateString('es-DO')}`
            : 'Todos los períodos';
      
      const categoryText = reportCategoryFilter !== 'all' ? reportCategoryFilter : 'Todas las categorías';

      // Preparar datos de la tabla
      const tableData = filteredExpenses.map(expense => [
        new Date(expense.expense_date).toLocaleDateString('es-DO'),
        expense.description,
        expense.category,
        money(expense.amount),
        expense.status === 'approved' ? 'Aprobado' : expense.status
      ]);

      // Crear documento PDF
      const doc = new jsPDF('p', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 15;
      let yPos = margin;

      // Encabezado
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('REPORTE DE GASTOS', margin, yPos);
      yPos += 7;

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(companyName, margin, yPos);
      yPos += 5;

      if (companyAddress) {
        doc.text(companyAddress, margin, yPos);
        yPos += 5;
      }

      if (companyPhone) {
        doc.text(`Tel: ${companyPhone}`, margin, yPos);
        yPos += 5;
      }

      // Línea separadora
      yPos += 3;
      doc.setLineWidth(0.5);
      doc.line(margin, yPos, pageWidth - margin, yPos);
      yPos += 8;

      // Información del reporte
      doc.setFontSize(10);
      doc.text(`Período: ${periodText}`, margin, yPos);
      yPos += 5;
      doc.text(`Categoría: ${categoryText}`, margin, yPos);
      yPos += 5;
      doc.text(`Fecha de generación: ${new Date().toLocaleDateString('es-DO')}`, margin, yPos);
      yPos += 8;

      // Agregar tabla con autoTable
      autoTable(doc, {
        head: [['Fecha', 'Descripción', 'Categoría', 'Monto', 'Estado']],
        body: tableData.length > 0 ? tableData : [['No hay gastos en este período', '', '', '', '']],
        startY: yPos,
        styles: { fontSize: 9, cellPadding: 3 },
        headStyles: { 
          fillColor: [66, 139, 202], 
          textColor: 255, 
          fontStyle: 'bold',
          halign: 'center'
        },
        columnStyles: {
          0: { cellWidth: 30 },
          1: { cellWidth: 'auto' },
          2: { cellWidth: 35 },
          3: { cellWidth: 35, halign: 'right' },
          4: { cellWidth: 30 }
        },
        margin: { left: margin, right: margin }
      });

      // Obtener la posición final después de la tabla
      const finalY = (doc as any).lastAutoTable.finalY || yPos + 50;

      // Resumen
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('RESUMEN', margin, finalY + 10);
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Total de gastos: ${filteredExpenses.length}`, margin, finalY + 18);
      doc.text(`Monto total: ${money(filteredTotalExpenses)}`, margin, finalY + 23);
      doc.text(`Promedio por gasto: ${money(filteredExpenses.length > 0 ? filteredTotalExpenses / filteredExpenses.length : 0)}`, margin, finalY + 28);

      // Gastos por categoría
      if (filteredCategories.length > 0) {
        doc.setFont('helvetica', 'bold');
        doc.text('Gastos por Categoría:', margin, finalY + 36);
        doc.setFont('helvetica', 'normal');
        let categoryY = finalY + 43;
        filteredCategories.forEach(cat => {
          const catExpenses = filteredExpenses.filter(exp => exp.category === cat);
          const catTotal = catExpenses.reduce((sum, exp) => sum + exp.amount, 0);
          doc.text(`${cat}: ${money(catTotal)}`, margin + 5, categoryY);
          categoryY += 5;
        });
      }

      // Pie de página
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.text(
          `Página ${i} de ${pageCount}`,
          pageWidth - margin - 20,
          doc.internal.pageSize.getHeight() - 10
        );
      }

      // Descargar PDF
      const fileName = `reporte-gastos-${new Date().toISOString().split('T')[0]}.pdf`;
      doc.save(fileName);
      toast.success('PDF descargado exitosamente');
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('Error al generar el PDF');
    }
  };

  // Funciones para gestionar categorías
  const handleAddCategory = async () => {
    if (newCategoryName.trim() && !expenseCategories.includes(newCategoryName.trim())) {
      const updatedCategories = [...expenseCategories, newCategoryName.trim()];
      setExpenseCategories(updatedCategories);
      setNewCategoryName('');
      setShowAddCategory(false);
      
      // Guardar en la base de datos
      try {
        await saveExpenseCategories();
        toast.success('Categoría agregada exitosamente');
      } catch (error) {
        // Revertir cambio local si falla
        setExpenseCategories(expenseCategories);
        toast.error('Error al guardar la categoría');
      }
    } else if (expenseCategories.includes(newCategoryName.trim())) {
      toast.error('Esta categoría ya existe');
    }
  };

  const handleEditCategory = (index: number) => {
    setEditingCategoryIndex(index);
    setEditingCategoryName(expenseCategories[index]);
  };

  const handleSaveCategoryEdit = async () => {
    if (editingCategoryIndex !== null && editingCategoryName.trim()) {
      const oldCategories = [...expenseCategories];
      const updated = [...expenseCategories];
      updated[editingCategoryIndex] = editingCategoryName.trim();
      setExpenseCategories(updated);
      setEditingCategoryIndex(null);
      setEditingCategoryName('');
      
      // Guardar en la base de datos
      try {
        await saveExpenseCategories();
        toast.success('Categoría actualizada exitosamente');
      } catch (error) {
        // Revertir cambio local si falla
        setExpenseCategories(oldCategories);
        toast.error('Error al actualizar la categoría');
      }
    }
  };

  const handleCancelCategoryEdit = () => {
    setEditingCategoryIndex(null);
    setEditingCategoryName('');
  };

  const handleDeleteCategory = async (index: number) => {
    const categoryToDelete = expenseCategories[index];
    // Verificar si hay gastos usando esta categoría
    const hasExpenses = expenses.some(exp => exp.category === categoryToDelete);
    if (hasExpenses) {
      toast.error('No se puede eliminar una categoría que tiene gastos asociados');
      return;
    }
    if (confirm(`¿Estás seguro de que deseas eliminar la categoría "${categoryToDelete}"?`)) {
      const oldCategories = [...expenseCategories];
      const updated = expenseCategories.filter((_, i) => i !== index);
      setExpenseCategories(updated);
      
      // Guardar en la base de datos
      try {
        await saveExpenseCategories();
        toast.success('Categoría eliminada exitosamente');
      } catch (error) {
        // Revertir cambio local si falla
        setExpenseCategories(oldCategories);
        toast.error('Error al eliminar la categoría');
      }
    }
  };

  // Funciones para editar gastos
  const handleEditExpense = (expense: Expense) => {
    setEditingExpense(expense);
    setExpenseForm({
      amount: expense.amount,
      description: expense.description,
      category: expense.category,
      expense_date: expense.expense_date
    });
    setShowEditExpenseForm(true);
  };

  const handleUpdateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !editingExpense) return;

    // Validar que el monto sea mayor a 0
    if (!expenseForm.amount || expenseForm.amount <= 0) {
      toast.error('El monto debe ser mayor a 0');
      return;
    }

    // Validar que se haya seleccionado una categoría
    if (!expenseForm.category || expenseForm.category.trim() === '') {
      toast.error('Debe seleccionar una categoría');
      return;
    }

    try {
      const { error } = await supabase
        .from('expenses')
        .update({
          amount: expenseForm.amount,
          description: expenseForm.description,
          category: expenseForm.category,
          expense_date: expenseForm.expense_date
        })
        .eq('id', editingExpense.id);

      if (error) throw error;

      toast.success('Gasto actualizado exitosamente');
      setShowEditExpenseForm(false);
      setEditingExpense(null);
      resetExpenseForm();
      fetchExpenses();
    } catch (error) {
      console.error('Error updating expense:', error);
      toast.error('Error al actualizar gasto');
    }
  };

  // Función para imprimir un gasto individual con selección de formato
  const openPrintFormatDialog = (expense: Expense) => {
    setExpenseToPrint(expense);
    setShowPrintFormatDialog(true);
  };

  const printSingleExpense = async (expense: Expense, format: 'POS80' | 'POS58' | 'A4' = 'A4') => {
    const money = (n: number) => new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(n || 0);
    
    // Obtener información de la empresa
    let companyName = 'Mi Empresa';
    let companyAddress = '';
    let companyPhone = '';
    
    try {
      const { data: companySettings } = await supabase
        .from('company_settings')
        .select('company_name, address, phone')
        .eq('user_id', user?.id)
        .maybeSingle();
      
      if (companySettings) {
        companyName = companySettings.company_name || companyName;
        companyAddress = companySettings.address || '';
        companyPhone = companySettings.phone || '';
      }
    } catch (error) {
      console.error('Error fetching company settings:', error);
    }

    const expenseDate = new Date(expense.expense_date).toLocaleDateString('es-DO', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const createdDate = expense.created_at 
      ? new Date(expense.created_at).toLocaleDateString('es-DO', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })
      : new Date().toLocaleString('es-DO');

    const isThermal = format === 'POS80' || format === 'POS58';
    const isPOS58 = format === 'POS58';

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
      .amount-section { padding: 4px 0; border-top: 1px solid #000; margin-top: 4px; text-align: center; }
      .amount-label { font-size: ${isPOS58 ? '7px' : '8px'}; }
      .amount-value { font-size: ${isPOS58 ? '12px' : '14px'}; font-weight: bold; }
      .footer { margin-top: 8px; font-size: ${isPOS58 ? '7px' : '8px'}; text-align: center; }
      .divider { border-top: 1px dashed #000; margin: 2px 0; }
    ` : '';

    // HTML según el formato
    const receiptHTML = isThermal ? `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <title>Comprobante de Gasto</title>
        <style>
          ${pageCss}
          ${thermalCss}
          body { font-family: 'Courier New', monospace; color: #000; margin: 0; padding: 0; }
        </style>
      </head>
      <body>
        <div class="invoice">
          <div class="header">
            <div class="brand-name">${companyName}</div>
            ${companyAddress ? `<div class="brand-meta">${companyAddress}</div>` : ''}
            ${companyPhone ? `<div class="brand-meta">Tel: ${companyPhone}</div>` : ''}
            <div class="divider"></div>
            <div class="doc-type">COMPROBANTE DE GASTO</div>
            <div class="doc-number">#${expense.id.substring(0, 8).toUpperCase()}</div>
          </div>
          
          <div class="section">
            <div class="field">
              <span class="label">Fecha:</span>
              <span>${expenseDate}</span>
            </div>
            <div class="field">
              <span class="label">Descripción:</span>
              <span>${expense.description}</span>
            </div>
            <div class="field">
              <span class="label">Categoría:</span>
              <span>${expense.category}</span>
            </div>
            <div class="field">
              <span class="label">Estado:</span>
              <span>${expense.status === 'approved' ? 'Aprobado' : expense.status}</span>
            </div>
          </div>

          <div class="divider"></div>

          <div class="amount-section">
            <div class="amount-label">MONTO</div>
            <div class="amount-value">${money(expense.amount)}</div>
          </div>

          <div class="footer">
            <div>${new Date().toLocaleString('es-DO')}</div>
          </div>
        </div>
      </body>
      </html>
    ` : `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <title>Comprobante de Gasto</title>
          <style>
            ${pageCss}
            body { 
              font-family: Arial, sans-serif; 
              margin: 20px; 
            }
            .invoice {
              max-width: 600px;
              margin: 0 auto;
            }
            .header { 
              text-align: center; 
              margin-bottom: 30px; 
              border-bottom: 2px solid #2563eb;
              padding-bottom: 20px;
            }
            .header h1 { 
              color: #2563eb; 
              margin: 0; 
              font-size: 24px;
            }
            .header h2 { 
              color: #666; 
              margin: 5px 0; 
              font-size: 14px;
            }
            .info { 
              margin-bottom: 20px; 
              padding: 15px; 
              background: #f8f9fa; 
              border-radius: 5px; 
            }
            .info-row { 
              display: flex; 
              justify-content: space-between; 
              padding: 8px 0;
              border-bottom: 1px solid #e0e0e0;
            }
            .info-row:last-child {
              border-bottom: none;
            }
            .info-label { 
              font-weight: bold; 
              color: #333;
            }
            .info-value { 
              color: #666; 
            }
            .amount-section {
              margin-top: 20px;
              padding: 20px;
              background: #e3f2fd;
              border-radius: 5px;
              text-align: center;
            }
            .amount-label {
              font-size: 14px;
              color: #666;
              margin-bottom: 10px;
            }
            .amount-value {
              font-size: 32px;
              font-weight: bold;
              color: #2563eb;
            }
            .footer { 
              margin-top: 30px; 
              text-align: center; 
              color: #666; 
              font-size: 0.9em; 
              border-top: 1px solid #e0e0e0;
              padding-top: 20px;
            }
            .status-badge {
              display: inline-block;
              padding: 5px 15px;
              border-radius: 20px;
              font-size: 12px;
              font-weight: bold;
              background: #4caf50;
              color: white;
            }
            @media print {
              body { margin: 0; }
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="invoice">
            <div class="header">
              <h1>${companyName}</h1>
              ${companyAddress ? `<p>${companyAddress}</p>` : ''}
              ${companyPhone ? `<p>Tel: ${companyPhone}</p>` : ''}
              <h1>COMPROBANTE DE GASTO</h1>
              <h2>${createdDate}</h2>
            </div>
          
          <div class="info">
            <div class="info-row">
              <span class="info-label">Número de Comprobante:</span>
              <span class="info-value">${expense.id.substring(0, 8).toUpperCase()}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Fecha del Gasto:</span>
              <span class="info-value">${expenseDate}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Descripción:</span>
              <span class="info-value">${expense.description}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Categoría:</span>
              <span class="info-value">${expense.category}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Estado:</span>
              <span class="info-value">
                <span class="status-badge">${expense.status === 'approved' ? 'Aprobado' : expense.status}</span>
              </span>
            </div>
          </div>

          <div class="amount-section">
            <div class="amount-label">MONTO DEL GASTO</div>
            <div class="amount-value">${money(expense.amount)}</div>
          </div>

          <div class="footer">
            <p>Este es un comprobante generado automáticamente</p>
            <p>Fecha de emisión: ${new Date().toLocaleString('es-DO')}</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(receiptHTML);
    printWindow.document.close();
    setTimeout(() => {
      printWindow.print();
    }, 250);
  };

  // Funciones para calculadoras adicionales
  const calculateSimpleInterest = () => {
    const interest = (simpleInterest.principal * simpleInterest.rate * simpleInterest.time) / (100 * 12);
    setSimpleInterest(prev => ({ ...prev, result: Math.round(interest * 100) / 100 }));
  };

  const calculateProfitability = () => {
    const profit = ((profitability.finalValue - profitability.initialInvestment) / profitability.initialInvestment) * 100;
    const annualizedReturn = (profit / profitability.timeMonths) * 12;
    setProfitability(prev => ({ ...prev, result: Math.round(annualizedReturn * 100) / 100 }));
  };

  const convertCurrency = () => {
    let rate = currency.exchangeRate;
    if (currency.fromCurrency === 'USD' && currency.toCurrency === 'DOP') {
      rate = 58.5; // USD to DOP
    } else if (currency.fromCurrency === 'DOP' && currency.toCurrency === 'USD') {
      rate = 1 / 58.5; // DOP to USD
    } else if (currency.fromCurrency === 'EUR' && currency.toCurrency === 'DOP') {
      rate = 64.2; // EUR to DOP
    } else if (currency.fromCurrency === 'DOP' && currency.toCurrency === 'EUR') {
      rate = 1 / 64.2; // DOP to EUR
    } else if (currency.fromCurrency === 'USD' && currency.toCurrency === 'EUR') {
      rate = 0.91; // USD to EUR
    } else if (currency.fromCurrency === 'EUR' && currency.toCurrency === 'USD') {
      rate = 1.10; // EUR to USD
    }
    
    const result = currency.amount * rate;
    setCurrency(prev => ({ ...prev, result: Math.round(result * 100) / 100, exchangeRate: rate }));
  };

  useEffect(() => {
    calculateLoanPayment();
  }, [loanAmount, interestRate, termMonths]);

  useEffect(() => {
    if (showSimpleInterest) {
      calculateSimpleInterest();
    }
  }, [simpleInterest.principal, simpleInterest.rate, simpleInterest.time, showSimpleInterest]);

  useEffect(() => {
    if (showProfitability) {
      calculateProfitability();
    }
  }, [profitability.initialInvestment, profitability.finalValue, profitability.timeMonths, showProfitability]);

  useEffect(() => {
    if (showCurrencyConverter) {
      convertCurrency();
    }
  }, [currency.amount, currency.fromCurrency, currency.toCurrency, showCurrencyConverter]);

  // Función para obtener el contenido por defecto de cada plantilla
  const getDefaultTemplateContent = (templateId: string): string => {
    const templates: { [key: string]: string } = {
      'pagare_notarial': `PAGARÉ NOTARIAL

Por medio del presente documento, yo {cliente_nombre}, con cédula de identidad No. {cliente_dni}, me comprometo a pagar incondicionalmente a la orden de {empresa_nombre}, la cantidad de {monto} ({monto_numeros} pesos dominicanos).

Condiciones del préstamo:
• Monto del préstamo: {monto}
• Tasa de interés: {tasa_interes}% mensual
• Plazo: {plazo} meses
• Cuota mensual: {cuota_mensual}
• Fecha de inicio: {fecha_inicio}
• Primera fecha de pago: {primera_fecha_pago}

El pago se realizará en {plazo} cuotas mensuales de {cuota_mensual} cada una, comenzando el {primera_fecha_pago}.

En caso de mora, se aplicará una tasa de mora del {tasa_mora}% {tipo_mora}.

Firma del Deudor: {cliente_nombre}
Cédula: {cliente_dni}
Fecha: {fecha_actual}`,

      'tabla_amortizacion': `TABLA DE AMORTIZACIÓN

Cliente: {cliente_nombre}
Cédula: {cliente_dni}
Monto del Préstamo: {monto}
Tasa de Interés: {tasa_interes}% mensual
Plazo: {plazo} meses
Cuota Mensual: {cuota_mensual}

Tabla de Amortización:
[La tabla se generará automáticamente con las cuotas]`,

      'contrato_bluetooth': `CONTRATO IMPRESORA BLUETOOTH

Por medio del presente contrato, {cliente_nombre}, con cédula {cliente_dni}, acuerda con {empresa_nombre} el uso de una impresora Bluetooth para la gestión de documentos relacionados con el préstamo.

Condiciones:
• El cliente se compromete a mantener la impresora en buen estado
• La impresora será utilizada exclusivamente para documentos del préstamo
• Cualquier daño será responsabilidad del cliente

Firma del Cliente: {cliente_nombre}
Fecha: {fecha_actual}`,

      'pagare_codeudor': `PAGARÉ NOTARIAL CON CODEUDOR

Por medio del presente documento, yo {cliente_nombre}, con cédula de identidad No. {cliente_dni}, como deudor principal, y {codeudor_nombre}, con cédula de identidad No. {codeudor_dni}, como codeudor, nos comprometemos solidariamente a pagar a la orden de {empresa_nombre}, la cantidad de {monto}.

Condiciones del préstamo:
• Monto del préstamo: {monto}
• Tasa de interés: {tasa_interes}% mensual
• Plazo: {plazo} meses

Firma del Deudor Principal: {cliente_nombre}
Cédula: {cliente_dni}

Firma del Codeudor: {codeudor_nombre}
Cédula: {codeudor_dni}
Fecha: {fecha_actual}`,

      'contrato_salarial': `CONTRATO SALARIAL

Por medio del presente contrato, {cliente_nombre}, con cédula {cliente_dni}, acuerda con {empresa_nombre} un préstamo con descuento salarial.

Condiciones:
• Monto del préstamo: {monto}
• Tasa de interés: {tasa_interes}% mensual
• Plazo: {plazo} meses
• Descuento salarial: {descuento_salarial}%

El cliente autoriza el descuento del monto de la cuota directamente de su salario.

Firma del Cliente: {cliente_nombre}
Cédula: {cliente_dni}
Fecha: {fecha_actual}`,

      'carta_intimacion': `CARTA DE INTIMACIÓN

Estimado/a {cliente_nombre},

Por medio de la presente, le informamos que su préstamo con número {numero_prestamo} presenta un saldo pendiente de {saldo_pendiente}.

Le solicitamos que se comunique con nosotros a la brevedad posible para regularizar su situación.

Fecha límite: {fecha_limite}

Atentamente,
{empresa_nombre}
Fecha: {fecha_actual}`,

      'carta_saldo': `CARTA DE SALDO

Estimado/a {cliente_nombre},

Por medio de la presente, le informamos el estado actual de su préstamo:

Número de Préstamo: {numero_prestamo}
Monto Original: {monto_original}
Saldo Pendiente: {saldo_pendiente}
Intereses Pendientes: {intereses_pendientes}
Mora Pendiente: {mora_pendiente}
Total a Pagar: {total_pagar}

Atentamente,
{empresa_nombre}
Fecha: {fecha_actual}`,

      'prueba_documento': `PRUEBA DE DOCUMENTO

Este es un documento de prueba para verificar la generación de documentos.

Cliente: {cliente_nombre}
Monto: {monto}
Fecha: {fecha_actual}`
    };

    return templates[templateId] || '';
  };

  // Funciones para manejar plantillas
  const handleEditTemplate = async (templateId: string) => {
    try {
      setLoadingTemplates(true);
      // Intentar obtener la plantilla desde company_settings (almacenada como JSON)
      const { data: settings, error: settingsError } = await supabase
        .from('company_settings')
        .select('document_templates')
        .eq('user_id', companyId)
        .maybeSingle();

      if (settingsError && settingsError.code !== 'PGRST116') {
        console.error('Error fetching settings:', settingsError);
      }

      const templatesData = settings?.document_templates || {};
      const template = templatesData[templateId];

      // Si existe una plantilla personalizada, usarla; si no, usar la por defecto
      const defaultContent = getDefaultTemplateContent(templateId);
      
      if (template && template.content) {
        setEditingTemplate({
          template_type: templateId,
          content: template.content,
          is_custom: template.is_custom || false,
          file_path: template.file_path || null
        });
        setTemplateContent(template.content);
      } else {
        setEditingTemplate({
          template_type: templateId,
          content: defaultContent,
          is_custom: false
        });
        setTemplateContent(defaultContent);
      }

      setSelectedTemplate(templateId);
      setShowTemplateEditor(true);
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al cargar la plantilla');
    } finally {
      setLoadingTemplates(false);
    }
  };

  const handleViewTemplate = async (templateId: string) => {
    // Generar un PDF de ejemplo para visualizar usando la función real de generación
    try {
      // Obtener datos de ejemplo y configuración de la empresa
      const { data: companySettings } = await supabase
        .from('company_settings')
        .select('*')
        .eq('user_id', companyId)
        .maybeSingle();

      const exampleLoanData = {
        id: 'example-loan-id',
        amount: 10000,
        interest_rate: 5,
        term_months: 6,
        monthly_payment: 2167,
        start_date: new Date().toISOString().split('T')[0],
        next_payment_date: new Date().toISOString().split('T')[0],
        clients: {
          full_name: 'Ejemplo Cliente',
          dni: '000-0000000-0',
          phone: '000-000-0000',
          address: 'Dirección de Ejemplo'
        }
      };

      const exampleFormData = {
        amount: 10000,
        interest_rate: 5,
        term_months: 6
      };

      // Importar dinámicamente la función de generación desde LoanForm
      // Por ahora, usaremos jsPDF directamente
      const { default: jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');
      
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 20;
      let yPos = 30;

      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('VISTA PREVIA DE PLANTILLA', pageWidth / 2, yPos, { align: 'center' });
      yPos += 15;

      doc.setFontSize(12);
      doc.setFont('helvetica', 'normal');
      doc.text(`Tipo: ${templateId.toUpperCase().replace(/_/g, ' ')}`, margin, yPos);
      yPos += 10;
      doc.text('Cliente: Ejemplo Cliente', margin, yPos);
      yPos += 7;
      doc.text('Monto: RD$10,000.00', margin, yPos);
      yPos += 7;
      doc.text('Esta es una vista previa de la plantilla con datos de ejemplo', margin, yPos);
      
      const pdfBlob = doc.output('blob');
      const url = URL.createObjectURL(pdfBlob);
      window.open(url, '_blank');
    } catch (error) {
      console.error('Error generating preview:', error);
      toast.error('Error al generar la vista previa');
    }
  };

  const handlePrintTemplate = async (templateId: string) => {
    try {
      const { default: jsPDF } = await import('jspdf');
      
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });
      
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 20;
      let yPos = 30;

      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('EJEMPLO DE PLANTILLA - FORMATO A4', pageWidth / 2, yPos, { align: 'center' });
      yPos += 15;

      doc.setFontSize(12);
      doc.setFont('helvetica', 'normal');
      doc.text(`Tipo de Documento: ${templateId.toUpperCase().replace(/_/g, ' ')}`, margin, yPos);
      yPos += 10;
      doc.text('Cliente: Ejemplo Cliente', margin, yPos);
      yPos += 7;
      doc.text('Cédula: 000-0000000-0', margin, yPos);
      yPos += 7;
      doc.text('Monto del Préstamo: RD$10,000.00', margin, yPos);
      yPos += 7;
      doc.text('Tasa de Interés: 5% mensual', margin, yPos);
      yPos += 7;
      doc.text('Plazo: 6 meses', margin, yPos);
      yPos += 10;
      doc.text('Este es un ejemplo de impresión en formato A4 para verificar el diseño de la plantilla.', margin, yPos);
      
      doc.autoPrint();
      const pdfBlob = doc.output('blob');
      const url = URL.createObjectURL(pdfBlob);
      const printWindow = window.open(url, '_blank');
      if (printWindow) {
        printWindow.onload = () => {
          setTimeout(() => {
            printWindow.print();
          }, 250);
        };
      }
    } catch (error) {
      console.error('Error printing template:', error);
      toast.error('Error al imprimir la plantilla');
    }
  };

  const handleDownloadTemplate = async (templateId: string) => {
    try {
      const { default: jsPDF } = await import('jspdf');
      
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });
      
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 20;
      let yPos = 30;

      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('PLANTILLA DE DOCUMENTO', pageWidth / 2, yPos, { align: 'center' });
      yPos += 15;

      doc.setFontSize(12);
      doc.setFont('helvetica', 'normal');
      doc.text(`Tipo: ${templateId.toUpperCase().replace(/_/g, ' ')}`, margin, yPos);
      yPos += 10;
      doc.text('Esta es la plantilla del documento en formato PDF', margin, yPos);
      
      doc.save(`${templateId}_plantilla.pdf`);
      toast.success('Plantilla descargada exitosamente');
    } catch (error) {
      console.error('Error downloading template:', error);
      toast.error('Error al descargar la plantilla');
    }
  };

  const handleSaveTemplate = async () => {
    if (!selectedTemplate || !editingTemplate) return;

    try {
      setLoadingTemplates(true);
      
      // Obtener configuración actual
      const { data: currentSettings, error: fetchError } = await supabase
        .from('company_settings')
        .select('id, document_templates')
        .eq('user_id', companyId)
        .maybeSingle();

      const templatesData = currentSettings?.document_templates || {};
      templatesData[selectedTemplate] = {
        content: templateContent,
        is_custom: true,
        updated_at: new Date().toISOString()
      };

      if (currentSettings) {
        // Actualizar configuración existente
        const { error } = await supabase
          .from('company_settings')
          .update({
            document_templates: templatesData,
            updated_at: new Date().toISOString()
          })
          .eq('id', currentSettings.id);

        if (error) throw error;
      } else {
        // Crear nueva configuración
        const { error } = await supabase
          .from('company_settings')
          .insert([{
            user_id: companyId,
            document_templates: templatesData,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }]);

        if (error) throw error;
      }

      toast.success('Plantilla guardada exitosamente');
      setShowTemplateEditor(false);
      setEditingTemplate(null);
      setTemplateContent('');
      setSelectedTemplate(null);
    } catch (error) {
      console.error('Error saving template:', error);
      toast.error('Error al guardar la plantilla');
    } finally {
      setLoadingTemplates(false);
    }
  };

  const handleUploadTemplate = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !selectedTemplate) return;

    if (file.type !== 'application/pdf') {
      toast.error('Solo se permiten archivos PDF');
      return;
    }

    try {
      setLoadingTemplates(true);
      
      // Guardar el archivo en storage
      const fileName = `${selectedTemplate}_${Date.now()}.pdf`;
      const filePath = `templates/${companyId}/${fileName}`;
      
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, file, {
          contentType: 'application/pdf',
          upsert: true
        });

      if (uploadError) throw uploadError;

      // Obtener URL pública
      const { data: urlData } = supabase.storage
        .from('documents')
        .getPublicUrl(filePath);

      // Guardar referencia en company_settings
      const { data: currentSettings } = await supabase
        .from('company_settings')
        .select('id, document_templates')
        .eq('user_id', companyId)
        .maybeSingle();

      const templatesData = currentSettings?.document_templates || {};
      templatesData[selectedTemplate] = {
        content: urlData.publicUrl,
        file_path: filePath,
        is_custom: true,
        updated_at: new Date().toISOString()
      };

      if (currentSettings) {
        const { error } = await supabase
          .from('company_settings')
          .update({
            document_templates: templatesData,
            updated_at: new Date().toISOString()
          })
          .eq('id', currentSettings.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('company_settings')
          .insert([{
            user_id: companyId,
            document_templates: templatesData,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }]);
        if (error) throw error;
      }

      toast.success('Plantilla subida exitosamente');
      setShowTemplateEditor(false);
      setEditingTemplate(null);
      setTemplateContent('');
      setSelectedTemplate(null);
    } catch (error) {
      console.error('Error uploading template:', error);
      toast.error('Error al subir la plantilla');
    } finally {
      setLoadingTemplates(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Utilidades</h1>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-5 gap-1 sm:gap-2">
          <TabsTrigger value="calculadora" className="text-xs sm:text-sm">Calculadora</TabsTrigger>
          <TabsTrigger value="gastos" className="text-xs sm:text-sm">Gastos</TabsTrigger>
          <TabsTrigger value="reportes" className="text-xs sm:text-sm">Reportes</TabsTrigger>
          <TabsTrigger value="plantillas" className="text-xs sm:text-sm">Plantillas</TabsTrigger>
          <TabsTrigger value="configuracion" className="text-xs sm:text-sm">Configuración</TabsTrigger>
        </TabsList>

        <TabsContent value="calculadora" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Calculator className="h-5 w-5 mr-2" />
                  Calculadora de Préstamos
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="loan_amount">Monto del Préstamo</Label>
                  <Input
                    id="loan_amount"
                    type="number"
                    value={loanAmount}
                    onChange={(e) => setLoanAmount(Number(e.target.value))}
                  />
                </div>
                
                <div>
                  <Label htmlFor="interest_rate">Tasa de Interés Anual (%)</Label>
                  <Input
                    id="interest_rate"
                    type="number"
                    step="0.1"
                    value={interestRate}
                    onChange={(e) => setInterestRate(Number(e.target.value))}
                  />
                </div>
                
                <div>
                  <Label htmlFor="term_months">Plazo (meses)</Label>
                  <Input
                    id="term_months"
                    type="number"
                    value={termMonths}
                    onChange={(e) => setTermMonths(Number(e.target.value))}
                  />
                </div>
                
                <Button onClick={calculateLoanPayment} className="w-full">
                  Calcular Cuota
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Resultado del Cálculo</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-center">
                  <div className="text-3xl font-bold text-green-600">
                    ${calculatedPayment.toLocaleString()}
                  </div>
                  <p className="text-gray-600">Cuota mensual</p>
                </div>
                
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Monto del préstamo:</span>
                    <span>${loanAmount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Tasa de interés:</span>
                    <span>{interestRate}% anual</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Plazo:</span>
                    <span>{termMonths} meses</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Total a pagar:</span>
                    <span>${(calculatedPayment * termMonths).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Total de intereses:</span>
                    <span>${((calculatedPayment * termMonths) - loanAmount).toLocaleString()}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Otras Calculadoras</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Button 
                  variant="outline" 
                  className="h-20 flex flex-col"
                  onClick={() => setShowSimpleInterest(true)}
                >
                  <Calculator className="h-6 w-6 mb-2" />
                  Calculadora de Interés Simple
                </Button>
                <Button 
                  variant="outline" 
                  className="h-20 flex flex-col"
                  onClick={() => setShowProfitability(true)}
                >
                  <TrendingUp className="h-6 w-6 mb-2" />
                  Calculadora de Rentabilidad
                </Button>
                <Button 
                  variant="outline" 
                  className="h-20 flex flex-col"
                  onClick={() => setShowCurrencyConverter(true)}
                >
                  <DollarSign className="h-6 w-6 mb-2" />
                  Conversor de Monedas
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="gastos" className="space-y-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Gastos</CardTitle>
                <Receipt className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{expenses.length}</div>
                <p className="text-xs text-muted-foreground">Gastos registrados</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Monto</CardTitle>
                <DollarSign className="h-4 w-4 text-red-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">${totalExpenses.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">Total gastado</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Este Mes</CardTitle>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">${monthlyExpenses.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">Gastos del mes</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Categorías</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{categories.length}</div>
                <p className="text-xs text-muted-foreground">Categorías activas</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Registro de Gastos</CardTitle>
                <Button onClick={() => setShowExpenseForm(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Nuevo Gasto
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8">Cargando gastos...</div>
              ) : expenses.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Receipt className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No hay gastos registrados</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {expenses.map((expense) => (
                    <div key={expense.id} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="font-semibold">{expense.description}</h3>
                            <Badge variant="secondary">{expense.category}</Badge>
                            <Badge variant={expense.status === 'approved' ? 'default' : 'secondary'}>
                              {expense.status === 'approved' ? 'Aprobado' : expense.status}
                            </Badge>
                          </div>
                          <div className="grid grid-cols-2 gap-4 text-sm text-gray-600">
                            <div>
                              <span className="font-medium">Monto:</span> ${expense.amount.toLocaleString()}
                            </div>
                            <div>
                              <span className="font-medium">Fecha:</span> {new Date(expense.expense_date).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" onClick={() => {
                            setExpenseToPrint(expense);
                            setShowPrintFormatDialog(true);
                          }} title="Imprimir comprobante">
                            <Printer className="h-4 w-4" />
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => handleEditExpense(expense)} title="Editar gasto">
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => deleteExpense(expense.id)}>
                            <Trash2 className="h-4 w-4" />
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

        <TabsContent value="reportes" className="space-y-6">
          {/* Filtros */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Filtros de Reporte</CardTitle>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={previewExpenseReport} disabled={filteredExpenses.length === 0}>
                    <Eye className="h-4 w-4 mr-2" />
                    Previsualizar
                  </Button>
                  <Button variant="outline" size="sm" onClick={printExpenseReport} disabled={filteredExpenses.length === 0}>
                    <Printer className="h-4 w-4 mr-2" />
                    Imprimir
                  </Button>
                  <Button variant="outline" size="sm" onClick={downloadExpenseReportPDF} disabled={filteredExpenses.length === 0}>
                    <Download className="h-4 w-4 mr-2" />
                    Descargar PDF
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <Label htmlFor="report_date_from">Fecha Desde</Label>
                  <Input
                    id="report_date_from"
                    type="date"
                    value={reportDateFrom}
                    onChange={(e) => setReportDateFrom(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="report_date_to">Fecha Hasta</Label>
                  <Input
                    id="report_date_to"
                    type="date"
                    value={reportDateTo}
                    onChange={(e) => setReportDateTo(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="report_category">Categoría</Label>
                  <Select value={reportCategoryFilter} onValueChange={setReportCategoryFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Todas las categorías" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas las categorías</SelectItem>
                      {categories.map((cat) => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      setReportDateFrom('');
                      setReportDateTo('');
                      setReportCategoryFilter('all');
                    }}
                    className="w-full"
                  >
                    Limpiar Filtros
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Resumen */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Resumen de Gastos</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <span>Gastos totales:</span>
                    <span className="font-semibold">{filteredExpenses.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Monto total:</span>
                    <span className="font-semibold">${filteredTotalExpenses.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Gastos en período:</span>
                    <span className="font-semibold">${filteredPeriodExpenses.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Promedio por gasto:</span>
                    <span className="font-semibold">
                      ${filteredExpenses.length > 0 ? (filteredTotalExpenses / filteredExpenses.length).toFixed(2) : '0'}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Gastos por Categoría</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {filteredCategories.map((category) => {
                    const categoryExpenses = filteredExpenses.filter(exp => exp.category === category);
                    const categoryTotal = categoryExpenses.reduce((sum, exp) => sum + exp.amount, 0);
                    const percentage = filteredTotalExpenses > 0 ? (categoryTotal / filteredTotalExpenses * 100).toFixed(1) : '0';
                    return (
                      <div key={category} className="space-y-1">
                        <div className="flex justify-between text-sm">
                        <span className="truncate">{category}</span>
                          <span className="font-semibold">${categoryTotal.toLocaleString()} ({percentage}%)</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-blue-600 h-2 rounded-full" 
                            style={{ width: `${percentage}%` }}
                          ></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Tabla detallada */}
          <Card>
            <CardHeader>
              <CardTitle>Detalle de Gastos</CardTitle>
            </CardHeader>
            <CardContent>
              {filteredExpenses.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Receipt className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No hay gastos que coincidan con los filtros seleccionados</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-2">Fecha</th>
                        <th className="text-left p-2">Descripción</th>
                        <th className="text-left p-2">Categoría</th>
                        <th className="text-right p-2">Monto</th>
                        <th className="text-left p-2">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredExpenses.map((expense) => (
                        <tr key={expense.id} className="border-b hover:bg-gray-50">
                          <td className="p-2">{new Date(expense.expense_date).toLocaleDateString('es-DO')}</td>
                          <td className="p-2">{expense.description}</td>
                          <td className="p-2">
                            <Badge variant="secondary">{expense.category}</Badge>
                          </td>
                          <td className="p-2 text-right font-semibold">${expense.amount.toLocaleString()}</td>
                          <td className="p-2">
                            <Badge variant={expense.status === 'approved' ? 'default' : 'secondary'}>
                              {expense.status === 'approved' ? 'Aprobado' : expense.status}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t font-bold">
                        <td colSpan={3} className="p-2 text-right">Total:</td>
                        <td className="p-2 text-right">${filteredTotalExpenses.toLocaleString()}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="plantillas" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <FileEdit className="h-5 w-5 mr-2" />
                Plantillas de Documentos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 mb-4">
                Gestiona las plantillas de documentos que se utilizan al crear préstamos. 
                Puedes editar, subir, visualizar, imprimir y descargar cada plantilla.
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[
                  { id: 'pagare_notarial', label: 'PAGARÉ NOTARIAL', icon: FileText },
                  { id: 'tabla_amortizacion', label: 'TABLA DE AMORTIZACIÓN', icon: FileText },
                  { id: 'contrato_bluetooth', label: 'CONTRATO IMPRESORA BLUETOOTH', icon: FileText },
                  { id: 'pagare_codeudor', label: 'PAGARÉ NOTARIAL CON CODEUDOR', icon: FileText },
                  { id: 'contrato_salarial', label: 'CONTRATO SALARIAL', icon: FileText },
                  { id: 'carta_intimacion', label: 'CARTA DE INTIMACIÓN', icon: FileText },
                  { id: 'carta_saldo', label: 'CARTA DE SALDO', icon: FileText },
                  { id: 'prueba_documento', label: 'PRUEBA DE DOCUMENTO', icon: FileText },
                ].map((template) => {
                  const Icon = template.icon;
                  return (
                    <Card key={template.id} className="hover:shadow-md transition-shadow">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <Icon className="h-5 w-5 text-blue-600" />
                            <h3 className="font-semibold text-sm">{template.label}</h3>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEditTemplate(template.id)}
                            className="flex-1"
                          >
                            <Edit className="h-4 w-4 mr-1" />
                            Editar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleViewTemplate(template.id)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handlePrintTemplate(template.id)}
                          >
                            <Printer className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDownloadTemplate(template.id)}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="configuracion" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Settings className="h-5 w-5 mr-2" />
                Configuración de Utilidades
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Configuración de Calculadora</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label htmlFor="default_interest">Tasa de Interés por Defecto (%)</Label>
                      <Input 
                        id="default_interest"
                        type="number" 
                        step="0.1"
                        value={defaultInterestRate}
                        onChange={(e) => setDefaultInterestRate(Number(e.target.value))}
                        placeholder="Tasa por defecto"
                      />
                    </div>
                    <div>
                      <Label htmlFor="default_term">Plazo por Defecto (meses)</Label>
                      <Input 
                        id="default_term"
                        type="number" 
                        value={defaultTermMonths}
                        onChange={(e) => setDefaultTermMonths(Number(e.target.value))}
                        placeholder="Plazo por defecto"
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Categorías de Gastos</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-2">
                      {expenseCategories.map((category, index) => (
                        <div key={index} className="flex items-center justify-between gap-2">
                          {editingCategoryIndex === index ? (
                            <div className="flex items-center gap-2 flex-1">
                              <Input
                                value={editingCategoryName}
                                onChange={(e) => setEditingCategoryName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSaveCategoryEdit();
                                  if (e.key === 'Escape') handleCancelCategoryEdit();
                                }}
                                className="h-8 text-sm"
                                autoFocus
                              />
                              <Button size="sm" variant="outline" onClick={handleSaveCategoryEdit}>
                                ✓
                              </Button>
                              <Button size="sm" variant="outline" onClick={handleCancelCategoryEdit}>
                                ✕
                              </Button>
                            </div>
                          ) : (
                            <>
                              <span className="text-sm flex-1">{category}</span>
                              <div className="flex gap-1">
                                <Button size="sm" variant="outline" onClick={() => handleEditCategory(index)}>
                            <Edit className="h-3 w-3" />
                          </Button>
                                <Button size="sm" variant="outline" onClick={() => handleDeleteCategory(index)}>
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                    {showAddCategory ? (
                      <div className="flex items-center gap-2">
                        <Input
                          value={newCategoryName}
                          onChange={(e) => setNewCategoryName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleAddCategory();
                            if (e.key === 'Escape') {
                              setShowAddCategory(false);
                              setNewCategoryName('');
                            }
                          }}
                          placeholder="Nombre de la categoría"
                          className="h-8 text-sm"
                          autoFocus
                        />
                        <Button size="sm" variant="outline" onClick={handleAddCategory}>
                          ✓
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => {
                          setShowAddCategory(false);
                          setNewCategoryName('');
                        }}>
                          ✕
                        </Button>
                      </div>
                    ) : (
                      <Button variant="outline" size="sm" className="w-full" onClick={() => setShowAddCategory(true)}>
                      <Plus className="h-3 w-3 mr-2" />
                      Agregar Categoría
                    </Button>
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="flex justify-end">
                <Button onClick={saveCalculatorConfig} disabled={loadingConfig}>
                  {loadingConfig ? 'Guardando...' : 'Guardar Configuración'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Expense Form Dialog */}
      <Dialog open={showExpenseForm} onOpenChange={setShowExpenseForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar Nuevo Gasto</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleExpenseSubmit} className="space-y-4">
            <div>
              <Label htmlFor="description">Descripción *</Label>
              <Input
                id="description"
                value={expenseForm.description}
                onChange={(e) => setExpenseForm({...expenseForm, description: e.target.value})}
                required
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="amount">Monto *</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  value={expenseForm.amount}
                  onChange={(e) => setExpenseForm({...expenseForm, amount: Number(e.target.value)})}
                  required
                />
              </div>
              <div>
                <Label htmlFor="expense_date">Fecha *</Label>
                <Input
                  id="expense_date"
                  type="date"
                  value={expenseForm.expense_date}
                  onChange={(e) => setExpenseForm({...expenseForm, expense_date: e.target.value})}
                  required
                />
              </div>
            </div>

            <div>
              <Label htmlFor="category">Categoría *</Label>
              <Select value={expenseForm.category} onValueChange={(value) => setExpenseForm({...expenseForm, category: value})}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar categoría" />
                </SelectTrigger>
                <SelectContent>
                  {expenseCategories.map((cat) => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => {
                setShowExpenseForm(false);
                resetExpenseForm();
              }}>
                Cancelar
              </Button>
              <Button type="submit">Guardar Gasto</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Expense Form Dialog */}
      <Dialog open={showEditExpenseForm} onOpenChange={setShowEditExpenseForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Gasto</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpdateExpense} className="space-y-4">
            <div>
              <Label htmlFor="edit_description">Descripción *</Label>
              <Input
                id="edit_description"
                value={expenseForm.description}
                onChange={(e) => setExpenseForm({...expenseForm, description: e.target.value})}
                required
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit_amount">Monto *</Label>
                <Input
                  id="edit_amount"
                  type="number"
                  step="0.01"
                  value={expenseForm.amount}
                  onChange={(e) => setExpenseForm({...expenseForm, amount: Number(e.target.value)})}
                  required
                />
              </div>
              <div>
                <Label htmlFor="edit_expense_date">Fecha *</Label>
                <Input
                  id="edit_expense_date"
                  type="date"
                  value={expenseForm.expense_date}
                  onChange={(e) => setExpenseForm({...expenseForm, expense_date: e.target.value})}
                  required
                />
              </div>
            </div>

            <div>
              <Label htmlFor="edit_category">Categoría *</Label>
              <Select value={expenseForm.category} onValueChange={(value) => setExpenseForm({...expenseForm, category: value})}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar categoría" />
                </SelectTrigger>
                <SelectContent>
                  {expenseCategories.map((cat) => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => {
                setShowEditExpenseForm(false);
                setEditingExpense(null);
                resetExpenseForm();
              }}>
                Cancelar
              </Button>
              <Button type="submit">Actualizar Gasto</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Print Format Selection Dialog */}
      <Dialog open={showPrintFormatDialog} onOpenChange={setShowPrintFormatDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Seleccionar Formato de Impresión</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">Selecciona el formato para imprimir el comprobante:</p>
            <div className="grid grid-cols-3 gap-4">
              <Button
                variant="outline"
                className="h-20 flex flex-col"
                onClick={() => {
                  if (expenseToPrint) {
                    printSingleExpense(expenseToPrint, 'POS80');
                    setShowPrintFormatDialog(false);
                    setExpenseToPrint(null);
                  }
                }}
              >
                <Printer className="h-6 w-6 mb-2" />
                POS80
              </Button>
              <Button
                variant="outline"
                className="h-20 flex flex-col"
                onClick={() => {
                  if (expenseToPrint) {
                    printSingleExpense(expenseToPrint, 'POS58');
                    setShowPrintFormatDialog(false);
                    setExpenseToPrint(null);
                  }
                }}
              >
                <Printer className="h-6 w-6 mb-2" />
                POS58
              </Button>
              <Button
                variant="outline"
                className="h-20 flex flex-col"
                onClick={() => {
                  if (expenseToPrint) {
                    printSingleExpense(expenseToPrint, 'A4');
                    setShowPrintFormatDialog(false);
                    setExpenseToPrint(null);
                  }
                }}
              >
                <Printer className="h-6 w-6 mb-2" />
                A4
              </Button>
            </div>
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => {
                setShowPrintFormatDialog(false);
                setExpenseToPrint(null);
              }}>
                Cancelar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Simple Interest Calculator Modal */}
      <Dialog open={showSimpleInterest} onOpenChange={setShowSimpleInterest}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <Calculator className="h-5 w-5 mr-2" />
              Calculadora de Interés Simple
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="si_principal">Capital Principal ($)</Label>
              <Input
                id="si_principal"
                type="number"
                value={simpleInterest.principal}
                onChange={(e) => setSimpleInterest({...simpleInterest, principal: Number(e.target.value)})}
              />
            </div>
            
            <div>
              <Label htmlFor="si_rate">Tasa de Interés Anual (%)</Label>
              <Input
                id="si_rate"
                type="number"
                step="0.1"
                value={simpleInterest.rate}
                onChange={(e) => setSimpleInterest({...simpleInterest, rate: Number(e.target.value)})}
              />
            </div>
            
            <div>
              <Label htmlFor="si_time">Tiempo (meses)</Label>
              <Input
                id="si_time"
                type="number"
                value={simpleInterest.time}
                onChange={(e) => setSimpleInterest({...simpleInterest, time: Number(e.target.value)})}
              />
            </div>
            
            <div className="bg-gray-50 p-4 rounded-lg">
              <h4 className="font-semibold mb-2">Resultados:</h4>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span>Capital inicial:</span>
                  <span className="font-medium">${simpleInterest.principal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Interés ganado:</span>
                  <span className="font-medium text-green-600">${simpleInterest.result.toLocaleString()}</span>
                </div>
                <div className="flex justify-between border-t pt-2">
                  <span>Monto total:</span>
                  <span className="font-bold text-lg">${(simpleInterest.principal + simpleInterest.result).toLocaleString()}</span>
                </div>
              </div>
            </div>
            
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowSimpleInterest(false)}>
                Cerrar
              </Button>
              <Button onClick={calculateSimpleInterest}>
                Recalcular
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Profitability Calculator Modal */}
      <Dialog open={showProfitability} onOpenChange={setShowProfitability}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <TrendingUp className="h-5 w-5 mr-2" />
              Calculadora de Rentabilidad
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="prof_initial">Inversión Inicial ($)</Label>
              <Input
                id="prof_initial"
                type="number"
                value={profitability.initialInvestment}
                onChange={(e) => setProfitability({...profitability, initialInvestment: Number(e.target.value)})}
              />
            </div>
            
            <div>
              <Label htmlFor="prof_final">Valor Final ($)</Label>
              <Input
                id="prof_final"
                type="number"
                value={profitability.finalValue}
                onChange={(e) => setProfitability({...profitability, finalValue: Number(e.target.value)})}
              />
            </div>
            
            <div>
              <Label htmlFor="prof_time">Tiempo (meses)</Label>
              <Input
                id="prof_time"
                type="number"
                value={profitability.timeMonths}
                onChange={(e) => setProfitability({...profitability, timeMonths: Number(e.target.value)})}
              />
            </div>
            
            <div className="bg-gray-50 p-4 rounded-lg">
              <h4 className="font-semibold mb-2">Resultados:</h4>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span>Inversión inicial:</span>
                  <span className="font-medium">${profitability.initialInvestment.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Valor final:</span>
                  <span className="font-medium">${profitability.finalValue.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Ganancia total:</span>
                  <span className="font-medium text-green-600">${(profitability.finalValue - profitability.initialInvestment).toLocaleString()}</span>
                </div>
                <div className="flex justify-between border-t pt-2">
                  <span>Rentabilidad anualizada:</span>
                  <span className="font-bold text-lg">{profitability.result.toFixed(2)}%</span>
                </div>
              </div>
            </div>
            
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowProfitability(false)}>
                Cerrar
              </Button>
              <Button onClick={calculateProfitability}>
                Recalcular
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Currency Converter Modal */}
      <Dialog open={showCurrencyConverter} onOpenChange={setShowCurrencyConverter}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <DollarSign className="h-5 w-5 mr-2" />
              Conversor de Monedas
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="curr_amount">Cantidad</Label>
              <Input
                id="curr_amount"
                type="number"
                step="0.01"
                value={currency.amount}
                onChange={(e) => setCurrency({...currency, amount: Number(e.target.value)})}
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="from_currency">De</Label>
                <Select value={currency.fromCurrency} onValueChange={(value) => setCurrency({...currency, fromCurrency: value})}>
                  <SelectTrigger>
                    <SelectValue placeholder="Moneda origen" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DOP">DOP - Peso Dominicano</SelectItem>
                    <SelectItem value="USD">USD - Dólar Americano</SelectItem>
                    <SelectItem value="EUR">EUR - Euro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label htmlFor="to_currency">A</Label>
                <Select value={currency.toCurrency} onValueChange={(value) => setCurrency({...currency, toCurrency: value})}>
                  <SelectTrigger>
                    <SelectValue placeholder="Moneda destino" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DOP">DOP - Peso Dominicano</SelectItem>
                    <SelectItem value="USD">USD - Dólar Americano</SelectItem>
                    <SelectItem value="EUR">EUR - Euro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="bg-gray-50 p-4 rounded-lg">
              <h4 className="font-semibold mb-2">Conversión:</h4>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span>Cantidad original:</span>
                  <span className="font-medium">{currency.amount.toLocaleString()} {currency.fromCurrency}</span>
                </div>
                <div className="flex justify-between">
                  <span>Tasa de cambio:</span>
                  <span className="font-medium">{currency.exchangeRate.toFixed(4)}</span>
                </div>
                <div className="flex justify-between border-t pt-2">
                  <span>Resultado:</span>
                  <span className="font-bold text-lg">{currency.result.toLocaleString()} {currency.toCurrency}</span>
                </div>
              </div>
            </div>
            
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowCurrencyConverter(false)}>
                Cerrar
              </Button>
              <Button onClick={convertCurrency}>
                Convertir
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Template Editor Dialog */}
      <Dialog open={showTemplateEditor} onOpenChange={setShowTemplateEditor}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileEdit className="h-5 w-5" />
              Editar Plantilla: {selectedTemplate?.toUpperCase().replace(/_/g, ' ')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = 'application/pdf';
                  input.onchange = handleUploadTemplate;
                  input.click();
                }}
              >
                <Upload className="h-4 w-4 mr-2" />
                Subir PDF
              </Button>
              <Button
                variant="outline"
                onClick={() => handleViewTemplate(selectedTemplate || '')}
              >
                <Eye className="h-4 w-4 mr-2" />
                Visualizar
              </Button>
              <Button
                variant="outline"
                onClick={() => handlePrintTemplate(selectedTemplate || '')}
              >
                <Printer className="h-4 w-4 mr-2" />
                Imprimir Ejemplo (A4)
              </Button>
              <Button
                variant="outline"
                onClick={() => handleDownloadTemplate(selectedTemplate || '')}
              >
                <Download className="h-4 w-4 mr-2" />
                Descargar PDF
              </Button>
            </div>

            <div>
              <Label htmlFor="template-content">Contenido de la Plantilla</Label>
              <Textarea
                id="template-content"
                value={templateContent}
                onChange={(e) => setTemplateContent(e.target.value)}
                placeholder="Edita el contenido de la plantilla aquí..."
                className="min-h-[400px] font-mono text-sm"
              />
              <p className="text-xs text-gray-500 mt-2">
                Puedes usar variables como {'{'}cliente_nombre{'}'}, {'{'}monto{'}'}, {'{'}fecha{'}'}, etc.
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowTemplateEditor(false);
                  setEditingTemplate(null);
                  setTemplateContent('');
                  setSelectedTemplate(null);
                }}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleSaveTemplate}
                disabled={loadingTemplates}
              >
                <Save className="h-4 w-4 mr-2" />
                {loadingTemplates ? 'Guardando...' : 'Guardar Plantilla'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default UtilitiesModule;
