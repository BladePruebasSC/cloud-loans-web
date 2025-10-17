import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { 
  Phone, 
  Mail, 
  MessageSquare, 
  MapPin, 
  FileText, 
  MoreHorizontal,
  Plus,
  Calendar,
  Clock,
  User,
  Edit,
  Trash2,
  ChevronLeft
} from 'lucide-react';
import { formatDateTimeWithOffset } from '@/utils/dateUtils';

interface CollectionTracking {
  id: string;
  loan_id: string;
  contact_type: 'phone' | 'email' | 'sms' | 'visit' | 'letter' | 'other';
  contact_date: string;
  contact_time: string;
  client_response: string | null;
  additional_notes: string | null;
  next_contact_date: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface CollectionTrackingProps {
  loanId: string;
  clientName: string;
  isOpen: boolean;
  onClose: () => void;
}

const contactTypeIcons = {
  phone: Phone,
  email: Mail,
  sms: MessageSquare,
  visit: MapPin,
  letter: FileText,
  other: MoreHorizontal
};

const contactTypeLabels = {
  phone: 'Llamada Telefónica',
  email: 'Correo Electrónico',
  sms: 'Mensaje de Texto',
  visit: 'Visita Personal',
  letter: 'Carta',
  other: 'Otro'
};

const contactTypeColors = {
  phone: 'bg-blue-100 text-blue-800',
  email: 'bg-green-100 text-green-800',
  sms: 'bg-purple-100 text-purple-800',
  visit: 'bg-orange-100 text-orange-800',
  letter: 'bg-gray-100 text-gray-800',
  other: 'bg-yellow-100 text-yellow-800'
};

export const CollectionTracking: React.FC<CollectionTrackingProps> = ({
  loanId,
  clientName,
  isOpen,
  onClose
}) => {
  const [trackingRecords, setTrackingRecords] = useState<CollectionTracking[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState<CollectionTracking | null>(null);
  const { user } = useAuth();

  const [formData, setFormData] = useState({
    contact_type: 'phone' as 'phone' | 'email' | 'sms' | 'visit' | 'letter' | 'other',
    contact_date: new Date().toISOString().split('T')[0],
    contact_time: new Date().toTimeString().slice(0, 5),
    client_response: '',
    additional_notes: '',
    next_contact_date: ''
  });

  // Cargar registros de seguimiento
  const fetchTrackingRecords = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('collection_tracking')
        .select('*')
        .eq('loan_id', loanId)
        .order('contact_date', { ascending: false })
        .order('contact_time', { ascending: false });

      if (error) throw error;
      setTrackingRecords(data || []);
    } catch (error) {
      console.error('Error fetching tracking records:', error);
      toast.error('Error al cargar el historial de seguimiento');
    } finally {
      setLoading(false);
    }
  };

  // Guardar nuevo registro o actualizar existente
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const submitData = {
        loan_id: loanId,
        contact_type: formData.contact_type,
        contact_date: formData.contact_date,
        contact_time: formData.contact_time,
        client_response: formData.client_response || null,
        additional_notes: formData.additional_notes || null,
        next_contact_date: formData.next_contact_date || null,
        created_by: user?.id
      };

      if (editingRecord) {
        // Actualizar registro existente
        const { error } = await supabase
          .from('collection_tracking')
          .update(submitData)
          .eq('id', editingRecord.id);

        if (error) throw error;
        toast.success('Seguimiento actualizado correctamente');
      } else {
        // Crear nuevo registro
        const { error } = await supabase
          .from('collection_tracking')
          .insert(submitData);

        if (error) throw error;
        toast.success('Seguimiento agregado correctamente');
      }

      // Limpiar formulario y recargar datos
      setFormData({
        contact_type: 'phone',
        contact_date: new Date().toISOString().split('T')[0],
        contact_time: new Date().toTimeString().slice(0, 5),
        client_response: '',
        additional_notes: '',
        next_contact_date: ''
      });
      setShowAddForm(false);
      setEditingRecord(null);
      fetchTrackingRecords();
    } catch (error) {
      console.error('Error saving tracking record:', error);
      toast.error('Error al guardar el seguimiento');
    }
  };

  // Eliminar registro
  const handleDelete = async (recordId: string) => {
    if (!confirm('¿Estás seguro de que quieres eliminar este seguimiento?')) return;

    try {
      const { error } = await supabase
        .from('collection_tracking')
        .delete()
        .eq('id', recordId);

      if (error) throw error;
      toast.success('Seguimiento eliminado correctamente');
      fetchTrackingRecords();
    } catch (error) {
      console.error('Error deleting tracking record:', error);
      toast.error('Error al eliminar el seguimiento');
    }
  };

  // Editar registro
  const handleEdit = (record: CollectionTracking) => {
    setFormData({
      contact_type: record.contact_type,
      contact_date: record.contact_date,
      contact_time: record.contact_time,
      client_response: record.client_response || '',
      additional_notes: record.additional_notes || '',
      next_contact_date: record.next_contact_date || ''
    });
    setEditingRecord(record);
    setShowAddForm(true);
  };

  // Cargar datos cuando se abre el modal
  useEffect(() => {
    if (isOpen) {
      fetchTrackingRecords();
    }
  }, [isOpen, loanId]);

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[95vh] overflow-y-auto p-0 sm:p-6">
        {/* Header con gradiente */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white p-6 rounded-t-lg sm:rounded-lg">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                <User className="h-6 w-6" />
              </div>
              <div>
                <DialogTitle className="text-xl sm:text-2xl font-bold text-white">
                  Seguimiento de Cobro
                </DialogTitle>
                <p className="text-blue-100 text-sm sm:text-base mt-1">
                  Cliente: {clientName}
                </p>
              </div>
            </div>
            <Button
              onClick={() => {
                setShowAddForm(true);
                setEditingRecord(null);
                setFormData({
                  contact_type: 'phone',
                  contact_date: new Date().toISOString().split('T')[0],
                  contact_time: new Date().toTimeString().slice(0, 5),
                  client_response: '',
                  additional_notes: '',
                  next_contact_date: ''
                });
              }}
              className="h-12 bg-white/20 hover:bg-white/30 text-white border-white/30 hover:border-white/50 transition-all duration-200 font-semibold"
            >
              <Plus className="h-5 w-5 mr-2" />
              <span className="hidden sm:inline">Nuevo Seguimiento</span>
              <span className="sm:hidden">Nuevo</span>
            </Button>
          </div>
        </div>

        <div className="p-6 space-y-6">

          {/* Formulario para agregar/editar seguimiento */}
          {showAddForm && (
            <Card className="border-0 shadow-lg bg-gradient-to-br from-white to-blue-50/30">
              <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-100">
                <CardTitle className="flex items-center text-lg font-bold text-gray-800">
                  {editingRecord ? (
                    <>
                      <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center mr-3">
                        <Edit className="h-4 w-4 text-orange-600" />
                      </div>
                      Editar Seguimiento
                    </>
                  ) : (
                    <>
                      <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center mr-3">
                        <Plus className="h-4 w-4 text-green-600" />
                      </div>
                      Nuevo Seguimiento
                    </>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* Primera fila - Tipo de contacto y fecha */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="contact_type" className="text-sm font-semibold text-gray-700">
                        Tipo de Contacto *
                      </Label>
                      <Select
                        value={formData.contact_type}
                        onValueChange={(value: 'phone' | 'email' | 'sms' | 'visit' | 'letter' | 'other') => setFormData({...formData, contact_type: value})}
                      >
                        <SelectTrigger className="h-12 border-2 border-gray-200 focus:border-blue-500 transition-colors">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(contactTypeLabels).map(([key, label]) => {
                            const Icon = contactTypeIcons[key as keyof typeof contactTypeIcons];
                            return (
                              <SelectItem key={key} value={key}>
                                <div className="flex items-center">
                                  <Icon className="h-4 w-4 mr-2" />
                                  {label}
                                </div>
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="contact_date" className="text-sm font-semibold text-gray-700">
                        Fecha de Contacto *
                      </Label>
                      <Input
                        id="contact_date"
                        type="date"
                        value={formData.contact_date}
                        onChange={(e) => setFormData({...formData, contact_date: e.target.value})}
                        required
                        className="h-12 border-2 border-gray-200 focus:border-blue-500 transition-colors"
                      />
                    </div>
                  </div>

                  {/* Segunda fila - Hora y próximo contacto */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="contact_time" className="text-sm font-semibold text-gray-700">
                        Hora de Contacto *
                      </Label>
                      <Input
                        id="contact_time"
                        type="time"
                        value={formData.contact_time}
                        onChange={(e) => setFormData({...formData, contact_time: e.target.value})}
                        required
                        className="h-12 border-2 border-gray-200 focus:border-blue-500 transition-colors"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="next_contact_date" className="text-sm font-semibold text-gray-700">
                        Próximo Contacto
                      </Label>
                      <Input
                        id="next_contact_date"
                        type="date"
                        value={formData.next_contact_date}
                        onChange={(e) => setFormData({...formData, next_contact_date: e.target.value})}
                        className="h-12 border-2 border-gray-200 focus:border-blue-500 transition-colors"
                      />
                    </div>
                  </div>

                  {/* Respuesta del cliente */}
                  <div className="space-y-2">
                    <Label htmlFor="client_response" className="text-sm font-semibold text-gray-700">
                      Respuesta del Cliente
                    </Label>
                    <Textarea
                      id="client_response"
                      value={formData.client_response}
                      onChange={(e) => setFormData({...formData, client_response: e.target.value})}
                      placeholder="Describe la respuesta o reacción del cliente..."
                      rows={4}
                      className="border-2 border-gray-200 focus:border-blue-500 transition-colors resize-none"
                    />
                  </div>

                  {/* Notas adicionales */}
                  <div className="space-y-2">
                    <Label htmlFor="additional_notes" className="text-sm font-semibold text-gray-700">
                      Notas Adicionales
                    </Label>
                    <Textarea
                      id="additional_notes"
                      value={formData.additional_notes}
                      onChange={(e) => setFormData({...formData, additional_notes: e.target.value})}
                      placeholder="Información adicional relevante..."
                      rows={4}
                      className="border-2 border-gray-200 focus:border-blue-500 transition-colors resize-none"
                    />
                  </div>

                  {/* Botones de acción */}
                  <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-gray-200">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setShowAddForm(false);
                        setEditingRecord(null);
                      }}
                      className="h-12 text-base font-semibold border-2 border-gray-300 hover:border-gray-400 hover:bg-gray-50 transition-all duration-200"
                    >
                      Cancelar
                    </Button>
                    <Button 
                      type="submit"
                      className="h-12 text-base font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-lg hover:shadow-xl transition-all duration-200 flex-1 sm:flex-none"
                    >
                      {editingRecord ? 'Actualizar' : 'Guardar'} Seguimiento
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {/* Historial de seguimientos */}
          <Card className="border-0 shadow-lg">
            <CardHeader className="bg-gradient-to-r from-gray-50 to-slate-50 border-b border-gray-100">
              <CardTitle className="flex items-center text-lg font-bold text-gray-800">
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center mr-3">
                  <Clock className="h-4 w-4 text-blue-600" />
                </div>
                Historial de Seguimientos
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              {loading ? (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-200 border-t-blue-600 mx-auto"></div>
                  <p className="text-gray-600 mt-4 font-medium">Cargando historial...</p>
                </div>
              ) : trackingRecords.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Clock className="h-10 w-10 text-gray-400" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-700 mb-2">Sin seguimientos</h3>
                  <p className="text-gray-500">No hay registros de seguimiento para este préstamo</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {trackingRecords.map((record) => {
                    const Icon = contactTypeIcons[record.contact_type];
                    const colorClass = contactTypeColors[record.contact_type];
                    
                    return (
                      <div key={record.id} className="bg-white border border-gray-200 rounded-xl p-6 hover:shadow-md transition-all duration-200">
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                          <div className="flex-1">
                            {/* Header del registro */}
                            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                                  <Icon className="h-5 w-5 text-gray-600" />
                                </div>
                                <Badge className={`${colorClass} px-3 py-1 text-sm font-semibold`}>
                                  {contactTypeLabels[record.contact_type]}
                                </Badge>
                              </div>
                              <div className="text-sm text-gray-500 font-medium">
                                {formatDateTimeWithOffset(`${record.contact_date}T${record.contact_time}`, 'dd MMM yyyy, hh:mm a')}
                              </div>
                            </div>

                            {/* Contenido del registro */}
                            <div className="space-y-4">
                              {record.client_response && (
                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                  <p className="text-sm font-semibold text-blue-800 mb-2">Respuesta del Cliente:</p>
                                  <p className="text-sm text-blue-700 leading-relaxed">{record.client_response}</p>
                                </div>
                              )}

                              {record.additional_notes && (
                                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                                  <p className="text-sm font-semibold text-gray-800 mb-2">Notas Adicionales:</p>
                                  <p className="text-sm text-gray-700 leading-relaxed">{record.additional_notes}</p>
                                </div>
                              )}

                              {record.next_contact_date && (
                                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                                  <div className="flex items-center gap-2">
                                    <Calendar className="h-4 w-4 text-orange-600" />
                                    <span className="text-sm font-semibold text-orange-800">
                                      Próximo contacto: {new Date(record.next_contact_date).toLocaleDateString()}
                                    </span>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Botones de acción */}
                          <div className="flex gap-2 sm:flex-col">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEdit(record)}
                              className="h-10 w-10 p-0 border-2 border-blue-200 hover:border-blue-300 hover:bg-blue-50 transition-all duration-200"
                            >
                              <Edit className="h-4 w-4 text-blue-600" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDelete(record.id)}
                              className="h-10 w-10 p-0 border-2 border-red-200 hover:border-red-300 hover:bg-red-50 transition-all duration-200"
                            >
                              <Trash2 className="h-4 w-4 text-red-600" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
};
