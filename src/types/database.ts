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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      application_answers: {
        Row: {
          application_id: string
          created_at: string
          event_question_id: string
          id: string
          value: Json
        }
        Insert: {
          application_id: string
          created_at?: string
          event_question_id: string
          id?: string
          value: Json
        }
        Update: {
          application_id?: string
          created_at?: string
          event_question_id?: string
          id?: string
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "application_answers_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_answers_event_question_id_fkey"
            columns: ["event_question_id"]
            isOneToOne: false
            referencedRelation: "event_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      applications: {
        Row: {
          booth_preference: string | null
          event_id: string
          id: string
          organizer_notes: string | null
          product_categories: string[] | null
          special_requirements: string | null
          status: string
          submitted_at: string
          updated_at: string
          vendor_id: string
        }
        Insert: {
          booth_preference?: string | null
          event_id: string
          id?: string
          organizer_notes?: string | null
          product_categories?: string[] | null
          special_requirements?: string | null
          status?: string
          submitted_at?: string
          updated_at?: string
          vendor_id: string
        }
        Update: {
          booth_preference?: string | null
          event_id?: string
          id?: string
          organizer_notes?: string | null
          product_categories?: string[] | null
          special_requirements?: string | null
          status?: string
          submitted_at?: string
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "applications_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      attachments: {
        Row: {
          application_id: string
          file_name: string
          file_path: string
          file_size: number | null
          file_type: string
          id: string
          uploaded_at: string
        }
        Insert: {
          application_id: string
          file_name: string
          file_path: string
          file_size?: number | null
          file_type: string
          id?: string
          uploaded_at?: string
        }
        Update: {
          application_id?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          file_type?: string
          id?: string
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attachments_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      event_questionnaires: {
        Row: {
          created_at: string
          event_id: string
          id: string
          locked_at: string | null
          seeded_from_template_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          locked_at?: string | null
          seeded_from_template_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          locked_at?: string | null
          seeded_from_template_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_questionnaires_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_questionnaires_seeded_from_template_id_fkey"
            columns: ["seeded_from_template_id"]
            isOneToOne: false
            referencedRelation: "questionnaire_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      event_questions: {
        Row: {
          event_questionnaire_id: string
          help_text: string | null
          id: string
          label: string
          options: Json | null
          position: number
          required: boolean
          show_if: Json | null
          type: Database["public"]["Enums"]["question_type"]
        }
        Insert: {
          event_questionnaire_id: string
          help_text?: string | null
          id?: string
          label: string
          options?: Json | null
          position: number
          required?: boolean
          show_if?: Json | null
          type: Database["public"]["Enums"]["question_type"]
        }
        Update: {
          event_questionnaire_id?: string
          help_text?: string | null
          id?: string
          label?: string
          options?: Json | null
          position?: number
          required?: boolean
          show_if?: Json | null
          type?: Database["public"]["Enums"]["question_type"]
        }
        Relationships: [
          {
            foreignKeyName: "event_questions_event_questionnaire_id_fkey"
            columns: ["event_questionnaire_id"]
            isOneToOne: false
            referencedRelation: "event_questionnaires"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          application_deadline: string | null
          created_at: string
          description: string | null
          event_date: string
          id: string
          location: string
          max_vendors: number | null
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          application_deadline?: string | null
          created_at?: string
          description?: string | null
          event_date: string
          id?: string
          location: string
          max_vendors?: number | null
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          application_deadline?: string | null
          created_at?: string
          description?: string | null
          event_date?: string
          id?: string
          location?: string
          max_vendors?: number | null
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      questionnaire_templates: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "questionnaire_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users_with_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      template_questions: {
        Row: {
          help_text: string | null
          id: string
          label: string
          options: Json | null
          position: number
          required: boolean
          show_if: Json | null
          template_id: string
          type: Database["public"]["Enums"]["question_type"]
        }
        Insert: {
          help_text?: string | null
          id?: string
          label: string
          options?: Json | null
          position: number
          required?: boolean
          show_if?: Json | null
          template_id: string
          type: Database["public"]["Enums"]["question_type"]
        }
        Update: {
          help_text?: string | null
          id?: string
          label?: string
          options?: Json | null
          position?: number
          required?: boolean
          show_if?: Json | null
          template_id?: string
          type?: Database["public"]["Enums"]["question_type"]
        }
        Relationships: [
          {
            foreignKeyName: "template_questions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "questionnaire_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
          vendor_id: string | null
        }
        Insert: {
          created_at?: string
          id: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          vendor_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_profiles_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "users_with_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_profiles_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          business_name: string
          contact_name: string
          created_at: string
          description: string | null
          email: string
          id: string
          phone: string | null
          updated_at: string
          user_id: string | null
          website: string | null
        }
        Insert: {
          business_name: string
          contact_name: string
          created_at?: string
          description?: string | null
          email: string
          id?: string
          phone?: string | null
          updated_at?: string
          user_id?: string | null
          website?: string | null
        }
        Update: {
          business_name?: string
          contact_name?: string
          created_at?: string
          description?: string | null
          email?: string
          id?: string
          phone?: string | null
          updated_at?: string
          user_id?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendors_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_with_roles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      users_with_roles: {
        Row: {
          created_at: string | null
          email: string | null
          id: string | null
          role: Database["public"]["Enums"]["user_role"] | null
          role_updated_at: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      create_event_with_default_questionnaire: {
        Args: { p_event: Json }
        Returns: string
      }
      get_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
    }
    Enums: {
      question_type:
        | "short_text"
        | "long_text"
        | "email"
        | "phone"
        | "url"
        | "number"
        | "date"
        | "single_select"
        | "multi_select"
        | "yes_no"
        | "file_upload"
      user_role: "vendor" | "organizer" | "admin"
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
    Enums: {
      question_type: [
        "short_text",
        "long_text",
        "email",
        "phone",
        "url",
        "number",
        "date",
        "single_select",
        "multi_select",
        "yes_no",
        "file_upload",
      ],
      user_role: ["vendor", "organizer", "admin"],
    },
  },
} as const
