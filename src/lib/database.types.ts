// ---------------------------------------------------------------------------
// AUTO-GENERATED — Supabase Database Types (schema: public)
// Generated from the active production project class-youth-archive2 on 2026-11-14.
// Do not hand-edit. Regenerate from the target Supabase schema after migrations.
// ---------------------------------------------------------------------------

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
      admin_app_releases: {
        Row: {
          apk_url: string
          force_update: boolean
          id: number
          min_code: number
          published_at: string
          published_by: string | null
          update_notes: string
          version_code: number
          version_name: string
        }
        Insert: {
          apk_url: string
          force_update?: boolean
          id?: never
          min_code?: number
          published_at?: string
          published_by?: string | null
          update_notes?: string
          version_code: number
          version_name: string
        }
        Update: {
          apk_url?: string
          force_update?: boolean
          id?: never
          min_code?: number
          published_at?: string
          published_by?: string | null
          update_notes?: string
          version_code?: number
          version_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_app_releases_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_audit_logs: {
        Row: {
          action: string
          actor: string | null
          created_at: string
          detail: Json | null
          id: number
          target: string | null
        }
        Insert: {
          action: string
          actor?: string | null
          created_at?: string
          detail?: Json | null
          id?: number
          target?: string | null
        }
        Update: {
          action?: string
          actor?: string | null
          created_at?: string
          detail?: Json | null
          id?: number
          target?: string | null
        }
        Relationships: []
      }
      admin_broadcasts: {
        Row: {
          audience: string
          body: string
          button_label: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: number
          kind: string
          options: Json
          poke_at: string | null
          poke_count: number
          revoked: boolean
          starts_at: string | null
          target_ids: Json
          title: string
        }
        Insert: {
          audience?: string
          body?: string
          button_label?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: never
          kind: string
          options?: Json
          poke_at?: string | null
          poke_count?: number
          revoked?: boolean
          starts_at?: string | null
          target_ids?: Json
          title?: string
        }
        Update: {
          audience?: string
          body?: string
          button_label?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: never
          kind?: string
          options?: Json
          poke_at?: string | null
          poke_count?: number
          revoked?: boolean
          starts_at?: string | null
          target_ids?: Json
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_broadcasts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_email_campaign_recipients: {
        Row: {
          campaign_id: number
          created_at: string
          error_code: string | null
          id: number
          profile_id: string | null
          provider_message_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          campaign_id: number
          created_at?: string
          error_code?: string | null
          id?: number
          profile_id?: string | null
          provider_message_id?: string | null
          status: string
          updated_at?: string
        }
        Update: {
          campaign_id?: number
          created_at?: string
          error_code?: string | null
          id?: number
          profile_id?: string | null
          provider_message_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_email_campaign_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "admin_email_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_email_campaign_recipients_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_email_campaigns: {
        Row: {
          actor_id: string | null
          completed_at: string | null
          created_at: string
          failed_count: number
          id: number
          selected_count: number
          sent_count: number
          status: string
          subject: string
        }
        Insert: {
          actor_id?: string | null
          completed_at?: string | null
          created_at?: string
          failed_count?: number
          id?: number
          selected_count: number
          sent_count?: number
          status?: string
          subject: string
        }
        Update: {
          actor_id?: string | null
          completed_at?: string | null
          created_at?: string
          failed_count?: number
          id?: number
          selected_count?: number
          sent_count?: number
          status?: string
          subject?: string
        }
        Relationships: []
      }
      album_photos: {
        Row: {
          album_id: number
          caption: string | null
          created_at: string
          id: number
          photo_url: string
          uploaded_by: string | null
        }
        Insert: {
          album_id: number
          caption?: string | null
          created_at?: string
          id?: never
          photo_url: string
          uploaded_by?: string | null
        }
        Update: {
          album_id?: number
          caption?: string | null
          created_at?: string
          id?: never
          photo_url?: string
          uploaded_by?: string | null
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
          category: string
          cover_url: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: number
          title: string
        }
        Insert: {
          category?: string
          cover_url?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: never
          title: string
        }
        Update: {
          category?: string
          cover_url?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: never
          title?: string
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
      anonymous_questions: {
        Row: {
          answer: string | null
          answered_at: string | null
          asker_deleted_at: string | null
          asker_id: string
          created_at: string
          id: string
          is_public: boolean
          moderated_at: string | null
          moderated_by: string | null
          moderation_hidden: boolean
          moderation_note: string | null
          question: string
          recipient_deleted_at: string | null
          recipient_id: string
          status: string
        }
        Insert: {
          answer?: string | null
          answered_at?: string | null
          asker_deleted_at?: string | null
          asker_id: string
          created_at?: string
          id?: string
          is_public?: boolean
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_hidden?: boolean
          moderation_note?: string | null
          question: string
          recipient_deleted_at?: string | null
          recipient_id: string
          status?: string
        }
        Update: {
          answer?: string | null
          answered_at?: string | null
          asker_deleted_at?: string | null
          asker_id?: string
          created_at?: string
          id?: string
          is_public?: boolean
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_hidden?: boolean
          moderation_note?: string | null
          question?: string
          recipient_deleted_at?: string | null
          recipient_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "anonymous_questions_asker_id_fkey"
            columns: ["asker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anonymous_questions_moderated_by_fkey"
            columns: ["moderated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anonymous_questions_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      app_announcement_reads: {
        Row: {
          announcement_id: number
          profile_id: string
          read_at: string
        }
        Insert: {
          announcement_id: number
          profile_id: string
          read_at?: string
        }
        Update: {
          announcement_id?: number
          profile_id?: string
          read_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_announcement_reads_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "app_announcements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_announcement_reads_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      app_announcements: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: number
          is_published: boolean
          published_at: string | null
          show_popup: boolean
          title: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: never
          is_published?: boolean
          published_at?: string | null
          show_popup?: boolean
          title: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: never
          is_published?: boolean
          published_at?: string | null
          show_popup?: boolean
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_announcements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      app_releases: {
        Row: {
          apk_url: string
          force_update: boolean
          id: number
          min_code: number
          published_at: string
          published_by: string | null
          update_notes: string
          version_code: number
          version_name: string
        }
        Insert: {
          apk_url: string
          force_update?: boolean
          id?: never
          min_code?: number
          published_at?: string
          published_by?: string | null
          update_notes?: string
          version_code: number
          version_name: string
        }
        Update: {
          apk_url?: string
          force_update?: boolean
          id?: never
          min_code?: number
          published_at?: string
          published_by?: string | null
          update_notes?: string
          version_code?: number
          version_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_releases_published_by_fkey"
            columns: ["published_by"]
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
        Relationships: []
      }
      authorized_request_queue: {
        Row: {
          consent_confirmed_at: string
          contact: string | null
          created_at: string
          description: string
          id: string
          profile_id: string
          request_date: string
          request_type: string
          status: string
          updated_at: string
        }
        Insert: {
          consent_confirmed_at?: string
          contact?: string | null
          created_at?: string
          description: string
          id?: string
          profile_id: string
          request_date?: string
          request_type: string
          status?: string
          updated_at?: string
        }
        Update: {
          consent_confirmed_at?: string
          contact?: string | null
          created_at?: string
          description?: string
          id?: string
          profile_id?: string
          request_date?: string
          request_type?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "authorized_request_queue_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      backup_logs: {
        Row: {
          created_at: string
          created_by: string | null
          id: number
          note: string | null
          scope: string
          status: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: never
          note?: string | null
          scope: string
          status: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: never
          note?: string | null
          scope?: string
          status?: string
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
      board_messages: {
        Row: {
          audience: string
          author_id: string | null
          content: string
          created_at: string
          deleted_at: string | null
          expires_at: string | null
          id: number
          is_admin_msg: boolean
          is_pinned: boolean
          popup_on_login: boolean
          popup_times: number
          title: string | null
        }
        Insert: {
          audience?: string
          author_id?: string | null
          content: string
          created_at?: string
          deleted_at?: string | null
          expires_at?: string | null
          id?: never
          is_admin_msg?: boolean
          is_pinned?: boolean
          popup_on_login?: boolean
          popup_times?: number
          title?: string | null
        }
        Update: {
          audience?: string
          author_id?: string | null
          content?: string
          created_at?: string
          deleted_at?: string | null
          expires_at?: string | null
          id?: never
          is_admin_msg?: boolean
          is_pinned?: boolean
          popup_on_login?: boolean
          popup_times?: number
          title?: string | null
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
          last_seen_at: string
          profile_id: string
        }
        Insert: {
          last_seen_at?: string
          profile_id: string
        }
        Update: {
          last_seen_at?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "board_reads_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcast_receipts: {
        Row: {
          answer: string | null
          broadcast_id: number
          region: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          answer?: string | null
          broadcast_id: number
          region?: string | null
          status: string
          updated_at?: string
          user_id: string
        }
        Update: {
          answer?: string | null
          broadcast_id?: number
          region?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "broadcast_receipts_broadcast_id_fkey"
            columns: ["broadcast_id"]
            isOneToOne: false
            referencedRelation: "admin_broadcasts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcast_receipts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcast_templates: {
        Row: {
          audience: string
          body: string | null
          created_at: string
          created_by: string | null
          id: number
          kind: string
          name: string
          options: Json
          title: string | null
        }
        Insert: {
          audience?: string
          body?: string | null
          created_at?: string
          created_by?: string | null
          id?: never
          kind: string
          name: string
          options?: Json
          title?: string | null
        }
        Update: {
          audience?: string
          body?: string | null
          created_at?: string
          created_by?: string | null
          id?: never
          kind?: string
          name?: string
          options?: Json
          title?: string | null
        }
        Relationships: []
      }
      capsule_reads: {
        Row: {
          capsule_id: number
          profile_id: string
          read_at: string
        }
        Insert: {
          capsule_id: number
          profile_id: string
          read_at?: string
        }
        Update: {
          capsule_id?: number
          profile_id?: string
          read_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "capsule_reads_capsule_id_fkey"
            columns: ["capsule_id"]
            isOneToOne: false
            referencedRelation: "time_capsules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capsule_reads_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          author_id: string
          content: string
          created_at: string
          deleted_at: string | null
          id: number
          post_id: number
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string
          deleted_at?: string | null
          id?: never
          post_id: number
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string
          deleted_at?: string | null
          id?: never
          post_id?: number
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
          chat_background: string
          conversation_id: number
          last_read_message_id: number | null
          last_receipt_message_id: number | null
          profile_id: string
        }
        Insert: {
          chat_background?: string
          conversation_id: number
          last_read_message_id?: number | null
          last_receipt_message_id?: number | null
          profile_id: string
        }
        Update: {
          chat_background?: string
          conversation_id?: number
          last_read_message_id?: number | null
          last_receipt_message_id?: number | null
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
            foreignKeyName: "conversation_members_last_read_message_id_fkey"
            columns: ["last_read_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_members_last_receipt_message_id_fkey"
            columns: ["last_receipt_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
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
          created_at: string
          id: number
        }
        Insert: {
          created_at?: string
          id?: number
        }
        Update: {
          created_at?: string
          id?: number
        }
        Relationships: []
      }
      email_delivery_logs: {
        Row: {
          actor_id: string | null
          attempt_count: number
          category: string
          claim_token: string | null
          created_at: string
          error_code: string | null
          event_key: string
          id: number
          provider: string
          provider_message_id: string | null
          recipient_user_id: string | null
          reference_id: string | null
          source: string
          status: string
          updated_at: string
        }
        Insert: {
          actor_id?: string | null
          attempt_count?: number
          category: string
          claim_token?: string | null
          created_at?: string
          error_code?: string | null
          event_key: string
          id?: number
          provider?: string
          provider_message_id?: string | null
          recipient_user_id?: string | null
          reference_id?: string | null
          source: string
          status?: string
          updated_at?: string
        }
        Update: {
          actor_id?: string | null
          attempt_count?: number
          category?: string
          claim_token?: string | null
          created_at?: string
          error_code?: string | null
          event_key?: string
          id?: number
          provider?: string
          provider_message_id?: string | null
          recipient_user_id?: string | null
          reference_id?: string | null
          source?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      event_regs: {
        Row: {
          created_at: string
          event_id: number
          profile_id: string
        }
        Insert: {
          created_at?: string
          event_id: number
          profile_id: string
        }
        Update: {
          created_at?: string
          event_id?: number
          profile_id?: string
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
          created_at: string
          created_by: string | null
          description: string | null
          event_at: string | null
          id: number
          location: string | null
          title: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          event_at?: string | null
          id?: never
          location?: string | null
          title: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          event_at?: string | null
          id?: never
          location?: string | null
          title?: string
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
          created_at: string
          profile_id: string
          target_id: string
          target_type: string
        }
        Insert: {
          created_at?: string
          profile_id: string
          target_id: string
          target_type: string
        }
        Update: {
          created_at?: string
          profile_id?: string
          target_id?: string
          target_type?: string
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
          admin_note: string | null
          contact: string | null
          content: string
          created_at: string
          handled_at: string | null
          handled_by: string | null
          id: number
          kind: string
          name: string | null
          status: string
          user_id: string | null
        }
        Insert: {
          admin_note?: string | null
          contact?: string | null
          content: string
          created_at?: string
          handled_at?: string | null
          handled_by?: string | null
          id?: number
          kind?: string
          name?: string | null
          status?: string
          user_id?: string | null
        }
        Update: {
          admin_note?: string | null
          contact?: string | null
          content?: string
          created_at?: string
          handled_at?: string | null
          handled_by?: string | null
          id?: number
          kind?: string
          name?: string | null
          status?: string
          user_id?: string | null
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
          addressee: string
          created_at: string
          id: number
          requester: string
          status: string
        }
        Insert: {
          addressee: string
          created_at?: string
          id?: number
          requester: string
          status?: string
        }
        Update: {
          addressee?: string
          created_at?: string
          id?: number
          requester?: string
          status?: string
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
          created_at: string
          game_name: string
          game_uid: string | null
          id: number
          profile_id: string
          rank: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          game_name: string
          game_uid?: string | null
          id?: number
          profile_id: string
          rank?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          game_name?: string
          game_uid?: string | null
          id?: number
          profile_id?: string
          rank?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_profiles_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
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
          author_id: string
          content: string
          created_at: string
          deleted_at: string | null
          id: number
          target_id: string | null
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string
          deleted_at?: string | null
          id?: never
          target_id?: string | null
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string
          deleted_at?: string | null
          id?: never
          target_id?: string | null
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
          code: string
          created_at: string
          id: number
          language: string
          source_name: string
          source_url: string | null
          summary: string
          title: string
          views: number
          window_views: number
        }
        Insert: {
          code: string
          created_at?: string
          id?: never
          language?: string
          source_name?: string
          source_url?: string | null
          summary?: string
          title: string
          views?: number
          window_views?: number
        }
        Update: {
          code?: string
          created_at?: string
          id?: never
          language?: string
          source_name?: string
          source_url?: string | null
          summary?: string
          title?: string
          views?: number
          window_views?: number
        }
        Relationships: []
      }
      invite_codes: {
        Row: {
          active: boolean
          code: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: number
          nickname: string | null
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: number
          nickname?: string | null
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: number
          nickname?: string | null
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
      location_geocode_cache: {
        Row: {
          created_at: string
          expires_at: string
          location_key: string
          location_label: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          location_key: string
          location_label: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          location_key?: string
          location_label?: string
        }
        Relationships: []
      }
      location_geocode_rate_limit: {
        Row: {
          last_request_at: string
          singleton: boolean
        }
        Insert: {
          last_request_at?: string
          singleton?: boolean
        }
        Update: {
          last_request_at?: string
          singleton?: boolean
        }
        Relationships: []
      }
      love_wall_comments: {
        Row: {
          author_id: string
          content: string
          created_at: string
          deleted_at: string | null
          id: string
          post_id: string
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          post_id: string
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "love_wall_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "love_wall_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "love_wall_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      love_wall_media: {
        Row: {
          created_at: string
          id: string
          kind: string
          path: string
          post_id: string
          sort: number
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          path: string
          post_id: string
          sort?: number
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          path?: string
          post_id?: string
          sort?: number
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
          author_id: string
          category: string
          content: string
          created_at: string
          id: string
          is_anonymous: boolean
          recipient_id: string | null
          recipient_name: string | null
          recipient_notified_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          author_id: string
          category?: string
          content: string
          created_at?: string
          id?: string
          is_anonymous?: boolean
          recipient_id?: string | null
          recipient_name?: string | null
          recipient_notified_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          category?: string
          content?: string
          created_at?: string
          id?: string
          is_anonymous?: boolean
          recipient_id?: string | null
          recipient_name?: string | null
          recipient_notified_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "love_wall_posts_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_notify_emails: {
        Row: {
          created_at: string
          email: string
          id: number
        }
        Insert: {
          created_at?: string
          email: string
          id?: never
        }
        Update: {
          created_at?: string
          email?: string
          id?: never
        }
        Relationships: []
      }
      member_presence: {
        Row: {
          app_version_code: number | null
          app_version_name: string | null
          client: string | null
          client_platform: string
          device: string | null
          location: string | null
          location_consented_at: string | null
          location_share_enabled: boolean
          profile_id: string
          updated_at: string
        }
        Insert: {
          app_version_code?: number | null
          app_version_name?: string | null
          client?: string | null
          client_platform?: string
          device?: string | null
          location?: string | null
          location_consented_at?: string | null
          location_share_enabled?: boolean
          profile_id: string
          updated_at?: string
        }
        Update: {
          app_version_code?: number | null
          app_version_name?: string | null
          client?: string | null
          client_platform?: string
          device?: string | null
          location?: string | null
          location_consented_at?: string | null
          location_share_enabled?: boolean
          profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_presence_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reactions: {
        Row: {
          created_at: string
          message_id: number
          profile_id: string
          reaction: string
        }
        Insert: {
          created_at?: string
          message_id: number
          profile_id: string
          reaction: string
        }
        Update: {
          created_at?: string
          message_id?: number
          profile_id?: string
          reaction?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reactions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          conversation_id: number
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: number
          reply_to_id: number | null
          sender_id: string
        }
        Insert: {
          body: string
          conversation_id: number
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: number
          reply_to_id?: number | null
          sender_id: string
        }
        Update: {
          body?: string
          conversation_id?: number
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: number
          reply_to_id?: number | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      music_download_logs: {
        Row: {
          artist: string
          created_at: string
          device_label: string
          error: string | null
          file_size: number | null
          id: number
          site_user_id: string | null
          site_username: string | null
          song_id: string
          song_name: string
          status: string
        }
        Insert: {
          artist?: string
          created_at?: string
          device_label?: string
          error?: string | null
          file_size?: number | null
          id?: never
          site_user_id?: string | null
          site_username?: string | null
          song_id: string
          song_name?: string
          status: string
        }
        Update: {
          artist?: string
          created_at?: string
          device_label?: string
          error?: string | null
          file_size?: number | null
          id?: never
          site_user_id?: string | null
          site_username?: string | null
          song_id?: string
          song_name?: string
          status?: string
        }
        Relationships: []
      }
      musicdl_app_releases: {
        Row: {
          apk_url: string
          force_update: boolean
          id: number
          min_code: number
          published_at: string
          published_by: string | null
          update_notes: string
          version_code: number
          version_name: string
        }
        Insert: {
          apk_url: string
          force_update?: boolean
          id?: never
          min_code?: number
          published_at?: string
          published_by?: string | null
          update_notes?: string
          version_code: number
          version_name: string
        }
        Update: {
          apk_url?: string
          force_update?: boolean
          id?: never
          min_code?: number
          published_at?: string
          published_by?: string | null
          update_notes?: string
          version_code?: number
          version_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "musicdl_app_releases_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      netease_account_links: {
        Row: {
          avatar_url: string
          cookie_ciphertext: string
          cookie_iv: string
          created_at: string
          key_version: number
          last_verified_at: string | null
          netease_user_id: string
          nickname: string
          site_user_id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string
          cookie_ciphertext: string
          cookie_iv: string
          created_at?: string
          key_version?: number
          last_verified_at?: string | null
          netease_user_id: string
          nickname?: string
          site_user_id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string
          cookie_ciphertext?: string
          cookie_iv?: string
          created_at?: string
          key_version?: number
          last_verified_at?: string | null
          netease_user_id?: string
          nickname?: string
          site_user_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: number
          is_read: boolean
          link: string | null
          profile_id: string
          title: string
          type: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: never
          is_read?: boolean
          link?: string | null
          profile_id: string
          title: string
          type?: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: never
          is_read?: boolean
          link?: string | null
          profile_id?: string
          title?: string
          type?: string
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
      page_views: {
        Row: {
          page_key: string
          updated_at: string
          views: number
        }
        Insert: {
          page_key: string
          updated_at?: string
          views?: number
        }
        Update: {
          page_key?: string
          updated_at?: string
          views?: number
        }
        Relationships: []
      }
      post_impression_options: {
        Row: {
          id: number
          label: string
          position: number
          post_id: number
        }
        Insert: {
          id?: number
          label: string
          position: number
          post_id: number
        }
        Update: {
          id?: number
          label?: string
          position?: number
          post_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "post_impression_options_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "post_impression_polls"
            referencedColumns: ["post_id"]
          },
        ]
      }
      post_impression_polls: {
        Row: {
          author_id: string
          created_at: string
          post_id: number
          question: string
        }
        Insert: {
          author_id: string
          created_at?: string
          post_id: number
          question: string
        }
        Update: {
          author_id?: string
          created_at?: string
          post_id?: number
          question?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_impression_polls_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_impression_polls_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: true
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_impression_votes: {
        Row: {
          created_at: string
          option_id: number
          post_id: number
          voter_id: string
        }
        Insert: {
          created_at?: string
          option_id: number
          post_id: number
          voter_id: string
        }
        Update: {
          created_at?: string
          option_id?: number
          post_id?: number
          voter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_impression_votes_option_fk"
            columns: ["post_id", "option_id"]
            isOneToOne: false
            referencedRelation: "post_impression_options"
            referencedColumns: ["post_id", "id"]
          },
          {
            foreignKeyName: "post_impression_votes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "post_impression_polls"
            referencedColumns: ["post_id"]
          },
          {
            foreignKeyName: "post_impression_votes_voter_id_fkey"
            columns: ["voter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      post_likes: {
        Row: {
          created_at: string
          post_id: number
          profile_id: string
        }
        Insert: {
          created_at?: string
          post_id: number
          profile_id: string
        }
        Update: {
          created_at?: string
          post_id?: number
          profile_id?: string
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
          author_id: string
          content: string
          created_at: string
          deleted_at: string | null
          id: number
          image_url: string | null
          section: string
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string
          deleted_at?: string | null
          id?: never
          image_url?: string | null
          section?: string
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string
          deleted_at?: string | null
          id?: never
          image_url?: string | null
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
          contact: string | null
          game_id: string | null
          profile_id: string
          social: string | null
        }
        Insert: {
          contact?: string | null
          game_id?: string | null
          profile_id: string
          social?: string | null
        }
        Update: {
          contact?: string | null
          game_id?: string | null
          profile_id?: string
          social?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profile_contacts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_emails: {
        Row: {
          email: string
          profile_id: string
        }
        Insert: {
          email: string
          profile_id: string
        }
        Update: {
          email?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_emails_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_notification_preferences: {
        Row: {
          preferences: Json
          profile_id: string
          updated_at: string
        }
        Insert: {
          preferences?: Json
          profile_id: string
          updated_at?: string
        }
        Update: {
          preferences?: Json
          profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_notification_preferences_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_privacy: {
        Row: {
          hide_love_wall_name: boolean
          profile_id: string
          show_age: boolean
          show_avatar: boolean
          show_bio: boolean
          show_contact: boolean
          show_game_id: boolean
          show_hobbies: boolean
          show_name: boolean
          show_personality: boolean
          show_signature: boolean
          show_social: boolean
          show_title: boolean
        }
        Insert: {
          hide_love_wall_name?: boolean
          profile_id: string
          show_age?: boolean
          show_avatar?: boolean
          show_bio?: boolean
          show_contact?: boolean
          show_game_id?: boolean
          show_hobbies?: boolean
          show_name?: boolean
          show_personality?: boolean
          show_signature?: boolean
          show_social?: boolean
          show_title?: boolean
        }
        Update: {
          hide_love_wall_name?: boolean
          profile_id?: string
          show_age?: boolean
          show_avatar?: boolean
          show_bio?: boolean
          show_contact?: boolean
          show_game_id?: boolean
          show_hobbies?: boolean
          show_name?: boolean
          show_personality?: boolean
          show_signature?: boolean
          show_social?: boolean
          show_title?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "profile_privacy_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          age: number | null
          avatar_path: string | null
          bio: string | null
          created_at: string
          display_name: string | null
          hobbies: string | null
          id: string
          intro_video_path: string | null
          intro_video_status: string
          joined: boolean
          personality: string | null
          phone: string | null
          profile_title: string | null
          real_name: string | null
          role: string
          signature: string | null
          theme: Json
          username: string
        }
        Insert: {
          age?: number | null
          avatar_path?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          hobbies?: string | null
          id: string
          intro_video_path?: string | null
          intro_video_status?: string
          joined?: boolean
          personality?: string | null
          phone?: string | null
          profile_title?: string | null
          real_name?: string | null
          role?: string
          signature?: string | null
          theme?: Json
          username: string
        }
        Update: {
          age?: number | null
          avatar_path?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          hobbies?: string | null
          id?: string
          intro_video_path?: string | null
          intro_video_status?: string
          joined?: boolean
          personality?: string | null
          phone?: string | null
          profile_title?: string | null
          real_name?: string | null
          role?: string
          signature?: string | null
          theme?: Json
          username?: string
        }
        Relationships: []
      }
      reports: {
        Row: {
          created_at: string
          handle_note: string | null
          handled_at: string | null
          handled_by: string | null
          id: number
          reason: string
          reporter_id: string | null
          status: string
          target_id: string
          target_type: string
        }
        Insert: {
          created_at?: string
          handle_note?: string | null
          handled_at?: string | null
          handled_by?: string | null
          id?: never
          reason: string
          reporter_id?: string | null
          status?: string
          target_id: string
          target_type: string
        }
        Update: {
          created_at?: string
          handle_note?: string | null
          handled_at?: string | null
          handled_by?: string | null
          id?: never
          reason?: string
          reporter_id?: string | null
          status?: string
          target_id?: string
          target_type?: string
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
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value?: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      song_audio_uploads: {
        Row: {
          created_at: string
          path: string
          profile_id: string
        }
        Insert: {
          created_at?: string
          path: string
          profile_id: string
        }
        Update: {
          created_at?: string
          path?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "song_audio_uploads_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      song_posts: {
        Row: {
          audio_path: string
          author_id: string
          created_at: string
          description: string | null
          duration_seconds: number | null
          id: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          audio_path: string
          author_id: string
          created_at?: string
          description?: string | null
          duration_seconds?: number | null
          id?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          audio_path?: string
          author_id?: string
          created_at?: string
          description?: string | null
          duration_seconds?: number | null
          id?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      time_capsules: {
        Row: {
          author_id: string | null
          content: string
          created_at: string
          deleted_at: string | null
          id: number
          is_public: boolean
          open_at: string
          title: string
        }
        Insert: {
          author_id?: string | null
          content: string
          created_at?: string
          deleted_at?: string | null
          id?: never
          is_public?: boolean
          open_at: string
          title: string
        }
        Update: {
          author_id?: string | null
          content?: string
          created_at?: string
          deleted_at?: string | null
          id?: never
          is_public?: boolean
          open_at?: string
          title?: string
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
          content: string | null
          created_at: string
          happened_on: string
          id: number
          media_url: string | null
          profile_id: string
          title: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          happened_on: string
          id?: never
          media_url?: string | null
          profile_id: string
          title: string
        }
        Update: {
          content?: string | null
          created_at?: string
          happened_on?: string
          id?: never
          media_url?: string | null
          profile_id?: string
          title?: string
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
      user_blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      wishes: {
        Row: {
          author_id: string | null
          content: string
          created_at: string
          id: number
          likes: number
        }
        Insert: {
          author_id?: string | null
          content: string
          created_at?: string
          id?: never
          likes?: number
        }
        Update: {
          author_id?: string | null
          content?: string
          created_at?: string
          id?: never
          likes?: number
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
      admin_analytics_overview: { Args: { p_days?: number }; Returns: Json }
      admin_apply_member_moderation: {
        Args: {
          p_action_type: string
          p_duration_hours?: number
          p_reason: string
          p_target_user_id: string
        }
        Returns: string
      }
      admin_backup_overview: { Args: never; Returns: Json }
      admin_client_platform_members: {
        Args: never
        Returns: {
          app_version_code: number
          app_version_name: string
          client_platform: string
          device: string
          display_name: string
          id: string
          presence_updated_at: string
          username: string
        }[]
      }
      admin_client_stats: { Args: never; Returns: Json }
      admin_create_app_announcement: {
        Args: {
          p_body: string
          p_expires_at?: string
          p_show_popup?: boolean
          p_title: string
        }
        Returns: Json
      }
      admin_create_maintenance_code: {
        Args: { p_max_uses?: number; p_valid_minutes?: number }
        Returns: Json
      }
      admin_decide_sensitive_action: {
        Args: { p_approve: boolean; p_note?: string; p_request_id: string }
        Returns: undefined
      }
      admin_delete_member_account: {
        Args: { target: string }
        Returns: undefined
      }
      admin_email_campaign_history: { Args: never; Returns: Json }
      admin_execute_sensitive_action: {
        Args: {
          p_action_type: string
          p_reason: string
          p_requested_role: string
          p_target_user_id: string
        }
        Returns: undefined
      }
      admin_get_guest_access_settings: { Args: never; Returns: Json }
      admin_list_admin_app_releases: {
        Args: never
        Returns: {
          apk_url: string
          force_update: boolean
          id: number
          min_code: number
          published_at: string
          update_notes: string
          version_code: number
          version_name: string
        }[]
      }
      admin_list_anonymous_questions: {
        Args: never
        Returns: {
          answer: string
          asker_id: string
          asker_name: string
          created_at: string
          id: string
          is_public: boolean
          moderation_hidden: boolean
          question: string
          recipient_id: string
          recipient_name: string
          status: string
        }[]
      }
      admin_list_app_announcements: {
        Args: never
        Returns: {
          body: string
          created_at: string
          expires_at: string
          id: number
          is_published: boolean
          published_at: string
          show_popup: boolean
          title: string
        }[]
      }
      admin_list_app_releases: {
        Args: never
        Returns: {
          apk_url: string
          force_update: boolean
          id: number
          min_code: number
          published_at: string
          update_notes: string
          version_code: number
          version_name: string
        }[]
      }
      admin_list_musicdl_app_releases: {
        Args: never
        Returns: {
          apk_url: string
          force_update: boolean
          id: number
          min_code: number
          published_at: string
          update_notes: string
          version_code: number
          version_name: string
        }[]
      }
      admin_member_accounts: {
        Args: never
        Returns: {
          app_version_code: number
          app_version_name: string
          client: string
          client_platform: string
          created_at: string
          device: string
          display_name: string
          email: string
          id: string
          joined: boolean
          last_sign_in_at: string
          location: string
          presence_updated_at: string
          real_name: string
          role: string
          username: string
        }[]
      }
      admin_member_activity: { Args: { p_target: string }; Returns: Json }
      admin_member_moderation: {
        Args: { p_target_user_id: string }
        Returns: Json
      }
      admin_presence_summary: { Args: never; Returns: Json }
      admin_publish_admin_app_release: {
        Args: {
          p_apk_url: string
          p_force_update?: boolean
          p_min_code?: number
          p_notes?: string
          p_version_code: number
          p_version_name: string
        }
        Returns: number
      }
      admin_publish_app_release: {
        Args: {
          p_apk_url: string
          p_force_update?: boolean
          p_min_code?: number
          p_notes?: string
          p_version_code: number
          p_version_name: string
        }
        Returns: number
      }
      admin_publish_musicdl_app_release: {
        Args: {
          p_apk_url: string
          p_force_update?: boolean
          p_min_code?: number
          p_notes?: string
          p_version_code: number
          p_version_name: string
        }
        Returns: number
      }
      admin_record_manual_backup: {
        Args: { p_note: string; p_scope: string }
        Returns: number
      }
      admin_request_sensitive_action: {
        Args: {
          p_action_type: string
          p_reason: string
          p_requested_role: string
          p_target_user_id: string
        }
        Returns: string
      }
      admin_resolve_authorized_request: {
        Args: { p_found: boolean; p_request_id: string }
        Returns: Json
      }
      admin_revoke_maintenance_codes: { Args: never; Returns: Json }
      admin_revoke_member_moderation: {
        Args: { p_action_id: string; p_reason: string }
        Returns: undefined
      }
      admin_save_guest_access_setting: {
        Args: { p_key: string; p_value: string }
        Returns: undefined
      }
      admin_security_overview: { Args: never; Returns: Json }
      admin_send_member_message: {
        Args: {
          p_body: string
          p_link?: string
          p_recipient_ids: string[]
          p_title: string
        }
        Returns: number
      }
      admin_send_notification_campaign: {
        Args: {
          p_body: string
          p_link?: string
          p_recipient_ids?: string[]
          p_title: string
        }
        Returns: number
      }
      admin_sensitive_action_requests: { Args: never; Returns: Json }
      admin_set_anonymous_question_hidden: {
        Args: { p_hidden: boolean; p_question_id: string }
        Returns: boolean
      }
      admin_set_app_announcement_status: {
        Args: { p_announcement_id: number; p_is_published: boolean }
        Returns: undefined
      }
      admin_set_comment_hidden: {
        Args: { p_hidden: boolean; p_id: number }
        Returns: undefined
      }
      admin_set_post_hidden: {
        Args: { p_hidden: boolean; p_id: number }
        Returns: undefined
      }
      admin_update_feedback: {
        Args: { p_admin_note?: string; p_feedback_id: number; p_status: string }
        Returns: undefined
      }
      admin_update_profile: {
        Args: {
          p_age?: number
          p_bio?: string
          p_display_name?: string
          p_hobbies?: string
          p_personality?: string
          p_real_name?: string
          p_signature?: string
          p_video_status?: string
          target: string
        }
        Returns: undefined
      }
      answer_anonymous_question: {
        Args: { p_answer: string; p_publish?: boolean; p_question_id: string }
        Returns: boolean
      }
      block_member: { Args: { target: string }; Returns: undefined }
      bootstrap_super_admin: { Args: { uname: string }; Returns: undefined }
      bump_hot_snippet_view: { Args: { p_id: number }; Returns: undefined }
      bump_page_view: { Args: { p_key: string }; Returns: number }
      cast_post_impression_vote: {
        Args: { p_option_id: number; p_post_id: number }
        Returns: boolean
      }
      claim_location_geocode_slot: { Args: never; Returns: boolean }
      clear_game_profile: { Args: never; Returns: undefined }
      clear_username_login_attempts: {
        Args: { p_identifier_hash: string }
        Returns: undefined
      }
      consume_dev_feedback_attempt: {
        Args: { p_profile_id: string }
        Returns: boolean
      }
      consume_username_login_attempt: {
        Args: { p_identifier_hash: string }
        Returns: boolean
      }
      create_invite_code: {
        Args: { new_code: string; nick: string }
        Returns: undefined
      }
      create_post_impression_poll: {
        Args: { p_options: string[]; p_post_id: number; p_question: string }
        Returns: boolean
      }
      create_song_audio_upload: { Args: { p_ext: string }; Returns: string }
      delete_anonymous_question: {
        Args: { p_question_id: string }
        Returns: boolean
      }
      delete_chat_message: {
        Args: { p_message_id: number }
        Returns: undefined
      }
      delete_invite_code: { Args: { cid: number }; Returns: undefined }
      delete_member: { Args: { target: string }; Returns: undefined }
      edit_chat_message: {
        Args: { p_body: string; p_message_id: number }
        Returns: undefined
      }
      friend_requests: {
        Args: never
        Returns: {
          avatar_path: string
          created_at: string
          display_name: string
          id: string
          username: string
        }[]
      }
      game_badges: {
        Args: never
        Returns: {
          game_name: string
          game_uid: string
          profile_id: string
          rank: string
        }[]
      }
      get_my_growth_summary: {
        Args: never
        Returns: {
          active_days: number
          comments: number
          events: number
          first_event_at: string
          first_photo_at: string
          first_post_at: string
          notices: number
          photos: number
          posts: number
          seventh_active_day: string
          tenth_comment_at: string
        }[]
      }
      get_my_shared_region: {
        Args: never
        Returns: {
          location: string
          location_consented_at: string
          location_share_enabled: boolean
        }[]
      }
      get_or_create_conversation: { Args: { other: string }; Returns: number }
      get_page_views: { Args: { p_key: string }; Returns: number }
      get_post_impression_poll_results: {
        Args: { p_post_ids: number[] }
        Returns: {
          my_option_id: number
          option_id: number
          option_label: string
          option_position: number
          post_id: number
          question: string
          total_votes: number
          vote_count: number
        }[]
      }
      guest_public_posts: {
        Args: { p_limit?: number; p_offset?: number; p_section?: string }
        Returns: {
          author_name: string
          comment_count: number
          content: string
          created_at: string
          id: number
          image_url: string
          like_count: number
          section: string
        }[]
      }
      invite_nickname: { Args: never; Returns: string }
      is_member: { Args: never; Returns: boolean }
      join_class: { Args: { code: string }; Returns: boolean }
      join_with_code: { Args: { code: string }; Returns: string }
      link_love_wall_media_post: {
        Args: { p_path: string; p_post_id: string }
        Returns: undefined
      }
      log_admin_action: {
        Args: { p_action: string; p_detail?: string }
        Returns: undefined
      }
      log_music_download: {
        Args: {
          p_artist: string
          p_device_label: string
          p_error: string
          p_file_size: number
          p_site_user_id?: string
          p_site_username?: string
          p_song_id: string
          p_song_name: string
          p_status: string
        }
        Returns: number
      }
      love_wall_guest_published: {
        Args: never
        Returns: {
          category: string
          comment_count: number
          content: string
          created_at: string
          id: string
          is_anonymous: boolean
          recipient_name: string
        }[]
      }
      love_wall_media_for_posts: {
        Args: { p_post_ids: string[] }
        Returns: {
          id: string
          kind: string
          path: string
          post_id: string
          sort: number
        }[]
      }
      love_wall_media_paths_referenced: {
        Args: { p_paths: string[] }
        Returns: {
          path: string
        }[]
      }
      love_wall_published: {
        Args: never
        Returns: {
          author_display_name: string
          category: string
          content: string
          created_at: string
          id: string
          is_anonymous: boolean
          recipient_name: string
          status: string
        }[]
      }
      maintenance_redeem_code: { Args: { p_code: string }; Returns: Json }
      maintenance_validate_access: {
        Args: { p_token: string }
        Returns: boolean
      }
      mark_app_announcement_read: {
        Args: { p_announcement_id: number }
        Returns: undefined
      }
      mark_conversation_read: {
        Args: { p_conversation_id: number }
        Returns: number
      }
      member_detail: {
        Args: { uid: string }
        Returns: {
          age: number
          avatar_path: string
          bio: string
          contact: string
          display_name: string
          game_id: string
          hobbies: string
          id: string
          personality: string
          profile_title: string
          signature: string
          social: string
          theme: Json
          username: string
        }[]
      }
      member_directory: {
        Args: { lim?: number; q?: string; skip?: number }
        Returns: {
          avatar_path: string
          display_name: string
          id: string
          personality: string
          signature: string
          username: string
        }[]
      }
      member_moderation_allows: { Args: { p_scope: string }; Returns: boolean }
      member_video: {
        Args: { uid: string }
        Returns: {
          path: string
          status: string
        }[]
      }
      migrate_legacy_love_wall_media_path: {
        Args: { p_media_id: string; p_new_path: string; p_old_path: string }
        Returns: undefined
      }
      my_anonymous_question_inbox: {
        Args: never
        Returns: {
          answer: string
          answered_at: string
          created_at: string
          id: string
          is_public: boolean
          question: string
          status: string
        }[]
      }
      my_authorized_request_queue: {
        Args: never
        Returns: {
          created_at: string
          id: string
          request_date: string
          request_type: string
          status: string
        }[]
      }
      my_blocked_members: {
        Args: never
        Returns: {
          avatar_path: string
          blocked_at: string
          display_name: string
          id: string
          username: string
        }[]
      }
      my_conversations: {
        Args: never
        Returns: {
          avatar_path: string
          conversation_created_at: string
          conversation_id: number
          display_name: string
          last_message_at: string
          last_message_body: string
          last_message_deleted: boolean
          last_message_id: number
          last_message_sender_id: string
          other_last_read_message_id: number
          other_profile_id: string
          unread_count: number
          username: string
        }[]
      }
      my_friends: {
        Args: never
        Returns: {
          avatar_path: string
          display_name: string
          id: string
          username: string
        }[]
      }
      my_review_estimates: { Args: never; Returns: Json }
      my_role: { Args: never; Returns: string }
      my_sent_anonymous_questions: {
        Args: never
        Returns: {
          answer: string
          answered_at: string
          created_at: string
          id: string
          question: string
          recipient_name: string
          status: string
        }[]
      }
      public_admin_app_update: { Args: never; Returns: Json }
      public_anonymous_question_answers: {
        Args: { p_profile_id: string }
        Returns: {
          answer: string
          answered_at: string
          id: string
          question: string
        }[]
      }
      public_app_announcements: {
        Args: never
        Returns: {
          body: string
          created_at: string
          id: number
          title: string
        }[]
      }
      public_app_update: { Args: never; Returns: Json }
      public_guest_landing: { Args: never; Returns: Json }
      public_musicdl_app_update: { Args: never; Returns: Json }
      record_auth_login_failure: {
        Args: { p_failure_class: string; p_method: string }
        Returns: undefined
      }
      register_love_wall_media_upload: {
        Args: { p_path: string }
        Returns: undefined
      }
      relationship_state: {
        Args: { target: string }
        Returns: {
          blocked_by_me: boolean
          blocked_me: boolean
          friend_requester: string
          friend_status: string
        }[]
      }
      remove_friend: { Args: { target: string }; Returns: undefined }
      report_anonymous_question: {
        Args: { p_question_id: string; p_reason: string }
        Returns: boolean
      }
      resolve_login_email: { Args: { ident: string }; Returns: string }
      respond_friend_request: {
        Args: { accept: boolean; req: string }
        Returns: undefined
      }
      review_game_profile: {
        Args: { approve: boolean; pid: string }
        Returns: undefined
      }
      revoke_my_shared_region: { Args: never; Returns: undefined }
      send_friend_request: { Args: { target: string }; Returns: string }
      set_chat_background: {
        Args: { p_background: string; p_conversation_id: number }
        Returns: undefined
      }
      set_invite_code: { Args: { new_code: string }; Returns: undefined }
      set_invite_code_active: {
        Args: { active: boolean; cid: number }
        Returns: undefined
      }
      set_invite_settings: {
        Args: { new_code: string; nick: string }
        Returns: undefined
      }
      set_joined: { Args: { j: boolean; target: string }; Returns: undefined }
      set_my_profile_title: { Args: { p_title: string }; Returns: undefined }
      set_my_shared_region: { Args: { p_location: string }; Returns: string }
      set_role: {
        Args: { new_role: string; target: string }
        Returns: undefined
      }
      site_feature_enabled: { Args: { p_feature: string }; Returns: boolean }
      song_wall_published: {
        Args: never
        Returns: {
          audio_path: string
          created_at: string
          description: string
          duration_seconds: number
          id: string
          title: string
        }[]
      }
      submit_anonymous_question: {
        Args: { p_content: string; p_recipient_id: string }
        Returns: string
      }
      submit_authorized_request: {
        Args: {
          p_confirmed?: boolean
          p_contact?: string
          p_description: string
          p_request_type: string
        }
        Returns: Json
      }
      submit_game_profile: {
        Args: { gname: string; guid: string; rnk: string }
        Returns: undefined
      }
      submit_intro_video: { Args: { p_path: string }; Returns: undefined }
      unblock_member: { Args: { target: string }; Returns: undefined }
      username_available: { Args: { u: string }; Returns: boolean }
      withdraw_friend_request: { Args: { target: string }; Returns: string }
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
