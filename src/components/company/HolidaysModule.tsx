
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Calendar, Plus, Edit, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface Holiday {
  id: string;
  name: string;
  date: string;
  description: string;
  is_recurring: boolean;
}

export const HolidaysModule = () => {
  const [holidays, setHolidays] = useState<Holiday[]>([
    {
      id: '1',
      name: 'Año Nuevo',
      date: '2024-01-01',
      description: 'Celebración del Año Nuevo',
      is_recurring: true
    },
    {
      id: '2',
      name: 'Día de la Independencia',
      date: '2024-02-27',
      description: 'Independencia Nacional',
      is_recurring: true
    },
    {
      id: '3',
      name: 'Viernes Santo',
      date: '2024-03-29',
      description: 'Celebración religiosa',
      is_recurring: false
    }
  ]);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState<Holiday | null>(null);
  const [showPasswordVerification, setShowPasswordVerification] = useState(false);
  const [holidayToDelete, setHolidayToDelete] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    date: '',
    description: '',
    is_recurring: false
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (editingHoliday) {
      setHolidays(prev => prev.map(holiday => 
        holiday.id === editingHoliday.id 
          ? { ...holiday, ...formData }
          : holiday
      ));
      toast.success('Día feriado actualizado exitosamente');
    } else {
      const newHoliday = {
        ...formData,
        id: Date.now().toString(),
      };
      setHolidays(prev => [...prev, newHoliday]);
      toast.success('Día feriado agregado exitosamente');
    }

    setIsDialogOpen(false);
    setEditingHoliday(null);
    setFormData({ name: '', date: '', description: '', is_recurring: false });
  };

  const handleEdit = (holiday: Holiday) => {
    setEditingHoliday(holiday);
    setFormData({
      name: holiday.name,
      date: holiday.date,
      description: holiday.description,
      is_recurring: holiday.is_recurring
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    setHolidayToDelete(id);
    setShowPasswordVerification(true);
  };

  const confirmDelete = () => {
    if (!holidayToDelete) return;
    setHolidays(prev => prev.filter(holiday => holiday.id !== holidayToDelete));
    toast.success('Día feriado eliminado exitosamente');
    setHolidayToDelete(null);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Días Feriados</h1>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => {
              setEditingHoliday(null);
              setFormData({ name: '', date: '', description: '', is_recurring: false });
            }}>
              <Plus className="h-4 w-4 mr-2" />
              Nuevo Día Feriado
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingHoliday ? 'Editar Día Feriado' : 'Nuevo Día Feriado'}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="name">Nombre del Feriado</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Ej: Día de la Independencia"
                  required
                />
              </div>

              <div>
                <Label htmlFor="date">Fecha</Label>
                <Input
                  id="date"
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
                  required
                />
              </div>

              <div>
                <Label htmlFor="description">Descripción</Label>
                <Input
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Descripción del feriado"
                />
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="is_recurring"
                  checked={formData.is_recurring}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_recurring: checked }))}
                />
                <Label htmlFor="is_recurring">Feriado recurrente (cada año)</Label>
              </div>

              <div className="flex gap-4">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit">
                  {editingHoliday ? 'Actualizar' : 'Crear'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Calendario de Días Feriados
          </CardTitle>
        </CardHeader>
        <CardContent>
          {holidays.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No hay días feriados registrados</p>
            </div>
          ) : (
            <div className="space-y-4">
              {holidays.map((holiday) => (
                <div key={holiday.id} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-semibold text-lg">{holiday.name}</h3>
                        {holiday.is_recurring && (
                          <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                            Recurrente
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-gray-600">
                        <p><strong>Fecha:</strong> {new Date(holiday.date).toLocaleDateString()}</p>
                        {holiday.description && (
                          <p><strong>Descripción:</strong> {holiday.description}</p>
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

      {/* Diálogo de Verificación de Contraseña */}
      <PasswordVerificationDialog
        isOpen={showPasswordVerification}
        onClose={() => {
          setShowPasswordVerification(false);
          setHolidayToDelete(null);
        }}
        onVerify={() => {
          setShowPasswordVerification(false);
          confirmDelete();
        }}
        title="Verificar Contraseña"
        description="Por seguridad, ingresa tu contraseña para confirmar la eliminación del día feriado."
        entityName="día feriado"
      />
    </div>
  );
};
