export type UserRole = 'admin' | 'user'

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string | null
          role: UserRole
          phone: string | null
          height: string | null
          weight: string | null
          hair_color: string | null
          eye_color: string | null
          top_size: string | null
          bottom_size: string | null
          shoe_size: string | null
          headshot_path: string | null
          created_at: string
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          role?: UserRole
          phone?: string | null
          height?: string | null
          weight?: string | null
          hair_color?: string | null
          eye_color?: string | null
          top_size?: string | null
          bottom_size?: string | null
          shoe_size?: string | null
          headshot_path?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string | null
          role?: UserRole
          phone?: string | null
          height?: string | null
          weight?: string | null
          hair_color?: string | null
          eye_color?: string | null
          top_size?: string | null
          bottom_size?: string | null
          shoe_size?: string | null
          headshot_path?: string | null
        }
      }
      hosts: {
        Row: {
          id: string
          name: string
          email: string | null
          user_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          email?: string | null
          user_id?: string | null
          created_at?: string
        }
        Update: {
          name?: string
          email?: string | null
          user_id?: string | null
        }
      }
      brands: {
        Row: {
          id: string
          name: string
          email: string | null
          user_id: string | null
          block_size_minutes: number
          day_start_minutes: number
          day_end_minutes: number
          logo_path: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          email?: string | null
          user_id?: string | null
          block_size_minutes?: number
          day_start_minutes?: number
          day_end_minutes?: number
          logo_path?: string | null
          created_at?: string
        }
        Update: {
          name?: string
          email?: string | null
          user_id?: string | null
          block_size_minutes?: number
          day_start_minutes?: number
          day_end_minutes?: number
          logo_path?: string | null
        }
      }
      producers: {
        Row: {
          id: string
          name: string
          email: string | null
          user_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          email?: string | null
          user_id?: string | null
          created_at?: string
        }
        Update: {
          name?: string
          email?: string | null
          user_id?: string | null
        }
      }
      brand_hosts: {
        Row: {
          brand_id: string
          host_id: string
          created_at: string
        }
        Insert: {
          brand_id: string
          host_id: string
          created_at?: string
        }
        Update: Record<string, never>
      }
      brand_shift_overrides: {
        Row: {
          brand_id: string
          shift_date: string
          block_index: number
          rate_cents: number
          created_at: string
        }
        Insert: {
          brand_id: string
          shift_date: string
          block_index: number
          rate_cents: number
          created_at?: string
        }
        Update: {
          rate_cents?: number
        }
      }
      brand_shift_rates: {
        Row: {
          brand_id: string
          day_of_week: number
          block_index: number
          rate_cents: number
          is_blocked: boolean
        }
        Insert: {
          brand_id: string
          day_of_week: number
          block_index: number
          rate_cents: number
          is_blocked?: boolean
        }
        Update: {
          rate_cents?: number
          is_blocked?: boolean
        }
      }
      notifications: {
        Row: {
          id: string
          recipient_id: string
          type: 'shift_booked' | 'shift_cancelled'
          actor_host_id: string | null
          host_name: string
          brand_id: string | null
          brand_name: string
          shift_start: string
          shift_end: string
          is_read: boolean
          created_at: string
        }
        Insert: {
          id?: string
          recipient_id: string
          type: 'shift_booked' | 'shift_cancelled'
          actor_host_id?: string | null
          host_name: string
          brand_id?: string | null
          brand_name: string
          shift_start: string
          shift_end: string
          is_read?: boolean
          created_at?: string
        }
        Update: {
          is_read?: boolean
        }
      }
      streams: {
        Row: {
          id: string
          title: string | null
          brand_id: string
          host_id: string | null
          producer_id: string | null
          start_time: string
          end_time: string
          notes: string | null
          created_by: string
          created_at: string
        }
        Insert: {
          id?: string
          title?: string | null
          brand_id: string
          host_id?: string | null
          producer_id?: string | null
          start_time: string
          end_time: string
          notes?: string | null
          created_by: string
          created_at?: string
        }
        Update: {
          title?: string | null
          brand_id?: string
          host_id?: string | null
          producer_id?: string | null
          start_time?: string
          end_time?: string
          notes?: string | null
        }
      }
    }
    Functions: {
      is_admin: {
        Args: Record<string, never>
        Returns: boolean
      }
    }
  }
}

export type Profile        = Database['public']['Tables']['profiles']['Row']
export type Host           = Database['public']['Tables']['hosts']['Row']
export type Brand          = Database['public']['Tables']['brands']['Row']
export type Producer       = Database['public']['Tables']['producers']['Row']
export type Stream         = Database['public']['Tables']['streams']['Row']
export type BrandShiftRate     = Database['public']['Tables']['brand_shift_rates']['Row']
export type BrandShiftOverride = Database['public']['Tables']['brand_shift_overrides']['Row']
export type BrandHost          = Database['public']['Tables']['brand_hosts']['Row']
export type Notification       = Database['public']['Tables']['notifications']['Row']

export interface StreamWithRelations extends Stream {
  host:     { id: string; name: string } | null
  brand:    { id: string; name: string }
  producer: { id: string; name: string } | null
}
