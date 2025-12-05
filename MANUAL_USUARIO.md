# Manual de Usuario - ProPréstamos

## 📋 Índice

1. [Introducción](#introducción)
2. [Acceso al Sistema](#acceso-al-sistema)
3. [Dashboard](#dashboard)
4. [Módulos Principales](#módulos-principales)
   - [Clientes](#clientes)
   - [Préstamos](#préstamos)
   - [Cobro Rápido](#cobro-rápido)
   - [Carteras](#carteras)
   - [Inventario](#inventario)
   - [Punto de Venta](#punto-de-venta)
   - [Compra/Venta y Empeños](#compraventa-y-empeños)
   - [Documentos](#documentos)
   - [Solicitudes](#solicitudes)
   - [Bancos](#bancos)
   - [Utilidades](#utilidades)
   - [Turnos](#turnos)
   - [Mapa](#mapa)
   - [Acuerdos de Pago](#acuerdos-de-pago)
   - [Reportes](#reportes)
   - [Mi Empresa](#mi-empresa)
5. [Permisos y Roles](#permisos-y-roles)
6. [Preguntas Frecuentes](#preguntas-frecuentes)

---

## Introducción

**ProPréstamos** es un sistema integral de gestión para empresas de préstamos que permite administrar clientes, préstamos, inventario, ventas, empeños y más, todo desde una plataforma web moderna y responsive.

### Características Principales

- ✅ Gestión completa de clientes y préstamos
- ✅ Sistema de cobros y pagos automatizado
- ✅ Control de inventario y punto de venta
- ✅ Módulo de empeños y compra/venta
- ✅ Reportes y estadísticas en tiempo real
- ✅ Sistema de permisos y roles
- ✅ Acceso móvil optimizado

---

## Acceso al Sistema

### Registro

1. Visita la página de registro
2. Completa el formulario con tus datos:
   - Nombre completo
   - Email
   - Contraseña
   - Código de registro (si es requerido)
3. Haz clic en "Registrarse"
4. Verifica tu email si es necesario

### Inicio de Sesión

1. Ingresa tu email y contraseña
2. Haz clic en "Iniciar Sesión"
3. Serás redirigido al Dashboard principal

### Recuperación de Contraseña

Si olvidaste tu contraseña, contacta al administrador del sistema.

---

## Dashboard

El Dashboard es la pantalla principal que muestra un resumen de tu negocio:

- **Métricas principales**: Préstamos activos, clientes, ingresos
- **Gráficos**: Visualización de tendencias y estadísticas
- **Accesos rápidos**: Enlaces directos a módulos frecuentes
- **Notificaciones**: Alertas importantes y recordatorios

---

## Módulos Principales

### Clientes

**Ubicación**: Menú lateral → Clientes

#### Funcionalidades

- **Ver lista de clientes**: Visualiza todos los clientes registrados
- **Buscar clientes**: Usa la barra de búsqueda para encontrar por nombre o cédula
- **Crear nuevo cliente**: 
  1. Haz clic en "Nuevo Cliente"
  2. Completa el formulario:
     - Nombre completo
     - Cédula/DNI
     - Teléfono
     - Email (opcional)
     - Dirección (opcional)
  3. Guarda los datos

- **Editar cliente**: 
  1. Busca el cliente en la lista
  2. Haz clic en el botón de editar
  3. Modifica los datos necesarios
  4. Guarda los cambios

- **Ver historial**: Accede al historial completo de préstamos y transacciones del cliente

#### Filtros Disponibles

- Por estado (activo, inactivo)
- Por nombre
- Por cédula
- Por fecha de registro

---

### Préstamos

**Ubicación**: Menú lateral → Préstamos

#### Crear un Nuevo Préstamo

1. Haz clic en "Nuevo Préstamo"
2. Selecciona el cliente (o créalo si no existe)
3. Completa los datos del préstamo:
   - **Monto del préstamo**: Cantidad a prestar
   - **Tasa de interés**: Porcentaje mensual
   - **Plazo**: Número de meses
   - **Frecuencia de pago**: Diario, semanal, quincenal, mensual
   - **Fecha de inicio**: Cuándo inicia el préstamo
   - **Tipo de amortización**: Simple, francés, alemán, americano

4. **Configuración de Mora** (opcional):
   - Activa/desactiva mora
   - Tasa de mora (%)
   - Días de gracia
   - Tipo de cálculo (diario, mensual, compuesto)
   - Mora máxima

5. Revisa el resumen y confirma

#### Ver Préstamos

- **Lista de préstamos**: Visualiza todos los préstamos con filtros
- **Estados**: Activo, Vencido, Pagado, Cancelado
- **Búsqueda**: Por cliente, monto, fecha

#### Registrar un Pago

1. Selecciona el préstamo de la lista
2. Haz clic en "Registrar Pago"
3. Completa el formulario:
   - **Monto de la cuota**: Cantidad a pagar
   - **Pago de mora** (si aplica): Cantidad opcional
   - **Método de pago**: Efectivo, transferencia, tarjeta, cheque, en línea
   - **Número de referencia** (opcional)
   - **Notas** (opcional)
4. Confirma el pago

**Nota**: En dispositivos móviles, después de registrar un pago serás redirigido automáticamente a "Cobro Rápido".

#### Actualizar Préstamo

1. Selecciona el préstamo
2. Haz clic en "Actualizar"
3. Puedes modificar:
   - Monto
   - Tasa de interés
   - Plazo
   - Frecuencia de pago
   - Agregar cargos adicionales
   - Extender plazo

#### Ver Detalles del Préstamo

- **Información general**: Monto, tasa, plazo, estado
- **Tabla de amortización**: Desglose de cuotas
- **Historial de pagos**: Todos los pagos registrados
- **Estado de cuenta**: Balance actual y pendiente
- **Información de mora**: Cálculo y desglose de mora

---

### Cobro Rápido

**Ubicación**: Menú lateral → Cobro Rápido

**⚠️ Solo disponible en dispositivos móviles**

#### Descripción

Módulo optimizado para cobradores que trabajan en campo. Permite realizar cobros rápidos desde teléfonos móviles con una interfaz tipo app.

#### Cómo Usar

1. **Buscar Préstamo**:
   - Ingresa el nombre o cédula del cliente en la barra de búsqueda
   - Selecciona el préstamo de la lista

2. **Registrar Cobro**:
   - El sistema pre-llena el monto de la cuota
   - **Opciones rápidas**:
     - **Cuota Completa**: Paga el monto completo de la cuota
     - **50%**: Paga la mitad de la cuota
     - **25%**: Paga un cuarto de la cuota
   - O ingresa un monto personalizado

3. **Pago de Mora** (si aplica):
   - Ingresa el monto de mora a pagar
   - O haz clic en "Pagar Toda" para pagar toda la mora pendiente

4. **Seleccionar Método de Pago**:
   - Efectivo
   - Transferencia
   - Tarjeta
   - Cheque
   - En línea

5. **Confirmar Cobro**:
   - Revisa el total a cobrar
   - Haz clic en "Registrar Cobro"

6. **Imprimir Recibo**:
   - Después del cobro, se mostrará un modal
   - Haz clic en "Imprimir Recibo" para generar el comprobante
   - El recibo está optimizado para impresoras térmicas (80mm)

#### Características Especiales

- ✅ Búsqueda instantánea de préstamos
- ✅ Botones grandes y táctiles
- ✅ Diseño optimizado para móviles
- ✅ Impresión automática de recibos
- ✅ Estadísticas rápidas (préstamos activos, total a cobrar)

---

### Carteras

**Ubicación**: Menú lateral → Carteras

#### Funcionalidades

- **Crear cartera**: Agrupa préstamos por categoría o tipo
- **Asignar préstamos**: Asocia préstamos a carteras específicas
- **Ver estadísticas**: Métricas por cartera
- **Filtrar préstamos**: Por cartera asignada

#### Uso

1. Crea una nueva cartera con nombre y descripción
2. Al crear un préstamo, selecciona la cartera
3. Visualiza todos los préstamos agrupados por cartera

---

### Inventario

**Ubicación**: Menú lateral → Inventario

#### Funcionalidades

- **Agregar productos**: 
  1. Haz clic en "Nuevo Producto"
  2. Completa:
     - Nombre del producto
     - Código de barras (opcional)
     - Categoría
     - Precio de compra
     - Precio de venta
     - Stock inicial
     - Descripción
  3. Guarda el producto

- **Gestionar stock**: 
  - Ver stock actual
  - Agregar/restar inventario
  - Registrar movimientos

- **Buscar productos**: Por nombre, código o categoría

- **Editar productos**: Modifica precios, stock y descripción

- **Eliminar productos**: Elimina productos que ya no se usan

---

### Punto de Venta

**Ubicación**: Menú lateral → Punto de Venta

#### Realizar una Venta

1. **Agregar productos al carrito**:
   - Busca el producto por nombre o código de barras
   - Haz clic en el producto para agregarlo
   - Ajusta la cantidad si es necesario

2. **Aplicar descuentos** (opcional):
   - Ingresa un descuento en porcentaje o monto fijo

3. **Seleccionar método de pago**:
   - Efectivo
   - Tarjeta
   - Transferencia
   - Mixto (múltiples métodos)

4. **Calcular cambio** (si es efectivo):
   - Ingresa el monto recibido
   - El sistema calcula el cambio automáticamente

5. **Completar venta**:
   - Revisa el total
   - Agrega notas si es necesario
   - Haz clic en "Completar Venta"

6. **Imprimir ticket**:
   - El sistema genera un ticket automáticamente
   - Puedes imprimirlo o enviarlo por email

#### Funciones Adicionales

- **Historial de ventas**: Ver todas las ventas realizadas
- **Filtrar por fecha**: Busca ventas en un rango de fechas
- **Anular venta**: Cancela una venta (requiere permisos)

---

### Compra/Venta y Empeños

**Ubicación**: Menú lateral → Compra/Venta

#### Registrar un Empeño

1. Haz clic en "Nuevo Empeño"
2. Selecciona el cliente (o créalo)
3. Completa los datos del artículo:
   - Nombre del artículo
   - Descripción
   - Valor estimado
   - Monto del préstamo
   - Tasa de interés
   - Fecha de vencimiento
4. Guarda el empeño

#### Registrar un Pago de Empeño

1. Selecciona el empeño de la lista
2. Haz clic en "Registrar Pago"
3. Elige el tipo de pago:
   - **Pago de interés**: Solo intereses
   - **Pago parcial**: Parte del capital
   - **Pago completo**: Todo el capital e intereses
4. Ingresa el monto y confirma

#### Redimir Empeño

1. Selecciona el empeño
2. Haz clic en "Redimir"
3. Confirma el pago completo
4. El artículo vuelve al cliente

#### Liquidar Empeño

Si el cliente no redime el empeño:
1. Selecciona el empeño vencido
2. Haz clic en "Liquidar"
3. El artículo pasa a ser propiedad de la empresa

---

### Documentos

**Ubicación**: Menú lateral → Documentos

#### Funcionalidades

- **Subir documentos**: 
  1. Haz clic en "Subir Documento"
  2. Selecciona el archivo
  3. Asocia el documento a un cliente o préstamo
  4. Agrega una descripción
  5. Guarda

- **Ver documentos**: Lista de todos los documentos
- **Descargar documentos**: Haz clic en el documento para descargarlo
- **Eliminar documentos**: Elimina documentos que ya no se necesitan

---

### Solicitudes

**Ubicación**: Menú lateral → Solicitudes

#### Funcionalidades

- **Ver solicitudes**: Lista de todas las solicitudes de préstamo
- **Aprobar/Rechazar**: Gestiona las solicitudes pendientes
- **Filtrar**: Por estado, fecha, cliente

#### Proceso

1. El cliente envía una solicitud
2. Revisa la información
3. Aprueba o rechaza la solicitud
4. Si se aprueba, puedes crear el préstamo directamente

---

### Bancos

**Ubicación**: Menú lateral → Bancos

#### Funcionalidades

- **Agregar banco**: 
  1. Haz clic en "Nuevo Banco"
  2. Completa:
     - Nombre del banco
     - Número de cuenta
     - Tipo de cuenta
     - Balance inicial
  3. Guarda

- **Registrar movimientos**: 
  - Depósitos
  - Retiros
  - Transferencias

- **Ver balance**: Balance actual de cada cuenta
- **Conciliación**: Concilia movimientos bancarios

---

### Utilidades

**Ubicación**: Menú lateral → Utilidades

#### Funcionalidades

- **Registrar gastos**: 
  1. Haz clic en "Nuevo Gasto"
  2. Completa:
     - Categoría
     - Descripción
     - Monto
     - Fecha
     - Comprobante (opcional)
  3. Guarda

- **Ver gastos**: Lista de todos los gastos
- **Filtrar por categoría**: Organiza gastos por tipo
- **Reportes de gastos**: Estadísticas y gráficos

---

### Turnos

**Ubicación**: Menú lateral → Turnos

#### Funcionalidades

- **Crear turno**: 
  1. Haz clic en "Nuevo Turno"
  2. Selecciona:
     - Empleado
     - Fecha y hora de inicio
     - Fecha y hora de fin
     - Descripción
  3. Guarda

- **Ver turnos**: Calendario y lista de turnos
- **Editar turnos**: Modifica turnos existentes
- **Eliminar turnos**: Cancela turnos

---

### Mapa

**Ubicación**: Menú lateral → Mapa

#### Funcionalidades

- **Ver ubicaciones**: Mapa interactivo con ubicaciones de clientes
- **Rutas de cobranza**: Visualiza rutas asignadas
- **Marcadores**: Ubicaciones importantes marcadas en el mapa

---

### Acuerdos de Pago

**Ubicación**: Menú lateral → Acuerdos

#### Funcionalidades

- **Crear acuerdo**: 
  1. Selecciona el préstamo
  2. Define los términos:
     - Nuevo monto de cuota
     - Nuevo plazo
     - Fecha de inicio
  3. Guarda el acuerdo

- **Ver acuerdos**: Lista de todos los acuerdos activos
- **Aprobar/Rechazar**: Gestiona acuerdos pendientes
- **Historial**: Ver acuerdos anteriores

---

### Reportes

**Ubicación**: Menú lateral → Reportes

#### Tipos de Reportes Disponibles

1. **Reporte de Préstamos**:
   - Préstamos activos
   - Préstamos vencidos
   - Préstamos pagados
   - Por rango de fechas

2. **Reporte de Pagos**:
   - Pagos del día
   - Pagos del mes
   - Pagos por método
   - Pagos por cobrador

3. **Reporte de Ventas**:
   - Ventas del día
   - Ventas del mes
   - Por producto
   - Por vendedor

4. **Reporte de Empeños**:
   - Empeños activos
   - Empeños redimidos
   - Empeños liquidados

5. **Reporte de Gastos**:
   - Gastos por categoría
   - Gastos por período
   - Comparativas

6. **Reporte de Caja**:
   - Arqueo de caja
   - Movimientos de caja
   - Conciliación

#### Cómo Generar un Reporte

1. Selecciona el tipo de reporte
2. Define los filtros:
   - Rango de fechas
   - Cliente (opcional)
   - Estado (opcional)
3. Haz clic en "Generar Reporte"
4. Descarga o imprime el reporte

---

### Mi Empresa

**Ubicación**: Menú lateral → Mi Empresa

**⚠️ Solo disponible para dueños/administradores**

#### Configuración General

1. **Datos de la Empresa**:
   - Nombre
   - RNC/NIT
   - Dirección
   - Teléfono
   - Email
   - Logo

2. **Configuración de Negocio**:
   - Moneda
   - Zona horaria
   - Formato de fecha
   - Impuestos

#### Gestión de Empleados

1. **Agregar Empleado**:
   - Nombre completo
   - Email
   - Rol (Administrador, Gerente, Cobrador, Contador, Empleado)
   - Permisos específicos
   - Contraseña temporal

2. **Editar Empleado**: Modifica datos y permisos
3. **Desactivar Empleado**: Desactiva acceso sin eliminar datos

#### Permisos

Asigna permisos específicos a cada empleado:
- Ver/crear/editar/eliminar clientes
- Ver/crear/editar/eliminar préstamos
- Registrar pagos
- Ver reportes
- Gestionar inventario
- Y más...

#### Feriados

1. **Agregar Feriado**:
   - Nombre del feriado
   - Fecha
   - Tipo (nacional, regional, local)

2. Los feriados se consideran en los cálculos de mora

#### Rutas

1. **Crear Ruta**:
   - Nombre de la ruta
   - Descripción
   - Clientes asignados
   - Cobrador asignado

2. **Asignar Clientes**: Asocia clientes a rutas específicas
3. **Ver Rutas**: Lista de todas las rutas activas

---

## Permisos y Roles

### Roles Disponibles

1. **Dueño**: Acceso completo a todo el sistema
2. **Administrador**: Acceso completo excepto configuración de empresa
3. **Gerente**: Gestión de préstamos, clientes y reportes
4. **Cobrador**: Acceso a Cobro Rápido y registro de pagos
5. **Contador**: Acceso a reportes y estados financieros
6. **Empleado**: Acceso básico según permisos asignados

### Permisos Comunes

- `clients.view` - Ver clientes
- `clients.create` - Crear clientes
- `clients.edit` - Editar clientes
- `loans.view` - Ver préstamos
- `loans.create` - Crear préstamos
- `loans.edit` - Editar préstamos
- `inventory.view` - Ver inventario
- `pos.view` - Acceso a punto de venta
- `reports.view` - Ver reportes

---

## Preguntas Frecuentes

### ¿Cómo calculo la mora de un préstamo?

La mora se calcula automáticamente según la configuración del préstamo:
- **Tipo diario**: Se calcula por cada día de atraso
- **Tipo mensual**: Se calcula por mes completo de atraso
- **Tipo compuesto**: Se calcula con interés compuesto

El sistema considera los días de gracia configurados.

### ¿Puedo hacer pagos parciales?

Sí, puedes registrar pagos parciales. El sistema:
- Aplica primero el pago al interés pendiente
- Luego aplica el resto al capital
- Mantiene un registro del estado de cada cuota

### ¿Cómo funciona el módulo Cobro Rápido?

El módulo Cobro Rápido está diseñado exclusivamente para dispositivos móviles. Permite:
- Búsqueda rápida de préstamos
- Registro de cobros con pocos clics
- Impresión automática de recibos
- Interfaz optimizada para pantallas táctiles

### ¿Puedo cambiar la tasa de interés de un préstamo después de crearlo?

Sí, puedes actualizar un préstamo y modificar la tasa de interés. Los cambios se aplicarán a las cuotas futuras.

### ¿Cómo se calculan las cuotas?

El sistema soporta varios tipos de amortización:
- **Simple**: Capital fijo + interés fijo
- **Francés**: Cuota fija mensual
- **Alemán**: Pagos decrecientes
- **Americano**: Solo intereses hasta el final

### ¿Puedo exportar reportes?

Sí, la mayoría de los reportes se pueden:
- Descargar en PDF
- Exportar a Excel
- Imprimir directamente

### ¿Qué pasa si un cliente no paga?

1. El sistema marca el préstamo como "Vencido"
2. Se calcula la mora automáticamente
3. Puedes crear un acuerdo de pago
4. O proceder con acciones legales según tu política

### ¿Cómo gestiono el inventario?

1. Agrega productos con sus precios
2. El sistema actualiza el stock automáticamente con cada venta
3. Puedes ajustar el stock manualmente
4. Visualiza alertas de productos con bajo stock

### ¿Puedo usar el sistema en múltiples dispositivos?

Sí, el sistema es completamente web y responsive. Puedes acceder desde:
- Computadoras de escritorio
- Laptops
- Tablets
- Teléfonos móviles

### ¿Cómo restablezco mi contraseña?

Contacta al administrador del sistema o al dueño de la empresa para restablecer tu contraseña.

---

## Consejos y Mejores Prácticas

### Para Cobradores

- ✅ Usa el módulo "Cobro Rápido" en tu teléfono móvil
- ✅ Imprime recibos inmediatamente después de cada cobro
- ✅ Verifica el balance antes de registrar el pago
- ✅ Usa las opciones rápidas (50%, 25%) para pagos parciales

### Para Administradores

- ✅ Revisa los reportes regularmente
- ✅ Configura correctamente los permisos de empleados
- ✅ Mantén actualizada la información de la empresa
- ✅ Revisa y aprueba acuerdos de pago

### Para Gerentes

- ✅ Monitorea los préstamos vencidos diariamente
- ✅ Revisa el dashboard cada mañana
- ✅ Genera reportes semanales y mensuales
- ✅ Supervisa las rutas de cobranza

### General

- ✅ Mantén los datos de clientes actualizados
- ✅ Registra todos los pagos inmediatamente
- ✅ Usa las notas para información importante
- ✅ Revisa regularmente el inventario

---

## Soporte

Si tienes preguntas o necesitas ayuda:

1. Revisa esta documentación
2. Contacta al administrador del sistema
3. Consulta la sección de ayuda en cada módulo

---

**Versión del Manual**: 1.0  
**Última actualización**: Enero 2025  
**Sistema**: ProPréstamos

