      public_app_announcements: {
        Args: Record<PropertyKey, never>
        Returns: { id: number; title: string; body: string; created_at: string }[]
      }
      public_app_update: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      public_guest_landing: {
        Args: Record<PropertyKey, never>
        Returns: { site_title: string; site_subtitle: string; home_banner_text: string; home_banner_url: string; close_login_entry: string; skip_login_screen: string; maintenance: string; maintenance_title: string; maintenance_msg: string; notices: { id: number; title: string | null; content: string; created_at: string }[] }
      }
      regexp_match: {
        Args: { arg_1: unknown; arg_2: unknown } | { arg_1: unknown; arg_2: unknown; arg_3: string }
        Returns: unknown
      }
      regexp_matches: {
        Args: { arg_1: unknown; arg_2: unknown } | { arg_1: unknown; arg_2: unknown; arg_3: string }
        Returns: unknown
      }
      regexp_replace: {
        Args: { arg_1: unknown; arg_2: unknown; arg_3: string; arg_4: string } | { arg_1: unknown; arg_2: unknown; arg_3: string }
        Returns: unknown
      }
      regexp_split_to_array: {
        Args: { arg_1: unknown; arg_2: unknown } | { arg_1: unknown; arg_2: unknown; arg_3: string }
        Returns: unknown
      }
      regexp_split_to_table: {
        Args: { arg_1: unknown; arg_2: unknown; arg_3: string } | { arg_1: unknown; arg_2: unknown }
        Returns: unknown
      }
      replace: {
        Args: { arg_1: unknown; arg_2: unknown; arg_3: unknown }
        Returns: unknown
      }
      resolve_login_email: {
        Args: { ident: string }
        Returns: unknown
      }
      song_wall_published: {
        Args: Record<PropertyKey, never>
        Returns: unknown
      }
      respond_friend_request: {
        Args: { req: string; accept: boolean }
        Returns: unknown
      }
      review_game_profile: {
        Args: { pid: string; approve: boolean }
        Returns: unknown
      }
      send_friend_request: {
        Args: { target: string }
        Returns: unknown
      }
      set_invite_code: {
        Args: { new_code: string }
        Returns: unknown
      }
      set_invite_code_active: {
        Args: { cid: number; active: boolean }
        Returns: unknown
      }
      set_invite_settings: {
        Args: { new_code: string; nick: string }
        Returns: unknown
      }
      set_joined: {
        Args: { target: string; j: boolean }
        Returns: unknown
      }
      set_role: {
        Args: { target: string; new_role: string }
        Returns: unknown
      }
      split_part: {
        Args: { arg_1: unknown; arg_2: unknown; arg_3: number }
        Returns: unknown
      }
      strpos: {
        Args: { arg_1: unknown; arg_2: unknown }
        Returns: unknown
      }
      submit_game_profile: {
        Args: { gname: string; guid: string | null; rnk: string | null }
        Returns: unknown
      }
      submit_intro_video: {
        Args: { p_path: string }
        Returns: unknown
      }
      texticlike: {
        Args: { arg_1: unknown; arg_2: string } | { arg_1: unknown; arg_2: unknown }
        Returns: unknown
      }
      texticnlike: {
        Args: { arg_1: unknown; arg_2: string } | { arg_1: unknown; arg_2: unknown }
        Returns: unknown
      }
      texticregexeq: {
        Args: { arg_1: unknown; arg_2: string } | { arg_1: unknown; arg_2: unknown }
        Returns: unknown
      }
      texticregexne: {
        Args: { arg_1: unknown; arg_2: unknown } | { arg_1: unknown; arg_2: string }
        Returns: unknown
      }
      translate: {
        Args: { arg_1: unknown; arg_2: unknown; arg_3: string }
        Returns: unknown
      }
      username_available: {
        Args: { u: string }
        Returns: unknown
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

