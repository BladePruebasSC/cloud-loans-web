import { useEffect, useRef } from 'react';
import { useAuth } from './useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  exportToExcelMultiSheet,
  formatDataForExport
} from '@/utils/exportUtils';

/**
 * Hook para manejar backups automáticos
 * Verifica la configuración y ejecuta backups según el intervalo configurado
 */
export const useAutoBackup = () => {
  const { companyId, user } = useAuth();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastCheckRef = useRef<Date>(new Date());

  useEffect(() => {
    if (!companyId || !user) return;

    const checkAndExecuteBackup = async () => {
      try {
        // Obtener configuración de backup
        const { data: settings, error } = await supabase
          .from('company_settings')
          .select('auto_backup_enabled, auto_backup_interval_hours, auto_backup_format, last_backup_date, next_backup_date')
          .eq('user_id', companyId)
          .maybeSingle();

        if (error || !settings) {
          return; // No hay configuración o error
        }

        // Si los backups automáticos no están habilitados, no hacer nada
        if (!settings.auto_backup_enabled) {
          return;
        }

        const now = new Date();
        const nextBackupDate = settings.next_backup_date ? new Date(settings.next_backup_date) : null;

        // Verificar si es hora de hacer backup
        if (!nextBackupDate || now >= nextBackupDate) {
          await executeAutoBackup(companyId, settings.auto_backup_format || 'excel');
          
          // Calcular próxima fecha de backup
          const intervalHours = settings.auto_backup_interval_hours || 24;
          const nextBackup = new Date(now.getTime() + intervalHours * 60 * 60 * 1000);

          // Actualizar configuración con última fecha de backup y próxima
          await supabase
            .from('company_settings')
            .update({
              last_backup_date: now.toISOString(),
              next_backup_date: nextBackup.toISOString()
            })
            .eq('user_id', companyId);
        }
      } catch (error) {
        console.error('Error checking auto backup:', error);
      }
    };

    // Verificar cada 5 minutos si es necesario hacer backup
    intervalRef.current = setInterval(checkAndExecuteBackup, 5 * 60 * 1000);

    // Ejecutar una vez al montar
    checkAndExecuteBackup();

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [companyId, user]);
};

/**
 * Ejecuta un backup automático completo
 */
const executeAutoBackup = async (companyId: string, format: 'excel' | 'csv' | 'pdf') => {
  try {
    // Obtener todos los datos
    const [
      { data: clients },
      { data: loans },
      { data: payments },
      { data: inventory },
      { data: sales },
      { data: pawnshop },
      { data: documents },
      { data: requests },
      { data: agreements },
      { data: expenses }
    ] = await Promise.all([
      supabase.from('clients').select('*').eq('user_id', companyId),
      supabase.from('loans').select('*').eq('loan_officer_id', companyId).neq('status', 'deleted'),
      supabase.from('payments').select('*').eq('created_by', companyId),
      supabase.from('products').select('*').eq('user_id', companyId),
      supabase.from('sales').select('*').eq('user_id', companyId),
      supabase.from('pawn_transactions').select('*').eq('user_id', companyId),
      supabase.from('documents').select('*').eq('user_id', companyId),
      supabase.from('loan_requests').select('*').eq('user_id', companyId),
      supabase.from('payment_agreements').select('*').eq('user_id', companyId),
      supabase.from('expenses').select('*').eq('created_by', companyId)
    ]);

    const allData = {
      clients: formatDataForExport(clients || []),
      loans: formatDataForExport(loans || []),
      payments: formatDataForExport(payments || []),
      inventory: formatDataForExport(inventory || []),
      sales: formatDataForExport(sales || []),
      pawnshop: formatDataForExport(pawnshop || []),
      documents: formatDataForExport(documents || []),
      requests: formatDataForExport(requests || []),
      agreements: formatDataForExport(agreements || []),
      expenses: formatDataForExport(expenses || [])
    };

    const filename = `backup_automatico_${new Date().toISOString().split('T')[0]}`;

    // Solo exportar a Excel para backups automáticos (más eficiente)
    if (format === 'excel') {
      exportToExcelMultiSheet([
        { name: 'Clientes', data: allData.clients },
        { name: 'Préstamos', data: allData.loans },
        { name: 'Pagos', data: allData.payments },
        { name: 'Inventario', data: allData.inventory },
        { name: 'Ventas', data: allData.sales },
        { name: 'Empeños', data: allData.pawnshop },
        { name: 'Documentos', data: allData.documents },
        { name: 'Solicitudes', data: allData.requests },
        { name: 'Acuerdos', data: allData.agreements },
        { name: 'Gastos', data: allData.expenses }
      ], filename);
    }

    // Nota: Los backups automáticos se descargan automáticamente
    // En el futuro se podría implementar almacenamiento en la nube
    console.log('Backup automático ejecutado exitosamente');
  } catch (error) {
    console.error('Error ejecutando backup automático:', error);
    // No mostrar toast para no molestar al usuario
  }
};

