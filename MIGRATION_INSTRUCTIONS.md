# Instrucciones para Aplicar la Migración de Emails de Empleados

## Problemas
1. **Restricción única de email**: Actualmente hay una restricción única en la tabla `employees` que no permite que el mismo email se use en diferentes empresas. Esto causa el error:
```
duplicate key value violates unique constraint "employees_email_key"
```

2. **Error de RLS en company_settings**: Los empleados no pueden acceder a las configuraciones de su empresa debido a políticas de RLS restrictivas, causando el error:
```
new row violates row-level security policy for table "company_settings"
```

## Solución
Necesitamos aplicar las migraciones que:
1. **Eliminan la restricción única de email** y crean una restricción única compuesta (email + company_owner_id)
2. **Arreglan las políticas de RLS** para permitir que empleados accedan a configuraciones de su empresa
3. **Permiten que el mismo email exista en diferentes empresas**

## Pasos para Aplicar la Migración

### Opción 1: Dashboard de Supabase (Recomendado)

1. Ve a [https://supabase.com/dashboard/project/jabiezfpkfyzfpiswcwz/sql](https://supabase.com/dashboard/project/jabiezfpkfyzfpiswcwz/sql)

2. Copia y pega el siguiente SQL en el editor:

```sql
-- Eliminar la restricción única de email que no permite duplicados
ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_email_key;

-- Crear una restricción única compuesta que permita emails duplicados pero no en la misma empresa
-- Esto permite que un email exista en múltiples empresas, pero no duplicado en la misma empresa
ALTER TABLE public.employees 
ADD CONSTRAINT employees_email_company_unique 
UNIQUE (email, company_owner_id);

-- Crear un índice para mejorar el rendimiento de búsquedas por email
CREATE INDEX IF NOT EXISTS idx_employees_email ON public.employees(email);

-- Crear un índice para búsquedas por empresa y email
CREATE INDEX IF NOT EXISTS idx_employees_company_email ON public.employees(company_owner_id, email);
```

-- Arreglar políticas de RLS para company_settings
-- Permitir que empleados puedan acceder a configuraciones de su empresa

-- Eliminar políticas existentes
DROP POLICY IF EXISTS "Company users can manage company settings" ON public.company_settings;

-- Crear política para SELECT (lectura) - empleados y dueños pueden leer
CREATE POLICY "Company users and employees can read company settings"
  ON public.company_settings
  FOR SELECT
  TO authenticated
  USING (
    user_id = get_user_company_id() OR
    EXISTS (
      SELECT 1 FROM public.employees 
      WHERE employees.auth_user_id = auth.uid() 
      AND employees.company_owner_id = company_settings.user_id
      AND employees.status = 'active'
    )
  );

-- Crear política para INSERT (creación) - solo dueños pueden crear
CREATE POLICY "Only company owners can create company settings"
  ON public.company_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = get_user_company_id());

-- Crear política para UPDATE (actualización) - solo dueños pueden actualizar
CREATE POLICY "Only company owners can update company settings"
  ON public.company_settings
  FOR UPDATE
  TO authenticated
  USING (user_id = get_user_company_id())
  WITH CHECK (user_id = get_user_company_id());

-- También permitir acceso para validación de códigos de empresa (sin autenticación)
CREATE POLICY "Allow company code validation"
  ON public.company_settings
  FOR SELECT
  TO anon
  USING (company_code_enabled = true);

-- Permitir inserción de configuraciones de empresa para nuevos usuarios
CREATE POLICY "Allow company settings creation"
  ON public.company_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = get_user_company_id());
```

3. Haz clic en "Run" para ejecutar la migración

### Opción 2: CLI de Supabase (Si funciona)

```bash
npx supabase db push
```

## Verificación

Después de aplicar la migración, puedes verificar que funcionó:

1. Intenta crear un empleado con un email que ya existe en otra empresa
2. Debería funcionar sin errores
3. Si intentas crear un empleado con el mismo email en la misma empresa, debería dar error

## Notas Importantes

- Esta migración es segura y no afecta los datos existentes
- Solo cambia las restricciones de la base de datos
- Permite mayor flexibilidad para empleados que cambian de empresa
- El sistema seguirá funcionando normalmente después de la migración
