-- Crear tabla de garantías para préstamos
CREATE TABLE IF NOT EXISTS public.guarantees (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  loan_id UUID NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
  guarantee_type TEXT NOT NULL CHECK (guarantee_type IN ('vehicle', 'building', 'other')),
  
  -- Campos comunes
  status TEXT DEFAULT 'available' CHECK (status IN ('available', 'in_use', 'sold', 'lost')),
  process TEXT DEFAULT 'in_warehouse' CHECK (process IN ('in_warehouse', 'with_client', 'sold', 'other')),
  holder TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  
  -- Campos específicos para vehículos
  vehicle_type TEXT, -- JEEP, CAR, MOTORCYCLE, etc.
  warehouse_id UUID, -- Referencia a almacén si existe
  brand TEXT,
  model TEXT,
  year INTEGER,
  automotive_power TEXT,
  chassis TEXT NOT NULL,
  engine_series TEXT,
  doors INTEGER,
  cylinders INTEGER,
  color TEXT,
  license_plate TEXT,
  
  -- Campos específicos para edificaciones
  building_type TEXT,
  address TEXT,
  square_meters DECIMAL(10,2),
  construction_year INTEGER,
  property_type TEXT, -- CASA, APARTAMENTO, TERRENO, etc.
  property_number TEXT,
  
  -- Campos específicos para otros tipos
  other_type TEXT,
  other_description TEXT,
  
  -- Precio de venta
  sale_price DECIMAL(12,2),
  sale_date DATE,
  sale_down_payment DECIMAL(12,2),
  sale_minimum_down_payment DECIMAL(12,2),
  
  -- Precio de compra
  purchase_date DATE,
  purchase_cost DECIMAL(12,2),
  purchase_invoice_url TEXT,
  supplier_id UUID -- Referencia a proveedor si existe
);

-- Crear tabla para imágenes de garantías
CREATE TABLE IF NOT EXISTS public.guarantee_images (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  guarantee_id UUID NOT NULL REFERENCES public.guarantees(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  image_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Crear índices para mejorar el rendimiento
CREATE INDEX IF NOT EXISTS idx_guarantees_loan_id ON public.guarantees(loan_id);
CREATE INDEX IF NOT EXISTS idx_guarantees_type ON public.guarantees(guarantee_type);
CREATE INDEX IF NOT EXISTS idx_guarantees_status ON public.guarantees(status);
CREATE INDEX IF NOT EXISTS idx_guarantee_images_guarantee_id ON public.guarantee_images(guarantee_id);

-- Habilitar RLS
ALTER TABLE public.guarantees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guarantee_images ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para guarantees
-- Usar la función get_user_company_id() que ya existe en el sistema
CREATE POLICY "Company users can view company guarantees"
  ON public.guarantees FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.loans
      WHERE loans.id = guarantees.loan_id
      AND (
        loans.loan_officer_id = get_user_company_id() OR
        EXISTS (
          SELECT 1 FROM public.clients 
          WHERE clients.id = loans.client_id 
          AND clients.user_id = get_user_company_id()
        )
      )
    )
  );

CREATE POLICY "Company users can create company guarantees"
  ON public.guarantees FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.loans
      WHERE loans.id = guarantees.loan_id
      AND (
        loans.loan_officer_id = get_user_company_id() OR
        EXISTS (
          SELECT 1 FROM public.clients 
          WHERE clients.id = loans.client_id 
          AND clients.user_id = get_user_company_id()
        )
      )
    )
  );

CREATE POLICY "Company users can update company guarantees"
  ON public.guarantees FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.loans
      WHERE loans.id = guarantees.loan_id
      AND (
        loans.loan_officer_id = get_user_company_id() OR
        EXISTS (
          SELECT 1 FROM public.clients 
          WHERE clients.id = loans.client_id 
          AND clients.user_id = get_user_company_id()
        )
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.loans
      WHERE loans.id = guarantees.loan_id
      AND (
        loans.loan_officer_id = get_user_company_id() OR
        EXISTS (
          SELECT 1 FROM public.clients 
          WHERE clients.id = loans.client_id 
          AND clients.user_id = get_user_company_id()
        )
      )
    )
  );

CREATE POLICY "Company users can delete company guarantees"
  ON public.guarantees FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.loans
      WHERE loans.id = guarantees.loan_id
      AND (
        loans.loan_officer_id = get_user_company_id() OR
        EXISTS (
          SELECT 1 FROM public.clients 
          WHERE clients.id = loans.client_id 
          AND clients.user_id = get_user_company_id()
        )
      )
    )
  );

-- Políticas RLS para guarantee_images
CREATE POLICY "Company users can view company guarantee images"
  ON public.guarantee_images FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.guarantees
      JOIN public.loans ON loans.id = guarantees.loan_id
      WHERE guarantees.id = guarantee_images.guarantee_id
      AND (
        loans.loan_officer_id = get_user_company_id() OR
        EXISTS (
          SELECT 1 FROM public.clients 
          WHERE clients.id = loans.client_id 
          AND clients.user_id = get_user_company_id()
        )
      )
    )
  );

CREATE POLICY "Company users can create company guarantee images"
  ON public.guarantee_images FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.guarantees
      JOIN public.loans ON loans.id = guarantees.loan_id
      WHERE guarantees.id = guarantee_images.guarantee_id
      AND (
        loans.loan_officer_id = get_user_company_id() OR
        EXISTS (
          SELECT 1 FROM public.clients 
          WHERE clients.id = loans.client_id 
          AND clients.user_id = get_user_company_id()
        )
      )
    )
  );

CREATE POLICY "Company users can delete company guarantee images"
  ON public.guarantee_images FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.guarantees
      JOIN public.loans ON loans.id = guarantees.loan_id
      WHERE guarantees.id = guarantee_images.guarantee_id
      AND (
        loans.loan_officer_id = get_user_company_id() OR
        EXISTS (
          SELECT 1 FROM public.clients 
          WHERE clients.id = loans.client_id 
          AND clients.user_id = get_user_company_id()
        )
      )
    )
  );

-- Comentarios para documentar
COMMENT ON TABLE public.guarantees IS 'Tabla para almacenar garantías de préstamos (vehículos, edificaciones, otros)';
COMMENT ON COLUMN public.guarantees.guarantee_type IS 'Tipo de garantía: vehicle, building, other';
COMMENT ON COLUMN public.guarantees.status IS 'Estado de la garantía: available, in_use, sold, lost';
COMMENT ON COLUMN public.guarantees.chassis IS 'Número de chasis (requerido para vehículos)';

