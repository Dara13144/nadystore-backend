import prisma from '../prisma';
import { broadcastRealtimeEvent } from '../lib/supabase';

export interface ApiSettings {
  providerApiKey: string;
  providerStock1Url: string;
  providerStock2Url: string;
  providerV2Url: string;
  providerActiveStock: 1 | 2;
  providerActiveUrl: string;
  providerAutoDelivery: boolean;
  bakongMerchantName: string;
  bakongAccountId: string;
  updatedAt?: string;
}

export const DEFAULT_API_SETTINGS: ApiSettings = {
  providerApiKey: process.env.VNGZZ2GAME_API_KEY || 'pwS5VEcfOkcN7skP5TRuWdUDdS9ZqG9m',
  providerStock1Url: process.env.VNGZZ2GAME_API_URL || 'https://www.vngzz2game.site/api/v1/game',
  providerStock2Url: process.env.VNGZZ2GAME_API_URL || 'https://www.vngzz2game.site/api/v1/game',
  providerV2Url: '',
  providerActiveStock: 1,
  providerActiveUrl: 'https://www.vngzz2game.site/api/v1/game',
  providerAutoDelivery: true,
  bakongMerchantName: 'NA-DY TOPUP ll',
  bakongAccountId: process.env.BAKONG_ACCOUNT_ID || 'dara_khqr@aba',
};

// In-memory cache for ultra-fast lookups (no database latency on each API request)
let cachedSettings: ApiSettings = { ...DEFAULT_API_SETTINGS };
let lastLoadedAt = 0;
const CACHE_TTL_MS = 15000; // 15 seconds cache refresh window

export async function getDynamicApiSettings(forceRefresh = false): Promise<ApiSettings> {
  const now = Date.now();
  if (!forceRefresh && lastLoadedAt > 0 && now - lastLoadedAt < CACHE_TTL_MS) {
    return cachedSettings;
  }

  try {
    const rows = await prisma.systemSetting.findMany({
      where: {
        key: {
          in: [
            'PROVIDER_API_KEY',
            'PROVIDER_STOCK1_URL',
            'PROVIDER_STOCK2_URL',
            'PROVIDER_V2_URL',
            'PROVIDER_ACTIVE_STOCK',
            'PROVIDER_ACTIVE_URL',
            'PROVIDER_AUTO_DELIVERY',
            'BAKONG_MERCHANT_NAME',
            'BAKONG_ACCOUNT_ID',
          ],
        },
      },
    });

    const map = new Map<string, string>();
    rows.forEach((r) => map.set(r.key, r.value));

    const activeStock = (map.get('PROVIDER_ACTIVE_STOCK') === '2' ? 2 : 1) as 1 | 2;
    const stock1 = map.get('PROVIDER_STOCK1_URL') || DEFAULT_API_SETTINGS.providerStock1Url;
    const stock2 = map.get('PROVIDER_STOCK2_URL') || DEFAULT_API_SETTINGS.providerStock2Url;
    const v2 = map.get('PROVIDER_V2_URL') || DEFAULT_API_SETTINGS.providerV2Url;
    const customActive = map.get('PROVIDER_ACTIVE_URL');

    cachedSettings = {
      providerApiKey: map.get('PROVIDER_API_KEY') || DEFAULT_API_SETTINGS.providerApiKey,
      providerStock1Url: stock1,
      providerStock2Url: stock2,
      providerV2Url: v2,
      providerActiveStock: activeStock,
      providerActiveUrl: customActive || (activeStock === 1 ? stock1 : stock2),
      providerAutoDelivery: map.has('PROVIDER_AUTO_DELIVERY')
        ? map.get('PROVIDER_AUTO_DELIVERY') === 'true'
        : DEFAULT_API_SETTINGS.providerAutoDelivery,
      bakongMerchantName: map.get('BAKONG_MERCHANT_NAME') || DEFAULT_API_SETTINGS.bakongMerchantName,
      bakongAccountId: map.get('BAKONG_ACCOUNT_ID') || DEFAULT_API_SETTINGS.bakongAccountId,
      updatedAt: new Date().toISOString(),
    };

    lastLoadedAt = now;
  } catch (err: any) {
    console.warn('[ApiSettings] Notice loading settings from DB, using fallback:', err.message);
  }

  return cachedSettings;
}

export async function saveDynamicApiSettings(updates: Partial<ApiSettings>): Promise<ApiSettings> {
  const current = await getDynamicApiSettings(true);
  const next: ApiSettings = {
    ...current,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  const keyMap: Record<string, string> = {
    PROVIDER_API_KEY: next.providerApiKey,
    PROVIDER_STOCK1_URL: next.providerStock1Url,
    PROVIDER_STOCK2_URL: next.providerStock2Url,
    PROVIDER_V2_URL: next.providerV2Url,
    PROVIDER_ACTIVE_STOCK: String(next.providerActiveStock),
    PROVIDER_ACTIVE_URL: next.providerActiveUrl,
    PROVIDER_AUTO_DELIVERY: String(next.providerAutoDelivery),
    BAKONG_MERCHANT_NAME: next.bakongMerchantName,
    BAKONG_ACCOUNT_ID: next.bakongAccountId,
  };

  for (const [key, value] of Object.entries(keyMap)) {
    if (value !== undefined && value !== null) {
      await prisma.systemSetting.upsert({
        where: { key },
        update: { value, updatedAt: new Date() },
        create: { key, value, description: `Dynamic API Config ${key}` },
      });
    }
  }

  cachedSettings = next;
  lastLoadedAt = Date.now();

  try {
    await broadcastRealtimeEvent('system_settings', 'UPDATE', {
      ...next,
      providerApiKey: '***MASKED***', // never broadcast cleartext key in public channels
    });
  } catch (e: any) {
    console.warn('[ApiSettings] Realtime broadcast notice:', e.message);
  }

  return cachedSettings;
}

export async function resetDynamicApiSettings(): Promise<ApiSettings> {
  const keys = [
    'PROVIDER_API_KEY',
    'PROVIDER_STOCK1_URL',
    'PROVIDER_STOCK2_URL',
    'PROVIDER_V2_URL',
    'PROVIDER_ACTIVE_STOCK',
    'PROVIDER_ACTIVE_URL',
    'PROVIDER_AUTO_DELIVERY',
    'BAKONG_MERCHANT_NAME',
    'BAKONG_ACCOUNT_ID',
  ];

  try {
    await prisma.systemSetting.deleteMany({
      where: { key: { in: keys } },
    });
  } catch (e: any) {
    console.warn('[ApiSettings] Notice deleting settings from DB:', e.message);
  }

  cachedSettings = { ...DEFAULT_API_SETTINGS, updatedAt: new Date().toISOString() };
  lastLoadedAt = Date.now();
  return cachedSettings;
}

export function getDynamicApiKeySync(): string {
  return cachedSettings.providerApiKey || DEFAULT_API_SETTINGS.providerApiKey;
}

export function getDynamicStockBasesSync(reqPath?: string): string[] {
  const bases: string[] = [];

  const stock1 = cachedSettings.providerStock1Url || process.env.VNGZZ2GAME_API_URL || 'https://www.vngzz2game.site/api/v1/game';
  const stock2 = cachedSettings.providerStock2Url || process.env.VNGZZ2GAME_API_URL || 'https://www.vngzz2game.site/api/v1/game';

  if (reqPath && reqPath.includes('game2')) {
    bases.push(stock2);
    bases.push(stock1);
  } else if (reqPath && (reqPath.includes('/game/') || reqPath.endsWith('/game'))) {
    bases.push(stock1);
    bases.push(stock2);
  } else {
    if (cachedSettings.providerActiveStock === 2) {
      bases.push(stock2);
      bases.push(stock1);
    } else {
      bases.push(stock1);
      bases.push(stock2);
    }
  }

  if (cachedSettings.providerV2Url) {
    bases.push(cachedSettings.providerV2Url);
  }

  return Array.from(new Set(bases.filter(Boolean)));
}

export async function testProviderConnection(apiKey?: string, targetUrl?: string): Promise<{
  success: boolean;
  status: number;
  latencyMs: number;
  message: string;
  data?: any;
}> {
  const settings = await getDynamicApiSettings();
  const key = (apiKey && apiKey.trim()) ? apiKey.trim() : settings.providerApiKey;
  let url = (targetUrl && targetUrl.trim()) ? targetUrl.trim() : settings.providerActiveUrl;
  url = url.replace(/\/+$/, '');

  const testEndpoints = [
    `${url}/profile`,
    `${url}/categories`,
    `${url}`,
  ];

  const startTime = Date.now();

  for (const endpoint of testEndpoints) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'X-API-Key': key,
          'Accept': 'application/json',
          'User-Agent': 'NADYTOM-Admin-Tester/2.0',
        },
        signal: controller.signal,
      });
      clearTimeout(timer);
      const latencyMs = Date.now() - startTime;

      const bodyText = await res.text().catch(() => '');
      let json: any = null;
      try {
        json = JSON.parse(bodyText);
      } catch {}

      if (res.ok) {
        return {
          success: true,
          status: res.status,
          latencyMs,
          message: json?.user?.username
            ? `Connected to provider as '${json.user.username}' (Balance: $${json.user.balance || 0} USD)`
            : `Connected successfully to upstream API (${res.status} OK)`,
          data: json,
        };
      }

      if (res.status === 401 || res.status === 403) {
        return {
          success: false,
          status: res.status,
          latencyMs,
          message: `Authentication Failed (${res.status}): Invalid API Key or Unauthorized reseller access.`,
          data: json,
        };
      }
    } catch (err: any) {
      // Continue to next endpoint test
    }
  }

  const latencyMs = Date.now() - startTime;
  return {
    success: false,
    status: 503,
    latencyMs,
    message: `Connection unreachable or timed out to ${url}. Verify URL format or network access.`,
  };
}
