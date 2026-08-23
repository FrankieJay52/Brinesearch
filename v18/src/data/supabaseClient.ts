import { createClient } from "@supabase/supabase-js";

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://wvxzqtoiwhrgovzddtvz.supabase.co";
export const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_5_sw9B-bcSdWgDzp4Z3pnQ_b-tutvtd";
export const v18AuthStorageKey = "brinesearch.v18AuthSession.v1";

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    storageKey: v18AuthStorageKey,
    persistSession: typeof window !== "undefined",
    autoRefreshToken: typeof window !== "undefined",
    detectSessionInUrl: false,
    flowType: "pkce",
  },
});
