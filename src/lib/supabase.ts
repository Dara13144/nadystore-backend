import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import WebSocket from 'ws';

// Polyfill global WebSocket for Node.js environments
if (typeof globalThis.WebSocket === 'undefined') {
  (globalThis as any).WebSocket = WebSocket;
}

dotenv.config();

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  'https://fnekziuyloncrsgqxcbq.supabase.co';

export const SUPABASE_AUTH_ENDPOINTS = {
  callbackUrl: 'https://fnekziuyloncrsgqxcbq.supabase.co/auth/v1/callback',
  authorizeUrl: 'https://fnekziuyloncrsgqxcbq.supabase.co/auth/v1/oauth/authorize',
  tokenUrl: 'https://fnekziuyloncrsgqxcbq.supabase.co/auth/v1/oauth/token',
  jwksUrl: 'https://fnekziuyloncrsgqxcbq.supabase.co/auth/v1/.well-known/jwks.json',
  openidConfigUrl: 'https://fnekziuyloncrsgqxcbq.supabase.co/auth/v1/.well-known/openid-configuration',
};

const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  'sb_publishable_5xDaVmE6nmGlqlHJZvuZAw_uoLjR64-';

let supabaseAdminInstance: SupabaseClient | null = null;

/**
 * Get Supabase Admin client with service role privileges
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (!supabaseAdminInstance) {
    supabaseAdminInstance = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      realtime: {
        transport: WebSocket as any,
      },
    });
  }
  return supabaseAdminInstance;
}

export const supabaseAdmin = getSupabaseAdmin();

/**
 * Verify Supabase JWT token and extract user information
 */
export async function verifySupabaseToken(token: string) {
  try {
    const supabase = getSupabaseAdmin();
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return null;
    }
    return user;
  } catch (err) {
    console.error('[Supabase] verifyToken error:', err);
    return null;
  }
}

/**
 * Broadcast event via Supabase Realtime channel
 */
export async function broadcastRealtimeEvent(channelName: string, eventName: string, payload: any) {
  try {
    const supabase = getSupabaseAdmin();
    const channel = supabase.channel(channelName);
    await channel.send({
      type: 'broadcast',
      event: eventName,
      payload,
    });
  } catch (err) {
    console.warn('[Supabase] Broadcast event warning:', err);
  }
}
