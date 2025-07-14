@@ .. @@
 -- Tabla para empleados/usuarios de la empresa
-CREATE TABLE public.employees (
-  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
-  company_owner_id UUID REFERENCES auth.users NOT NULL, -- El dueño de la empresa
-  user_id UUID REFERENCES auth.users, -- Usuario asociado (si tiene cuenta)
-  full_name TEXT NOT NULL,
-  email TEXT,
-  phone TEXT,
-  dni TEXT,
-  position TEXT,
-  department TEXT,
-  hire_date DATE DEFAULT CURRENT_DATE,
-  salary NUMERIC,
-  status TEXT DEFAULT 'active',
-  permissions JSONB DEFAULT '{}',
-  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
-  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
-);
+-- Tabla employees ya existe en migración posterior
 
 -- Tabla para configuraciones generales del sistema
@@ .. @@
 -- Políticas RLS para employees
-CREATE POLICY "Company owners can manage their employees" ON public.employees
-  FOR ALL USING (auth.uid() = company_owner_id);
+-- Políticas para employees están en migración posterior
 
 -- Políticas RLS para system_configurations