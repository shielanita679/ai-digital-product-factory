/**
 * Hand-written to match supabase/migrations/*.sql until a live project exists.
 * Once linked, regenerate with:
 *   npx supabase gen types typescript --linked > src/types/supabase.ts
 */
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
          email: string;
          full_name: string | null;
          avatar_url: string | null;
          sells_what: string[] | null;
          sells_where: string[] | null;
          monthly_product_volume: string | null;
          onboarding_completed: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          avatar_url?: string | null;
          sells_what?: string[] | null;
          sells_where?: string[] | null;
          monthly_product_volume?: string | null;
          onboarding_completed?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          avatar_url?: string | null;
          sells_what?: string[] | null;
          sells_where?: string[] | null;
          monthly_product_volume?: string | null;
          onboarding_completed?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_id_fkey";
            columns: ["id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      projects: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          product_type: string;
          status: string;
          cover_url: string | null;
          design_count: number;
          archived: boolean;
          created_at: string;
          updated_at: string;
          // Phase 4 — wizard configuration. Undefined at runtime (not just
          // null) if the migration hasn't been applied yet; code reading
          // these must not assume they're always present.
          user_prompt: string | null;
          style: string[];
          custom_style: string | null;
          target_audience: string[];
          custom_audience: string | null;
          requested_design_count: number;
          content_mode: string;
          color_mode: string;
          custom_colors: string[];
          transparent_background: boolean;
          orientation: string;
          detail_level: string;
          generation_config: Json;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          product_type?: string;
          status?: string;
          cover_url?: string | null;
          design_count?: number;
          archived?: boolean;
          created_at?: string;
          updated_at?: string;
          user_prompt?: string | null;
          style?: string[];
          custom_style?: string | null;
          target_audience?: string[];
          custom_audience?: string | null;
          requested_design_count?: number;
          content_mode?: string;
          color_mode?: string;
          custom_colors?: string[];
          transparent_background?: boolean;
          orientation?: string;
          detail_level?: string;
          generation_config?: Json;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          product_type?: string;
          status?: string;
          cover_url?: string | null;
          design_count?: number;
          archived?: boolean;
          created_at?: string;
          updated_at?: string;
          user_prompt?: string | null;
          style?: string[];
          custom_style?: string | null;
          target_audience?: string[];
          custom_audience?: string | null;
          requested_design_count?: number;
          content_mode?: string;
          color_mode?: string;
          custom_colors?: string[];
          transparent_background?: boolean;
          orientation?: string;
          detail_level?: string;
          generation_config?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "projects_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      // Phase 5 — AI generation pipeline foundation.
      generation_jobs: {
        Row: {
          id: string;
          user_id: string;
          project_id: string;
          status: string;
          provider: string;
          prompt_engine_version: string;
          requested_count: number;
          completed_count: number;
          failed_count: number;
          progress: number;
          error_message: string | null;
          started_at: string | null;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          project_id: string;
          status?: string;
          provider?: string;
          prompt_engine_version?: string;
          requested_count: number;
          completed_count?: number;
          failed_count?: number;
          progress?: number;
          error_message?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          project_id?: string;
          status?: string;
          provider?: string;
          prompt_engine_version?: string;
          requested_count?: number;
          completed_count?: number;
          failed_count?: number;
          progress?: number;
          error_message?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "generation_jobs_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "generation_jobs_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      designs: {
        Row: {
          id: string;
          user_id: string;
          project_id: string;
          generation_job_id: string;
          variation_index: number;
          title: string;
          prompt: string;
          negative_prompt: string | null;
          status: string;
          image_url: string | null;
          thumbnail_url: string | null;
          width: number | null;
          height: number | null;
          provider: string;
          provider_generation_id: string | null;
          error_message: string | null;
          prompt_engine_version: string;
          metadata: Json;
          // Phase 6 — durable Supabase Storage identity for REAL (non-mock)
          // designs. Null for Phase 5 mock designs, whose preview is a
          // fully self-contained data: URI in image_url.
          storage_bucket: string | null;
          storage_path: string | null;
          file_size_bytes: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          project_id: string;
          generation_job_id: string;
          variation_index: number;
          title: string;
          prompt: string;
          negative_prompt?: string | null;
          status?: string;
          image_url?: string | null;
          thumbnail_url?: string | null;
          width?: number | null;
          height?: number | null;
          provider?: string;
          provider_generation_id?: string | null;
          error_message?: string | null;
          prompt_engine_version?: string;
          metadata?: Json;
          storage_bucket?: string | null;
          storage_path?: string | null;
          file_size_bytes?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          project_id?: string;
          generation_job_id?: string;
          variation_index?: number;
          title?: string;
          prompt?: string;
          negative_prompt?: string | null;
          status?: string;
          image_url?: string | null;
          thumbnail_url?: string | null;
          width?: number | null;
          height?: number | null;
          provider?: string;
          provider_generation_id?: string | null;
          error_message?: string | null;
          prompt_engine_version?: string;
          metadata?: Json;
          storage_bucket?: string | null;
          storage_path?: string | null;
          file_size_bytes?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "designs_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "designs_generation_job_id_fkey";
            columns: ["generation_job_id"];
            isOneToOne: false;
            referencedRelation: "generation_jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "designs_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      // Phase 7 — vector (SVG) derivative of a design's raster original.
      // One canonical row per design (unique(design_id)); a retry updates
      // the same row rather than inserting a new one. Undefined at
      // runtime (not just null/missing rows) if this migration hasn't
      // been applied yet — code reading this table must degrade
      // gracefully, exactly like every other post-Phase-4 table.
      vectorizations: {
        Row: {
          id: string;
          user_id: string;
          project_id: string;
          design_id: string;
          status: string;
          provider: string;
          provider_vectorization_id: string | null;
          storage_bucket: string | null;
          storage_path: string | null;
          mime_type: string | null;
          file_size_bytes: number | null;
          width: number | null;
          height: number | null;
          view_box: string | null;
          path_count: number | null;
          shape_count: number | null;
          color_count: number | null;
          has_embedded_raster: boolean;
          settings: Json;
          error_message: string | null;
          created_at: string;
          updated_at: string;
          started_at: string | null;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          project_id: string;
          design_id: string;
          status?: string;
          provider?: string;
          provider_vectorization_id?: string | null;
          storage_bucket?: string | null;
          storage_path?: string | null;
          mime_type?: string | null;
          file_size_bytes?: number | null;
          width?: number | null;
          height?: number | null;
          view_box?: string | null;
          path_count?: number | null;
          shape_count?: number | null;
          color_count?: number | null;
          has_embedded_raster?: boolean;
          settings?: Json;
          error_message?: string | null;
          created_at?: string;
          updated_at?: string;
          started_at?: string | null;
          completed_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          project_id?: string;
          design_id?: string;
          status?: string;
          provider?: string;
          provider_vectorization_id?: string | null;
          storage_bucket?: string | null;
          storage_path?: string | null;
          mime_type?: string | null;
          file_size_bytes?: number | null;
          width?: number | null;
          height?: number | null;
          view_box?: string | null;
          path_count?: number | null;
          shape_count?: number | null;
          color_count?: number | null;
          has_embedded_raster?: boolean;
          settings?: Json;
          error_message?: string | null;
          created_at?: string;
          updated_at?: string;
          started_at?: string | null;
          completed_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "vectorizations_design_id_fkey";
            columns: ["design_id"];
            isOneToOne: true;
            referencedRelation: "designs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "vectorizations_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "vectorizations_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      // Phase 8 — bundle builder + mockups + bundle cover. Undefined at
      // runtime (not just null/missing rows) if this migration hasn't
      // been applied yet — code reading these tables must degrade
      // gracefully, exactly like every other post-Phase-4 table.
      product_bundles: {
        Row: {
          id: string;
          user_id: string;
          project_id: string;
          name: string;
          status: string;
          cover_storage_bucket: string | null;
          cover_storage_path: string | null;
          item_count: number;
          mockup_count: number;
          error_message: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          project_id: string;
          name: string;
          status?: string;
          cover_storage_bucket?: string | null;
          cover_storage_path?: string | null;
          item_count?: number;
          mockup_count?: number;
          error_message?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          project_id?: string;
          name?: string;
          status?: string;
          cover_storage_bucket?: string | null;
          cover_storage_path?: string | null;
          item_count?: number;
          mockup_count?: number;
          error_message?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_bundles_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_bundles_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      bundle_items: {
        Row: {
          id: string;
          bundle_id: string;
          design_id: string;
          user_id: string;
          include_png: boolean;
          include_svg: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          bundle_id: string;
          design_id: string;
          user_id: string;
          include_png?: boolean;
          include_svg?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          bundle_id?: string;
          design_id?: string;
          user_id?: string;
          include_png?: boolean;
          include_svg?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bundle_items_bundle_id_fkey";
            columns: ["bundle_id"];
            isOneToOne: false;
            referencedRelation: "product_bundles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bundle_items_design_id_fkey";
            columns: ["design_id"];
            isOneToOne: false;
            referencedRelation: "designs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bundle_items_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      mockups: {
        Row: {
          id: string;
          bundle_id: string;
          design_id: string;
          user_id: string;
          project_id: string;
          status: string;
          provider: string;
          provider_mockup_id: string | null;
          template_type: string;
          storage_bucket: string | null;
          storage_path: string | null;
          mime_type: string | null;
          width: number | null;
          height: number | null;
          file_size_bytes: number | null;
          error_message: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
          started_at: string | null;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          bundle_id: string;
          design_id: string;
          user_id: string;
          project_id: string;
          status?: string;
          provider?: string;
          provider_mockup_id?: string | null;
          template_type: string;
          storage_bucket?: string | null;
          storage_path?: string | null;
          mime_type?: string | null;
          width?: number | null;
          height?: number | null;
          file_size_bytes?: number | null;
          error_message?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
          started_at?: string | null;
          completed_at?: string | null;
        };
        Update: {
          id?: string;
          bundle_id?: string;
          design_id?: string;
          user_id?: string;
          project_id?: string;
          status?: string;
          provider?: string;
          provider_mockup_id?: string | null;
          template_type?: string;
          storage_bucket?: string | null;
          storage_path?: string | null;
          mime_type?: string | null;
          width?: number | null;
          height?: number | null;
          file_size_bytes?: number | null;
          error_message?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
          started_at?: string | null;
          completed_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "mockups_bundle_id_fkey";
            columns: ["bundle_id"];
            isOneToOne: false;
            referencedRelation: "product_bundles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "mockups_design_id_fkey";
            columns: ["design_id"];
            isOneToOne: false;
            referencedRelation: "designs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "mockups_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "mockups_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      // Phase 9 — listing generator + editor + license. Undefined at
      // runtime (not just null/missing rows) if this migration hasn't
      // been applied yet — code reading this table must degrade
      // gracefully, exactly like every other post-Phase-4 table.
      product_listings: {
        Row: {
          id: string;
          user_id: string;
          project_id: string;
          bundle_id: string;
          marketplace: string;
          status: string;
          title: string | null;
          description: string | null;
          tags: Json;
          materials: Json;
          included_files: Json;
          seo_keywords: Json;
          license_type: string | null;
          license_text: string | null;
          license_edited: boolean;
          generation_provider: string | null;
          generation_model: string | null;
          generation_version: number;
          error_message: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          project_id: string;
          bundle_id: string;
          marketplace?: string;
          status?: string;
          title?: string | null;
          description?: string | null;
          tags?: Json;
          materials?: Json;
          included_files?: Json;
          seo_keywords?: Json;
          license_type?: string | null;
          license_text?: string | null;
          license_edited?: boolean;
          generation_provider?: string | null;
          generation_model?: string | null;
          generation_version?: number;
          error_message?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          project_id?: string;
          bundle_id?: string;
          marketplace?: string;
          status?: string;
          title?: string | null;
          description?: string | null;
          tags?: Json;
          materials?: Json;
          included_files?: Json;
          seo_keywords?: Json;
          license_type?: string | null;
          license_text?: string | null;
          license_edited?: boolean;
          generation_provider?: string | null;
          generation_model?: string | null;
          generation_version?: number;
          error_message?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_listings_bundle_id_fkey";
            columns: ["bundle_id"];
            isOneToOne: false;
            referencedRelation: "product_bundles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_listings_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_listings_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      // Phase 10 — ZIP packaging + download center. Undefined at runtime
      // (not just null/missing rows) if this migration hasn't been applied
      // yet — code reading this table must degrade gracefully, exactly
      // like every other post-Phase-4 table.
      product_packages: {
        Row: {
          id: string;
          user_id: string;
          project_id: string;
          bundle_id: string;
          marketplace: string;
          status: string;
          version: number;
          storage_bucket: string | null;
          storage_path: string | null;
          file_name: string | null;
          file_size_bytes: number | null;
          checksum_sha256: string | null;
          item_count: number;
          manifest: Json;
          error_message: string | null;
          created_at: string;
          updated_at: string;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          project_id: string;
          bundle_id: string;
          marketplace?: string;
          status?: string;
          version?: number;
          storage_bucket?: string | null;
          storage_path?: string | null;
          file_name?: string | null;
          file_size_bytes?: number | null;
          checksum_sha256?: string | null;
          item_count?: number;
          manifest?: Json;
          error_message?: string | null;
          created_at?: string;
          updated_at?: string;
          completed_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          project_id?: string;
          bundle_id?: string;
          marketplace?: string;
          status?: string;
          version?: number;
          storage_bucket?: string | null;
          storage_path?: string | null;
          file_name?: string | null;
          file_size_bytes?: number | null;
          checksum_sha256?: string | null;
          item_count?: number;
          manifest?: Json;
          error_message?: string | null;
          created_at?: string;
          updated_at?: string;
          completed_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "product_packages_bundle_id_fkey";
            columns: ["bundle_id"];
            isOneToOne: false;
            referencedRelation: "product_bundles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_packages_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_packages_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Project = Database["public"]["Tables"]["projects"]["Row"];
export type GenerationJob = Database["public"]["Tables"]["generation_jobs"]["Row"];
export type Design = Database["public"]["Tables"]["designs"]["Row"];
export type Vectorization = Database["public"]["Tables"]["vectorizations"]["Row"];
export type ProductBundle = Database["public"]["Tables"]["product_bundles"]["Row"];
export type BundleItem = Database["public"]["Tables"]["bundle_items"]["Row"];
export type Mockup = Database["public"]["Tables"]["mockups"]["Row"];
export type ProductListing = Database["public"]["Tables"]["product_listings"]["Row"];
export type ProductPackage = Database["public"]["Tables"]["product_packages"]["Row"];
