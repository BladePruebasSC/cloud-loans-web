@@ .. @@
 CREATE TABLE IF NOT EXISTS public.employees (
   id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
   company_owner_id UUID REFERENCES auth.users(id) NOT NULL,
   auth_user_id UUID REFERENCES auth.users(id),
   full_name TEXT NOT NULL,
-  email TEXT UNIQUE NOT NULL,
+  email TEXT,
   phone TEXT,
   dni TEXT,
   position TEXT,
   department TEXT,
   hire_date DATE DEFAULT CURRENT_DATE,
   salary NUMERIC,
   status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
   role TEXT DEFAULT 'employee' CHECK (role IN ('admin', 'manager', 'employee', 'collector', 'accountant')),
   permissions JSONB DEFAULT '{}',
   created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
   updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
 );