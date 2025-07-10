
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { 
  Plus, 
  Calendar, 
  Search, 
  Edit,
  Trash2,
  CalendarDays
} from 'lucide-react';

const holidaySchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  date: z.string().min(1, 'La fecha es requerida'),
  description: z.string().optional(),
  is_recurring: z.boolean().default(false),
});

type HolidayFormData = z.infer<typeof holidaySchema>;

interface Holiday {
  id: string;
  name: string;
  date: string;
  description: string | null;
  is_recurring: boolean;
  created_at: string;
}

export const HolidaysModule = () => {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState<Holiday | null>(null);
  const { user } = useAuth();

  const form = useForm<HolidayFormData>({
    resolver: zodResolver(holidaySchema),
    defaultValues: {
      is_recurring: false,
    },
  });

  useEffect(() => {
    fetchHolidays();
  }, []);

  const fetchHolidays = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('holidays')
        .select('*')
        .order('date', { ascending: true });

      if (error) throw error;
      setHolidays(data || []);
    } catch (error) {
      console.error('Error fetching holidays:', error);
      toast.error('Error al cargar días feriados');
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (data: HolidayFormData) => {
    if (!user) return;

    setLoading(true);
    try {
      const holidayData = {
        ...data,
        user_id: user.id,
      };

      if (editingHoliday) {
        const { error } = await supabase
          .from('holidays')
          .update(holidayData)
          .eq('id', editingHoliday.id);

        if (error) throw error;
        toast.success('Día feriado actualizado exitosamente');
      } else {
        const { error } = await supabase
          .from('holidays')
          .insert([holidayData]);

        if (error) throw error;
        toast.success('Día feriado agregado exitosamente');
      }

      setIsDialogOpen(false);
      setEditingHoliday(null);
      form.reset();
      fetchHolidays();
    } catch (error) {
      console.error('Error saving holiday:', error);
      toast.error('Error al guardar día feriado');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (holiday: Holiday) => {
    setEditingHoliday(holiday);
    form.reset({
      name: holiday.name,
      date: holiday.date,
      description: holiday.description || '',
      is_recurring: holiday.is_recurring,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Está seguro de eliminar este día feriado?')) return;

    try {
      const { error } = await supabase
        .from('holidays')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Día feriado eliminado exitosamente');
      fetchHolidays();
    } catch (error) {
      console.error('Error deleting holiday:', error);
      toast.error('Error al eliminar día feriado');
    }
  };

  const filteredHolidays = holidays.filter(holiday =>
    holiday.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    holiday.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const currentDate = new Date();
  const upcomingHolidays = holidays.filter(h => new Date(h.date) >= currentDate).length;
  const thisYearHolidays = holidays.filter(h => new Date(h.date).getFullYear() === currentDate.getFullYear()).length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Días Feriados</h1>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => {
              setEditingHoliday(null);
              form.reset();
            }}>
              <Plus className="h-4 w-4 mr-2" />
              Nuevo Día Feriado
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {editingHoliday ? 'Editar Día Feriado' : 'Nuevo Día Feriado'}
              </DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nombre del Feriado</FormLabel>
                      <FormControl>
                        <Input placeholder="Ej: Día de la Independencia" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fecha</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Descripción (Opcional)</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Descripción del día feriado..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="is_recurring"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>Feriado Recurrente</FormLabel>
                        <p className="text-sm text-muted-foreground">
                          Se repite cada año en la misma fecha
                        </p>
                      </div>
                    </FormItem>
                  )}
                />

                <div className="flex gap-4">
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={loading}>
                    {loading ? 'Guardando...' : editingHoliday ? 'Actualizar' : 'Crear'}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Feriados</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{holidays.length}</div>
            <p className="text-xs text-muted-foreground">Registrados</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Próximos Feriados</CardTitle>
            <CalendarDays className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{upcomingHolidays}</div>
            <p className="text-xs text-muted-foreground">Por venir</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Este Año</CardTitle>
            <Calendar className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{thisYearHolidays}</div>
            <p className="text-xs text-muted-foreground">Feriados {currentDate.getFullYear()}</p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <Card>
        <CardHeader>
          <CardTitle>Buscar Días Feriados</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-2">
            <Search className="h-4 w-4 text-gray-400" />
            <Input
              placeholder="Buscar por nombre o descripción..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-sm"
            />
          </div>
        </CardContent>
      </Card>

      {/* Holidays List */}
      <Card>
        <CardHeader>
          <CardTitle>Lista de Días Feriados</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-gray-500">Cargando días feriados...</div>
          ) : filteredHolidays.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No hay días feriados registrados</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredHolidays.map((holiday) => (
                <div key={holiday.id} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-semibold text-lg">{holiday.name}</h3>
                        {holiday.is_recurring && (
                          <Badge variant="secondary">Recurrente</Badge>
                        )}
                        {new Date(holiday.date) < new Date() && (
                          <Badge variant="outline">Pasado</Badge>
                        )}
                        {new Date(holiday.date) >= new Date() && (
                          <Badge variant="default">Próximo</Badge>
                        )}
                      </div>
                      
                      <div className="space-y-1 text-sm text-gray-600">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          <span>{new Date(holiday.date).toLocaleDateString('es-ES', {
                            weekday: 'long',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          })}</span>
                        </div>
                        
                        {holiday.description && (
                          <p className="mt-2">{holiday.description}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => handleEdit(holiday)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(holiday.id)}
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
    </div>
  );
};
