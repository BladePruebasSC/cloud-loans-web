import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertCircle } from 'lucide-react';

export interface GuaranteeFormData {
  guarantee_type: 'vehicle' | 'building' | 'other';
  
  // Campos comunes
  status: 'available' | 'in_use' | 'sold' | 'lost';
  process: 'in_warehouse' | 'with_client' | 'sold' | 'other';
  holder: string;
  notes: string;
  
  // Campos para vehículos
  vehicle_type: string;
  brand: string;
  model: string;
  year: number | null;
  automotive_power: string;
  chassis: string;
  engine_series: string;
  doors: number | null;
  cylinders: number | null;
  color: string;
  license_plate: string;
  
  // Campos para edificaciones
  building_type: string;
  address: string;
  square_meters: number | null;
  construction_year: number | null;
  property_type: string;
  property_number: string;
  
  // Campos para otros
  other_type: string;
  other_description: string;
  
  // Precio de venta
  sale_price: number | null;
  sale_date: string;
  sale_down_payment: number | null;
  sale_minimum_down_payment: number | null;
  
  // Precio de compra
  purchase_date: string;
  purchase_cost: number | null;
  purchase_invoice_url: string;
  supplier_id: string;
}

interface GuaranteeFormProps {
  formData: Partial<GuaranteeFormData>;
  onChange: (data: Partial<GuaranteeFormData>) => void;
}

export const GuaranteeForm: React.FC<GuaranteeFormProps> = ({ formData, onChange }) => {
  const [activeTab, setActiveTab] = useState<'vehicle' | 'building' | 'other'>(
    (formData.guarantee_type as any) || 'vehicle'
  );

  const updateField = (field: keyof GuaranteeFormData, value: any) => {
    onChange({ ...formData, [field]: value });
  };

  return (
    <Card className="mt-4">
      <CardHeader className="bg-blue-500 text-white">
        <CardTitle className="text-base sm:text-lg">INFORMACIÓN DE GARANTÍA</CardTitle>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-center gap-2 text-yellow-800">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm font-medium">Son necesarios los campos marcados con *</span>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={(value) => {
          setActiveTab(value as any);
          updateField('guarantee_type', value);
        }}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="vehicle">Vehículos</TabsTrigger>
            <TabsTrigger value="building">Edificaciones</TabsTrigger>
            <TabsTrigger value="other">Otros</TabsTrigger>
          </TabsList>

          {/* Tab de Vehículos */}
          <TabsContent value="vehicle" className="space-y-4 mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="vehicle_type">Tipo</Label>
                <Select
                  value={formData.vehicle_type || ''}
                  onValueChange={(value) => updateField('vehicle_type', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="JEEP">JEEP</SelectItem>
                    <SelectItem value="CAR">CARRO</SelectItem>
                    <SelectItem value="MOTORCYCLE">MOTOCICLETA</SelectItem>
                    <SelectItem value="TRUCK">CAMIONETA</SelectItem>
                    <SelectItem value="OTHER">OTRO</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="warehouse">Almacén</Label>
                <Select
                  value={formData.process || 'in_warehouse'}
                  onValueChange={(value) => updateField('process', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="* SELECCIONAR" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="in_warehouse">En almacén</SelectItem>
                    <SelectItem value="with_client">Con cliente</SelectItem>
                    <SelectItem value="sold">Vendido</SelectItem>
                    <SelectItem value="other">Otro</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="brand">Marca *</Label>
                <Input
                  id="brand"
                  value={formData.brand || ''}
                  onChange={(e) => updateField('brand', e.target.value)}
                  placeholder="Marca del vehículo"
                />
              </div>

              <div>
                <Label htmlFor="model">Modelo</Label>
                <Input
                  id="model"
                  value={formData.model || ''}
                  onChange={(e) => updateField('model', e.target.value)}
                  placeholder="Modelo del vehículo"
                />
              </div>

              <div>
                <Label htmlFor="year">Año *</Label>
                <Input
                  id="year"
                  type="number"
                  value={formData.year || ''}
                  onChange={(e) => updateField('year', e.target.value ? parseInt(e.target.value) : null)}
                  placeholder="2025"
                />
              </div>

              <div>
                <Label htmlFor="automotive_power">Fuerza automotriz</Label>
                <Select
                  value={formData.automotive_power || ''}
                  onValueChange={(value) => updateField('automotive_power', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gasoline">Gasolina</SelectItem>
                    <SelectItem value="diesel">Diésel</SelectItem>
                    <SelectItem value="electric">Eléctrico</SelectItem>
                    <SelectItem value="hybrid">Híbrido</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="chassis">Chasis *</Label>
                <Input
                  id="chassis"
                  value={formData.chassis || ''}
                  onChange={(e) => updateField('chassis', e.target.value)}
                  placeholder="Número de chasis"
                  required
                />
              </div>

              <div>
                <Label htmlFor="engine_series">Serie motor</Label>
                <Input
                  id="engine_series"
                  value={formData.engine_series || ''}
                  onChange={(e) => updateField('engine_series', e.target.value)}
                  placeholder="Serie del motor"
                />
              </div>

              <div>
                <Label htmlFor="doors">Puertas</Label>
                <Select
                  value={formData.doors?.toString() || ''}
                  onValueChange={(value) => updateField('doors', value ? parseInt(value) : null)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2">2</SelectItem>
                    <SelectItem value="4">4</SelectItem>
                    <SelectItem value="5">5</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="cylinders">Cilindros</Label>
                <Select
                  value={formData.cylinders?.toString() || ''}
                  onValueChange={(value) => updateField('cylinders', value ? parseInt(value) : null)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="3">3</SelectItem>
                    <SelectItem value="4">4</SelectItem>
                    <SelectItem value="6">6</SelectItem>
                    <SelectItem value="8">8</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="color">Color</Label>
                <Input
                  id="color"
                  value={formData.color || ''}
                  onChange={(e) => updateField('color', e.target.value)}
                  placeholder="Color del vehículo"
                />
              </div>

              <div>
                <Label htmlFor="license_plate">Número de placa *</Label>
                <Input
                  id="license_plate"
                  value={formData.license_plate || ''}
                  onChange={(e) => updateField('license_plate', e.target.value)}
                  placeholder="Número de placa"
                  required
                />
              </div>
            </div>

            <div>
              <Label htmlFor="status">Estado</Label>
              <Select
                value={formData.status || 'available'}
                onValueChange={(value) => updateField('status', value as any)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="available">Nuevo - Disponible</SelectItem>
                  <SelectItem value="in_use">Usado - En uso</SelectItem>
                  <SelectItem value="sold">Vendido</SelectItem>
                  <SelectItem value="lost">Perdido</SelectItem>
                </SelectContent>
              </Select>
              {formData.status === 'available' && (
                <p className="text-sm text-gray-600 mt-1">Garantía en uso y disponible</p>
              )}
            </div>

            <div>
              <Label htmlFor="holder">Titular</Label>
              <Input
                id="holder"
                value={formData.holder || ''}
                onChange={(e) => updateField('holder', e.target.value)}
                placeholder="Nombre del titular"
              />
            </div>
          </TabsContent>

          {/* Tab de Edificaciones */}
          <TabsContent value="building" className="space-y-4 mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="building_type">Tipo de Edificación</Label>
                <Select
                  value={formData.building_type || ''}
                  onValueChange={(value) => updateField('building_type', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="house">Casa</SelectItem>
                    <SelectItem value="apartment">Apartamento</SelectItem>
                    <SelectItem value="land">Terreno</SelectItem>
                    <SelectItem value="commercial">Comercial</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="property_type">Tipo de Propiedad</Label>
                <Select
                  value={formData.property_type || ''}
                  onValueChange={(value) => updateField('property_type', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CASA">CASA</SelectItem>
                    <SelectItem value="APARTAMENTO">APARTAMENTO</SelectItem>
                    <SelectItem value="TERRENO">TERRENO</SelectItem>
                    <SelectItem value="COMERCIAL">COMERCIAL</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="md:col-span-2">
                <Label htmlFor="address">Dirección</Label>
                <Input
                  id="address"
                  value={formData.address || ''}
                  onChange={(e) => updateField('address', e.target.value)}
                  placeholder="Dirección completa"
                />
              </div>

              <div>
                <Label htmlFor="property_number">Número de Propiedad</Label>
                <Input
                  id="property_number"
                  value={formData.property_number || ''}
                  onChange={(e) => updateField('property_number', e.target.value)}
                  placeholder="Número de propiedad"
                />
              </div>

              <div>
                <Label htmlFor="square_meters">Metros Cuadrados</Label>
                <Input
                  id="square_meters"
                  type="number"
                  value={formData.square_meters || ''}
                  onChange={(e) => updateField('square_meters', e.target.value ? parseFloat(e.target.value) : null)}
                  placeholder="Metros cuadrados"
                />
              </div>

              <div>
                <Label htmlFor="construction_year">Año de Construcción</Label>
                <Input
                  id="construction_year"
                  type="number"
                  value={formData.construction_year || ''}
                  onChange={(e) => updateField('construction_year', e.target.value ? parseInt(e.target.value) : null)}
                  placeholder="Año"
                />
              </div>
            </div>
          </TabsContent>

          {/* Tab de Otros */}
          <TabsContent value="other" className="space-y-4 mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="other_type">Tipo *</Label>
                <Input
                  id="other_type"
                  value={formData.other_type || ''}
                  onChange={(e) => updateField('other_type', e.target.value)}
                  placeholder="Tipo de garantía"
                  required
                />
              </div>

              <div className="md:col-span-2">
                <Label htmlFor="other_description">Descripción</Label>
                <Textarea
                  id="other_description"
                  value={formData.other_description || ''}
                  onChange={(e) => updateField('other_description', e.target.value)}
                  placeholder="Descripción detallada de la garantía"
                  rows={4}
                />
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {/* Precio de Venta */}
        <div className="mt-6 pt-6 border-t">
          <h3 className="text-lg font-semibold mb-4">PRECIO DE VENTA</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="sale_price">Precio de venta</Label>
              <Input
                id="sale_price"
                type="number"
                step="0.01"
                value={formData.sale_price || ''}
                onChange={(e) => updateField('sale_price', e.target.value ? parseFloat(e.target.value) : null)}
                placeholder="0.00"
              />
            </div>

            <div>
              <Label htmlFor="sale_date">Fecha</Label>
              <Input
                id="sale_date"
                type="date"
                value={formData.sale_date || ''}
                onChange={(e) => updateField('sale_date', e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="sale_down_payment">Inicial</Label>
              <Input
                id="sale_down_payment"
                type="number"
                step="0.01"
                value={formData.sale_down_payment || ''}
                onChange={(e) => updateField('sale_down_payment', e.target.value ? parseFloat(e.target.value) : null)}
                placeholder="0.00"
              />
            </div>

            <div>
              <Label htmlFor="sale_minimum_down_payment">Inicial Mínimo</Label>
              <Input
                id="sale_minimum_down_payment"
                type="number"
                step="0.01"
                value={formData.sale_minimum_down_payment || ''}
                onChange={(e) => updateField('sale_minimum_down_payment', e.target.value ? parseFloat(e.target.value) : null)}
                placeholder="0.00"
              />
            </div>
          </div>
        </div>

        {/* Precio de Compra */}
        <div className="mt-6 pt-6 border-t">
          <h3 className="text-lg font-semibold mb-4">PRECIO DE COMPRA</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="purchase_date">Fecha</Label>
              <Input
                id="purchase_date"
                type="date"
                value={formData.purchase_date || ''}
                onChange={(e) => updateField('purchase_date', e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="purchase_cost">Costo</Label>
              <Input
                id="purchase_cost"
                type="number"
                step="0.01"
                value={formData.purchase_cost || ''}
                onChange={(e) => updateField('purchase_cost', e.target.value ? parseFloat(e.target.value) : null)}
                placeholder="0.00"
              />
            </div>

            <div className="md:col-span-2">
              <Label htmlFor="purchase_invoice">Factura</Label>
              <Input
                id="purchase_invoice"
                type="file"
                onChange={(e) => {
                  // Aquí se manejaría la subida del archivo
                  // Por ahora solo guardamos la URL si se proporciona
                }}
              />
            </div>

            <div>
              <Label htmlFor="supplier">Proveedor</Label>
              <Select
                value={formData.supplier_id || ''}
                onValueChange={(value) => updateField('supplier_id', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="SELECCIONAR" />
                </SelectTrigger>
                <SelectContent>
                  {/* Aquí se cargarían los proveedores desde la base de datos */}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Nota de la garantía */}
        <div className="mt-6 pt-6 border-t">
          <Label htmlFor="guarantee_notes">Nota de la garantía</Label>
          <Textarea
            id="guarantee_notes"
            value={formData.notes || ''}
            onChange={(e) => updateField('notes', e.target.value)}
            placeholder="Observaciones adicionales sobre la garantía..."
            rows={4}
          />
        </div>
      </CardContent>
    </Card>
  );
};

