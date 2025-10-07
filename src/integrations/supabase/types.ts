export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      agreement_payments: {
        Row: {
          agreement_id: string
          amount: number
          created_at: string | null
          due_date: string
          id: string
          installment_number: number
          notes: string | null
          payment_date: string | null
          payment_method: string | null
          reference_number: string | null
          status: string | null
        }
        Insert: {
          agreement_id: string
          amount: number
          created_at?: string | null
          due_date: string
          id?: string
          installment_number: number
          notes?: string | null
          payment_date?: string | null
          payment_method?: string | null
          reference_number?: string | null
          status?: string | null
        }
        Update: {
          agreement_id?: string
          amount?: number
          created_at?: string | null
          due_date?: string
          id?: string
          installment_number?: number
          notes?: string | null
          payment_date?: string | null
          payment_method?: string | null
          reference_number?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agreement_payments_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "payment_agreements"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          appointment_date: string
          appointment_time: string
          client_id: string | null
          created_at: string
          description: string | null
          duration_minutes: number | null
          id: string
          location: string | null
          reminder_sent: boolean | null
          status: string | null
          title: string
          type: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          appointment_date: string
          appointment_time: string
          client_id?: string | null
          created_at?: string
          description?: string | null
          duration_minutes?: number | null
          id?: string
          location?: string | null
          reminder_sent?: boolean | null
          status?: string | null
          title: string
          type?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          appointment_date?: string
          appointment_time?: string
          client_id?: string | null
          created_at?: string
          description?: string | null
          duration_minutes?: number | null
          id?: string
          location?: string | null
          reminder_sent?: boolean | null
          status?: string | null
          title?: string
          type?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string | null
          id: string
          ip_address: unknown | null
          new_values: Json | null
          old_values: Json | null
          record_id: string | null
          table_name: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          id?: string
          ip_address?: unknown | null
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          table_name?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          id?: string
          ip_address?: unknown | null
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          table_name?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      capital_funds: {
        Row: {
          amount: number
          created_at: string | null
          expected_return_rate: number | null
          fund_type: string | null
          id: string
          investment_date: string
          investor_id: string | null
          maturity_date: string | null
          notes: string | null
          status: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          expected_return_rate?: number | null
          fund_type?: string | null
          id?: string
          investment_date?: string
          investor_id?: string | null
          maturity_date?: string | null
          notes?: string | null
          status?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          expected_return_rate?: number | null
          fund_type?: string | null
          id?: string
          investment_date?: string
          investor_id?: string | null
          maturity_date?: string | null
          notes?: string | null
          status?: string | null
        }
        Relationships: []
      }
      client_locations: {
        Row: {
          address_verified: boolean | null
          client_id: string
          created_at: string | null
          id: string
          latitude: number | null
          location_type: string | null
          longitude: number | null
          notes: string | null
          updated_at: string | null
        }
        Insert: {
          address_verified?: boolean | null
          client_id: string
          created_at?: string | null
          id?: string
          latitude?: number | null
          location_type?: string | null
          longitude?: number | null
          notes?: string | null
          updated_at?: string | null
        }
        Update: {
          address_verified?: boolean | null
          client_id?: string
          created_at?: string | null
          id?: string
          latitude?: number | null
          location_type?: string | null
          longitude?: number | null
          notes?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_locations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          account_number: string | null
          address: string | null
          bank_name: string | null
          birth_date: string | null
          city: string | null
          company_id: string | null
          created_at: string | null
          credit_score: number | null
          dni: string
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          full_name: string
          id: string
          marital_status: string | null
          monthly_income: number | null
          occupation: string | null
          phone: string
          references_json: Json | null
          routing_number: string | null
          spouse_name: string | null
          spouse_phone: string | null
          status: string | null
          supervisor_name: string | null
          supervisor_phone: string | null
          updated_at: string | null
          user_id: string | null
          workplace_address: string | null
          workplace_name: string | null
          workplace_phone: string | null
          years_employed: number | null
        }
        Insert: {
          account_number?: string | null
          address?: string | null
          bank_name?: string | null
          birth_date?: string | null
          city?: string | null
          company_id?: string | null
          created_at?: string | null
          credit_score?: number | null
          dni: string
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          full_name: string
          id?: string
          marital_status?: string | null
          monthly_income?: number | null
          occupation?: string | null
          phone: string
          references_json?: Json | null
          routing_number?: string | null
          spouse_name?: string | null
          spouse_phone?: string | null
          status?: string | null
          supervisor_name?: string | null
          supervisor_phone?: string | null
          updated_at?: string | null
          user_id?: string | null
          workplace_address?: string | null
          workplace_name?: string | null
          workplace_phone?: string | null
          years_employed?: number | null
        }
        Update: {
          account_number?: string | null
          address?: string | null
          bank_name?: string | null
          birth_date?: string | null
          city?: string | null
          company_id?: string | null
          created_at?: string | null
          credit_score?: number | null
          dni?: string
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          full_name?: string
          id?: string
          marital_status?: string | null
          monthly_income?: number | null
          occupation?: string | null
          phone?: string
          references_json?: Json | null
          routing_number?: string | null
          spouse_name?: string | null
          spouse_phone?: string | null
          status?: string | null
          supervisor_name?: string | null
          supervisor_phone?: string | null
          updated_at?: string | null
          user_id?: string | null
          workplace_address?: string | null
          workplace_name?: string | null
          workplace_phone?: string | null
          years_employed?: number | null
        }
        Relationships: []
      }
      collection_routes: {
        Row: {
          assigned_to: string | null
          completed_clients: number | null
          created_at: string | null
          description: string | null
          estimated_duration: number | null
          id: string
          name: string
          notes: string | null
          route_date: string
          start_time: string | null
          status: string | null
          total_clients: number | null
          total_collected: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          assigned_to?: string | null
          completed_clients?: number | null
          created_at?: string | null
          description?: string | null
          estimated_duration?: number | null
          id?: string
          name: string
          notes?: string | null
          route_date: string
          start_time?: string | null
          status?: string | null
          total_clients?: number | null
          total_collected?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          assigned_to?: string | null
          completed_clients?: number | null
          created_at?: string | null
          description?: string | null
          estimated_duration?: number | null
          id?: string
          name?: string
          notes?: string | null
          route_date?: string
          start_time?: string | null
          status?: string | null
          total_clients?: number | null
          total_collected?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      collection_tracking: {
        Row: {
          additional_notes: string | null
          client_response: string | null
          contact_date: string
          contact_time: string
          contact_type: string
          created_at: string | null
          created_by: string | null
          id: string
          loan_id: string
          next_contact_date: string | null
          updated_at: string | null
        }
        Insert: {
          additional_notes?: string | null
          client_response?: string | null
          contact_date: string
          contact_time: string
          contact_type: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          loan_id: string
          next_contact_date?: string | null
          updated_at?: string | null
        }
        Update: {
          additional_notes?: string | null
          client_response?: string | null
          contact_date?: string
          contact_time?: string
          contact_type?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          loan_id?: string
          next_contact_date?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "collection_tracking_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
        ]
      }
      company_settings: {
        Row: {
          address: string | null
          business_type: string | null
          city: string | null
          company_code: string | null
          company_code_enabled: boolean | null
          company_name: string
          country: string | null
          created_at: string
          currency: string | null
          description: string | null
          email: string | null
          grace_period_days: number | null
          id: string
          interest_rate_default: number | null
          late_fee_percentage: number | null
          logo_url: string | null
          max_loan_amount: number | null
          min_loan_amount: number | null
          phone: string | null
          postal_code: string | null
          state: string | null
          tax_id: string | null
          updated_at: string
          user_id: string
          website: string | null
        }
        Insert: {
          address?: string | null
          business_type?: string | null
          city?: string | null
          company_code?: string | null
          company_code_enabled?: boolean | null
          company_name: string
          country?: string | null
          created_at?: string
          currency?: string | null
          description?: string | null
          email?: string | null
          grace_period_days?: number | null
          id?: string
          interest_rate_default?: number | null
          late_fee_percentage?: number | null
          logo_url?: string | null
          max_loan_amount?: number | null
          min_loan_amount?: number | null
          phone?: string | null
          postal_code?: string | null
          state?: string | null
          tax_id?: string | null
          updated_at?: string
          user_id: string
          website?: string | null
        }
        Update: {
          address?: string | null
          business_type?: string | null
          city?: string | null
          company_code?: string | null
          company_code_enabled?: boolean | null
          company_name?: string
          country?: string | null
          created_at?: string
          currency?: string | null
          description?: string | null
          email?: string | null
          grace_period_days?: number | null
          id?: string
          interest_rate_default?: number | null
          late_fee_percentage?: number | null
          logo_url?: string | null
          max_loan_amount?: number | null
          min_loan_amount?: number | null
          phone?: string | null
          postal_code?: string | null
          state?: string | null
          tax_id?: string | null
          updated_at?: string
          user_id?: string
          website?: string | null
        }
        Relationships: []
      }
      documents: {
        Row: {
          client_id: string | null
          created_at: string | null
          description: string | null
          document_type: string
          file_name: string | null
          file_size: number | null
          file_url: string | null
          id: string
          loan_id: string | null
          mime_type: string | null
          status: string | null
          tags: string[] | null
          title: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string | null
          description?: string | null
          document_type: string
          file_name?: string | null
          file_size?: number | null
          file_url?: string | null
          id?: string
          loan_id?: string | null
          mime_type?: string | null
          status?: string | null
          tags?: string[] | null
          title: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          client_id?: string | null
          created_at?: string | null
          description?: string | null
          document_type?: string
          file_name?: string | null
          file_size?: number | null
          file_url?: string | null
          id?: string
          loan_id?: string | null
          mime_type?: string | null
          status?: string | null
          tags?: string[] | null
          title?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          auth_user_id: string | null
          company_id: string | null
          company_owner_id: string
          created_at: string | null
          department: string | null
          dni: string | null
          email: string
          full_name: string
          hire_date: string | null
          id: string
          permissions: Json | null
          phone: string | null
          position: string | null
          role: string | null
          salary: number | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          auth_user_id?: string | null
          company_id?: string | null
          company_owner_id: string
          created_at?: string | null
          department?: string | null
          dni?: string | null
          email: string
          full_name: string
          hire_date?: string | null
          id?: string
          permissions?: Json | null
          phone?: string | null
          position?: string | null
          role?: string | null
          salary?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          auth_user_id?: string | null
          company_id?: string | null
          company_owner_id?: string
          created_at?: string | null
          department?: string | null
          dni?: string | null
          email?: string
          full_name?: string
          hire_date?: string | null
          id?: string
          permissions?: Json | null
          phone?: string | null
          position?: string | null
          role?: string | null
          salary?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          category: string
          created_at: string | null
          created_by: string | null
          description: string
          expense_date: string
          id: string
          receipt_url: string | null
          status: string | null
        }
        Insert: {
          amount: number
          category: string
          created_at?: string | null
          created_by?: string | null
          description: string
          expense_date?: string
          id?: string
          receipt_url?: string | null
          status?: string | null
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string | null
          created_by?: string | null
          description?: string
          expense_date?: string
          id?: string
          receipt_url?: string | null
          status?: string | null
        }
        Relationships: []
      }
      help_tickets: {
        Row: {
          assigned_to: string | null
          category: string | null
          created_at: string | null
          description: string
          id: string
          priority: string | null
          resolution: string | null
          resolved_at: string | null
          status: string | null
          subject: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          assigned_to?: string | null
          category?: string | null
          created_at?: string | null
          description: string
          id?: string
          priority?: string | null
          resolution?: string | null
          resolved_at?: string | null
          status?: string | null
          subject: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          assigned_to?: string | null
          category?: string | null
          created_at?: string | null
          description?: string
          id?: string
          priority?: string | null
          resolution?: string | null
          resolved_at?: string | null
          status?: string | null
          subject?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      installments: {
        Row: {
          created_at: string | null
          due_date: string
          id: string
          installment_number: number
          interest_amount: number
          is_paid: boolean | null
          late_fee_paid: number
          loan_id: string
          paid_date: string | null
          principal_amount: number
          total_amount: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          due_date: string
          id?: string
          installment_number: number
          interest_amount: number
          is_paid?: boolean | null
          late_fee_paid?: number
          loan_id: string
          paid_date?: string | null
          principal_amount: number
          total_amount: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          due_date?: string
          id?: string
          installment_number?: number
          interest_amount?: number
          is_paid?: boolean | null
          late_fee_paid?: number
          loan_id?: string
          paid_date?: string | null
          principal_amount?: number
          total_amount?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "installments_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
        ]
      }
      late_fee_history: {
        Row: {
          calculation_date: string
          created_at: string | null
          days_overdue: number
          id: string
          late_fee_amount: number
          late_fee_rate: number
          loan_id: string
          total_late_fee: number
        }
        Insert: {
          calculation_date: string
          created_at?: string | null
          days_overdue: number
          id?: string
          late_fee_amount: number
          late_fee_rate: number
          loan_id: string
          total_late_fee: number
        }
        Update: {
          calculation_date?: string
          created_at?: string | null
          days_overdue?: number
          id?: string
          late_fee_amount?: number
          late_fee_rate?: number
          loan_id?: string
          total_late_fee?: number
        }
        Relationships: [
          {
            foreignKeyName: "late_fee_history_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_history: {
        Row: {
          change_type: string
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          loan_id: string
          new_value: string | null
          old_value: string | null
        }
        Insert: {
          change_type: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          loan_id: string
          new_value?: string | null
          old_value?: string | null
        }
        Update: {
          change_type?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          loan_id?: string
          new_value?: string | null
          old_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loan_history_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_requests: {
        Row: {
          amortization_type: string | null
          client_id: string
          closing_costs: number | null
          collateral_description: string | null
          created_at: string
          employment_status: string | null
          existing_debts: number | null
          first_payment_date: string | null
          guarantor_dni: string | null
          guarantor_name: string | null
          guarantor_phone: string | null
          guarantor_required: boolean | null
          id: string
          income_verification: string | null
          interest_rate: number | null
          late_fee: boolean | null
          loan_type: string | null
          minimum_payment_percentage: number | null
          minimum_payment_type: string | null
          monthly_income: number | null
          notes: string | null
          payment_frequency: string | null
          purpose: string | null
          requested_amount: number
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string | null
          term_months: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amortization_type?: string | null
          client_id: string
          closing_costs?: number | null
          collateral_description?: string | null
          created_at?: string
          employment_status?: string | null
          existing_debts?: number | null
          first_payment_date?: string | null
          guarantor_dni?: string | null
          guarantor_name?: string | null
          guarantor_phone?: string | null
          guarantor_required?: boolean | null
          id?: string
          income_verification?: string | null
          interest_rate?: number | null
          late_fee?: boolean | null
          loan_type?: string | null
          minimum_payment_percentage?: number | null
          minimum_payment_type?: string | null
          monthly_income?: number | null
          notes?: string | null
          payment_frequency?: string | null
          purpose?: string | null
          requested_amount: number
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
          term_months?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amortization_type?: string | null
          client_id?: string
          closing_costs?: number | null
          collateral_description?: string | null
          created_at?: string
          employment_status?: string | null
          existing_debts?: number | null
          first_payment_date?: string | null
          guarantor_dni?: string | null
          guarantor_name?: string | null
          guarantor_phone?: string | null
          guarantor_required?: boolean | null
          id?: string
          income_verification?: string | null
          interest_rate?: number | null
          late_fee?: boolean | null
          loan_type?: string | null
          minimum_payment_percentage?: number | null
          minimum_payment_type?: string | null
          monthly_income?: number | null
          notes?: string | null
          payment_frequency?: string | null
          purpose?: string | null
          requested_amount?: number
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
          term_months?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loan_requests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      loans: {
        Row: {
          add_expense_enabled: boolean | null
          amortization_type: string | null
          amount: number
          client_id: string
          closing_costs: number | null
          closing_costs_percentage: number | null
          collateral: string | null
          created_at: string | null
          current_late_fee: number | null
          deleted_at: string | null
          deleted_reason: string | null
          end_date: string
          excluded_days: string[] | null
          first_payment_date: string
          fixed_payment_amount: number | null
          fixed_payment_enabled: boolean | null
          grace_period_days: number | null
          guarantor_dni: string | null
          guarantor_name: string | null
          guarantor_phone: string | null
          id: string
          interest_rate: number
          last_late_fee_calculation: string | null
          late_fee_calculation_type: string | null
          late_fee_enabled: boolean | null
          late_fee_rate: number | null
          loan_officer_id: string | null
          loan_type: string | null
          max_late_fee: number | null
          minimum_payment_enabled: boolean | null
          minimum_payment_percentage: number | null
          minimum_payment_type: string | null
          monthly_payment: number
          next_payment_date: string
          notes: string | null
          paid_installments: number[] | null
          payment_frequency: string | null
          portfolio_id: string | null
          purpose: string | null
          remaining_balance: number
          start_date: string
          status: string | null
          term_months: number
          total_amount: number
          total_late_fee_paid: number | null
          updated_at: string | null
        }
        Insert: {
          add_expense_enabled?: boolean | null
          amortization_type?: string | null
          amount: number
          client_id: string
          closing_costs?: number | null
          closing_costs_percentage?: number | null
          collateral?: string | null
          created_at?: string | null
          current_late_fee?: number | null
          deleted_at?: string | null
          deleted_reason?: string | null
          end_date: string
          excluded_days?: string[] | null
          first_payment_date: string
          fixed_payment_amount?: number | null
          fixed_payment_enabled?: boolean | null
          grace_period_days?: number | null
          guarantor_dni?: string | null
          guarantor_name?: string | null
          guarantor_phone?: string | null
          id?: string
          interest_rate: number
          last_late_fee_calculation?: string | null
          late_fee_calculation_type?: string | null
          late_fee_enabled?: boolean | null
          late_fee_rate?: number | null
          loan_officer_id?: string | null
          loan_type?: string | null
          max_late_fee?: number | null
          minimum_payment_enabled?: boolean | null
          minimum_payment_percentage?: number | null
          minimum_payment_type?: string | null
          monthly_payment: number
          next_payment_date: string
          notes?: string | null
          paid_installments?: number[] | null
          payment_frequency?: string | null
          portfolio_id?: string | null
          purpose?: string | null
          remaining_balance: number
          start_date?: string
          status?: string | null
          term_months: number
          total_amount: number
          total_late_fee_paid?: number | null
          updated_at?: string | null
        }
        Update: {
          add_expense_enabled?: boolean | null
          amortization_type?: string | null
          amount?: number
          client_id?: string
          closing_costs?: number | null
          closing_costs_percentage?: number | null
          collateral?: string | null
          created_at?: string | null
          current_late_fee?: number | null
          deleted_at?: string | null
          deleted_reason?: string | null
          end_date?: string
          excluded_days?: string[] | null
          first_payment_date?: string
          fixed_payment_amount?: number | null
          fixed_payment_enabled?: boolean | null
          grace_period_days?: number | null
          guarantor_dni?: string | null
          guarantor_name?: string | null
          guarantor_phone?: string | null
          id?: string
          interest_rate?: number
          last_late_fee_calculation?: string | null
          late_fee_calculation_type?: string | null
          late_fee_enabled?: boolean | null
          late_fee_rate?: number | null
          loan_officer_id?: string | null
          loan_type?: string | null
          max_late_fee?: number | null
          minimum_payment_enabled?: boolean | null
          minimum_payment_percentage?: number | null
          minimum_payment_type?: string | null
          monthly_payment?: number
          next_payment_date?: string
          notes?: string | null
          paid_installments?: number[] | null
          payment_frequency?: string | null
          portfolio_id?: string | null
          purpose?: string | null
          remaining_balance?: number
          start_date?: string
          status?: string | null
          term_months?: number
          total_amount?: number
          total_late_fee_paid?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loans_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loans_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          action_url: string | null
          category: string | null
          created_at: string | null
          id: string
          message: string
          metadata: Json | null
          read: boolean | null
          title: string
          type: string | null
          user_id: string
        }
        Insert: {
          action_url?: string | null
          category?: string | null
          created_at?: string | null
          id?: string
          message: string
          metadata?: Json | null
          read?: boolean | null
          title: string
          type?: string | null
          user_id: string
        }
        Update: {
          action_url?: string | null
          category?: string | null
          created_at?: string | null
          id?: string
          message?: string
          metadata?: Json | null
          read?: boolean | null
          title?: string
          type?: string | null
          user_id?: string
        }
        Relationships: []
      }
      payment_agreements: {
        Row: {
          agreed_amount: number
          agreement_type: string | null
          approved_by: string | null
          client_id: string
          created_at: string | null
          created_by: string | null
          discount_amount: number | null
          end_date: string | null
          id: string
          installment_amount: number | null
          installments: number | null
          loan_id: string
          notes: string | null
          original_amount: number
          start_date: string
          status: string | null
          terms: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          agreed_amount: number
          agreement_type?: string | null
          approved_by?: string | null
          client_id: string
          created_at?: string | null
          created_by?: string | null
          discount_amount?: number | null
          end_date?: string | null
          id?: string
          installment_amount?: number | null
          installments?: number | null
          loan_id: string
          notes?: string | null
          original_amount: number
          start_date: string
          status?: string | null
          terms?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          agreed_amount?: number
          agreement_type?: string | null
          approved_by?: string | null
          client_id?: string
          created_at?: string | null
          created_by?: string | null
          discount_amount?: number | null
          end_date?: string | null
          id?: string
          installment_amount?: number | null
          installments?: number | null
          loan_id?: string
          notes?: string | null
          original_amount?: number
          start_date?: string
          status?: string | null
          terms?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_agreements_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_agreements_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string | null
          created_by: string | null
          due_date: string
          id: string
          interest_amount: number
          late_fee: number | null
          late_fee_days: number | null
          late_fee_rate_applied: number | null
          loan_id: string
          notes: string | null
          payment_date: string
          payment_method: string | null
          principal_amount: number
          reference_number: string | null
          status: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          created_by?: string | null
          due_date: string
          id?: string
          interest_amount: number
          late_fee?: number | null
          late_fee_days?: number | null
          late_fee_rate_applied?: number | null
          loan_id: string
          notes?: string | null
          payment_date?: string
          payment_method?: string | null
          principal_amount: number
          reference_number?: string | null
          status?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          created_by?: string | null
          due_date?: string
          id?: string
          interest_amount?: number
          late_fee?: number | null
          late_fee_days?: number | null
          late_fee_rate_applied?: number | null
          loan_id?: string
          notes?: string | null
          payment_date?: string
          payment_method?: string | null
          principal_amount?: number
          reference_number?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolio_loans: {
        Row: {
          assigned_date: string | null
          id: string
          loan_id: string | null
          portfolio_id: string | null
        }
        Insert: {
          assigned_date?: string | null
          id?: string
          loan_id?: string | null
          portfolio_id?: string | null
        }
        Update: {
          assigned_date?: string | null
          id?: string
          loan_id?: string | null
          portfolio_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_loans_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfolio_loans_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolios: {
        Row: {
          created_at: string | null
          current_amount: number | null
          description: string | null
          id: string
          interest_rate: number | null
          name: string
          risk_level: string | null
          status: string | null
          target_amount: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          current_amount?: number | null
          description?: string | null
          id?: string
          interest_rate?: number | null
          name: string
          risk_level?: string | null
          status?: string | null
          target_amount?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          current_amount?: number | null
          description?: string | null
          id?: string
          interest_rate?: number | null
          name?: string
          risk_level?: string | null
          status?: string | null
          target_amount?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          barcode: string | null
          brand: string | null
          category: string | null
          created_at: string
          current_stock: number | null
          description: string | null
          id: string
          min_stock: number | null
          name: string
          purchase_price: number | null
          selling_price: number | null
          sku: string | null
          status: string | null
          unit_type: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          barcode?: string | null
          brand?: string | null
          category?: string | null
          created_at?: string
          current_stock?: number | null
          description?: string | null
          id?: string
          min_stock?: number | null
          name: string
          purchase_price?: number | null
          selling_price?: number | null
          sku?: string | null
          status?: string | null
          unit_type?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          barcode?: string | null
          brand?: string | null
          category?: string | null
          created_at?: string
          current_stock?: number | null
          description?: string | null
          id?: string
          min_stock?: number | null
          name?: string
          purchase_price?: number | null
          selling_price?: number | null
          sku?: string | null
          status?: string | null
          unit_type?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          address: string | null
          city: string | null
          created_at: string | null
          dni: string | null
          full_name: string
          id: string
          phone: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string | null
          dni?: string | null
          full_name: string
          id: string
          phone?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string | null
          dni?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      purchase_details: {
        Row: {
          created_at: string
          id: string
          product_id: string
          purchase_id: string
          quantity: number
          total_price: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          purchase_id: string
          quantity: number
          total_price: number
          unit_price: number
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          purchase_id?: string
          quantity?: number
          total_price?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_details_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_details_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      purchases: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          purchase_date: string | null
          purchase_number: string
          status: string | null
          supplier_id: string | null
          total_amount: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          purchase_date?: string | null
          purchase_number: string
          status?: string | null
          supplier_id?: string | null
          total_amount?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          purchase_date?: string | null
          purchase_number?: string
          status?: string | null
          supplier_id?: string | null
          total_amount?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchases_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_details: {
        Row: {
          created_at: string
          id: string
          product_id: string
          quantity: number
          quote_id: string
          total_price: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          quantity: number
          quote_id: string
          total_price: number
          unit_price: number
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          quantity?: number
          quote_id?: string
          total_price?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "quote_details_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_details_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          client_id: string | null
          created_at: string
          id: string
          notes: string | null
          quote_date: string | null
          quote_number: string
          status: string | null
          total_amount: number | null
          updated_at: string
          user_id: string
          valid_until: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          quote_date?: string | null
          quote_number: string
          status?: string | null
          total_amount?: number | null
          updated_at?: string
          user_id: string
          valid_until?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          quote_date?: string | null
          quote_number?: string
          status?: string | null
          total_amount?: number | null
          updated_at?: string
          user_id?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      registration_codes: {
        Row: {
          code: string
          company_name: string
          created_at: string | null
          created_by: string | null
          expires_at: string | null
          id: string
          is_used: boolean | null
          updated_at: string | null
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          code: string
          company_name: string
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_used?: boolean | null
          updated_at?: string | null
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          code?: string
          company_name?: string
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_used?: boolean | null
          updated_at?: string | null
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: []
      }
      reports: {
        Row: {
          created_at: string | null
          data: Json | null
          description: string | null
          expires_at: string | null
          file_url: string | null
          generated_at: string | null
          id: string
          parameters: Json | null
          report_name: string
          report_type: string
          status: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          data?: Json | null
          description?: string | null
          expires_at?: string | null
          file_url?: string | null
          generated_at?: string | null
          id?: string
          parameters?: Json | null
          report_name: string
          report_type: string
          status?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          data?: Json | null
          description?: string | null
          expires_at?: string | null
          file_url?: string | null
          generated_at?: string | null
          id?: string
          parameters?: Json | null
          report_name?: string
          report_type?: string
          status?: string | null
          user_id?: string
        }
        Relationships: []
      }
      route_clients: {
        Row: {
          client_id: string
          collected_amount: number | null
          created_at: string | null
          expected_amount: number | null
          id: string
          loan_id: string | null
          notes: string | null
          route_id: string | null
          visit_order: number | null
          visit_status: string | null
          visit_time: string | null
        }
        Insert: {
          client_id: string
          collected_amount?: number | null
          created_at?: string | null
          expected_amount?: number | null
          id?: string
          loan_id?: string | null
          notes?: string | null
          route_id?: string | null
          visit_order?: number | null
          visit_status?: string | null
          visit_time?: string | null
        }
        Update: {
          client_id?: string
          collected_amount?: number | null
          created_at?: string | null
          expected_amount?: number | null
          id?: string
          loan_id?: string | null
          notes?: string | null
          route_id?: string | null
          visit_order?: number | null
          visit_status?: string | null
          visit_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "route_clients_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "route_clients_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "route_clients_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "collection_routes"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_details: {
        Row: {
          created_at: string
          id: string
          product_id: string
          quantity: number
          sale_id: string
          total_price: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          quantity: number
          sale_id: string
          total_price: number
          unit_price: number
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          quantity?: number
          sale_id?: string
          total_price?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sale_details_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_details_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          client_id: string | null
          created_at: string
          id: string
          notes: string | null
          payment_method: string | null
          sale_date: string | null
          sale_number: string
          status: string | null
          total_amount: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          payment_method?: string | null
          sale_date?: string | null
          sale_number: string
          status?: string | null
          total_amount?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          payment_method?: string | null
          sale_date?: string | null
          sale_number?: string
          status?: string | null
          total_amount?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          city: string | null
          company_name: string
          contact_name: string | null
          created_at: string
          email: string | null
          id: string
          phone: string | null
          status: string | null
          tax_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          company_name: string
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          phone?: string | null
          status?: string | null
          tax_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          city?: string | null
          company_name?: string
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          phone?: string | null
          status?: string | null
          tax_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          key: string
          updated_at: string | null
          value: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          key: string
          updated_at?: string | null
          value: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          key?: string
          updated_at?: string | null
          value?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      calculate_late_fee: {
        Args: { p_calculation_date?: string; p_loan_id: string }
        Returns: {
          days_overdue: number
          late_fee_amount: number
          total_late_fee: number
        }[]
      }
      current_santo_domingo_date: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      current_santo_domingo_timestamp: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      generate_company_code: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      generate_registration_code: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      get_santo_domingo_date: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      get_santo_domingo_timestamp: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      get_user_company_id: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      recalculate_late_fee_from_scratch: {
        Args: { p_calculation_date?: string; p_loan_id: string }
        Returns: {
          days_overdue: number
          late_fee_amount: number
          total_late_fee: number
        }[]
      }
      update_all_late_fees: {
        Args: { p_calculation_date?: string }
        Returns: number
      }
      update_all_late_fees_from_scratch: {
        Args: { p_calculation_date?: string }
        Returns: number
      }
      validate_and_use_registration_code: {
        Args: { p_code: string; p_user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
