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
      profiles: {
        Row: {
          id: string;
          display_name: string;
          bio: string | null;
          avatar_url: string | null;
          live_profile_photo_path: string | null;
          live_profile_photo_captured_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          display_name: string;
          bio?: string | null;
          avatar_url?: string | null;
          live_profile_photo_path?: string | null;
          live_profile_photo_captured_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string;
          bio?: string | null;
          avatar_url?: string | null;
          live_profile_photo_path?: string | null;
          live_profile_photo_captured_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      assets: {
        Row: {
          id: string;
          chain_id: string;
          asset_standard: Database["public"]["Enums"]["asset_standard"];
          native_reference: string | null;
          token_contract_id: string | null;
          symbol: string;
          decimals: number;
          canonical_asset_key: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          chain_id: string;
          asset_standard: Database["public"]["Enums"]["asset_standard"];
          native_reference?: string | null;
          token_contract_id?: string | null;
          symbol: string;
          decimals: number;
          canonical_asset_key: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          chain_id?: string;
          asset_standard?: Database["public"]["Enums"]["asset_standard"];
          native_reference?: string | null;
          token_contract_id?: string | null;
          symbol?: string;
          decimals?: number;
          canonical_asset_key?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      app_config: {
        Row: {
          id: number;
          allow_cross_asset_responses: boolean;
          updated_at: string;
        };
        Insert: {
          id?: number;
          allow_cross_asset_responses?: boolean;
          updated_at?: string;
        };
        Update: {
          id?: number;
          allow_cross_asset_responses?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      tags: {
        Row: {
          id: string;
          slug: string;
          label: string;
          category: Database["public"]["Enums"]["tag_category"];
          sort_order: number;
        };
        Insert: {
          id?: string;
          slug: string;
          label: string;
          category: Database["public"]["Enums"]["tag_category"];
          sort_order?: number;
        };
        Update: {
          id?: string;
          slug?: string;
          label?: string;
          category?: Database["public"]["Enums"]["tag_category"];
          sort_order?: number;
        };
        Relationships: [];
      };
      requests: {
        Row: {
          id: string;
          requester_id: string;
          title: string;
          description: string;
          status: Database["public"]["Enums"]["request_status"];
          timing_type: Database["public"]["Enums"]["timing_type"];
          scheduled_at: string | null;
          deadline_at: string | null;
          expires_at: string | null;
          budget_amount: string;
          budget_asset_id: string;
          location_label: string | null;
          location_kind: Database["public"]["Enums"]["location_kind"];
          location_structured: Json | null;
          published_at: string | null;
          first_response_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          requester_id: string;
          title: string;
          description: string;
          status?: Database["public"]["Enums"]["request_status"];
          timing_type: Database["public"]["Enums"]["timing_type"];
          scheduled_at?: string | null;
          deadline_at?: string | null;
          expires_at?: string | null;
          budget_amount: string;
          budget_asset_id: string;
          location_label?: string | null;
          location_kind?: Database["public"]["Enums"]["location_kind"];
          location_structured?: Json | null;
          published_at?: string | null;
          first_response_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          requester_id?: string;
          title?: string;
          description?: string;
          status?: Database["public"]["Enums"]["request_status"];
          timing_type?: Database["public"]["Enums"]["timing_type"];
          scheduled_at?: string | null;
          deadline_at?: string | null;
          expires_at?: string | null;
          budget_amount?: string;
          budget_asset_id?: string;
          location_label?: string | null;
          location_kind?: Database["public"]["Enums"]["location_kind"];
          location_structured?: Json | null;
          published_at?: string | null;
          first_response_at?: string | null;
          created_at?: string;
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
        Relationships: [];
      };
      request_photos: {
        Row: {
          id: string;
          request_id: string;
          storage_path: string;
          sort_order: number;
          mime_type: string;
          byte_size: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          request_id: string;
          storage_path: string;
          sort_order?: number;
          mime_type: string;
          byte_size: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          request_id?: string;
          storage_path?: string;
          sort_order?: number;
          mime_type?: string;
          byte_size?: number;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      requests_public: {
        Row: {
          id: string;
          title: string;
          description: string;
          timing_type: Database["public"]["Enums"]["timing_type"];
          scheduled_at: string | null;
          deadline_at: string | null;
          budget_amount: string;
          budget_asset_id: string;
          location_kind: Database["public"]["Enums"]["location_kind"];
          location_label: string | null;
          published_at: string | null;
          created_at: string;
          tags: Json;
        };
        Relationships: [];
      };
    };
    Functions: {
      create_request: {
        Args: {
          p_title: string;
          p_description: string;
          p_timing_type: Database["public"]["Enums"]["timing_type"];
          p_scheduled_at: string | null;
          p_deadline_at: string | null;
          p_expires_at: string | null;
          p_budget_amount: string;
          p_budget_asset_id: string;
          p_location_kind: Database["public"]["Enums"]["location_kind"];
          p_location_label: string | null;
          p_location_structured: Json | null;
          p_tag_ids: string[] | null;
          p_publish: boolean;
        };
        Returns: string;
      };
      add_request_photos: {
        Args: {
          p_request_id: string;
          p_paths: string[];
          p_mime_types: string[];
          p_byte_sizes: number[];
        };
        Returns: undefined;
      };
    };
    Enums: {
      asset_standard: "native" | "nep141";
      request_status: "draft" | "open" | "assigned" | "completed" | "expired";
      timing_type: "immediate" | "scheduled";
      location_kind: "unspecified" | "online" | "in_person";
      tag_category:
        | "repairs_trades"
        | "home"
        | "cars_transport"
        | "errands"
        | "food_cooking"
        | "others";
    };
    CompositeTypes: Record<string, never>;
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
