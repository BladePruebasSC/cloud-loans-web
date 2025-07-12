import { supabase } from '../integrations/supabase/client';
import { Database } from '../integrations/supabase/types';

export async function getClientStatistics() {
  const { data, error } = await supabase
    .from('clients')
    .select('*');

  if (error) console.error('Error fetching client statistics:', error);
  return data || [];
}

export async function getLoanReports() {
  const { data, error } = await supabase
    .from('loans')
    .select('*');

  if (error) console.error('Error fetching loan reports:', error);
  return data || [];
}

export async function getPaymentReports() {
  const { data, error } = await supabase
    .from('payments')
    .select('*');

  if (error) console.error('Error fetching payment reports:', error);
  return data || [];
}

export async function getPerformanceReports() {
  const { data, error } = await supabase
    .rpc('get_performance_metrics') // Assuming a stored procedure exists

  if (error) console.error('Error fetching performance reports:', error);
  return data || [];
}
