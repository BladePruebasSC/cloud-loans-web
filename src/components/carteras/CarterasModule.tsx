import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { 
  Wallet, 
  TrendingUp, 
  TrendingDown, 
  DollarSign,
  Plus,
  BarChart3,
  Users,
  AlertCircle,
  Edit,
  Trash2,
  X,
  Search,
  Filter,
  PieChart,
  LineChart,
  Settings,
  FileText,
  Eye,
  CheckCircle2
} from 'lucide-react';

interface Portfolio {
  id: string;
  name: string;
  description: string | null;
  company_id: string;
  status: 'active' | 'inactive' | 'archived';
  color: string;
  target_yield: number | null;
  max_loan_amount: number | null;
  min_loan_amount: number | null;
  created_at: string;
  updated_at: string;
}

interface PortfolioStats {
  totalPortfolios: number;
  totalValue: number;
  averageYield: number;
  totalClients: number;
  monthlyGrowth: number;
}

interface PortfolioWithStats extends Portfolio {
  loanCount: number;
  totalAmount: number;
  totalPaid: number;
  remainingBalance: number;
  averageYield: number;
  clientCount: number;
}

export const CarterasModule = () => {
  const [activeTab, setActiveTab] = useState('resumen');
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [portfoliosWithStats, setPortfoliosWithStats] = useState<PortfolioWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<PortfolioStats>({
    totalPortfolios: 0,
    totalValue: 0,
    averageYield: 0,
    totalClients: 0,
    monthlyGrowth: 0
  });
  const [showPortfolioForm, setShowPortfolioForm] = useState(false);
  const [editingPortfolio, setEditingPortfolio] = useState<Portfolio | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive' | 'archived'>('all');
  const [selectedPortfolio, setSelectedPortfolio] = useState<PortfolioWithStats | null>(null);
  const [showPortfolioDetails, setShowPortfolioDetails] = useState(false);
  const [portfolioLoans, setPortfolioLoans] = useState<any[]>([]);
  const [showAssignLoansDialog, setShowAssignLoansDialog] = useState(false);
  const [selectedPortfolioForAssignment, setSelectedPortfolioForAssignment] = useState<Portfolio | null>(null);
  const [availableLoans, setAvailableLoans] = useState<any[]>([]);
  const [selectedLoans, setSelectedLoans] = useState<Set<string>>(new Set());
  const [loadingLoans, setLoadingLoans] = useState(false);
  const { user, companyId } = useAuth();

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    status: 'active' as 'active' | 'inactive' | 'archived',
    color: '#3B82F6',
    target_yield: '',
    max_loan_amount: '',
    min_loan_amount: ''
  });

  useEffect(() => {
    if (user && companyId) {
      fetchPortfolios();
    }
  }, [user, companyId]);

  const fetchPortfolios = async () => {
    if (!user || !companyId) return;

    try {
      setLoading(true);
      
      // Obtener carteras
      const { data: portfoliosData, error: portfoliosError } = await supabase
        .from('portfolios')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });

      if (portfoliosError) throw portfoliosError;

      setPortfolios(portfoliosData || []);

      // Obtener estadísticas para cada cartera
      const portfoliosWithStatsData = await Promise.all(
        (portfoliosData || []).map(async (portfolio) => {
          const stats = await calculatePortfolioStats(portfolio.id);
          return { ...portfolio, ...stats };
        })
      );

      setPortfoliosWithStats(portfoliosWithStatsData);

      // Calcular estadísticas generales
      await calculateGeneralStats(portfoliosWithStatsData);
    } catch (error) {
      console.error('Error fetching portfolios:', error);
      toast.error('Error al cargar carteras');
    } finally {
      setLoading(false);
    }
  };

  const calculatePortfolioStats = async (portfolioId: string): Promise<{
    loanCount: number;
    totalAmount: number;
    totalPaid: number;
    remainingBalance: number;
    averageYield: number;
    clientCount: number;
  }> => {
    try {
      // Obtener préstamos de esta cartera
      const { data: loans, error } = await supabase
        .from('loans')
        .select(`
          id,
          amount,
          remaining_balance,
          interest_rate,
          status,
          client_id
        `)
        .eq('portfolio_id', portfolioId)
        .in('status', ['active', 'overdue', 'pending']);

      if (error) throw error;

      const loanCount = loans?.length || 0;
      const totalAmount = loans?.reduce((sum, loan) => sum + Number(loan.amount || 0), 0) || 0;
      const remainingBalance = loans?.reduce((sum, loan) => sum + Number(loan.remaining_balance || 0), 0) || 0;
      const totalPaid = totalAmount - remainingBalance;
      
      // Calcular rendimiento promedio
      const averageYield = loans && loans.length > 0
        ? loans.reduce((sum, loan) => sum + Number(loan.interest_rate || 0), 0) / loans.length
        : 0;

      // Contar clientes únicos
      const uniqueClients = new Set(loans?.map(loan => loan.client_id).filter(Boolean) || []);
      const clientCount = uniqueClients.size;

      return {
        loanCount,
        totalAmount,
        totalPaid,
        remainingBalance,
        averageYield,
        clientCount
      };
    } catch (error) {
      console.error('Error calculating portfolio stats:', error);
      return {
        loanCount: 0,
        totalAmount: 0,
        totalPaid: 0,
        remainingBalance: 0,
        averageYield: 0,
        clientCount: 0
      };
    }
  };

  const calculateGeneralStats = async (portfoliosData: PortfolioWithStats[]) => {
    const activePortfolios = portfoliosData.filter(p => p.status === 'active');
    const totalPortfolios = activePortfolios.length;
    const totalValue = activePortfolios.reduce((sum, p) => sum + p.totalAmount, 0);

    // Obtener todos los clientes únicos de las carteras activas
    try {
      const portfolioIds = activePortfolios.map(p => p.id);
      if (portfolioIds.length > 0) {
        const { data: loans, error } = await supabase
          .from('loans')
          .select('client_id')
          .in('portfolio_id', portfolioIds)
          .in('status', ['active', 'overdue', 'pending'])
          .not('client_id', 'is', null);

        if (!error && loans) {
          const uniqueClients = new Set(loans.map(loan => loan.client_id).filter(Boolean));
          const totalClients = uniqueClients.size;

          // Calcular rendimiento promedio ponderado
          const totalWeightedYield = activePortfolios.reduce((sum, p) => {
            if (p.totalAmount > 0) {
              return sum + (p.averageYield * p.totalAmount);
            }
            return sum;
          }, 0);
          const averageYield = totalValue > 0 ? totalWeightedYield / totalValue : 0;

          // Calcular crecimiento mensual (simplificado - comparar con mes anterior)
          const monthlyGrowth = 12; // Placeholder - se puede calcular comparando con datos históricos

          setStats({
            totalPortfolios,
            totalValue,
            averageYield,
            totalClients,
            monthlyGrowth
          });
        } else {
          // Fallback: sumar clientes de cada cartera
          const totalClients = activePortfolios.reduce((sum, p) => sum + p.clientCount, 0);
          const totalWeightedYield = activePortfolios.reduce((sum, p) => {
            if (p.totalAmount > 0) {
              return sum + (p.averageYield * p.totalAmount);
            }
            return sum;
          }, 0);
          const averageYield = totalValue > 0 ? totalWeightedYield / totalValue : 0;

          setStats({
            totalPortfolios,
            totalValue,
            averageYield,
            totalClients,
            monthlyGrowth: 12
          });
        }
      } else {
        setStats({
          totalPortfolios: 0,
          totalValue: 0,
          averageYield: 0,
          totalClients: 0,
          monthlyGrowth: 0
        });
      }
    } catch (error) {
      console.error('Error calculating general stats:', error);
      // Fallback: usar datos de las carteras
      const totalClients = activePortfolios.reduce((sum, p) => sum + p.clientCount, 0);
      const totalWeightedYield = activePortfolios.reduce((sum, p) => {
        if (p.totalAmount > 0) {
          return sum + (p.averageYield * p.totalAmount);
        }
        return sum;
      }, 0);
      const averageYield = totalValue > 0 ? totalWeightedYield / totalValue : 0;

      setStats({
        totalPortfolios,
        totalValue,
        averageYield,
        totalClients,
        monthlyGrowth: 12
      });
    }
  };

  const handleCreatePortfolio = () => {
    setEditingPortfolio(null);
    setFormData({
      name: '',
      description: '',
      status: 'active',
      color: '#3B82F6',
      target_yield: '',
      max_loan_amount: '',
      min_loan_amount: ''
    });
    setShowPortfolioForm(true);
  };

  const handleEditPortfolio = (portfolio: Portfolio) => {
    setEditingPortfolio(portfolio);
    setFormData({
      name: portfolio.name,
      description: portfolio.description || '',
      status: portfolio.status,
      color: portfolio.color,
      target_yield: portfolio.target_yield?.toString() || '',
      max_loan_amount: portfolio.max_loan_amount?.toString() || '',
      min_loan_amount: portfolio.min_loan_amount?.toString() || ''
    });
    setShowPortfolioForm(true);
  };

  const handleSavePortfolio = async () => {
    if (!formData.name.trim()) {
      toast.error('El nombre de la cartera es requerido');
      return;
    }

    if (!user || !companyId) {
      toast.error('Error de autenticación');
      return;
    }

    try {
      const portfolioData: any = {
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        status: formData.status,
        color: formData.color,
        company_id: companyId,
        target_yield: formData.target_yield ? parseFloat(formData.target_yield) : null,
        max_loan_amount: formData.max_loan_amount ? parseFloat(formData.max_loan_amount) : null,
        min_loan_amount: formData.min_loan_amount ? parseFloat(formData.min_loan_amount) : null
      };

      if (editingPortfolio) {
        const { error } = await supabase
          .from('portfolios')
          .update(portfolioData)
          .eq('id', editingPortfolio.id);

        if (error) throw error;
        toast.success('Cartera actualizada exitosamente');
      } else {
        const { error } = await supabase
          .from('portfolios')
          .insert([portfolioData]);

        if (error) throw error;
        toast.success('Cartera creada exitosamente');
      }

      setShowPortfolioForm(false);
      fetchPortfolios();
    } catch (error: any) {
      console.error('Error saving portfolio:', error);
      toast.error(error?.message || 'Error al guardar la cartera');
    }
  };

  const handleDeletePortfolio = async (portfolio: Portfolio) => {
    if (!confirm(`¿Estás seguro de eliminar la cartera "${portfolio.name}"?`)) {
      return;
    }

    try {
      // Primero, desasignar préstamos de esta cartera
      const { error: updateError } = await supabase
        .from('loans')
        .update({ portfolio_id: null })
        .eq('portfolio_id', portfolio.id);

      if (updateError) throw updateError;

      // Luego eliminar la cartera
      const { error: deleteError } = await supabase
        .from('portfolios')
        .delete()
        .eq('id', portfolio.id);

      if (deleteError) throw deleteError;

      toast.success('Cartera eliminada exitosamente');
      fetchPortfolios();
    } catch (error: any) {
      console.error('Error deleting portfolio:', error);
      toast.error(error?.message || 'Error al eliminar la cartera');
    }
  };

  const handleViewPortfolioDetails = async (portfolio: PortfolioWithStats) => {
    setSelectedPortfolio(portfolio);
    
    try {
      const { data: loans, error } = await supabase
        .from('loans')
        .select(`
          id,
          amount,
          remaining_balance,
          interest_rate,
          status,
          next_payment_date,
          client:client_id (
            id,
            full_name,
            dni,
            phone
          )
        `)
        .eq('portfolio_id', portfolio.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setPortfolioLoans(loans || []);
      setShowPortfolioDetails(true);
    } catch (error) {
      console.error('Error fetching portfolio loans:', error);
      toast.error('Error al cargar préstamos de la cartera');
    }
  };

  // Funciones para generar reportes
  const generatePerformanceReport = async () => {
    try {
      const { default: jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');
      
      const money = (n: number) => new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(n || 0);
      
      // Obtener información de la empresa
      const { data: companySettings } = await supabase
        .from('company_settings')
        .select('company_name, address, phone')
        .eq('user_id', companyId)
        .maybeSingle();
      
      const companyName = companySettings?.company_name || 'Mi Empresa';
      const today = new Date().toLocaleDateString('es-DO', { year: 'numeric', month: 'long', day: 'numeric' });

      const doc = new jsPDF('p', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 15;
      let yPos = margin;

      // Encabezado
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('REPORTE DE RENDIMIENTO POR CARTERA', margin, yPos);
      yPos += 10;

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Empresa: ${companyName}`, margin, yPos);
      yPos += 5;
      doc.text(`Fecha: ${today}`, margin, yPos);
      yPos += 10;

      // Tabla de carteras
      const tableData = filteredPortfolios
        .filter(p => p.status === 'active')
        .map(portfolio => [
          portfolio.name,
          portfolio.loanCount.toString(),
          money(portfolio.totalAmount),
          money(portfolio.remainingBalance),
          `${portfolio.averageYield.toFixed(2)}%`,
          portfolio.target_yield ? `${portfolio.target_yield}%` : 'N/A'
        ]);

      autoTable(doc, {
        startY: yPos,
        head: [['Cartera', 'Préstamos', 'Valor Total', 'Balance Pendiente', 'Rendimiento', 'Objetivo']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold' },
        styles: { fontSize: 9 },
        margin: { left: margin, right: margin }
      });

      // Resumen
      yPos = (doc as any).lastAutoTable.finalY + 15;
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('RESUMEN GENERAL', margin, yPos);
      yPos += 8;

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Total Carteras Activas: ${displayStats.totalPortfolios}`, margin, yPos);
      yPos += 5;
      doc.text(`Valor Total: ${money(displayStats.totalValue)}`, margin, yPos);
      yPos += 5;
      doc.text(`Rendimiento Promedio: ${displayStats.averageYield.toFixed(2)}%`, margin, yPos);
      yPos += 5;
      doc.text(`Total Clientes: ${displayStats.totalClients}`, margin, yPos);

      doc.save(`Reporte_Rendimiento_Carteras_${new Date().toISOString().split('T')[0]}.pdf`);
      toast.success('Reporte generado exitosamente');
    } catch (error) {
      console.error('Error generating performance report:', error);
      toast.error('Error al generar el reporte');
    }
  };

  const generateComparativeAnalysis = async () => {
    try {
      const { default: jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');
      
      const money = (n: number) => new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(n || 0);
      
      const { data: companySettings } = await supabase
        .from('company_settings')
        .select('company_name')
        .eq('user_id', companyId)
        .maybeSingle();
      
      const companyName = companySettings?.company_name || 'Mi Empresa';
      const today = new Date().toLocaleDateString('es-DO', { year: 'numeric', month: 'long', day: 'numeric' });

      const doc = new jsPDF('p', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 15;
      let yPos = margin;

      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('ANÁLISIS COMPARATIVO DE CARTERAS', margin, yPos);
      yPos += 10;

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Empresa: ${companyName}`, margin, yPos);
      yPos += 5;
      doc.text(`Fecha: ${today}`, margin, yPos);
      yPos += 10;

      const sortedPortfolios = [...filteredPortfolios]
        .filter(p => p.status === 'active')
        .sort((a, b) => b.averageYield - a.averageYield);

      const tableData = sortedPortfolios.map(portfolio => [
        portfolio.name,
        portfolio.loanCount.toString(),
        money(portfolio.totalAmount),
        `${portfolio.averageYield.toFixed(2)}%`,
        portfolio.target_yield ? `${portfolio.target_yield}%` : 'N/A',
        portfolio.target_yield 
          ? (portfolio.averageYield >= portfolio.target_yield ? '✅ Cumple' : '⚠️ Bajo')
          : 'N/A'
      ]);

      autoTable(doc, {
        startY: yPos,
        head: [['Cartera', 'Préstamos', 'Valor Total', 'Rendimiento', 'Objetivo', 'Estado']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold' },
        styles: { fontSize: 9 },
        margin: { left: margin, right: margin }
      });

      doc.save(`Analisis_Comparativo_Carteras_${new Date().toISOString().split('T')[0]}.pdf`);
      toast.success('Análisis comparativo generado exitosamente');
    } catch (error) {
      console.error('Error generating comparative analysis:', error);
      toast.error('Error al generar el análisis');
    }
  };

  const generateLoanDistribution = async () => {
    try {
      const { default: jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');
      
      const money = (n: number) => new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(n || 0);
      
      const { data: companySettings } = await supabase
        .from('company_settings')
        .select('company_name')
        .eq('user_id', companyId)
        .maybeSingle();
      
      const companyName = companySettings?.company_name || 'Mi Empresa';
      const today = new Date().toLocaleDateString('es-DO', { year: 'numeric', month: 'long', day: 'numeric' });

      const doc = new jsPDF('p', 'mm', 'a4');
      const margin = 15;
      let yPos = margin;

      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('DISTRIBUCIÓN DE PRÉSTAMOS POR CARTERA', margin, yPos);
      yPos += 10;

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Empresa: ${companyName}`, margin, yPos);
      yPos += 5;
      doc.text(`Fecha: ${today}`, margin, yPos);
      yPos += 10;

      const activePortfolios = filteredPortfolios.filter(p => p.status === 'active');
      const totalValue = displayStats.totalValue;

      const tableData = activePortfolios.map(portfolio => {
        const percentage = totalValue > 0 ? (portfolio.totalAmount / totalValue) * 100 : 0;
        return [
          portfolio.name,
          portfolio.loanCount.toString(),
          money(portfolio.totalAmount),
          `${percentage.toFixed(1)}%`,
          portfolio.clientCount.toString()
        ];
      });

      autoTable(doc, {
        startY: yPos,
        head: [['Cartera', 'Préstamos', 'Valor Total', 'Porcentaje', 'Clientes']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold' },
        styles: { fontSize: 9 },
        margin: { left: margin, right: margin }
      });

      yPos = (doc as any).lastAutoTable.finalY + 15;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(`Total: ${money(totalValue)}`, margin, yPos);

      doc.save(`Distribucion_Prestamos_Carteras_${new Date().toISOString().split('T')[0]}.pdf`);
      toast.success('Reporte de distribución generado exitosamente');
    } catch (error) {
      console.error('Error generating loan distribution:', error);
      toast.error('Error al generar el reporte');
    }
  };

  const generatePerformanceTrends = async () => {
    try {
      const { default: jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');
      
      const money = (n: number) => new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(n || 0);
      
      const { data: companySettings } = await supabase
        .from('company_settings')
        .select('company_name')
        .eq('user_id', companyId)
        .maybeSingle();
      
      const companyName = companySettings?.company_name || 'Mi Empresa';
      const today = new Date().toLocaleDateString('es-DO', { year: 'numeric', month: 'long', day: 'numeric' });

      const doc = new jsPDF('p', 'mm', 'a4');
      const margin = 15;
      let yPos = margin;

      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('TENDENCIAS DE RENDIMIENTO', margin, yPos);
      yPos += 10;

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Empresa: ${companyName}`, margin, yPos);
      yPos += 5;
      doc.text(`Fecha: ${today}`, margin, yPos);
      yPos += 10;

      const sortedPortfolios = [...filteredPortfolios]
        .filter(p => p.status === 'active')
        .sort((a, b) => b.averageYield - a.averageYield);

      const tableData = sortedPortfolios.map((portfolio, index) => [
        (index + 1).toString(),
        portfolio.name,
        `${portfolio.averageYield.toFixed(2)}%`,
        portfolio.target_yield ? `${portfolio.target_yield}%` : 'N/A',
        portfolio.target_yield 
          ? `${(portfolio.averageYield - portfolio.target_yield).toFixed(2)}%`
          : 'N/A',
        money(portfolio.totalAmount)
      ]);

      autoTable(doc, {
        startY: yPos,
        head: [['#', 'Cartera', 'Rendimiento Actual', 'Objetivo', 'Diferencia', 'Valor Total']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold' },
        styles: { fontSize: 9 },
        margin: { left: margin, right: margin }
      });

      yPos = (doc as any).lastAutoTable.finalY + 15;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(`Rendimiento Promedio General: ${displayStats.averageYield.toFixed(2)}%`, margin, yPos);

      doc.save(`Tendencias_Rendimiento_Carteras_${new Date().toISOString().split('T')[0]}.pdf`);
      toast.success('Reporte de tendencias generado exitosamente');
    } catch (error) {
      console.error('Error generating performance trends:', error);
      toast.error('Error al generar el reporte');
    }
  };

  const filteredPortfolios = portfoliosWithStats.filter(portfolio => {
    const matchesSearch = portfolio.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (portfolio.description || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || portfolio.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const filteredStats = filteredPortfolios.filter(p => p.status === 'active');
  const displayStats = {
    totalPortfolios: filteredStats.length,
    totalValue: filteredStats.reduce((sum, p) => sum + p.totalAmount, 0),
    averageYield: filteredStats.length > 0
      ? filteredStats.reduce((sum, p) => sum + (p.averageYield * p.totalAmount), 0) / filteredStats.reduce((sum, p) => sum + p.totalAmount, 0)
      : 0,
    totalClients: filteredStats.reduce((sum, p) => sum + p.clientCount, 0),
    monthlyGrowth: stats.monthlyGrowth
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Gestión de Carteras</h1>
        <Button 
          className="w-full sm:w-auto"
          onClick={handleCreatePortfolio}
        >
          <Plus className="h-4 w-4 mr-2" />
          Nueva Cartera
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Carteras</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{displayStats.totalPortfolios}</div>
            <p className="text-xs text-muted-foreground">Carteras activas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Valor Total</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${displayStats.totalValue.toLocaleString('es-DO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </div>
            <p className="text-xs text-muted-foreground">
              {displayStats.monthlyGrowth > 0 ? '+' : ''}{displayStats.monthlyGrowth}% este mes
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Rendimiento Promedio</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {displayStats.averageYield.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground">Anual</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Clientes Total</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{displayStats.totalClients}</div>
            <p className="text-xs text-muted-foreground">En todas las carteras</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 gap-1 sm:gap-2">
          <TabsTrigger value="resumen" className="text-xs sm:text-sm">Resumen</TabsTrigger>
          <TabsTrigger value="carteras" className="text-xs sm:text-sm">Mis Carteras</TabsTrigger>
          <TabsTrigger value="analisis" className="text-xs sm:text-sm">Análisis</TabsTrigger>
          <TabsTrigger value="configuracion" className="text-xs sm:text-sm">Configuración</TabsTrigger>
        </TabsList>

        <TabsContent value="resumen" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Resumen de Carteras</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                  <p className="text-gray-600 mt-2">Cargando carteras...</p>
                </div>
              ) : filteredPortfolios.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Wallet className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No hay carteras disponibles</p>
                </div>
              ) : (
              <div className="space-y-4">
                  {filteredPortfolios.map((portfolio) => (
                    <div 
                      key={portfolio.id} 
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => handleViewPortfolioDetails(portfolio)}
                    >
                    <div className="flex items-center space-x-4">
                        <div 
                          className="h-8 w-8 rounded-full flex items-center justify-center"
                          style={{ backgroundColor: portfolio.color }}
                        >
                          <Wallet className="h-5 w-5 text-white" />
                        </div>
                      <div>
                          <div className="flex items-center gap-2">
                        <h3 className="font-medium">{portfolio.name}</h3>
                            <Badge 
                              variant={portfolio.status === 'active' ? 'default' : 'secondary'}
                              className="text-xs"
                            >
                              {portfolio.status === 'active' ? 'Activa' : 
                               portfolio.status === 'inactive' ? 'Inactiva' : 'Archivada'}
                            </Badge>
                          </div>
                          <p className="text-sm text-gray-500">
                            {portfolio.clientCount} clientes • {portfolio.loanCount} préstamos
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold">
                          ${portfolio.totalAmount.toLocaleString('es-DO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </div>
                        <div className="text-sm text-green-600 flex items-center justify-end">
                        <TrendingUp className="h-4 w-4 mr-1" />
                          {portfolio.averageYield.toFixed(1)}%
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="carteras" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <CardTitle>Mis Carteras</CardTitle>
                <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                  <div className="relative w-full sm:w-64">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Buscar carteras..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-8"
                    />
                  </div>
                  <Select value={statusFilter} onValueChange={(value: any) => setStatusFilter(value)}>
                    <SelectTrigger className="w-full sm:w-40">
                      <SelectValue placeholder="Estado" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="active">Activas</SelectItem>
                      <SelectItem value="inactive">Inactivas</SelectItem>
                      <SelectItem value="archived">Archivadas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                  <p className="text-gray-600 mt-2">Cargando carteras...</p>
                </div>
              ) : filteredPortfolios.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Wallet className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <h3 className="text-lg font-medium mb-2">No hay carteras</h3>
                  <p className="text-gray-600 mb-4">Crea tu primera cartera para comenzar</p>
                  <Button onClick={handleCreatePortfolio}>
                    <Plus className="h-4 w-4 mr-2" />
                    Nueva Cartera
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredPortfolios.map((portfolio) => (
                    <div 
                      key={portfolio.id} 
                      className="border rounded-lg p-4 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start space-x-4 flex-1">
                          <div 
                            className="h-12 w-12 rounded-lg flex items-center justify-center flex-shrink-0"
                            style={{ backgroundColor: portfolio.color }}
                          >
                            <Wallet className="h-6 w-6 text-white" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h3 className="font-semibold text-lg">{portfolio.name}</h3>
                              <Badge 
                                variant={portfolio.status === 'active' ? 'default' : 'secondary'}
                              >
                                {portfolio.status === 'active' ? 'Activa' : 
                                 portfolio.status === 'inactive' ? 'Inactiva' : 'Archivada'}
                              </Badge>
                            </div>
                            {portfolio.description && (
                              <p className="text-sm text-gray-600 mb-3">{portfolio.description}</p>
                            )}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                              <div>
                                <p className="text-gray-500">Préstamos</p>
                                <p className="font-semibold">{portfolio.loanCount}</p>
                              </div>
                              <div>
                                <p className="text-gray-500">Valor Total</p>
                                <p className="font-semibold">
                                  ${portfolio.totalAmount.toLocaleString('es-DO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                </p>
                              </div>
                              <div>
                                <p className="text-gray-500">Clientes</p>
                                <p className="font-semibold">{portfolio.clientCount}</p>
                              </div>
                              <div>
                                <p className="text-gray-500">Rendimiento</p>
                                <p className="font-semibold text-green-600">
                                  {portfolio.averageYield.toFixed(1)}%
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 ml-4">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={async () => {
                              setSelectedPortfolioForAssignment(portfolio);
                              setLoadingLoans(true);
                              try {
                                const { data: loans, error } = await supabase
                                  .from('loans')
                                  .select(`
                                    id,
                                    amount,
                                    remaining_balance,
                                    interest_rate,
                                    status,
                                    portfolio_id,
                                    client:client_id (
                                      id,
                                      full_name,
                                      dni,
                                      phone
                                    )
                                  `)
                                  .eq('loan_officer_id', companyId)
                                  .in('status', ['active', 'overdue', 'pending'])
                                  .order('created_at', { ascending: false });

                                if (error) throw error;

                                // Filtrar préstamos que no están asignados a otra cartera o están asignados a esta
                                const available = (loans || []).filter((loan: any) => 
                                  !loan.portfolio_id || loan.portfolio_id === portfolio.id
                                );

                                setAvailableLoans(available);
                                setShowAssignLoansDialog(true);
                              } catch (error) {
                                console.error('Error fetching loans:', error);
                                toast.error('Error al cargar préstamos');
                              } finally {
                                setLoadingLoans(false);
                              }
                            }}
                            title="Asignar préstamos"
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewPortfolioDetails(portfolio)}
                            title="Ver detalles"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditPortfolio(portfolio);
                            }}
                            title="Editar"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeletePortfolio(portfolio);
                            }}
                            title="Eliminar"
                            className="text-red-600 hover:text-red-700"
                          >
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

        <TabsContent value="analisis" className="space-y-6">
          {/* Resumen Ejecutivo */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-gray-600">Valor Total Activo</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">
                  ${displayStats.totalValue.toLocaleString('es-DO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {filteredPortfolios.filter(p => p.status === 'active').length} cartera(s) activa(s)
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-gray-600">Rendimiento Promedio</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-green-600">
                  {displayStats.averageYield.toFixed(2)}%
                </p>
                <p className="text-xs text-gray-500 mt-1">Rendimiento ponderado</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-gray-600">Total Préstamos</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">
                  {filteredPortfolios.reduce((sum, p) => sum + p.loanCount, 0)}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  En todas las carteras
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-gray-600">Total Clientes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">
                  {displayStats.totalClients}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Clientes únicos
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Distribución por Valor */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PieChart className="h-5 w-5" />
                  Distribución por Valor
                </CardTitle>
                <p className="text-sm text-gray-500 mt-1">
                  Porcentaje del valor total por cartera
                </p>
              </CardHeader>
              <CardContent>
                {filteredPortfolios.filter(p => p.status === 'active').length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <PieChart className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No hay carteras activas para mostrar</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {filteredPortfolios
                      .filter(p => p.status === 'active')
                      .sort((a, b) => b.totalAmount - a.totalAmount)
                      .map((portfolio) => {
                        const percentage = displayStats.totalValue > 0
                          ? (portfolio.totalAmount / displayStats.totalValue) * 100
                          : 0;
                        return (
                          <div key={portfolio.id} className="space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <div 
                                  className="h-4 w-4 rounded"
                                  style={{ backgroundColor: portfolio.color }}
                                />
                                <span className="text-sm font-medium">{portfolio.name}</span>
                              </div>
                              <div className="text-right">
                                <span className="text-sm font-semibold text-gray-900">
                                  {percentage.toFixed(1)}%
                                </span>
                                <p className="text-xs text-gray-500">
                                  ${portfolio.totalAmount.toLocaleString('es-DO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                </p>
                              </div>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-3">
                              <div
                                className="h-3 rounded-full transition-all"
                                style={{
                                  width: `${percentage}%`,
                                  backgroundColor: portfolio.color
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Rendimiento por Cartera */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <LineChart className="h-5 w-5" />
                  Rendimiento por Cartera
                </CardTitle>
                <p className="text-sm text-gray-500 mt-1">
                  Comparación de rendimiento vs objetivo
                </p>
              </CardHeader>
              <CardContent>
                {filteredPortfolios.filter(p => p.status === 'active').length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <LineChart className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No hay carteras activas para mostrar</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredPortfolios
                      .filter(p => p.status === 'active')
                      .sort((a, b) => b.averageYield - a.averageYield)
                      .map((portfolio) => {
                        const meetsTarget = portfolio.target_yield 
                          ? portfolio.averageYield >= portfolio.target_yield 
                          : null;
                        return (
                          <div key={portfolio.id} className="p-4 border rounded-lg hover:bg-gray-50 transition-colors">
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-3">
                                <div 
                                  className="h-10 w-10 rounded-lg flex items-center justify-center"
                                  style={{ backgroundColor: portfolio.color }}
                                >
                                  <Wallet className="h-5 w-5 text-white" />
                                </div>
                                <div>
                                  <p className="font-semibold">{portfolio.name}</p>
                                  <p className="text-xs text-gray-500">
                                    {portfolio.loanCount} préstamos • {portfolio.clientCount} clientes
                                  </p>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className={`text-2xl font-bold ${
                                  meetsTarget === true ? 'text-green-600' : 
                                  meetsTarget === false ? 'text-orange-600' : 
                                  'text-blue-600'
                                }`}>
                                  {portfolio.averageYield.toFixed(1)}%
                                </p>
                                {portfolio.target_yield && (
                                  <div className="flex items-center gap-1 justify-end mt-1">
                                    {meetsTarget ? (
                                      <CheckCircle2 className="h-3 w-3 text-green-600" />
                                    ) : (
                                      <AlertCircle className="h-3 w-3 text-orange-600" />
                                    )}
                                    <p className="text-xs text-gray-500">
                                      Objetivo: {portfolio.target_yield}%
                                    </p>
                                  </div>
                                )}
                              </div>
                            </div>
                            {portfolio.target_yield && (
                              <div className="mt-2">
                                <div className="flex items-center justify-between text-xs mb-1">
                                  <span className="text-gray-500">Progreso hacia objetivo</span>
                                  <span className="text-gray-600">
                                    {Math.min(100, (portfolio.averageYield / portfolio.target_yield) * 100).toFixed(0)}%
                                  </span>
                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-2">
                                  <div
                                    className={`h-2 rounded-full transition-all ${
                                      meetsTarget ? 'bg-green-600' : 'bg-orange-500'
                                    }`}
                                    style={{
                                      width: `${Math.min(100, (portfolio.averageYield / portfolio.target_yield) * 100)}%`
                                    }}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Análisis Detallado */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Análisis de Balance
                </CardTitle>
                <p className="text-sm text-gray-500 mt-1">
                  Capital pagado vs pendiente por cartera
                </p>
              </CardHeader>
              <CardContent>
                {filteredPortfolios.filter(p => p.status === 'active').length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No hay datos para mostrar</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {filteredPortfolios
                      .filter(p => p.status === 'active')
                      .map((portfolio) => {
                        const totalPaid = portfolio.totalAmount - portfolio.remainingBalance;
                        const paidPercentage = portfolio.totalAmount > 0 
                          ? (totalPaid / portfolio.totalAmount) * 100 
                          : 0;
                        return (
                          <div key={portfolio.id} className="space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <div 
                                  className="h-3 w-3 rounded"
                                  style={{ backgroundColor: portfolio.color }}
                                />
                                <span className="text-sm font-medium">{portfolio.name}</span>
                              </div>
                              <div className="text-right">
                                <p className="text-sm font-semibold">
                                  ${totalPaid.toLocaleString('es-DO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} / ${portfolio.totalAmount.toLocaleString('es-DO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                </p>
                                <p className="text-xs text-gray-500">
                                  {paidPercentage.toFixed(1)}% pagado
                                </p>
                              </div>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2.5 relative overflow-hidden">
                              <div
                                className="h-2.5 rounded-full bg-green-500 transition-all"
                                style={{ width: `${paidPercentage}%` }}
                              />
                              <div
                                className="h-2.5 rounded-full bg-gray-400 absolute top-0 right-0 transition-all"
                                style={{ width: `${100 - paidPercentage}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Ranking de Carteras
                </CardTitle>
                <p className="text-sm text-gray-500 mt-1">
                  Clasificación por rendimiento
                </p>
              </CardHeader>
              <CardContent>
                {filteredPortfolios.filter(p => p.status === 'active').length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <TrendingUp className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No hay datos para mostrar</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredPortfolios
                      .filter(p => p.status === 'active')
                      .sort((a, b) => b.averageYield - a.averageYield)
                      .map((portfolio, index) => (
                        <div key={portfolio.id} className="flex items-center gap-4 p-3 border rounded-lg hover:bg-gray-50 transition-colors">
                          <div className="flex-shrink-0">
                            <div className={`h-10 w-10 rounded-full flex items-center justify-center font-bold text-white ${
                              index === 0 ? 'bg-yellow-500' :
                              index === 1 ? 'bg-gray-400' :
                              index === 2 ? 'bg-orange-600' :
                              'bg-blue-500'
                            }`}>
                              {index + 1}
                            </div>
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <div 
                                className="h-3 w-3 rounded"
                                style={{ backgroundColor: portfolio.color }}
                              />
                              <p className="font-semibold">{portfolio.name}</p>
                            </div>
                            <p className="text-xs text-gray-500">
                              {portfolio.loanCount} préstamos • ${portfolio.totalAmount.toLocaleString('es-DO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-bold text-green-600">
                              {portfolio.averageYield.toFixed(1)}%
                            </p>
                            {portfolio.target_yield && (
                              <p className="text-xs text-gray-500">
                                Obj: {portfolio.target_yield}%
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Resumen Consolidado */}
          <Card>
            <CardHeader>
              <CardTitle>Resumen Consolidado</CardTitle>
              <p className="text-sm text-gray-500 mt-1">
                Vista general de todas las carteras activas
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <p className="text-sm text-blue-600 font-medium mb-1">Capital Total</p>
                  <p className="text-2xl font-bold text-blue-900">
                    ${displayStats.totalValue.toLocaleString('es-DO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </p>
                  <p className="text-xs text-blue-600 mt-1">
                    Valor de todos los préstamos
                  </p>
                </div>
                <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                  <p className="text-sm text-green-600 font-medium mb-1">Capital Pagado</p>
                  <p className="text-2xl font-bold text-green-900">
                    ${(displayStats.totalValue - filteredPortfolios.reduce((sum, p) => sum + p.remainingBalance, 0)).toLocaleString('es-DO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </p>
                  <p className="text-xs text-green-600 mt-1">
                    {displayStats.totalValue > 0 
                      ? ((displayStats.totalValue - filteredPortfolios.reduce((sum, p) => sum + p.remainingBalance, 0)) / displayStats.totalValue * 100).toFixed(1)
                      : 0}% del total
                  </p>
                </div>
                <div className="p-4 bg-orange-50 rounded-lg border border-orange-200">
                  <p className="text-sm text-orange-600 font-medium mb-1">Balance Pendiente</p>
                  <p className="text-2xl font-bold text-orange-900">
                    ${filteredPortfolios.reduce((sum, p) => sum + p.remainingBalance, 0).toLocaleString('es-DO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </p>
                  <p className="text-xs text-orange-600 mt-1">
                    Por cobrar
                  </p>
                </div>
                <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
                  <p className="text-sm text-purple-600 font-medium mb-1">Rendimiento Promedio</p>
                  <p className="text-2xl font-bold text-purple-900">
                    {displayStats.averageYield.toFixed(2)}%
                  </p>
                  <p className="text-xs text-purple-600 mt-1">
                    Ponderado por valor
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="configuracion" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Configuración General
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 border rounded-lg">
                <h3 className="font-medium mb-2">Gestión de Carteras</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Administra tus carteras de préstamos, asigna préstamos a carteras específicas y realiza un seguimiento del rendimiento.
                </p>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span className="text-sm">Crear y editar carteras</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span className="text-sm">Asignar préstamos a carteras</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span className="text-sm">Ver análisis y reportes</span>
                  </div>
                </div>
              </div>

              <div className="p-4 border rounded-lg">
                <h3 className="font-medium mb-2">Estados de Cartera</h3>
                <div className="space-y-2 text-sm">
                  <div>
                    <Badge className="mr-2">Activa</Badge>
                    <span className="text-gray-600">Cartera en uso activo</span>
                  </div>
                  <div>
                    <Badge variant="secondary" className="mr-2">Inactiva</Badge>
                    <span className="text-gray-600">Cartera temporalmente deshabilitada</span>
                  </div>
                  <div>
                    <Badge variant="outline" className="mr-2">Archivada</Badge>
                    <span className="text-gray-600">Cartera archivada para referencia histórica</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Formulario de Crear/Editar Cartera */}
      <Dialog open={showPortfolioForm} onOpenChange={setShowPortfolioForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingPortfolio ? 'Editar Cartera' : 'Nueva Cartera'}
            </DialogTitle>
            <DialogDescription>
              {editingPortfolio 
                ? 'Modifica los datos de la cartera' 
                : 'Crea una nueva cartera para organizar tus préstamos'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="name">Nombre de la Cartera *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Ej: Cartera Personal"
                required
              />
            </div>

            <div>
              <Label htmlFor="description">Descripción</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Descripción de la cartera..."
                rows={3}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="status">Estado</Label>
                <Select 
                  value={formData.status} 
                  onValueChange={(value: any) => setFormData({ ...formData, status: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Activa</SelectItem>
                    <SelectItem value="inactive">Inactiva</SelectItem>
                    <SelectItem value="archived">Archivada</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="color">Color</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="color"
                    type="color"
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                    className="w-20 h-10"
                  />
                  <Input
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                    placeholder="#3B82F6"
                    className="flex-1"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="target_yield">Rendimiento Objetivo (%)</Label>
                <Input
                  id="target_yield"
                  type="number"
                  step="0.1"
                  value={formData.target_yield}
                  onChange={(e) => setFormData({ ...formData, target_yield: e.target.value })}
                  placeholder="12.0"
                />
              </div>

              <div>
                <Label htmlFor="min_loan_amount">Monto Mínimo</Label>
                <Input
                  id="min_loan_amount"
                  type="number"
                  step="0.01"
                  value={formData.min_loan_amount}
                  onChange={(e) => setFormData({ ...formData, min_loan_amount: e.target.value })}
                  placeholder="0.00"
                />
              </div>

              <div>
                <Label htmlFor="max_loan_amount">Monto Máximo</Label>
                <Input
                  id="max_loan_amount"
                  type="number"
                  step="0.01"
                  value={formData.max_loan_amount}
                  onChange={(e) => setFormData({ ...formData, max_loan_amount: e.target.value })}
                  placeholder="0.00"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPortfolioForm(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSavePortfolio}>
              {editingPortfolio ? 'Actualizar' : 'Crear'} Cartera
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de Detalles de Cartera */}
      <Dialog open={showPortfolioDetails} onOpenChange={setShowPortfolioDetails}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div 
                className="h-6 w-6 rounded"
                style={{ backgroundColor: selectedPortfolio?.color || '#3B82F6' }}
              />
              {selectedPortfolio?.name}
            </DialogTitle>
            <DialogDescription>
              Detalles y préstamos de la cartera
            </DialogDescription>
          </DialogHeader>
          {selectedPortfolio && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="p-3 border rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">Préstamos</p>
                  <p className="text-xl font-bold">{selectedPortfolio.loanCount}</p>
                </div>
                <div className="p-3 border rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">Valor Total</p>
                  <p className="text-xl font-bold">
                    ${selectedPortfolio.totalAmount.toLocaleString('es-DO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </p>
                </div>
                <div className="p-3 border rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">Balance Pendiente</p>
                  <p className="text-xl font-bold">
                    ${selectedPortfolio.remainingBalance.toLocaleString('es-DO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </p>
                </div>
                <div className="p-3 border rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">Rendimiento</p>
                  <p className="text-xl font-bold text-green-600">
                    {selectedPortfolio.averageYield.toFixed(1)}%
                  </p>
                </div>
              </div>

              <div>
                <h3 className="font-semibold mb-3">Préstamos en esta Cartera</h3>
                {portfolioLoans.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No hay préstamos asignados a esta cartera</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {portfolioLoans.map((loan: any) => {
                      const client = Array.isArray(loan.client) ? loan.client[0] : loan.client;
                      return (
                        <div key={loan.id} className="p-3 border rounded-lg">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium">{client?.full_name || 'Cliente desconocido'}</p>
                              <p className="text-sm text-gray-500">
                                {client?.dni || 'N/A'} • {client?.phone || 'N/A'}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="font-semibold">
                                ${Number(loan.amount || 0).toLocaleString('es-DO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                              </p>
                              <p className="text-sm text-gray-500">
                                {loan.interest_rate}% • {loan.status}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog para Asignar Préstamos */}
      <Dialog open={showAssignLoansDialog} onOpenChange={setShowAssignLoansDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Asignar Préstamos a Cartera</DialogTitle>
            <DialogDescription>
              Selecciona los préstamos que deseas asignar a la cartera "{selectedPortfolioForAssignment?.name}"
            </DialogDescription>
          </DialogHeader>
          {loadingLoans ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="text-gray-600 mt-2">Cargando préstamos...</p>
            </div>
          ) : availableLoans.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No hay préstamos disponibles para asignar</p>
            </div>
          ) : (
            <div className="space-y-4 py-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600">
                  {selectedLoans.size} préstamo(s) seleccionado(s)
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (selectedLoans.size === availableLoans.length) {
                        setSelectedLoans(new Set());
                      } else {
                        setSelectedLoans(new Set(availableLoans.map(loan => loan.id)));
                      }
                    }}
                  >
                    {selectedLoans.size === availableLoans.length ? 'Deseleccionar Todos' : 'Seleccionar Todos'}
                  </Button>
                </div>
              </div>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {availableLoans.map((loan: any) => {
                  const client = Array.isArray(loan.client) ? loan.client[0] : loan.client;
                  const isSelected = selectedLoans.has(loan.id);
                  return (
                    <div
                      key={loan.id}
                      className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                        isSelected ? 'bg-blue-50 border-blue-300' : 'hover:bg-gray-50'
                      }`}
                      onClick={() => {
                        const newSelected = new Set(selectedLoans);
                        if (isSelected) {
                          newSelected.delete(loan.id);
                        } else {
                          newSelected.add(loan.id);
                        }
                        setSelectedLoans(newSelected);
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {
                              const newSelected = new Set(selectedLoans);
                              if (isSelected) {
                                newSelected.delete(loan.id);
                              } else {
                                newSelected.add(loan.id);
                              }
                              setSelectedLoans(newSelected);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="h-4 w-4"
                          />
                          <div>
                            <p className="font-medium">{client?.full_name || 'Cliente desconocido'}</p>
                            <p className="text-sm text-gray-500">
                              {client?.dni || 'N/A'} • {loan.status}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold">
                            ${Number(loan.amount || 0).toLocaleString('es-DO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                          </p>
                          <p className="text-sm text-gray-500">
                            {loan.interest_rate}% • Balance: ${Number(loan.remaining_balance || 0).toLocaleString('es-DO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowAssignLoansDialog(false);
              setSelectedLoans(new Set());
            }}>
              Cancelar
            </Button>
            <Button
              onClick={async () => {
                if (!selectedPortfolioForAssignment || selectedLoans.size === 0) {
                  toast.error('Selecciona al menos un préstamo');
                  return;
                }

                try {
                  const { error } = await supabase
                    .from('loans')
                    .update({ portfolio_id: selectedPortfolioForAssignment.id })
                    .in('id', Array.from(selectedLoans));

                  if (error) throw error;

                  toast.success(`${selectedLoans.size} préstamo(s) asignado(s) exitosamente`);
                  setShowAssignLoansDialog(false);
                  setSelectedLoans(new Set());
                  fetchPortfolios();
                } catch (error: any) {
                  console.error('Error assigning loans:', error);
                  toast.error(error?.message || 'Error al asignar préstamos');
                }
              }}
              disabled={selectedLoans.size === 0}
            >
              Asignar {selectedLoans.size > 0 && `(${selectedLoans.size})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
};
