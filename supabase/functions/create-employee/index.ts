import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Get the authorization header from the request
    const authHeader = req.headers.get('Authorization')!
    const token = authHeader.replace('Bearer ', '')

    // Verify the user is authenticated and get their info
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token)
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    let employeeData;
    try {
      const body = await req.json();
      employeeData = body.employeeData;
      if (!employeeData) {
        throw new Error("employeeData is missing in the request body");
      }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error';
      return new Response(
        JSON.stringify({ error: `Error parsing request body: ${errorMessage}` }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Check if employee already exists in this company
    const { data: existingEmployee, error: checkError } = await supabaseAdmin
      .from('employees')
      .select('id, email')
      .eq('email', employeeData.email)
      .eq('company_owner_id', user.id)
      .single();

    if (existingEmployee) {
      return new Response(
        JSON.stringify({ error: 'Ya existe un empleado con este email en tu empresa' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Try to find existing auth user first
    let authUser = null;
    const { data: existingUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (!listError && existingUsers) {
      authUser = existingUsers.users.find(u => u.email === employeeData.email);
    }

    let authData;
    let isReusedUser = false;

    if (authUser) {
      // User already exists, reuse it
      console.log('Reusing existing user:', authUser.id);
      authData = { user: authUser };
      isReusedUser = true;
    } else {
      // Create new user
      console.log('Creating new user for email:', employeeData.email);
      const result = await supabaseAdmin.auth.admin.createUser({
        email: employeeData.email,
        password: employeeData.password,
        email_confirm: true,
        user_metadata: {
          full_name: employeeData.full_name,
          role: employeeData.role,
          company_owner_id: employeeData.company_owner_id,
        }
      });

      if (result.error) {
        return new Response(
          JSON.stringify({ error: result.error.message }),
          { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      authData = result.data;
    }

    // Create the employee record
    const { error: employeeError } = await supabaseAdmin
      .from('employees')
      .insert({
        company_owner_id: user.id,
        auth_user_id: authData.user?.id,
        full_name: employeeData.full_name,
        email: employeeData.email,
        phone: employeeData.phone,
        dni: employeeData.dni,
        position: employeeData.position,
        department: employeeData.department,
        salary: employeeData.salary,
        hire_date: employeeData.hire_date,
        role: employeeData.role,
        status: 'active',
        permissions: employeeData.permissions || {},
      })

    if (employeeError) {
      // If employee creation fails and we created a new auth user, clean it up
      if (!isReusedUser && authData.user?.id) {
        await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
      }
      
      return new Response(
        JSON.stringify({ error: employeeError.message }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        user: authData.user,
        message: isReusedUser ? 
          'Empleado creado exitosamente (reutilizando cuenta existente)' : 
          'Empleado creado exitosamente'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Function error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})