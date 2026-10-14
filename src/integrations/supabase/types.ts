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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      campaigns: {
        Row: {
          contact_max_sec: number
          contact_min_sec: number
          created_at: string
          daily_limit: number
          end_hour: number
          id: string
          instance_id: string | null
          list_id: string | null
          msg_max_sec: number
          msg_min_sec: number
          name: string
          script_id: string | null
          start_hour: number
          start_now: boolean
          status: string
          user_id: string
          weekdays: number[]
        }
        Insert: {
          contact_max_sec?: number
          contact_min_sec?: number
          created_at?: string
          daily_limit?: number
          end_hour?: number
          id?: string
          instance_id?: string | null
          list_id?: string | null
          msg_max_sec?: number
          msg_min_sec?: number
          name: string
          script_id?: string | null
          start_hour?: number
          start_now?: boolean
          status?: string
          user_id?: string
          weekdays?: number[]
        }
        Update: {
          contact_max_sec?: number
          contact_min_sec?: number
          created_at?: string
          daily_limit?: number
          end_hour?: number
          id?: string
          instance_id?: string | null
          list_id?: string | null
          msg_max_sec?: number
          msg_min_sec?: number
          name?: string
          script_id?: string | null
          start_hour?: number
          start_now?: boolean
          status?: string
          user_id?: string
          weekdays?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_script_id_fkey"
            columns: ["script_id"]
            isOneToOne: false
            referencedRelation: "scripts"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          company: string
          created_at: string
          id: string
          is_admin: boolean
          is_valid: boolean
          name: string
          phone: string
          source: string
          tags: string[]
          user_id: string
        }
        Insert: {
          company?: string
          created_at?: string
          id?: string
          is_admin?: boolean
          is_valid?: boolean
          name?: string
          phone: string
          source?: string
          tags?: string[]
          user_id?: string
        }
        Update: {
          company?: string
          created_at?: string
          id?: string
          is_admin?: boolean
          is_valid?: boolean
          name?: string
          phone?: string
          source?: string
          tags?: string[]
          user_id?: string
        }
        Relationships: []
      }
      instances: {
        Row: {
          created_at: string
          id: string
          instance_name: string
          name: string
          phone: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          instance_name: string
          name: string
          phone?: string | null
          status?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          instance_name?: string
          name?: string
          phone?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      list_contacts: {
        Row: {
          contact_id: string
          list_id: string
          user_id: string
        }
        Insert: {
          contact_id: string
          list_id: string
          user_id?: string
        }
        Update: {
          contact_id?: string
          list_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "list_contacts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "list_contacts_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "lists"
            referencedColumns: ["id"]
          },
        ]
      }
      lists: {
        Row: {
          created_at: string
          id: string
          is_test: boolean
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_test?: boolean
          name: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_test?: boolean
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      queue_messages: {
        Row: {
          attempts: number
          campaign_id: string
          contact_id: string | null
          contact_name: string
          content: string
          created_at: string
          error: string | null
          id: string
          phone: string
          replied: boolean
          scheduled_at: string
          sent_at: string | null
          status: string
          step_position: number
          user_id: string
          variation_index: number
        }
        Insert: {
          attempts?: number
          campaign_id: string
          contact_id?: string | null
          contact_name?: string
          content: string
          created_at?: string
          error?: string | null
          id?: string
          phone: string
          replied?: boolean
          scheduled_at: string
          sent_at?: string | null
          status?: string
          step_position?: number
          user_id?: string
          variation_index?: number
        }
        Update: {
          attempts?: number
          campaign_id?: string
          contact_id?: string | null
          contact_name?: string
          content?: string
          created_at?: string
          error?: string | null
          id?: string
          phone?: string
          replied?: boolean
          scheduled_at?: string
          sent_at?: string | null
          status?: string
          step_position?: number
          user_id?: string
          variation_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "queue_messages_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "queue_messages_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      script_steps: {
        Row: {
          created_at: string
          id: string
          position: number
          script_id: string
          user_id: string
          variations: string[]
        }
        Insert: {
          created_at?: string
          id?: string
          position?: number
          script_id: string
          user_id?: string
          variations?: string[]
        }
        Update: {
          created_at?: string
          id?: string
          position?: number
          script_id?: string
          user_id?: string
          variations?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "script_steps_script_id_fkey"
            columns: ["script_id"]
            isOneToOne: false
            referencedRelation: "scripts"
            referencedColumns: ["id"]
          },
        ]
      }
      scripts: {
        Row: {
          created_at: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
