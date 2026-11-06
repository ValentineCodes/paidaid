export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      app_config: {
        Row: {
          allow_cross_asset_responses: boolean;
          id: number;
          updated_at: string;
        };
        Insert: {
          allow_cross_asset_responses?: boolean;
          id?: number;
          updated_at?: string;
        };
        Update: {
          allow_cross_asset_responses?: boolean;
          id?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      assets: {
        Row: {
          asset_standard: Database["public"]["Enums"]["asset_standard"];
          canonical_asset_key: string;
          chain_id: string;
          created_at: string;
          decimals: number;
          id: string;
          native_reference: string | null;
          symbol: string;
          token_contract_id: string | null;
        };
        Insert: {
          asset_standard: Database["public"]["Enums"]["asset_standard"];
          canonical_asset_key: string;
          chain_id: string;
          created_at?: string;
          decimals: number;
          id?: string;
          native_reference?: string | null;
          symbol: string;
          token_contract_id?: string | null;
        };
        Update: {
          asset_standard?: Database["public"]["Enums"]["asset_standard"];
          canonical_asset_key?: string;
          chain_id?: string;
          created_at?: string;
          decimals?: number;
          id?: string;
          native_reference?: string | null;
          symbol?: string;
          token_contract_id?: string | null;
        };
        Relationships: [];
      };
      assignments: {
        Row: {
          accepted_response_id: string;
          created_at: string;
          id: string;
          provider_user_id: string;
          request_id: string;
          requester_id: string;
        };
        Insert: {
          accepted_response_id: string;
          created_at?: string;
          id?: string;
          provider_user_id: string;
          request_id: string;
          requester_id: string;
        };
        Update: {
          accepted_response_id?: string;
          created_at?: string;
          id?: string;
          provider_user_id?: string;
          request_id?: string;
          requester_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "assignments_accepted_response_id_fkey";
            columns: ["accepted_response_id"];
            isOneToOne: true;
            referencedRelation: "request_responses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "assignments_provider_user_id_fkey";
            columns: ["provider_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "assignments_request_id_fkey";
            columns: ["request_id"];
            isOneToOne: true;
            referencedRelation: "requests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "assignments_request_id_fkey";
            columns: ["request_id"];
            isOneToOne: true;
            referencedRelation: "requests_public";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "assignments_requester_id_fkey";
            columns: ["requester_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      conversations: {
        Row: {
          created_at: string;
          engagement_id: string | null;
          id: string;
          kind: Database["public"]["Enums"]["conversation_kind"];
          request_id: string;
          response_id: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          engagement_id?: string | null;
          id?: string;
          kind: Database["public"]["Enums"]["conversation_kind"];
          request_id: string;
          response_id?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          engagement_id?: string | null;
          id?: string;
          kind?: Database["public"]["Enums"]["conversation_kind"];
          request_id?: string;
          response_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "conversations_engagement_id_fkey";
            columns: ["engagement_id"];
            isOneToOne: false;
            referencedRelation: "engagements";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversations_request_id_fkey";
            columns: ["request_id"];
            isOneToOne: false;
            referencedRelation: "requests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversations_request_id_fkey";
            columns: ["request_id"];
            isOneToOne: false;
            referencedRelation: "requests_public";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversations_response_id_fkey";
            columns: ["response_id"];
            isOneToOne: false;
            referencedRelation: "request_responses";
            referencedColumns: ["id"];
          },
        ];
      };
      deliveries: {
        Row: {
          approved_at: string | null;
          created_at: string;
          description: string;
          engagement_id: string;
          id: string;
          provider_user_id: string;
          revision_requested_at: string | null;
          status: Database["public"]["Enums"]["delivery_status"];
          submitted_at: string | null;
          updated_at: string;
        };
        Insert: {
          approved_at?: string | null;
          created_at?: string;
          description: string;
          engagement_id: string;
          id?: string;
          provider_user_id: string;
          revision_requested_at?: string | null;
          status?: Database["public"]["Enums"]["delivery_status"];
          submitted_at?: string | null;
          updated_at?: string;
        };
        Update: {
          approved_at?: string | null;
          created_at?: string;
          description?: string;
          engagement_id?: string;
          id?: string;
          provider_user_id?: string;
          revision_requested_at?: string | null;
          status?: Database["public"]["Enums"]["delivery_status"];
          submitted_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "deliveries_engagement_id_fkey";
            columns: ["engagement_id"];
            isOneToOne: true;
            referencedRelation: "engagements";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deliveries_provider_user_id_fkey";
            columns: ["provider_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      delivery_attachments: {
        Row: {
          byte_size: number;
          created_at: string;
          delivery_id: string;
          id: string;
          mime_type: string;
          sort_order: number;
          storage_path: string;
        };
        Insert: {
          byte_size: number;
          created_at?: string;
          delivery_id: string;
          id?: string;
          mime_type: string;
          sort_order?: number;
          storage_path: string;
        };
        Update: {
          byte_size?: number;
          created_at?: string;
          delivery_id?: string;
          id?: string;
          mime_type?: string;
          sort_order?: number;
          storage_path?: string;
        };
        Relationships: [
          {
            foreignKeyName: "delivery_attachments_delivery_id_fkey";
            columns: ["delivery_id"];
            isOneToOne: false;
            referencedRelation: "deliveries";
            referencedColumns: ["id"];
          },
        ];
      };
      engagement_issues: {
        Row: {
          body: string;
          category: string;
          created_at: string;
          engagement_id: string;
          id: string;
          reporter_id: string;
          resolved_at: string | null;
          status: Database["public"]["Enums"]["issue_status"];
        };
        Insert: {
          body: string;
          category: string;
          created_at?: string;
          engagement_id: string;
          id?: string;
          reporter_id: string;
          resolved_at?: string | null;
          status?: Database["public"]["Enums"]["issue_status"];
        };
        Update: {
          body?: string;
          category?: string;
          created_at?: string;
          engagement_id?: string;
          id?: string;
          reporter_id?: string;
          resolved_at?: string | null;
          status?: Database["public"]["Enums"]["issue_status"];
        };
        Relationships: [
          {
            foreignKeyName: "engagement_issues_engagement_id_fkey";
            columns: ["engagement_id"];
            isOneToOne: false;
            referencedRelation: "engagements";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "engagement_issues_reporter_id_fkey";
            columns: ["reporter_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      engagements: {
        Row: {
          assignment_id: string;
          auto_complete_deadline_at: string | null;
          auto_completed_at: string | null;
          completed_at: string | null;
          created_at: string;
          id: string;
          provider_user_id: string;
          scheduled_for_day: string;
          status: Database["public"]["Enums"]["engagement_status"];
          updated_at: string;
        };
        Insert: {
          assignment_id: string;
          auto_complete_deadline_at?: string | null;
          auto_completed_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          id?: string;
          provider_user_id: string;
          scheduled_for_day: string;
          status?: Database["public"]["Enums"]["engagement_status"];
          updated_at?: string;
        };
        Update: {
          assignment_id?: string;
          auto_complete_deadline_at?: string | null;
          auto_completed_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          id?: string;
          provider_user_id?: string;
          scheduled_for_day?: string;
          status?: Database["public"]["Enums"]["engagement_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "engagements_assignment_id_fkey";
            columns: ["assignment_id"];
            isOneToOne: true;
            referencedRelation: "assignments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "engagements_provider_user_id_fkey";
            columns: ["provider_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      message_attachments: {
        Row: {
          byte_size: number;
          created_at: string;
          id: string;
          message_id: string;
          mime_type: string;
          sort_order: number;
          storage_path: string;
        };
        Insert: {
          byte_size: number;
          created_at?: string;
          id?: string;
          message_id: string;
          mime_type: string;
          sort_order?: number;
          storage_path: string;
        };
        Update: {
          byte_size?: number;
          created_at?: string;
          id?: string;
          message_id?: string;
          mime_type?: string;
          sort_order?: number;
          storage_path?: string;
        };
        Relationships: [
          {
            foreignKeyName: "message_attachments_message_id_fkey";
            columns: ["message_id"];
            isOneToOne: false;
            referencedRelation: "messages";
            referencedColumns: ["id"];
          },
        ];
      };
      message_reads: {
        Row: {
          message_id: string;
          read_at: string;
          user_id: string;
        };
        Insert: {
          message_id: string;
          read_at?: string;
          user_id: string;
        };
        Update: {
          message_id?: string;
          read_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "message_reads_message_id_fkey";
            columns: ["message_id"];
            isOneToOne: false;
            referencedRelation: "messages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "message_reads_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      messages: {
        Row: {
          body: string | null;
          conversation_id: string;
          created_at: string;
          id: string;
          kind: Database["public"]["Enums"]["message_kind"];
          location_label: string | null;
          location_lat: number | null;
          location_lng: number | null;
          sender_id: string;
          updated_at: string;
        };
        Insert: {
          body?: string | null;
          conversation_id: string;
          created_at?: string;
          id?: string;
          kind?: Database["public"]["Enums"]["message_kind"];
          location_label?: string | null;
          location_lat?: number | null;
          location_lng?: number | null;
          sender_id: string;
          updated_at?: string;
        };
        Update: {
          body?: string | null;
          conversation_id?: string;
          created_at?: string;
          id?: string;
          kind?: Database["public"]["Enums"]["message_kind"];
          location_label?: string | null;
          location_lat?: number | null;
          location_lng?: number | null;
          sender_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_sender_id_fkey";
            columns: ["sender_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          body: string | null;
          category: Database["public"]["Enums"]["notification_category"];
          conversation_id: string | null;
          created_at: string;
          engagement_id: string | null;
          id: string;
          kind: Database["public"]["Enums"]["notification_kind"];
          message_id: string | null;
          read_at: string | null;
          request_id: string | null;
          response_id: string | null;
          title: string;
          user_id: string;
        };
        Insert: {
          body?: string | null;
          category: Database["public"]["Enums"]["notification_category"];
          conversation_id?: string | null;
          created_at?: string;
          engagement_id?: string | null;
          id?: string;
          kind: Database["public"]["Enums"]["notification_kind"];
          message_id?: string | null;
          read_at?: string | null;
          request_id?: string | null;
          response_id?: string | null;
          title: string;
          user_id: string;
        };
        Update: {
          body?: string | null;
          category?: Database["public"]["Enums"]["notification_category"];
          conversation_id?: string | null;
          created_at?: string;
          engagement_id?: string | null;
          id?: string;
          kind?: Database["public"]["Enums"]["notification_kind"];
          message_id?: string | null;
          read_at?: string | null;
          request_id?: string | null;
          response_id?: string | null;
          title?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_engagement_id_fkey";
            columns: ["engagement_id"];
            isOneToOne: false;
            referencedRelation: "engagements";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_message_id_fkey";
            columns: ["message_id"];
            isOneToOne: false;
            referencedRelation: "messages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_request_id_fkey";
            columns: ["request_id"];
            isOneToOne: false;
            referencedRelation: "requests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_request_id_fkey";
            columns: ["request_id"];
            isOneToOne: false;
            referencedRelation: "requests_public";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_response_id_fkey";
            columns: ["response_id"];
            isOneToOne: false;
            referencedRelation: "request_responses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profile_private_contact: {
        Row: {
          phone: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          phone?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          phone?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profile_private_contact_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          bio: string | null;
          created_at: string;
          display_name: string;
          id: string;
          live_profile_photo_captured_at: string | null;
          live_profile_photo_path: string | null;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          bio?: string | null;
          created_at?: string;
          display_name: string;
          id: string;
          live_profile_photo_captured_at?: string | null;
          live_profile_photo_path?: string | null;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          bio?: string | null;
          created_at?: string;
          display_name?: string;
          id?: string;
          live_profile_photo_captured_at?: string | null;
          live_profile_photo_path?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      provider_profiles: {
        Row: {
          created_at: string;
          headline: string | null;
          id: string;
          kind: Database["public"]["Enums"]["provider_profile_kind"];
          metadata: Json | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          headline?: string | null;
          id?: string;
          kind?: Database["public"]["Enums"]["provider_profile_kind"];
          metadata?: Json | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          headline?: string | null;
          id?: string;
          kind?: Database["public"]["Enums"]["provider_profile_kind"];
          metadata?: Json | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "provider_profiles_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      request_photos: {
        Row: {
          byte_size: number;
          created_at: string;
          id: string;
          mime_type: string;
          request_id: string;
          sort_order: number;
          storage_path: string;
        };
        Insert: {
          byte_size: number;
          created_at?: string;
          id?: string;
          mime_type: string;
          request_id: string;
          sort_order?: number;
          storage_path: string;
        };
        Update: {
          byte_size?: number;
          created_at?: string;
          id?: string;
          mime_type?: string;
          request_id?: string;
          sort_order?: number;
          storage_path?: string;
        };
        Relationships: [
          {
            foreignKeyName: "request_photos_request_id_fkey";
            columns: ["request_id"];
            isOneToOne: false;
            referencedRelation: "requests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "request_photos_request_id_fkey";
            columns: ["request_id"];
            isOneToOne: false;
            referencedRelation: "requests_public";
            referencedColumns: ["id"];
          },
        ];
      };
      request_responses: {
        Row: {
          created_at: string;
          id: string;
          message: string | null;
          proposed_amount: number;
          proposed_asset_id: string;
          provider_profile_id: string;
          request_id: string;
          status: Database["public"]["Enums"]["response_status"];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          message?: string | null;
          proposed_amount: number;
          proposed_asset_id: string;
          provider_profile_id: string;
          request_id: string;
          status?: Database["public"]["Enums"]["response_status"];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          message?: string | null;
          proposed_amount?: number;
          proposed_asset_id?: string;
          provider_profile_id?: string;
          request_id?: string;
          status?: Database["public"]["Enums"]["response_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "request_responses_proposed_asset_id_fkey";
            columns: ["proposed_asset_id"];
            isOneToOne: false;
            referencedRelation: "assets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "request_responses_provider_profile_id_fkey";
            columns: ["provider_profile_id"];
            isOneToOne: false;
            referencedRelation: "provider_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "request_responses_request_id_fkey";
            columns: ["request_id"];
            isOneToOne: false;
            referencedRelation: "requests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "request_responses_request_id_fkey";
            columns: ["request_id"];
            isOneToOne: false;
            referencedRelation: "requests_public";
            referencedColumns: ["id"];
          },
        ];
      };
      request_tags: {
        Row: {
          request_id: string;
          tag_id: string;
        };
        Insert: {
          request_id: string;
          tag_id: string;
        };
        Update: {
          request_id?: string;
          tag_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "request_tags_request_id_fkey";
            columns: ["request_id"];
            isOneToOne: false;
            referencedRelation: "requests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "request_tags_request_id_fkey";
            columns: ["request_id"];
            isOneToOne: false;
            referencedRelation: "requests_public";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "request_tags_tag_id_fkey";
            columns: ["tag_id"];
            isOneToOne: false;
            referencedRelation: "tags";
            referencedColumns: ["id"];
          },
        ];
      };
      requests: {
        Row: {
          budget_amount: number;
          budget_asset_id: string;
          created_at: string;
          deadline_at: string | null;
          description: string;
          expires_at: string | null;
          first_response_at: string | null;
          id: string;
          location_kind: Database["public"]["Enums"]["location_kind"];
          location_label: string | null;
          location_structured: Json | null;
          published_at: string | null;
          requester_id: string;
          scheduled_at: string | null;
          status: Database["public"]["Enums"]["request_status"];
          timing_type: Database["public"]["Enums"]["timing_type"];
          title: string;
          updated_at: string;
        };
        Insert: {
          budget_amount: number;
          budget_asset_id: string;
          created_at?: string;
          deadline_at?: string | null;
          description: string;
          expires_at?: string | null;
          first_response_at?: string | null;
          id?: string;
          location_kind?: Database["public"]["Enums"]["location_kind"];
          location_label?: string | null;
          location_structured?: Json | null;
          published_at?: string | null;
          requester_id: string;
          scheduled_at?: string | null;
          status?: Database["public"]["Enums"]["request_status"];
          timing_type: Database["public"]["Enums"]["timing_type"];
          title: string;
          updated_at?: string;
        };
        Update: {
          budget_amount?: number;
          budget_asset_id?: string;
          created_at?: string;
          deadline_at?: string | null;
          description?: string;
          expires_at?: string | null;
          first_response_at?: string | null;
          id?: string;
          location_kind?: Database["public"]["Enums"]["location_kind"];
          location_label?: string | null;
          location_structured?: Json | null;
          published_at?: string | null;
          requester_id?: string;
          scheduled_at?: string | null;
          status?: Database["public"]["Enums"]["request_status"];
          timing_type?: Database["public"]["Enums"]["timing_type"];
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "requests_budget_asset_id_fkey";
            columns: ["budget_asset_id"];
            isOneToOne: false;
            referencedRelation: "assets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "requests_requester_id_fkey";
            columns: ["requester_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      reviews: {
        Row: {
          comment: string | null;
          created_at: string;
          engagement_id: string;
          id: string;
          provider_user_id: string;
          rating: number;
          requester_id: string;
        };
        Insert: {
          comment?: string | null;
          created_at?: string;
          engagement_id: string;
          id?: string;
          provider_user_id: string;
          rating: number;
          requester_id: string;
        };
        Update: {
          comment?: string | null;
          created_at?: string;
          engagement_id?: string;
          id?: string;
          provider_user_id?: string;
          rating?: number;
          requester_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reviews_engagement_id_fkey";
            columns: ["engagement_id"];
            isOneToOne: true;
            referencedRelation: "engagements";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reviews_provider_user_id_fkey";
            columns: ["provider_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reviews_requester_id_fkey";
            columns: ["requester_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      tags: {
        Row: {
          category: Database["public"]["Enums"]["tag_category"];
          id: string;
          label: string;
          slug: string;
          sort_order: number;
        };
        Insert: {
          category: Database["public"]["Enums"]["tag_category"];
          id?: string;
          label: string;
          slug: string;
          sort_order?: number;
        };
        Update: {
          category?: Database["public"]["Enums"]["tag_category"];
          id?: string;
          label?: string;
          slug?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
    };
    Views: {
      requests_public: {
        Row: {
          asset_decimals: number | null;
          asset_symbol: string | null;
          budget_amount: number | null;
          budget_asset_id: string | null;
          created_at: string | null;
          deadline_at: string | null;
          description: string | null;
          description_preview: string | null;
          first_photo_path: string | null;
          id: string | null;
          location_kind: Database["public"]["Enums"]["location_kind"] | null;
          location_label: string | null;
          photo_paths: Json | null;
          published_at: string | null;
          scheduled_at: string | null;
          tags: Json | null;
          timing_type: Database["public"]["Enums"]["timing_type"] | null;
          title: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "requests_budget_asset_id_fkey";
            columns: ["budget_asset_id"];
            isOneToOne: false;
            referencedRelation: "assets";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Functions: {
      accept_response: {
        Args: { p_request_id: string; p_response_id: string };
        Returns: undefined;
      };
      add_delivery_attachments: {
        Args: {
          p_byte_sizes: number[];
          p_delivery_id: string;
          p_mime_types: string[];
          p_paths: string[];
        };
        Returns: undefined;
      };
      add_message_attachments: {
        Args: {
          p_byte_sizes: number[];
          p_message_id: string;
          p_mime_types: string[];
          p_paths: string[];
        };
        Returns: undefined;
      };
      add_request_photos: {
        Args: {
          p_byte_sizes: number[];
          p_mime_types: string[];
          p_paths: string[];
          p_request_id: string;
        };
        Returns: undefined;
      };
      auto_complete_engagements: { Args: never; Returns: number };
      can_read_private_contact: {
        Args: { p_target_user: string };
        Returns: boolean;
      };
      complete_engagement_after_delivery: {
        Args: { p_auto?: boolean; p_engagement_id: string };
        Returns: boolean;
      };
      confirm_live_profile_photo: {
        Args: { p_storage_path: string };
        Returns: undefined;
      };
      create_request: {
        Args: {
          p_budget_amount: number;
          p_budget_asset_id: string;
          p_deadline_at: string;
          p_description: string;
          p_expires_at: string;
          p_location_kind: Database["public"]["Enums"]["location_kind"];
          p_location_label: string;
          p_location_structured: Json;
          p_publish: boolean;
          p_scheduled_at: string;
          p_tag_ids: string[];
          p_timing_type: Database["public"]["Enums"]["timing_type"];
          p_title: string;
        };
        Returns: string;
      };
      is_conversation_participant: {
        Args: { p_conversation_id: string; p_user_id: string };
        Returns: boolean;
      };
      is_engagement_participant: {
        Args: { p_engagement_id: string; p_user_id: string };
        Returns: boolean;
      };
      is_provider_profile_owner: {
        Args: { p_provider_profile_id: string; p_user_id: string };
        Returns: boolean;
      };
      list_requests_public: {
        Args: {
          p_asset_id?: string;
          p_category?: Database["public"]["Enums"]["tag_category"];
          p_cursor_id?: string;
          p_cursor_published_at?: string;
          p_limit?: number;
          p_location_kind?: Database["public"]["Enums"]["location_kind"];
          p_search?: string;
          p_tag_ids?: string[];
        };
        Returns: {
          asset_decimals: number;
          asset_symbol: string;
          budget_amount: number;
          budget_asset_id: string;
          deadline_at: string;
          description_preview: string;
          first_photo_path: string;
          id: string;
          location_kind: Database["public"]["Enums"]["location_kind"];
          location_label: string;
          published_at: string;
          scheduled_at: string;
          tags: Json;
          timing_type: Database["public"]["Enums"]["timing_type"];
          title: string;
        }[];
      };
      mark_all_notifications_read: {
        Args: {
          p_category?: Database["public"]["Enums"]["notification_category"];
        };
        Returns: number;
      };
      mark_conversation_read: {
        Args: { p_conversation_id: string };
        Returns: undefined;
      };
      mark_notification_read: {
        Args: { p_notification_id: string };
        Returns: undefined;
      };
      notification_category_for_kind: {
        Args: { p_kind: Database["public"]["Enums"]["notification_kind"] };
        Returns: Database["public"]["Enums"]["notification_category"];
      };
      open_request_id_for_photo_path: {
        Args: { p_path: string };
        Returns: string;
      };
      report_engagement_issue: {
        Args: { p_body: string; p_category: string; p_engagement_id: string };
        Returns: string;
      };
      resolve_engagement_issue: {
        Args: { p_issue_id: string };
        Returns: undefined;
      };
      restore_engagement_auto_deadline_if_eligible: {
        Args: { p_engagement_id: string };
        Returns: undefined;
      };
      review_delivery: {
        Args: {
          p_action: string;
          p_engagement_id: string;
          p_revision_note?: string;
        };
        Returns: undefined;
      };
      send_message: {
        Args: {
          p_body?: string;
          p_conversation_id: string;
          p_kind: Database["public"]["Enums"]["message_kind"];
          p_location_label?: string;
          p_location_lat?: number;
          p_location_lng?: number;
        };
        Returns: string;
      };
      show_limit: { Args: never; Returns: number };
      show_trgm: { Args: { "": string }; Returns: string[] };
      submit_delivery: {
        Args: {
          p_description: string;
          p_engagement_id: string;
          p_post_to_chat?: boolean;
        };
        Returns: {
          chat_message_id: string;
          delivery_id: string;
        }[];
      };
      submit_request_response: {
        Args: {
          p_headline: string;
          p_message: string;
          p_proposed_amount: number;
          p_request_id: string;
        };
        Returns: string;
      };
      submit_review: {
        Args: { p_comment?: string; p_engagement_id: string; p_rating: number };
        Returns: string;
      };
      withdraw_request_response: {
        Args: { p_response_id: string };
        Returns: undefined;
      };
    };
    Enums: {
      asset_standard: "native" | "nep141";
      conversation_kind: "pre_accept" | "engagement";
      delivery_status: "pending_review" | "revision_requested" | "approved";
      engagement_status: "active" | "completed";
      issue_status: "open" | "resolved";
      location_kind: "unspecified" | "online" | "in_person";
      message_kind: "text" | "location";
      notification_category:
        | "requests_responses"
        | "messages"
        | "payments_wallet"
        | "calls"
        | "tips_reminders";
      notification_kind:
        | "request_new_response"
        | "response_accepted"
        | "response_rejected"
        | "delivery_submitted"
        | "delivery_revision_requested"
        | "delivery_approved"
        | "engagement_auto_completed"
        | "engagement_issue_reported"
        | "engagement_issue_resolved"
        | "review_received"
        | "new_message"
        | "response_withdrawn"
        | "engagement_created";
      provider_profile_kind: "human" | "ai";
      request_status: "draft" | "open" | "assigned" | "completed" | "expired";
      response_status: "pending" | "withdrawn" | "accepted" | "rejected";
      tag_category:
        | "repairs_trades"
        | "home"
        | "cars_transport"
        | "errands"
        | "food_cooking"
        | "others";
      timing_type: "immediate" | "scheduled";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      asset_standard: ["native", "nep141"],
      conversation_kind: ["pre_accept", "engagement"],
      delivery_status: ["pending_review", "revision_requested", "approved"],
      engagement_status: ["active", "completed"],
      issue_status: ["open", "resolved"],
      location_kind: ["unspecified", "online", "in_person"],
      message_kind: ["text", "location"],
      notification_category: [
        "requests_responses",
        "messages",
        "payments_wallet",
        "calls",
        "tips_reminders",
      ],
      notification_kind: [
        "request_new_response",
        "response_accepted",
        "response_rejected",
        "delivery_submitted",
        "delivery_revision_requested",
        "delivery_approved",
        "engagement_auto_completed",
        "engagement_issue_reported",
        "engagement_issue_resolved",
        "review_received",
        "new_message",
        "response_withdrawn",
        "engagement_created",
      ],
      provider_profile_kind: ["human", "ai"],
      request_status: ["draft", "open", "assigned", "completed", "expired"],
      response_status: ["pending", "withdrawn", "accepted", "rejected"],
      tag_category: [
        "repairs_trades",
        "home",
        "cars_transport",
        "errands",
        "food_cooking",
        "others",
      ],
      timing_type: ["immediate", "scheduled"],
    },
  },
} as const;
