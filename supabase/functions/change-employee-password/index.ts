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

    // Get employee email and new password from request body
    let employeeEmail: string;
    let newPassword: string;
    try {
      const body = await req.json();
      employeeEmail = body.email;
      newPassword = body.password;
      
      if (!employeeEmail || !newPassword) {
        throw new Error("email and password are required");
      }

      if (newPassword.length < 6) {
        throw new Error("La contraseña debe tener al menos 6 caracteres");
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

    // Verify that the employee belongs to the company owner
    const { data: employee, error: employeeError } = await supabaseAdmin
      .from('employees')
      .select('id, email, auth_user_id')
      .eq('email', employeeEmail)
      .eq('company_owner_id', user.id)
      .eq('status', 'active')
      .single();

    if (employeeError || !employee) {
      return new Response(
        JSON.stringify({ error: 'Empleado no encontrado o no pertenece a tu empresa' }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    if (!employee.auth_user_id) {
      return new Response(
        JSON.stringify({ error: 'El empleado no tiene auth_user_id' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Update the employee's password
    const { data: updatedUser, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      employee.auth_user_id,
      {
        password: newPassword
      }
    );

    if (updateError) {
      return new Response(
        JSON.stringify({ error: `Error al cambiar contraseña: ${updateError.message}` }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Contraseña cambiada exitosamente'
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

