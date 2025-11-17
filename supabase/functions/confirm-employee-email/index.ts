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

    // Get employee email from request body
    let employeeEmail: string;
    try {
      const body = await req.json();
      employeeEmail = body.email;
      if (!employeeEmail) {
        throw new Error("email is missing in the request body");
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

    // Verify that the email corresponds to an active employee
    // This allows confirming email without authentication, but only for employees
    const { data: employee, error: employeeError } = await supabaseAdmin
      .from('employees')
      .select('id, email, auth_user_id, company_owner_id')
      .eq('email', employeeEmail)
      .eq('status', 'active')
      .single();

    if (employeeError || !employee) {
      return new Response(
        JSON.stringify({ error: 'Empleado no encontrado o no está activo' }),
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

    // Confirm the employee's email
    const { data: updatedUser, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      employee.auth_user_id,
      {
        email_confirm: true
      }
    );

    if (updateError) {
      return new Response(
        JSON.stringify({ error: `Error al confirmar correo: ${updateError.message}` }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Correo confirmado exitosamente'
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

