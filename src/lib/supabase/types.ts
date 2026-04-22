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
          created_at: string
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          role?: UserRole
          created_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string | null
          role?: UserRole
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
      streams: {
        Row: {
          id: string
          title: string
          brand_id: string
          host_id: string
          start_time: string
          end_time: string
          notes: string | null
          created_by: string
          created_at: string
        }
        Insert: {
          id?: string
          title: string
          brand_id: string
          host_id: string
          start_time: string
          end_time: string
          notes?: string | null
          created_by: string
          created_at?: string
        }
        Update: {
          title?: string
          brand_id?: string
          host_id?: string
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

export type Profile = Database['public']['Tables']['profiles']['Row']
export type Host    = Database['public']['Tables']['hosts']['Row']
export type Brand   = Database['public']['Tables']['brands']['Row']
export type Stream  = Database['public']['Tables']['streams']['Row']

export interface StreamWithRelations extends Stream {
  host:  { id: string; name: string }
  brand: { id: string; name: string }
}
