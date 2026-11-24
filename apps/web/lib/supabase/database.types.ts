// Matches supabase/migrations/*.sql.
// Regenerate after schema changes with:
//   npx supabase gen types typescript --project-id <ref> > apps/web/lib/supabase/database.types.ts

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type LinkRow = {
  id: string;
  user_id: string;
  url: string;
  url_normalized: string;
  final_url: string | null;
  canonical_url: string | null;
  status_code: number | null;
  content_type: string | null;
  title: string | null;
  description: string | null;
  site_name: string | null;
  og_type: string | null;
  image: string | null;
  image_alt: string | null;
  image_width: number | null;
  image_height: number | null;
  favicon: string | null;
  video: string | null;
  author: string | null;
  published_time: string | null;
  modified_time: string | null;
  keywords: string[];
  theme_color: string | null;
  locale: string | null;
  twitter_card: string | null;
  twitter_site: string | null;
  twitter_creator: string | null;
  meta_tags: Json;
  fetch_error: string | null;
  fetch_status: "pending" | "done" | "failed";
  fetched_at: string | null;
  collection_id: string | null;
  tags: string[];
  note: string | null;
  custom_title: string | null;
  custom_description: string | null;
  is_favorite: boolean;
  is_archived: boolean;
  /** Set while the link is in the Trash; it is purged 7 days later. */
  deleted_at: string | null;
  search: unknown;
  created_at: string;
  updated_at: string;
};

type CollectionRow = {
  id: string;
  user_id: string;
  name: string;
  icon: string;
  is_public: boolean;
  /** Locked with the account's PIN: its links are hidden until the PIN is entered. */
  is_locked: boolean;
  share_id: string;
  created_at: string;
  updated_at: string;
};

type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

type LinkInsert = Optional<
  LinkRow,
  Exclude<keyof LinkRow, "url" | "url_normalized">
>;
type CollectionInsert = Optional<CollectionRow, Exclude<keyof CollectionRow, "name">>;

export type Database = {
  public: {
    Tables: {
      links: {
        Row: LinkRow;
        Insert: LinkInsert;
        Update: Partial<LinkRow>;
        Relationships: [
          {
            foreignKeyName: "links_collection_id_fkey";
            columns: ["collection_id"];
            isOneToOne: false;
            referencedRelation: "collections";
            referencedColumns: ["id"];
          },
        ];
      };
      collections: {
        Row: CollectionRow;
        Insert: CollectionInsert;
        Update: Partial<CollectionRow>;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      get_library_stats: { Args: Record<PropertyKey, never>; Returns: Json };
      get_shared_collection: { Args: { p_share_id: string }; Returns: Json };
      purge_expired_trash: { Args: Record<PropertyKey, never>; Returns: number };
      vault_status: { Args: Record<PropertyKey, never>; Returns: Json };
      set_vault_pin: { Args: { new_pin: string }; Returns: Json };
      unlock_vault: { Args: { pin: string; folder?: string | null }; Returns: Json };
      lock_vault: { Args: { folder?: string | null }; Returns: undefined };
      keep_folder_open: { Args: { folder: string }; Returns: boolean };
      set_folder_locked: { Args: { folder: string; locked: boolean }; Returns: undefined };
      reset_vault: { Args: Record<PropertyKey, never>; Returns: Json };
      remove_vault_pin: { Args: Record<PropertyKey, never>; Returns: undefined };
      account_is_active: { Args: Record<PropertyKey, never>; Returns: boolean };
      deactivate_account: { Args: Record<PropertyKey, never>; Returns: undefined };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
