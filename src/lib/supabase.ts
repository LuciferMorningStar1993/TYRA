import 'expo-sqlite/localStorage/install';

import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import type { Database } from './database.types';
import { describeSupabaseConfig, resolveSupabaseConfig } from './supabase-config';

// Las referencias process.env.EXPO_PUBLIC_* deben ser literales para que Expo las inyecte.
export const supabaseConfig = resolveSupabaseConfig({
  qaLocal: process.env.EXPO_PUBLIC_QA_LOCAL,
  url: process.env.EXPO_PUBLIC_SUPABASE_URL,
  publishableKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  qaUrl: process.env.EXPO_PUBLIC_QA_SUPABASE_URL,
  qaPublishableKey: process.env.EXPO_PUBLIC_QA_SUPABASE_PUBLISHABLE_KEY,
});

if (supabaseConfig.mode === 'qa-local') {
  console.info(`[QA local] ${describeSupabaseConfig(supabaseConfig)}`);
}

export const supabase = createClient<Database>(supabaseConfig.url, supabaseConfig.publishableKey, {
  auth: {
    storage: localStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
});

// En móvil solo refrescamos el token mientras la app está en primer plano.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
