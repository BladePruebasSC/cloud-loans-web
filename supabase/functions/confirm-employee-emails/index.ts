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

    // Get employee email from request body (optional)
    let employeeEmail: string | null = null;
    try {
      const clonedReq = req.clone();
      const bodyText = await clonedReq.text();
      if (bodyText && bodyText.trim()) {
        const body = JSON.parse(bodyText);
        employeeEmail = body.email || null;
      }
    } catch (e) {
      // No body provided or invalid JSON, will confirm all employees
      employeeEmail = null;
    }

    // Get employees for this company
    let query = supabaseAdmin
      .from('employees')
      .select('id, email, auth_user_id')
      .eq('company_owner_id', user.id)
      .eq('status', 'active');

    // If specific email provided, filter by it
    if (employeeEmail) {
      query = query.eq('email', employeeEmail);
    }

    const { data: employees, error: employeesError } = await query;

    if (employeesError) {
      return new Response(
        JSON.stringify({ error: `Error al obtener empleados: ${employeesError.message}` }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    if (!employees || employees.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No hay empleados para confirmar', confirmed: 0 }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Confirm email for each employee
    let confirmedCount = 0
    let errors: string[] = []

    for (const employee of employees) {
      if (!employee.auth_user_id) {
        errors.push(`Empleado ${employee.email} no tiene auth_user_id`)
        continue
      }

      try {
        const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
          employee.auth_user_id,
          {
            email_confirm: true
          }
        )

        if (updateError) {
          errors.push(`Error al confirmar ${employee.email}: ${updateError.message}`)
        } else {
          confirmedCount++
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        errors.push(`Error al confirmar ${employee.email}: ${errorMessage}`)
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        confirmed: confirmedCount,
        total: employees.length,
        errors: errors.length > 0 ? errors : undefined
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

