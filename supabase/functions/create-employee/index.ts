import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
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

    const { employeeData } = await req.json()

    // Create the auth user for the employee
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: employeeData.email,
      password: employeeData.password,
      email_confirm: true, // Skip email confirmation
      user_metadata: {
        full_name: employeeData.full_name,
        role: employeeData.role,
        company_owner_id: user.id,
      }
    })

    if (authError) {
      return new Response(
        JSON.stringify({ error: authError.message }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
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
      // If employee creation fails, clean up the auth user
      await supabaseAdmin.auth.admin.deleteUser(authData.user!.id)
      
      return new Response(
        JSON.stringify({ error: employeeError.message }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    return new Response(
      JSON.stringify({ success: true, user: authData.user }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})