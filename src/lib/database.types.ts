// ---------------------------------------------------------------------------
// AUTO-GENERATED — Supabase Database Types (schema: public)
// 初版于 2026-10-31 由生产库实时结构导出生成，并通过 tsc 校验。
// 重新生成（官方方式）：先 `supabase link` 链接项目，再运行 `npm run types:gen`。
// 不要手工修改本文件；手工类型请放在其他文件里并逐步向本文件收敛。
// ---------------------------------------------------------------------------

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      admin_audit_logs: {
        Row: {
          id: number
          actor: string | null
          action: string
          target: string | null
          detail: Json | null
          created_at: string
        }
        Insert: {
          id?: number
          actor?: string | null
          action: string
          target?: string | null
          detail?: Json | null
          created_at?: string
        }
        Update: {
          id?: number
          actor?: string | null
          action?: string
          target?: string | null
          detail?: Json | null
          created_at?: string
        }
        Relationships: [
        ]
      }
      album_photos: {
        Row: {
          id: number
          album_id: number
          photo_url: string
          caption: string | null
          uploaded_by: string | null
          created_at: string
        }
        Insert: {
          id?: number
          album_id: number
          photo_url: string
          caption?: string | null
          uploaded_by?: string | null
          created_at?: string
        }
        Update: {
          id?: number
          album_id?: number
          photo_url?: string
          caption?: string | null
          uploaded_by?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "album_photos_album_id_fkey"
            columns: ["album_id"]
            isOneToOne: false
            referencedRelation: "albums"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "album_photos_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      albums: {
        Row: {
          id: number
          title: string
          category: string
          cover_url: string | null
          created_by: string | null
          created_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: number
          title: string
          category?: string
          cover_url?: string | null
          created_by?: string | null
          created_at?: string
          deleted_at?: string | null
        }
        Update: {
          id?: number
          title?: string
          category?: string
          cover_url?: string | null
          created_by?: string | null
          created_at?: string
          deleted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "albums_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          id: number
          invite_code: string | null
          invite_nickname: string | null
        }
        Insert: {
          id?: number
          invite_code?: string | null
          invite_nickname?: string | null
        }
        Update: {
          id?: number
          invite_code?: string | null
          invite_nickname?: string | null
        }
        Relationships: [
        ]
      }
      backup_logs: {
        Row: {
          id: number
          created_by: string | null
          scope: string
          status: string
          note: string | null
          created_at: string
        }
        Insert: {
          id?: number
          created_by?: string | null
          scope: string
          status: string
          note?: string | null
          created_at?: string
        }
        Update: {
          id?: number
          created_by?: string | null
          scope?: string
          status?: string
          note?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "backup_logs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_notify_emails: {
        Row: {
          id: number
          email: string
          created_at: string
        }
        Insert: {
          id?: number
          email: string
          created_at?: string
        }
        Update: {
          id?: number
          email?: string
          created_at?: string
        }
        Relationships: []
      }
      board_messages: {
        Row: {
          id: number
          author_id: string | null
          content: string
          is_admin_msg: boolean
          created_at: string
          is_pinned: boolean
          expires_at: string | null
          deleted_at: string | null
          popup_on_login: boolean
          title: string | null
          popup_times: number
        }
        Insert: {
          id?: number
          author_id?: string | null
          content: string
          is_admin_msg?: boolean
          created_at?: string
          is_pinned?: boolean
          expires_at?: string | null
          deleted_at?: string | null
          popup_on_login?: boolean
          title?: string | null
          popup_times?: number
        }
        Update: {
          id?: number
          author_id?: string | null
          content?: string
          is_admin_msg?: boolean
          created_at?: string
          is_pinned?: boolean
          expires_at?: string | null
          deleted_at?: string | null
          popup_on_login?: boolean
          title?: string | null
          popup_times?: number
        }
        Relationships: [
          {
            foreignKeyName: "board_messages_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      board_reads: {
        Row: {
          profile_id: string
          last_seen_at: string
        }
        Insert: {
          profile_id: string
          last_seen_at?: string
        }
        Update: {
          profile_id?: string
          last_seen_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "board_reads_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          id: number
          post_id: number
          author_id: string
          content: string
          created_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: number
          post_id: number
          author_id: string
          content: string
          created_at?: string
          deleted_at?: string | null
        }
        Update: {
          id?: number
          post_id?: number
          author_id?: string
          content?: string
          created_at?: string
          deleted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_members: {
        Row: {
          conversation_id: number
          profile_id: string
        }
        Insert: {
          conversation_id: number
          profile_id: string
        }
        Update: {
          conversation_id?: number
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_members_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          id: number
          created_at: string
        }
        Insert: {
          id?: number
          created_at?: string
        }
        Update: {
          id?: number
          created_at?: string
        }
        Relationships: [
        ]
      }
      event_regs: {
        Row: {
          event_id: number
          profile_id: string
          created_at: string
        }
        Insert: {
          event_id: number
          profile_id: string
          created_at?: string
        }
        Update: {
          event_id?: number
          profile_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_regs_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_regs_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          id: number
          title: string
          description: string | null
          event_at: string | null
          location: string | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: number
          title: string
          description?: string | null
          event_at?: string | null
          location?: string | null
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: number
          title?: string
          description?: string | null
          event_at?: string | null
          location?: string | null
          created_by?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      favorites: {
        Row: {
          profile_id: string
          target_type: string
          target_id: string
          created_at: string
        }
        Insert: {
          profile_id: string
          target_type: string
          target_id: string
          created_at?: string
        }
        Update: {
          profile_id?: string
          target_type?: string
          target_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feedbacks: {
        Row: {
          id: number
          user_id: string | null
          name: string | null
          contact: string | null
          content: string
          kind: string
          status: string
          created_at: string
          admin_note: string | null
          handled_by: string | null
          handled_at: string | null
        }
        Insert: {
          id?: number
          user_id?: string | null
          name?: string | null
          contact?: string | null
          content: string
          kind?: string
          status?: string
          created_at?: string
          admin_note?: string | null
          handled_by?: string | null
          handled_at?: string | null
        }
        Update: {
          id?: number
          user_id?: string | null
          name?: string | null
          contact?: string | null
          content?: string
          kind?: string
          status?: string
          created_at?: string
          admin_note?: string | null
          handled_by?: string | null
          handled_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feedbacks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      friendships: {
        Row: {
          id: number
          requester: string
          addressee: string
          status: string
          created_at: string
        }
        Insert: {
          id?: number
          requester: string
          addressee: string
          status?: string
          created_at?: string
        }
        Update: {
          id?: number
          requester?: string
          addressee?: string
          status?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "friendships_addressee_fkey"
            columns: ["addressee"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendships_requester_fkey"
            columns: ["requester"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      game_profiles: {
        Row: {
          id: number
          profile_id: string
          game_name: string
          game_uid: string | null
          rank: string | null
          status: string
          reviewed_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          profile_id: string
          game_name: string
          game_uid?: string | null
          rank?: string | null
          status?: string
          reviewed_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          profile_id?: string
          game_name?: string
          game_uid?: string | null
          rank?: string | null
          status?: string
          reviewed_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_profiles_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_profiles_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      greetings: {
        Row: {
          id: number
          author_id: string
          target_id: string | null
          content: string
          deleted_at: string | null
          created_at: string
        }
        Insert: {
          id?: number
          author_id: string
          target_id?: string | null
          content: string
          deleted_at?: string | null
          created_at?: string
        }
        Update: {
          id?: number
          author_id?: string
          target_id?: string | null
          content?: string
          deleted_at?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "greetings_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "greetings_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hot_snippets: {
        Row: {
          id: number
          title: string
          language: string
          code: string
          summary: string
          source_url: string | null
          source_name: string
          views: number
          window_views: number
          created_at: string
        }
        Insert: {
          id?: number
          title: string
          language?: string
          code: string
          summary?: string
          source_url?: string | null
          source_name?: string
          views?: number
          window_views?: number
          created_at?: string
        }
        Update: {
          id?: number
          title?: string
          language?: string
          code?: string
          summary?: string
          source_url?: string | null
          source_name?: string
          views?: number
          window_views?: number
          created_at?: string
        }
        Relationships: [
        ]
      }
      invite_codes: {
        Row: {
          id: number
          code: string
          nickname: string | null
          active: boolean
          created_by: string | null
          created_at: string
          expires_at: string | null
        }
        Insert: {
          id?: number
          code: string
          nickname?: string | null
          active?: boolean
          created_by?: string | null
          created_at?: string
          expires_at?: string | null
        }
        Update: {
          id?: number
          code?: string
          nickname?: string | null
          active?: boolean
          created_by?: string | null
          created_at?: string
          expires_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invite_codes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      love_wall_comments: {
        Row: {
          id: string
          post_id: string
          author_id: string
          content: string
          created_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          post_id: string
          author_id: string
          content: string
          created_at?: string
          deleted_at?: string | null
        }
        Update: {
          id?: string
          post_id?: string
          author_id?: string
          content?: string
          created_at?: string
          deleted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "love_wall_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "love_wall_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "love_wall_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      love_wall_media: {
        Row: {
          id: string
          post_id: string
          path: string
          kind: string
          sort: number
          created_at: string
        }
        Insert: {
          id?: string
          post_id: string
          path: string
          kind: string
          sort?: number
          created_at?: string
        }
        Update: {
          id?: string
          post_id?: string
          path?: string
          kind?: string
          sort?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "love_wall_media_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "love_wall_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      love_wall_posts: {
        Row: {
          id: string
          author_id: string
          recipient_name: string | null
          recipient_id: string | null
          recipient_notified_at: string | null
          category: string
          content: string
          is_anonymous: boolean
          status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          author_id: string
          recipient_name?: string | null
          recipient_id?: string | null
          recipient_notified_at?: string | null
          category?: string
          content: string
          is_anonymous?: boolean
          status?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          author_id?: string
          recipient_name?: string | null
          recipient_id?: string | null
          recipient_notified_at?: string | null
          category?: string
          content?: string
          is_anonymous?: boolean
          status?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
        ]
      }
      member_presence: {
        Row: {
          profile_id: string
          device: string | null
          location: string | null
          updated_at: string
        }
        Insert: {
          profile_id: string
          device?: string | null
          location?: string | null
          updated_at?: string
        }
        Update: {
          profile_id?: string
          device?: string | null
          location?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_presence_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          id: number
          conversation_id: number
          sender_id: string
          body: string
          created_at: string
        }
        Insert: {
          id?: number
          conversation_id: number
          sender_id: string
          body: string
          created_at?: string
        }
        Update: {
          id?: number
          conversation_id?: number
          sender_id?: string
          body?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          id: number
          profile_id: string
          type: string
          title: string
          body: string | null
          link: string | null
          is_read: boolean
          created_at: string
        }
        Insert: {
          id?: number
          profile_id: string
          type?: string
          title: string
          body?: string | null
          link?: string | null
          is_read?: boolean
          created_at?: string
        }
        Update: {
          id?: number
          profile_id?: string
          type?: string
          title?: string
          body?: string | null
          link?: string | null
          is_read?: boolean
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      post_likes: {
        Row: {
          post_id: number
          profile_id: string
          created_at: string
        }
        Insert: {
          post_id: number
          profile_id: string
          created_at?: string
        }
        Update: {
          post_id?: number
          profile_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_likes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          id: number
          author_id: string
          content: string
          image_url: string | null
          created_at: string
          deleted_at: string | null
          section: string
        }
        Insert: {
          id?: number
          author_id: string
          content: string
          image_url?: string | null
          created_at?: string
          deleted_at?: string | null
          section?: string
        }
        Update: {
          id?: number
          author_id?: string
          content?: string
          image_url?: string | null
          created_at?: string
          deleted_at?: string | null
          section?: string
        }
        Relationships: [
          {
            foreignKeyName: "posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_contacts: {
        Row: {
          profile_id: string
          contact: string | null
          social: string | null
          game_id: string | null
        }
        Insert: {
          profile_id: string
          contact?: string | null
          social?: string | null
          game_id?: string | null
        }
        Update: {
          profile_id?: string
          contact?: string | null
          social?: string | null
          game_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profile_contacts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_emails: {
        Row: {
          profile_id: string
          email: string
        }
        Insert: {
          profile_id: string
          email: string
        }
        Update: {
          profile_id?: string
          email?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_emails_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_privacy: {
        Row: {
          profile_id: string
          show_name: boolean
          show_age: boolean
          show_personality: boolean
          show_signature: boolean
          show_bio: boolean
          show_hobbies: boolean
          show_avatar: boolean
          show_contact: boolean
          show_social: boolean
          show_game_id: boolean
          hide_love_wall_name: boolean
        }
        Insert: {
          profile_id: string
          show_name?: boolean
          show_age?: boolean
          show_personality?: boolean
          show_signature?: boolean
          show_bio?: boolean
          show_hobbies?: boolean
          show_avatar?: boolean
          show_contact?: boolean
          show_social?: boolean
          show_game_id?: boolean
          hide_love_wall_name?: boolean
        }
        Update: {
          profile_id?: string
          show_name?: boolean
          show_age?: boolean
          show_personality?: boolean
          show_signature?: boolean
          show_bio?: boolean
          show_hobbies?: boolean
          show_avatar?: boolean
          show_contact?: boolean
          show_social?: boolean
          show_game_id?: boolean
          hide_love_wall_name?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "profile_privacy_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          id: string
          username: string
          role: string
          joined: boolean
          display_name: string | null
          age: number | null
          personality: string | null
          signature: string | null
          bio: string | null
          hobbies: string | null
          avatar_path: string | null
          theme: Json
          created_at: string
          real_name: string | null
          intro_video_path: string | null
          intro_video_status: string
        }
        Insert: {
          id: string
          username: string
          role?: string
          joined?: boolean
          display_name?: string | null
          age?: number | null
          personality?: string | null
          signature?: string | null
          bio?: string | null
          hobbies?: string | null
          avatar_path?: string | null
          theme?: Json
          created_at?: string
          real_name?: string | null
          intro_video_path?: string | null
          intro_video_status?: string
        }
        Update: {
          id?: string
          username?: string
          role?: string
          joined?: boolean
          display_name?: string | null
          age?: number | null
          personality?: string | null
          signature?: string | null
          bio?: string | null
          hobbies?: string | null
          avatar_path?: string | null
          theme?: Json
          created_at?: string
          real_name?: string | null
          intro_video_path?: string | null
          intro_video_status?: string
        }
        Relationships: [
        ]
      }
      reports: {
        Row: {
          id: number
          reporter_id: string | null
          target_type: string
          target_id: string
          reason: string
          status: string
          handled_by: string | null
          handle_note: string | null
          handled_at: string | null
          created_at: string
        }
        Insert: {
          id?: number
          reporter_id?: string | null
          target_type: string
          target_id: string
          reason: string
          status?: string
          handled_by?: string | null
          handle_note?: string | null
          handled_at?: string | null
          created_at?: string
        }
        Update: {
          id?: number
          reporter_id?: string | null
          target_type?: string
          target_id?: string
          reason?: string
          status?: string
          handled_by?: string | null
          handle_note?: string | null
          handled_at?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_handled_by_fkey"
            columns: ["handled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      site_settings: {
        Row: {
          key: string
          value: string
          updated_at: string
        }
        Insert: {
          key: string
          value?: string
          updated_at?: string
        }
        Update: {
          key?: string
          value?: string
          updated_at?: string
        }
        Relationships: [
        ]
      }
      song_posts: {
        Row: {
          id: string
          author_id: string
          title: string
          description: string | null
          audio_path: string
          duration_seconds: number | null
          status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          author_id: string
          title: string
          description?: string | null
          audio_path: string
          duration_seconds?: number | null
          status?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          author_id?: string
          title?: string
          description?: string | null
          audio_path?: string
          duration_seconds?: number | null
          status?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
        ]
      }
      time_capsules: {
        Row: {
          id: number
          author_id: string | null
          title: string
          content: string
          open_at: string
          is_public: boolean
          created_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: number
          author_id?: string | null
          title: string
          content: string
          open_at: string
          is_public?: boolean
          created_at?: string
          deleted_at?: string | null
        }
        Update: {
          id?: number
          author_id?: string | null
          title?: string
          content?: string
          open_at?: string
          is_public?: boolean
          created_at?: string
          deleted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "time_capsules_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      timelines: {
        Row: {
          id: number
          profile_id: string
          happened_on: string
          title: string
          content: string | null
          media_url: string | null
          created_at: string
        }
        Insert: {
          id?: number
          profile_id: string
          happened_on: string
          title: string
          content?: string | null
          media_url?: string | null
          created_at?: string
        }
        Update: {
          id?: number
          profile_id?: string
          happened_on?: string
          title?: string
          content?: string | null
          media_url?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "timelines_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      wishes: {
        Row: {
          id: number
          author_id: string | null
          content: string
          likes: number
          created_at: string
        }
        Insert: {
          id?: number
          author_id?: string | null
          content: string
          likes?: number
          created_at?: string
        }
        Update: {
          id?: number
          author_id?: string | null
          content?: string
          likes?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wishes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_security_overview: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      admin_member_activity: {
        Args: { p_target: string }
        Returns: Json
      }
      admin_analytics_overview: {
        Args: { p_days?: number }
        Returns: Json
      }
      admin_backup_overview: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      admin_update_feedback: {
        Args: { p_feedback_id: number; p_status: string; p_admin_note?: string | null }
        Returns: undefined
      }
      admin_send_notification_campaign: {
        Args: { p_title: string; p_body: string; p_link?: string | null; p_recipient_ids?: string[] | null }
        Returns: number
      }
      admin_record_manual_backup: {
        Args: { p_scope: string; p_note: string }
        Returns: number
      }
      admin_request_sensitive_action: {
        Args: { p_action_type: string; p_target_user_id: string; p_requested_role: string | null; p_reason: string }
        Returns: string
      }
      admin_decide_sensitive_action: {
        Args: { p_request_id: string; p_approve: boolean; p_note?: string | null }
        Returns: undefined
      }
      admin_sensitive_action_requests: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      record_auth_login_failure: {
        Args: { p_method: string; p_failure_class: string }
        Returns: undefined
      }
      admin_create_maintenance_code: {
        Args: { p_valid_minutes: number; p_max_uses: number }
        Returns: { code: string; expires_at: string; max_uses: number }
      }
      admin_delete_member_account: {
        Args: { target: string }
        Returns: unknown
      }
      admin_member_accounts: {
        Args: Record<PropertyKey, never>
        Returns: unknown
      }
      admin_presence_summary: {
        Args: Record<PropertyKey, never>
        Returns: { online_count: number; active_count: number; sampled_at: string }
      }
      admin_revoke_maintenance_codes: {
        Args: Record<PropertyKey, never>
        Returns: { ok: boolean; revoked_count: number }
      }
      admin_set_comment_hidden: {
        Args: { p_id: number; p_hidden: boolean }
        Returns: unknown
      }
      admin_set_post_hidden: {
        Args: { p_id: number; p_hidden: boolean }
        Returns: unknown
      }
      admin_update_profile: {
        Args: { target: string; p_display_name: string | null; p_real_name?: string | null; p_signature: string | null; p_bio: string | null; p_personality: string | null; p_hobbies: string | null; p_age: number | null; p_video_status?: string | null }
        Returns: unknown
      }
      bootstrap_super_admin: {
        Args: { uname: string }
        Returns: unknown
      }
      bump_hot_snippet_view: {
        Args: { p_id: number }
        Returns: unknown
      }
      citext: {
        Args: { arg_1: string } | { arg_1: boolean } | { arg_1: unknown }
        Returns: unknown
      }
      citext_cmp: {
        Args: { arg_1: unknown; arg_2: unknown }
        Returns: unknown
      }
      citext_eq: {
        Args: { arg_1: unknown; arg_2: unknown }
        Returns: unknown
      }
      citext_ge: {
        Args: { arg_1: unknown; arg_2: unknown }
        Returns: unknown
      }
      citext_gt: {
        Args: { arg_1: unknown; arg_2: unknown }
        Returns: unknown
      }
      citext_hash: {
        Args: { arg_1: unknown }
        Returns: unknown
      }
      citext_hash_extended: {
        Args: { arg_1: unknown; arg_2: number }
        Returns: unknown
      }
      citext_larger: {
        Args: { arg_1: unknown; arg_2: unknown }
        Returns: unknown
      }
      citext_le: {
        Args: { arg_1: unknown; arg_2: unknown }
        Returns: unknown
      }
      citext_lt: {
        Args: { arg_1: unknown; arg_2: unknown }
        Returns: unknown
      }
      citext_ne: {
        Args: { arg_1: unknown; arg_2: unknown }
        Returns: unknown
      }
      citext_pattern_cmp: {
        Args: { arg_1: unknown; arg_2: unknown }
        Returns: unknown
      }
      citext_pattern_ge: {
        Args: { arg_1: unknown; arg_2: unknown }
        Returns: unknown
      }
      citext_pattern_gt: {
        Args: { arg_1: unknown; arg_2: unknown }
        Returns: unknown
      }
      citext_pattern_le: {
        Args: { arg_1: unknown; arg_2: unknown }
        Returns: unknown
      }
      citext_pattern_lt: {
        Args: { arg_1: unknown; arg_2: unknown }
        Returns: unknown
      }
      citext_smaller: {
        Args: { arg_1: unknown; arg_2: unknown }
        Returns: unknown
      }
      citextin: {
        Args: { arg_1: unknown }
        Returns: unknown
      }
      citextout: {
        Args: { arg_1: unknown }
        Returns: unknown
      }
      citextrecv: {
        Args: { arg_1: unknown }
        Returns: unknown
      }
      citextsend: {
        Args: { arg_1: unknown }
        Returns: unknown
      }
      clear_game_profile: {
        Args: Record<PropertyKey, never>
        Returns: unknown
      }
      create_song_audio_upload: {
        Args: { p_ext: string }
        Returns: string
      }
      create_invite_code: {
        Args: { new_code: string; nick: string | null }
        Returns: unknown
      }
      delete_invite_code: {
        Args: { cid: number }
        Returns: unknown
      }
      delete_member: {
        Args: { target: string }
        Returns: unknown
      }
      friend_requests: {
        Args: Record<PropertyKey, never>
        Returns: unknown
      }
      game_badges: {
        Args: Record<PropertyKey, never>
        Returns: unknown
      }
      get_or_create_conversation: {
        Args: { other: string }
        Returns: unknown
      }
      handle_new_user: {
        Args: Record<PropertyKey, never>
        Returns: unknown
      }
      invite_nickname: {
        Args: Record<PropertyKey, never>
        Returns: unknown
      }
      is_conversation_member: {
        Args: { cid: number }
        Returns: unknown
      }
      is_member: {
        Args: Record<PropertyKey, never>
        Returns: unknown
      }
      join_class: {
        Args: { code: string }
        Returns: unknown
      }
      join_with_code: {
        Args: { code: string }
        Returns: unknown
      }
      log_admin_action: {
        Args: { p_action: string; p_detail: string }
        Returns: unknown
      }
      love_wall_published: {
        Args: Record<PropertyKey, never>
        Returns: unknown
      }
      maintenance_redeem_code: {
        Args: { p_code: string }
        Returns: { ok: boolean; message?: string; token?: string; expires_at?: string }
      }
      maintenance_validate_access: {
        Args: { p_token: string }
        Returns: unknown
      }
      member_detail: {
        Args: { uid: string }
        Returns: { id: string; username: string; display_name: string | null; age: number | null; personality: string | null; signature: string | null; bio: string | null; hobbies: string | null; avatar_path: string | null; theme: Json; contact: string | null; social: string | null }[]
      }
      member_directory: {
        Args: { q: string; lim: number; skip: number }
        Returns: { id: string; username: string; display_name: string | null; personality: string | null; signature: string | null; avatar_path: string | null }[]
      }
      member_video: {
        Args: { uid: string }
        Returns: { path: string; status: string }[]
      }
      my_friends: {
        Args: Record<PropertyKey, never>
        Returns: unknown
      }
      my_role: {
        Args: Record<PropertyKey, never>
        Returns: string | null
      }
      my_review_estimates: {
        Args: Record<PropertyKey, never>
        Returns: { admin_active: boolean; items: { kind: string; id: string; created_at: string; ahead: number; total: number }[]; sampled_at: string }
      }
      notify_greeting_recipient: {
        Args: Record<PropertyKey, never>
        Returns: unknown
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

