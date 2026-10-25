export type Json = string | number | boolean | null | {
  [key: string]: Json | undefined;
} | Json[];
export type Database = {
  "public": {
    Tables: {
      "profiles": {
        Row: {
          "activity_level": string | null;
          "birth_date": string | null;
          "color_mode": string | null;
          "created_at": string;
          "display_name": string | null;
          "gender": string | null;
          "goal": string | null;
          "height_cm": number | null;
          "id": string;
          "onboarded_at": string | null;
          "phone": string | null;
          "sex": string | null;
          "theme_palette": string | null;
          "updated_at": string;
          "weight_kg": number | null;
        };
        ComputedFields: never;
        Insert: {
          "activity_level"?: string | null;
          "birth_date"?: string | null;
          "color_mode"?: string | null;
          "created_at"?: string;
          "display_name"?: string | null;
          "gender"?: string | null;
          "goal"?: string | null;
          "height_cm"?: number | null;
          "id": string;
          "onboarded_at"?: string | null;
          "phone"?: string | null;
          "sex"?: string | null;
          "theme_palette"?: string | null;
          "updated_at"?: string;
          "weight_kg"?: number | null;
        };
        Update: {
          "activity_level"?: string | null;
          "birth_date"?: string | null;
          "color_mode"?: string | null;
          "created_at"?: string;
          "display_name"?: string | null;
          "gender"?: string | null;
          "goal"?: string | null;
          "height_cm"?: number | null;
          "id"?: string;
          "onboarded_at"?: string | null;
          "phone"?: string | null;
          "sex"?: string | null;
          "theme_palette"?: string | null;
          "updated_at"?: string;
          "weight_kg"?: number | null;
        };
        Relationships: [
        ];
      };
      "weight_entries": {
        Row: {
          "created_at": string;
          "id": string;
          "measured_on": string | null;
          "origin": string;
          "updated_at": string;
          "user_id": string;
          "version": number;
          "weight_kg": number;
        };
        ComputedFields: never;
        Insert: {
          "created_at"?: string;
          "id"?: string;
          "measured_on"?: string | null;
          "origin"?: string;
          "updated_at"?: string;
          "user_id"?: string;
          "version"?: number;
          "weight_kg": number;
        };
        Update: {
          "created_at"?: string;
          "id"?: string;
          "measured_on"?: string | null;
          "origin"?: string;
          "updated_at"?: string;
          "user_id"?: string;
          "version"?: number;
          "weight_kg"?: number;
        };
        Relationships: [
          {
            foreignKeyName: "weight_entries_user_id_fkey";
            columns: [
              "user_id"
            ];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: [
              "id"
            ];
          }
        ];
      };
      "weight_entry_audit": {
        Row: {
          "action": string;
          "changed_at": string;
          "entry_id": string;
          "id": number;
          "new_measured_on": string | null;
          "new_weight_kg": number | null;
          "old_measured_on": string | null;
          "old_version": number;
          "old_weight_kg": number;
          "user_id": string;
        };
        ComputedFields: never;
        Insert: {
          "action": string;
          "changed_at"?: string;
          "entry_id": string;
          "id"?: never;
          "new_measured_on"?: string | null;
          "new_weight_kg"?: number | null;
          "old_measured_on"?: string | null;
          "old_version": number;
          "old_weight_kg": number;
          "user_id": string;
        };
        Update: {
          "action"?: string;
          "changed_at"?: string;
          "entry_id"?: string;
          "id"?: never;
          "new_measured_on"?: string | null;
          "new_weight_kg"?: number | null;
          "old_measured_on"?: string | null;
          "old_version"?: number;
          "old_weight_kg"?: number;
          "user_id"?: string;
        };
        Relationships: [
          {
            foreignKeyName: "weight_entry_audit_user_id_fkey";
            columns: [
              "user_id"
            ];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: [
              "id"
            ];
          }
        ];
      };
      "weight_goals": {
        Row: {
          "id": string;
          "set_at": string;
          "start_entry_id": string | null;
          "start_entry_version": number;
          "start_measured_on": string;
          "start_weight_kg": number;
          "target_weight_kg": number;
          "updated_at": string;
          "user_id": string;
          "version": number;
        };
        ComputedFields: never;
        Insert: {
          "id"?: string;
          "set_at"?: string;
          "start_entry_id"?: string | null;
          "start_entry_version": number;
          "start_measured_on": string;
          "start_weight_kg": number;
          "target_weight_kg": number;
          "updated_at"?: string;
          "user_id": string;
          "version"?: number;
        };
        Update: {
          "id"?: string;
          "set_at"?: string;
          "start_entry_id"?: string | null;
          "start_entry_version"?: number;
          "start_measured_on"?: string;
          "start_weight_kg"?: number;
          "target_weight_kg"?: number;
          "updated_at"?: string;
          "user_id"?: string;
          "version"?: number;
        };
        Relationships: [
          {
            foreignKeyName: "weight_goals_start_entry_id_fkey";
            columns: [
              "start_entry_id"
            ];
            isOneToOne: false;
            referencedRelation: "weight_entries";
            referencedColumns: [
              "id"
            ];
          },
          {
            foreignKeyName: "weight_goals_user_id_fkey";
            columns: [
              "user_id"
            ];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: [
              "id"
            ];
          }
        ];
      };
      "weight_legacy_client_writes": {
        Row: {
          "first_written_at": string;
          "last_weight_kg": number | null;
          "last_written_at": string;
          "user_id": string;
          "write_count": number;
        };
        ComputedFields: never;
        Insert: {
          "first_written_at"?: string;
          "last_weight_kg"?: number | null;
          "last_written_at"?: string;
          "user_id": string;
          "write_count": number;
        };
        Update: {
          "first_written_at"?: string;
          "last_weight_kg"?: number | null;
          "last_written_at"?: string;
          "user_id"?: string;
          "write_count"?: number;
        };
        Relationships: [
          {
            foreignKeyName: "weight_legacy_client_writes_user_id_fkey";
            columns: [
              "user_id"
            ];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: [
              "id"
            ];
          }
        ];
      };
      "weight_legacy_imports": {
        Row: {
          "imported_at": string;
          "source": string;
          "user_id": string;
          "weight_kg": number;
        };
        ComputedFields: never;
        Insert: {
          "imported_at"?: string;
          "source": string;
          "user_id": string;
          "weight_kg": number;
        };
        Update: {
          "imported_at"?: string;
          "source"?: string;
          "user_id"?: string;
          "weight_kg"?: number;
        };
        Relationships: [
          {
            foreignKeyName: "weight_legacy_imports_user_id_fkey";
            columns: [
              "user_id"
            ];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: [
              "id"
            ];
          }
        ];
      };
    };
    Views: {
      "weight_monthly_summaries": {
        Row: {
          "average_kg": number | null;
          "change_kg": number | null;
          "entries": number | null;
          "first_measured_on": string | null;
          "first_weight_kg": number | null;
          "last_measured_on": string | null;
          "last_weight_kg": number | null;
          "month": string | null;
          "user_id": string;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: "weight_entries_user_id_fkey";
            columns: [
              "user_id"
            ];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: [
              "id"
            ];
          }
        ];
      };
    };
    Functions: {
      "complete_onboarding": {
        Args: {
          "p_activity_level": string;
          "p_birth_date": string;
          "p_display_name": string;
          "p_gender": string;
          "p_goal": string;
          "p_height_cm": number;
          "p_measured_on": string;
          "p_sex": string;
          "p_theme_palette": string;
          "p_weight_kg": number;
        };
        Returns: string;
      };
      "import_legacy_profile_weight": {
        Args: {
          "p_source": string;
          "p_user_id": string;
          "p_weight_kg": number;
        };
        Returns: boolean;
      };
      "import_profile_weights": {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
      "purge_weight_entry_audit": {
        Args: {
          "retention"?: string;
        };
        Returns: number;
      };
      "set_weight_goal": {
        Args: {
          "p_expected_version"?: number;
          "p_goal_id"?: string;
          "p_reset_start"?: boolean;
          "p_target_weight_kg": number;
        };
        Returns: {
          "id": string;
          "set_at": string;
          "start_entry_id": string | null;
          "start_entry_version": number;
          "start_measured_on": string;
          "start_weight_kg": number;
          "target_weight_kg": number;
          "updated_at": string;
          "user_id": string;
          "version": number;
        };
        SetofOptions: {
          from: "*";
          to: "weight_goals";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;
type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];
export type Tables<DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"]) | {
  schema: keyof DatabaseWithoutInternals;
}, TableName extends DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
} ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] & DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"]) : never = never> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
} ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] & DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
  Row: infer R;
} ? R : never : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"]) ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
  Row: infer R;
} ? R : never : never;
export type TablesInsert<DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | {
  schema: keyof DatabaseWithoutInternals;
}, TableName extends DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
} ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] : never = never> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
} ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
  Insert: infer I;
} ? I : never : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
  Insert: infer I;
} ? I : never : never;
export type TablesUpdate<DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | {
  schema: keyof DatabaseWithoutInternals;
}, TableName extends DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
} ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] : never = never> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
} ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
  Update: infer U;
} ? U : never : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
  Update: infer U;
} ? U : never : never;
export type Enums<DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"] | {
  schema: keyof DatabaseWithoutInternals;
}, EnumName extends DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
} ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"] : never = never> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
} ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName] : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"] ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions] : never;
export type CompositeTypes<PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"] | {
  schema: keyof DatabaseWithoutInternals;
}, CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
} ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"] : never = never> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
} ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName] : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"] ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions] : never;
export const Constants = {
  "public": {
    Enums: {}
  }
} as const;
