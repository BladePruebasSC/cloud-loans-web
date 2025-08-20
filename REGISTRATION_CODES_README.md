# Sistema de Códigos de Registro para Empresas

## Descripción

Este sistema implementa un mecanismo de control de acceso donde las empresas solo pueden registrarse en la plataforma usando códigos de registro proporcionados por el administrador.

## Características

### 🔐 Control de Acceso
- Solo los administradores pueden generar códigos de registro
- Cada código es único y solo puede ser usado una vez
- Los códigos pueden tener fechas de expiración opcionales
- Validación automática de códigos durante el registro

### 📋 Funcionalidades del Administrador
- Generar códigos de registro únicos
- Asignar nombres de empresa a cada código
- Establecer fechas de expiración opcionales
- Ver todos los códigos generados y su estado
- Copiar códigos al portapapeles
- Seguimiento de códigos usados

### 🏢 Proceso de Registro y Acceso
- Las empresas se registran normalmente sin código
- En su primer login, deben proporcionar el código de registro
- El sistema valida automáticamente el código
- Si el código es válido, se marca como usado y pueden acceder

## Instalación y Configuración

### 1. Ejecutar las Migraciones

```bash
# Ejecutar las migraciones de Supabase
supabase db push
```

### 2. Configurar el Administrador

El sistema está configurado con acceso directo al panel de códigos. Solo tú y tu equipo conocen la combinación de teclas.

### 3. Generar Códigos de Registro

1. En la página de login, presiona **Ctrl + Alt + A** para acceder directamente al panel de códigos
2. Se abrirá un panel independiente donde puedes:
   - Generar nuevos códigos
   - Ver todos los códigos existentes
   - Copiar códigos al portapapeles
   - Gestionar fechas de expiración
3. Completa el formulario con:
   - Nombre de la empresa
   - Fecha de expiración (opcional)
4. Haz clic en "Generar Código"

## Uso del Sistema

### Para Administradores

#### Acceso Directo al Panel de Códigos
1. En la página de login, presiona **Ctrl + Alt + A**
2. Se abrirá un panel independiente y completo para gestionar códigos
3. No necesitas iniciar sesión ni escribir códigos adicionales
4. El panel funciona completamente sin autenticación

#### Generar un Nuevo Código
1. Accede al panel de códigos usando **Ctrl + Alt + A**
2. En el formulario "Generar Nuevo Código":
   - **Nombre de la Empresa**: Nombre de la empresa que usará el código
   - **Fecha de Expiración**: Opcional, si no se establece el código no expira
3. Haz clic en "Generar Código"
4. El código aparecerá en la lista y podrás copiarlo con un clic
5. Comparte el código con la empresa

#### Gestionar Códigos Existentes
- **Ver todos los códigos**: Lista completa con estado y fechas
- **Copiar código**: Botón de copia para cada código disponible
- **Seguimiento**: Ver qué códigos han sido usados y cuándo
- **Filtros visuales**: Códigos disponibles vs usados claramente marcados
- **Información detallada**: Fechas de creación, expiración y uso

### Para Empresas

#### Registro
1. Ve a la página de registro
2. Completa todos los campos del formulario
3. Haz clic en "Crear Cuenta"

#### Primer Acceso
1. Ve a la página de login
2. Completa tu email y contraseña
3. **Código de Registro**: Ingresa el código proporcionado por el administrador
4. Haz clic en "Iniciar Sesión"

#### Validaciones
- El código debe ser válido y no haber sido usado
- Si el código tiene fecha de expiración, debe estar vigente
- Solo se puede usar un código por cuenta
- El código solo es necesario en el primer acceso

## Estructura de la Base de Datos

### Tabla `registration_codes`
```sql
CREATE TABLE public.registration_codes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  company_name TEXT NOT NULL,
  is_used BOOLEAN DEFAULT FALSE,
  used_by UUID REFERENCES auth.users(id),
  used_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
```

### Funciones de Base de Datos

#### `generate_registration_code()`
Genera códigos únicos de 8 caracteres alfanuméricos.

#### `validate_and_use_registration_code(p_code TEXT, p_user_id UUID)`
Valida y marca un código como usado.

## Seguridad

### Acceso Directo al Panel de Códigos
- **Activación**: Presiona **Ctrl + Alt + A** en la página de login
- **Acceso inmediato**: Redirección directa al panel de códigos
- **Sin autenticación**: No requiere login ni códigos adicionales
- **Panel completo**: Acceso total a todas las funcionalidades de códigos

### Row Level Security (RLS)
- Solo administradores pueden ver todos los códigos
- Solo administradores pueden crear y actualizar códigos
- Cualquier usuario puede validar códigos (solo lectura)

### Validaciones
- Códigos únicos generados automáticamente
- Verificación de expiración
- Control de uso único
- Validación de permisos de administrador

### Recomendaciones de Seguridad
- **No compartir la combinación de teclas** con usuarios no autorizados
- **Cambiar la combinación Ctrl+Alt+A** en el código fuente si es necesario
- **Monitorear el uso** del panel de códigos
- **Limpiar códigos expirados** periódicamente

## Códigos de Ejemplo para Testing

Se han insertado los siguientes códigos de ejemplo:
- `ABC12345` - Empresa Ejemplo 1 (expira en 30 días)
- `DEF67890` - Empresa Ejemplo 2 (expira en 60 días)
- `GHI11111` - Empresa Ejemplo 3 (sin expiración)
- `JKL22222` - Empresa Ejemplo 4 (expira en 90 días)
- `MNO33333` - Empresa Ejemplo 5 (sin expiración)

**Nota**: Estos códigos son solo para desarrollo y testing.

## Troubleshooting

### Error: "Código de registro inválido"
- Verifica que el código esté escrito correctamente
- Asegúrate de que el código no haya sido usado
- Verifica que el código no haya expirado

### Error: "No tienes permisos para acceder"
- Solo el administrador puede acceder al módulo de códigos
- Verifica que estés usando la cuenta correcta

### Error al generar código
- Verifica que el nombre de la empresa esté completado
- Asegúrate de tener permisos de administrador

## Mantenimiento

### Limpieza de Códigos Expirados
Los códigos expirados se pueden limpiar periódicamente con:

```sql
DELETE FROM public.registration_codes 
WHERE expires_at < NOW() AND is_used = FALSE;
```

### Auditoría
La tabla mantiene un registro completo de:
- Cuándo se creó cada código
- Quién lo usó y cuándo
- Fechas de expiración
- Estado actual del código
