/*
  # Actualización Comprehensiva de Permisos de Empleados
  
  Esta migración documenta la estructura completa de permisos del sistema
  incluyendo todos los módulos y funcionalidades disponibles.
  
  Los permisos se almacenan en el campo JSONB 'permissions' de la tabla 'employees',
  por lo que esta migración es principalmente documentativa.
  
  Estructura de permisos actualizada:
  - Préstamos (loans.*)
  - Clientes (clients.*)
  - Pagos (payments.*)
  - Inventario (inventory.*)
  - Punto de Venta (pos.*)
  - Compra-Venta/Casa de Empeño (pawnshop.*)
  - Carteras (portfolios.*)
  - Solicitudes (requests.*)
  - Acuerdos de Pago (agreements.*)
  - Documentos (documents.*)
  - Rutas y Cobranza (routes.*)
  - Reportes (reports.*)
  - Finanzas (expenses.*)
  - Personal y Turnos (shifts.*)
  - Agenda y Citas (appointments.*)
  - Configuración (settings.*, employees.*)
*/

-- Comentario en la tabla employees sobre la estructura de permisos
COMMENT ON COLUMN public.employees.permissions IS 'JSONB object containing employee permissions. 
Structure: { "permission_key": true/false }
Categories:
- Préstamos: loans.view, loans.create, loans.edit, loans.delete
- Clientes: clients.view, clients.create, clients.edit, clients.delete
- Pagos: payments.view, payments.create, payments.edit, payments.delete
- Inventario: inventory.view, inventory.products.*, inventory.movements.view, inventory.sales.view, inventory.reports.view
- Punto de Venta: pos.view, pos.create, pos.edit, pos.delete, pos.receipt.print, pos.receipt.download
- Compra-Venta: pawnshop.view, pawnshop.create, pawnshop.edit, pawnshop.delete, pawnshop.payments.*, pawnshop.redeem, pawnshop.forfeit, pawnshop.reports.view, pawnshop.receipt.print
- Carteras: portfolios.view, portfolios.create, portfolios.edit, portfolios.delete
- Solicitudes: requests.view, requests.create, requests.edit, requests.approve, requests.reject
- Acuerdos: agreements.view, agreements.create, agreements.edit, agreements.delete
- Documentos: documents.view, documents.create, documents.edit, documents.delete, documents.download
- Rutas: routes.view, routes.create, routes.edit, routes.delete, routes.map.view
- Reportes: reports.view, reports.loans, reports.financial, reports.export, reports.inventory, reports.pawnshop
- Finanzas: expenses.view, expenses.create, expenses.edit, expenses.delete
- Personal: shifts.view, shifts.create, shifts.edit, shifts.delete
- Agenda: appointments.view, appointments.create, appointments.edit, appointments.delete
- Configuración: settings.view, settings.edit, settings.banks, settings.utilities, employees.manage';

-- No hay cambios estructurales necesarios ya que permissions es JSONB
-- Los permisos se gestionan desde la aplicación frontend

