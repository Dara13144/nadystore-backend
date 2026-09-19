export interface LookupResult {
  success: boolean;
  nickname?: string;
  error?: string;
  avatarUrl?: string;
  region?: string;
  level?: string | number;
  playerId?: string;
  playerZoneId?: string;
}

export interface DeliveryResult {
  success: boolean;
  referenceId: string;
  error?: string;
}

import { getDynamicApiKeySync, getDynamicStockBasesSync } from './apiConfig';

export function getVngzzApiKey(): string {
  return getDynamicApiKeySync();
}

export function getCandidateBases(): string[] {
  return getDynamicStockBasesSync();
}

// ─────────────────────────────────────────────────────────────────────────────
// SANDBOX ACCOUNTS: Pre-seeded test accounts for development & demo purposes.
// ─────────────────────────────────────────────────────────────────────────────
const SANDBOX_ACCOUNTS: Record<string, Record<string, string>> = {
  'free-fire': {
    '11676873799': 'Darazzzzz1k',
    '12345678': '🔥 ProGamer_FF_KH',
    '87654321': '⚔️ Slayer_King',
    '11111111': '🐉 FF_Dragon_KH',
    '99887766': '💎 Dara_Legend_FF',
  },
  'freefire': {
    '11676873799': 'Darazzzzz1k',
    '12345678': '🔥 ProGamer_FF_KH',
    '87654321': '⚔️ Slayer_King',
    '11111111': '🐉 FF_Dragon_KH',
    '99887766': '💎 Dara_Legend_FF',
  },
  'mobile-legends': {
    '1523754961|11766': 'oNLymYdANiTh',
    '12345678|1234': '⚔️ MLBB_Pro_Gamer',
    '123456789|1234': '🌟 MLBB_Legend_KH',
    '123456|1234': '💎 MLBB_Mythic_Player',
    '998877|1234': '🌟 MLBB_Legend_KH',
    '111222|5678': '⚔️ Star_Hunter_KH',
    '333444|9999': '🛡️ Blade_Master_KH',
    '778899|2024': '👑 Mythic_Glory_KH',
    '888888|8888': '🔥 MLBB_Glory_KH',
    '999999|9999': '⚡ MLBB_Immortal_KH',
    '555555|5555': '🎯 MLBB_Sharpshooter',
  },
  'mobile-legend': {
    '1523754961|11766': 'oNLymYdANiTh',
    '12345678|1234': '⚔️ MLBB_Pro_Gamer',
    '123456789|1234': '🌟 MLBB_Legend_KH',
    '123456|1234': '💎 MLBB_Mythic_Player',
    '998877|1234': '🌟 MLBB_Legend_KH',
    '111222|5678': '⚔️ Star_Hunter_KH',
    '333444|9999': '🛡️ Blade_Master_KH',
    '778899|2024': '👑 Mythic_Glory_KH',
    '888888|8888': '🔥 MLBB_Glory_KH',
    '999999|9999': '⚡ MLBB_Immortal_KH',
    '555555|5555': '🎯 MLBB_Sharpshooter',
  },
  'moonton-mlbb': {
    '1523754961|11766': 'oNLymYdANiTh',
    '12345678|1234': '⚔️ MLBB_Pro_Gamer',
    '998877|1234': '🌟 MLBB_Legend_KH',
    '111222|5678': '⚔️ Star_Hunter_KH',
    '333444|9999': '🛡️ Blade_Master_KH',
  },
  'pubg-mobile': {
    '55443322': '🎯 PUBG_Conqueror_KH',
    '11223344': '🦅 PUBG_Ace_Player',
    '99887766': '⚡ SnipeKing_KH',
  },
  'roblox': {
    'Builderman': 'Builderman',
    'ROBLOX': 'ROBLOX',
    'TestUser': 'TestUser',
  },
  'valorant': {
    'ValorantPro#KH1': 'ValorantPro',
    'RadiantKH#001': 'RadiantKH',
  },
  'genshin-impact': {
    '800123456': 'TravelerKH',
    '900876543': 'PaimonFan_KH',
  },
  'honkai-star-rail': {
    '700112233': 'StarRailKH',
    '700998877': 'TrailblazerKH',
  },
};

const COOL_NAMES_FF = [
  '🔥 ProGamer_KH', '⚡ Shadow_Ninja', '👑 Dragon_Slayer', '⚔️ Angkor_King',
  '🦅 Khmer_Warrior', '🎯 Snipe_Master', '💎 Dara_Legend', '🦁 LionHeart_KH',
  '🌪️ Storm_Bringer', '🛡️ Titan_Defender', '🏹 Sniper_Ghost', '🌟 Master_Chief'
];

const COOL_NAMES_MLBB = [
  '⚡ MLBB_Mythic_Pro', '⚔️ Blade_Master_KH', '🌟 Star_Hunter', '👑 Divine_Knight',
  '🔥 Dara_Carry', '🛡️ Angkor_Titan', '💎 Savage_Queen', '🌪️ Storm_Rider',
  '🏆 Glory_Immortal', '🦅 Falcon_Striker', '🏹 Shadow_Assassin', '⚡ Cyber_Mage'
];

// ─────────────────────────────────────────────────────────────────────────────
// SANDBOX FALLBACK RESOLVER: Returns deterministic nickname from Player ID.
// ─────────────────────────────────────────────────────────────────────────────
function sandboxLookup(gameSlug: string, playerId: string, playerZoneId?: string): LookupResult {
  console.log(`[Sandbox] Resolving ${gameSlug} player: ${playerId}${playerZoneId ? ` / zone ${playerZoneId}` : ''}`);

  const trimmedId = playerId.trim();
  const trimmedZone = playerZoneId ? playerZoneId.trim() : '';

  // Calculate deterministic index from ID digits
  const idSum = trimmedId.split('').reduce((acc, c) => acc + (c.charCodeAt(0) || 0), 0);

  // ── Free Fire ──────────────────────────────────────────────────────────────
  if (gameSlug === 'free-fire' || gameSlug.startsWith('free-fire') || gameSlug.includes('freefire')) {
    if (!/^\d{5,14}$/.test(trimmedId)) {
      return { success: false, error: 'Free Fire Player ID must be 5–14 digits' };
    }
    const known = SANDBOX_ACCOUNTS['free-fire'][trimmedId];
    const nickname = known || `${COOL_NAMES_FF[idSum % COOL_NAMES_FF.length]}_${trimmedId.slice(-3)}`;
    return {
      success: true,
      nickname,
      playerId: trimmedId,
      region: 'Cambodia (Asia)',
      level: 45 + (idSum % 40),
      avatarUrl: '/images/games/freefire.png'
    };
  }

  // ── Mobile Legends & Moonton MLBB ───────────────────────────────────────────
  if (gameSlug.includes('mobile-legend') || gameSlug.includes('mlbb') || gameSlug.includes('moonton')) {
    if (!trimmedZone) {
      return { success: false, error: 'Zone ID is required for Mobile Legends' };
    }
    if (!/^\d{3,12}$/.test(trimmedId)) {
      return { success: false, error: 'Mobile Legends User ID must be numeric (3–12 digits)' };
    }
    const key = `${trimmedId}|${trimmedZone}`;
    const known = SANDBOX_ACCOUNTS['mobile-legends']?.[key] || 
                  SANDBOX_ACCOUNTS['mobile-legend']?.[key] || 
                  SANDBOX_ACCOUNTS['moonton-mlbb']?.[key];
    const nickname = known || `${COOL_NAMES_MLBB[idSum % COOL_NAMES_MLBB.length]}`;
    return {
      success: true,
      nickname,
      playerId: trimmedId,
      playerZoneId: trimmedZone,
      region: 'Cambodia (Asia)',
      level: 30 + (idSum % 50),
      avatarUrl: '/images/games/mlbb.png'
    };
  }

  // ── PUBG Mobile ────────────────────────────────────────────────────────────
  if (gameSlug === 'pubg-mobile') {
    if (!/^\d{5,15}$/.test(trimmedId)) {
      return { success: false, error: 'PUBG Mobile Player ID must be 5–15 digits' };
    }
    const known = SANDBOX_ACCOUNTS['pubg-mobile'][trimmedId];
    return {
      success: true,
      nickname: known || `🎯 PUBG_Pro_${trimmedId.slice(-4)}`,
      playerId: trimmedId,
      region: 'Asia'
    };
  }

  // ── Roblox ─────────────────────────────────────────────────────────────────
  if (gameSlug === 'roblox') {
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(trimmedId)) {
      return { success: false, error: 'Roblox username must be 3–20 alphanumeric characters' };
    }
    const known = SANDBOX_ACCOUNTS['roblox'][trimmedId];
    return {
      success: true,
      nickname: known || `${trimmedId} (Roblox)`,
      playerId: trimmedId
    };
  }

  // ── Valorant ───────────────────────────────────────────────────────────────
  if (gameSlug === 'valorant') {
    if (!trimmedId.includes('#')) {
      return { success: false, error: 'Valorant ID must include a tagline (e.g., PlayerName#KH1)' };
    }
    const known = SANDBOX_ACCOUNTS['valorant']?.[trimmedId];
    return {
      success: true,
      nickname: known || trimmedId.split('#')[0],
      playerId: trimmedId
    };
  }

  // ── Generic fallback for any other game ────────────────────────────────────
  if (!trimmedId || trimmedId.length < 3) {
    return { success: false, error: 'Player ID is too short (minimum 3 characters)' };
  }

  return {
    success: true,
    nickname: `Gamer_${trimmedId.slice(-4)}`,
    playerId: trimmedId,
    region: 'Asia'
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// LIVE API: Validate player via external verification gateway
// Falls back gracefully if region-blocked or network unreachable.
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// VNGZZ2GAME LIVE API (https://www.vngzz2game.site/api/v1/game)
// ─────────────────────────────────────────────────────────────────────────────
async function vngzz2gameLookup(
  gameSlug: string,
  playerId: string,
  playerZoneId?: string
): Promise<LookupResult | null> {
  const apiKey = getVngzzApiKey();
  const candidateBases = [
    process.env.VNGZZ2GAME_API_URL || 'https://www.vngzz2game.site/api/v1/game',
    'https://www.vngzz2game.site/api/v1/game',
  ];
  const uniqueBases = Array.from(new Set(candidateBases));

  const slugLower = gameSlug.toLowerCase();
  const isFF = slugLower.includes('free-fire') || slugLower.includes('freefire');
  const isMLBB = slugLower.includes('mobile-legend') || slugLower.includes('mlbb') || slugLower.includes('moonton');

  const gameCodesToTry: string[] = [];
  if (isFF) {
    if (slugLower.includes('global')) {
      gameCodesToTry.push('freefire_global', 'freefire_sgmy', 'freefire_kh', 'ff');
    } else {
      gameCodesToTry.push('freefire_sgmy', 'freefire_kh', 'freefire_global', 'ff');
    }
  } else if (isMLBB) {
    gameCodesToTry.push('mlbb_special', 'mlbb_exclusive', 'mobile_legends', 'mlbb', 'ml');
  } else if (slugLower.includes('pubg')) {
    gameCodesToTry.push('pubgm');
  } else if (slugLower.includes('honor-of-kings') || slugLower.includes('hok')) {
    gameCodesToTry.push('hok');
  } else if (slugLower.includes('farlight')) {
    gameCodesToTry.push('farlight84');
  } else if (slugLower.includes('blood-strike')) {
    gameCodesToTry.push('bloodstrike', 'bloodstrikeme');
  } else if (slugLower.includes('valorant')) {
    gameCodesToTry.push('valorant_kh', 'valorant_sg');
  }

  if (gameCodesToTry.length === 0 || !apiKey) return null;

  const cleanId = playerId.trim().replace(/[^\d]/g, '');
  const cleanZone = playerZoneId ? playerZoneId.trim().replace(/[^\d]/g, '') : '';
  const avatarUrl = isFF ? '/images/games/freefire.png' : (isMLBB ? '/images/games/mlbb.png' : `/images/games/${gameSlug}.png`);

  for (const apiUrl of uniqueBases) {
    for (const gameCode of gameCodesToTry) {
      try {
        let url = `${apiUrl}/check_id?game_code=${gameCode}&game=${gameCode}&game_user_id=${encodeURIComponent(cleanId)}&id=${encodeURIComponent(cleanId)}&userid=${encodeURIComponent(cleanId)}`;
        if (cleanZone) {
          url += `&zone_id=${encodeURIComponent(cleanZone)}&zoneid=${encodeURIComponent(cleanZone)}&server_id=${encodeURIComponent(cleanZone)}&serverid=${encodeURIComponent(cleanZone)}`;
        }

        console.log(`[Game Provider API] [VNGZZ2GAME] Querying check_id: ${url}`);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);

        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'X-API-Key': apiKey,
            'Accept': 'application/json',
          },
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (response.status === 404 || response.status >= 500) {
          continue; // Try next base URL / game code
        }

        if (response.ok) {
          const data = (await response.json()) as any;
          if (data.status === 'APPROVED' || data.status === 200 || data.valid === true || data.success === true) {
            const nickname = data.username || data.data?.username || data.data?.nickname || data.data?.name || data.name || data.nickname;
            if (nickname) {
              console.log(`[VNGZZ2GAME API] ✅ Found player nickname: ${nickname}`);
              return {
                success: true,
                nickname,
                region: data.region || 'Cambodia (Asia)',
                level: 50,
                playerId: cleanId,
                playerZoneId: cleanZone || undefined,
                avatarUrl
              };
            }
          }
        } else {
          const errData = (await response.json().catch(() => ({}))) as any;
          if (errData && errData.message && errData.valid === false) {
            console.warn(`[VNGZZ2GAME API] Validation note on ${gameCode}: ${errData.message}`);
          }
        }
      } catch (e: any) {
        console.warn(`[VNGZZ2GAME API] Lookup error on ${gameCode}:`, e.message);
      }
    }
  }

  const notFoundMsg = isFF
    ? 'រកមិនឃើញគណនី Free Fire នេះទេ។ សូមពិនិត្យមើល Player ID ម្ដងទៀត'
    : (isMLBB ? 'រកមិនឃើញគណនី Mobile Legends នេះទេ។ សូមពិនិត្យមើល User ID និង Zone ID ម្ដងទៀត' : 'រកមិនឃើញគណនីហ្គេមនេះទេ។ សូមពិនិត្យមើល Player ID ម្ដងទៀត');

  return { success: false, error: notFoundMsg };
}

// ─────────────────────────────────────────────────────────────────────────────
// LIVE API: Validate player via external verification gateway
// Falls back gracefully if region-blocked or network unreachable.
// ─────────────────────────────────────────────────────────────────────────────
async function liveApiLookup(
  typeName: string,
  playerId: string,
  playerZoneId?: string
): Promise<LookupResult | null> {
  try {
    const zoneParam = playerZoneId ? `&zoneId=${playerZoneId.trim()}` : '';
    const url = `https://api-cek-id-game-ten.vercel.app/api/check-id-game?type_name=${typeName}&userId=${playerId.trim()}${zoneParam}`;

    console.log(`[Game Provider API] Querying live validation gateway: ${url}`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000); // 2 second fast timeout

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'application/json',
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.warn(`[Game Provider API] Live API returned HTTP ${response.status}. Will use sandbox fallback.`);
      return null;
    }

    const data = (await response.json()) as any;
    if (data && data.status === true) {
      const nickname = data.nickname || data?.data?.nickname || data?.data?.username || data?.data?.name || data.username || data.name || '';
      if (nickname) return { success: true, nickname };
    }
    return null;
  } catch (e: any) {
    console.warn('[Game Provider API] Live API exception or timeout:', e.message);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ROBLOX LIVE LOOKUP: Uses the official Roblox users API
// ─────────────────────────────────────────────────────────────────────────────
async function robloxLiveLookup(username: string): Promise<LookupResult | null> {
  try {
    console.log(`[Game Provider API] Querying Roblox API for username: ${username}`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);

    const response = await fetch('https://users.roblox.com/v1/usernames/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      },
      body: JSON.stringify({
        usernames: [username.trim()],
        excludeBannedUsers: true,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as any;

    if (data && data.data && data.data.length > 0) {
      const user = data.data[0];
      return { success: true, nickname: `${user.displayName} (@${user.name})` };
    }

    return { success: false, error: 'Roblox username not found. Please check your username and try again.' };
  } catch (e: any) {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MRXTOPUP LIVE LOOKUP: Uses the check-user API endpoint (POST)
// ─────────────────────────────────────────────────────────────────────────────
async function mrxApiLookup(
  gameSlug: string,
  playerId: string,
  playerZoneId?: string
): Promise<LookupResult | null> {
  try {
    const payload: any = { userId: playerId.trim() };
    const isMLBB = gameSlug.includes('mobile-legend') || gameSlug.includes('mlbb') || gameSlug.includes('moonton');
    if (isMLBB && playerZoneId) {
      payload.zoneId = playerZoneId.trim();
    }

    const url = 'https://www.mrxtopup.com/api/check-user';
    console.log(`[Game Provider API] Querying mrxtopup check-user API: ${url} with payload:`, payload);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000); // 2 second timeout

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, fill: true) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Referer': isMLBB ? 'https://www.mrxtopup.com/topup/mlbb' : 'https://www.mrxtopup.com/topup/ff',
        'Origin': 'https://www.mrxtopup.com',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as any;
    if (data && (data.success === true || data.status === 200 || data.status === 'success' || data.name || data.username)) {
      const nickname = data.name || data.username || data.nickname || data.data?.name || data.data?.username || data.data?.nickname || '';
      if (nickname) {
        return { success: true, nickname };
      }
    }

    if (data && (data.success === false || data.message)) {
      return { success: false, error: data.message || 'រកមិនឃើញគណនី ឬ User ID មិនត្រឹមត្រូវទេ' };
    }

    return null;
  } catch (e: any) {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXPORT: lookupPlayerNickname
// Strategy: Sandbox accounts → Live Multi-Provider Pipeline → Sandbox Fallback
// ─────────────────────────────────────────────────────────────────────────────
export async function lookupPlayerNickname(
  gameSlug: string,
  playerId: string,
  playerZoneId?: string
): Promise<LookupResult> {
  let trimmedId = (playerId || '').trim();
  let trimmedZone = (playerZoneId || '').trim();

  // Intelligent combined ID/Zone parsing (e.g. "1523754961 (11766)", "1523754961(11766)", "1523754961 11766", "1523754961_11766")
  const comboMatch = trimmedId.match(/^(\d{4,12})[\s_()\-]+(\d{3,6})\)?$/);
  if (comboMatch) {
    trimmedId = comboMatch[1];
    if (!trimmedZone) {
      trimmedZone = comboMatch[2];
    }
  }

  // Strip parentheses and whitespace from Zone ID
  if (trimmedZone) {
    trimmedZone = trimmedZone.replace(/[()]/g, '').trim();
  }

  if (!trimmedId) {
    return { success: false, error: 'Player ID is required' };
  }

  const baseSlug = (gameSlug.startsWith('free-fire-') || gameSlug.includes('freefire'))
    ? 'free-fire' 
    : ((gameSlug.includes('mobile-legend') || gameSlug.includes('mlbb') || gameSlug.includes('moonton')) 
      ? 'mobile-legends' 
      : ((gameSlug.includes('telegram') || gameSlug.includes('tg')) ? 'telegram-premium' : gameSlug));

  // ── Telegram Live Username Lookup ──────────────────────────────────────────
  if (baseSlug === 'telegram-premium') {
    const cleanUsername = trimmedId.replace(/^@+/, '').trim();
    if (!cleanUsername || cleanUsername.length < 3) {
      return { success: false, error: 'សូមបញ្ចូល Telegram Username យ៉ាងតិច 3 តួអក្សរ' };
    }
    if (!/^[a-zA-Z0-9_]{3,32}$/.test(cleanUsername)) {
      return { success: false, error: 'Telegram Username មិនត្រឹមត្រូវ (ប្រើតែអក្សរ លេខ និង _ ប៉ុណ្ណោះ)' };
    }

    try {
      const tgRes = await fetch(`https://t.me/${cleanUsername}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: AbortSignal.timeout(6000),
      });
      const html = await tgRes.text();

      const titleMatch = html.match(/<div class="tgme_page_title"[^>]*>([\s\S]*?)<\/div>/i) ||
                         html.match(/<meta property="og:title" content="([^"]+)"/i);
      const photoMatch = html.match(/<img class="tgme_page_photo_image"[^>]*src="([^"]+)"/i) ||
                         html.match(/<meta property="og:image" content="([^"]+)"/i);

      let title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : null;
      let photo = photoMatch ? photoMatch[1] : null;

      if (photo && (photo.includes('telegram.org/img/t_logo') || photo.includes('favicon'))) {
        photo = null;
      }

      const notFound = !title || (html.includes('tgme_page_icon') && html.includes('If you have <strong>Telegram</strong>'));

      if (!notFound && title) {
        return {
          success: true,
          nickname: title,
          region: 'Telegram Global',
          level: 1,
          playerId: `@${cleanUsername}`,
          avatarUrl: photo ? `/api/avatar?url=${encodeURIComponent(photo)}` : '/images/games/telegram-premium.png',
        };
      } else {
        return {
          success: false,
          error: `រកមិនឃើញគណនី Telegram (@${cleanUsername}) នេះទេ។ សូមពិនិត្យមើល Username ម្ដងទៀត`,
        };
      }
    } catch (tgErr: any) {
      console.error('[Telegram Lookup Error]:', tgErr);
      return {
        success: false,
        error: 'មិនអាចទាក់ទងប្រព័ន្ធ Telegram បានទេ សូមព្យាយាមម្តងទៀត',
      };
    }
  }

  // Strip non-numeric chars for Mobile Legends
  if (baseSlug === 'mobile-legends') {
    trimmedId = trimmedId.replace(/[^\d]/g, '');
    trimmedZone = trimmedZone.replace(/[^\d]/g, '');
  }

  // Pre-check: If this ID is a pre-seeded mock sandbox account, resolve it immediately.
  if (baseSlug === 'mobile-legends') {
    const key = `${trimmedId}|${trimmedZone}`;
    const known = SANDBOX_ACCOUNTS['mobile-legends']?.[key] || 
                  SANDBOX_ACCOUNTS['mobile-legend']?.[key] ||
                  SANDBOX_ACCOUNTS['moonton-mlbb']?.[key];
    if (known) {
      return { 
        success: true, 
        nickname: known,
        region: 'Cambodia (Asia)',
        level: 45,
        playerId: trimmedId,
        playerZoneId: trimmedZone,
        avatarUrl: '/images/games/mlbb.png'
      };
    }
  } else if (SANDBOX_ACCOUNTS[baseSlug]?.[trimmedId]) {
    return { success: true, nickname: SANDBOX_ACCOUNTS[baseSlug][trimmedId] };
  }

  // ── Mobile Legends Real In-Game Name Multi-Provider Pipeline ──────────────
  if (baseSlug === 'mobile-legends') {
    if (!trimmedZone) {
      return { success: false, error: 'សូមបញ្ចូល Zone ID (Server ID) សម្រាប់ Mobile Legends' };
    }

    // 1. Try VNGZZ2GAME Official Partner API FIRST (Fast & Direct Moonton Gateway)
    const vngzzResult = await vngzz2gameLookup(gameSlug, trimmedId, trimmedZone);
    if (vngzzResult && vngzzResult.success && vngzzResult.nickname) {
      console.log(`[MLBB Real Name] ✅ Found via VNGZZ: ${vngzzResult.nickname}`);
      return vngzzResult;
    }

    // 2. Try Vercel / Gateway API
    const vercelResult = await liveApiLookup('mobile_legends', trimmedId, trimmedZone);
    if (vercelResult && vercelResult.success && vercelResult.nickname) {
      console.log(`[MLBB Real Name] ✅ Found via Vercel Gateway: ${vercelResult.nickname}`);
      return {
        ...vercelResult,
        region: vercelResult.region || 'Cambodia (Asia)',
        playerId: trimmedId,
        playerZoneId: trimmedZone,
        avatarUrl: '/images/games/mlbb.png'
      };
    }

    // 3. Try mrxtopup (Cambodian gateway fallback)
    const mrxResult = await mrxApiLookup(gameSlug, trimmedId, trimmedZone);
    if (mrxResult && mrxResult.success && mrxResult.nickname) {
      console.log(`[MLBB Real Name] ✅ Found via mrxtopup: ${mrxResult.nickname}`);
      return {
        ...mrxResult,
        region: 'Cambodia (Asia)',
        playerId: trimmedId,
        playerZoneId: trimmedZone,
        avatarUrl: '/images/games/mlbb.png'
      };
    }

    // If VNGZZ explicitly returned user not found
    if (vngzzResult && !vngzzResult.success && vngzzResult.error) {
      return vngzzResult;
    }

    console.log(`[Game Provider API] Live APIs unavailable for ${gameSlug}. Using sandbox resolver.`);
    return sandboxLookup(gameSlug, trimmedId, trimmedZone);
  }

  // ── Free Fire Real In-Game Name Verification Pipeline ─────────────────────
  if (baseSlug === 'free-fire') {
    // 1. Try VNGZZ2GAME Official Partner API (Tries freefire_sgmy then freefire_global)
    const vngzzResult = await vngzz2gameLookup(gameSlug, trimmedId);
    if (vngzzResult && vngzzResult.success && vngzzResult.nickname) {
      console.log(`[Free Fire Real Name] ✅ Found via VNGZZ: ${vngzzResult.nickname}`);
      return {
        ...vngzzResult,
        avatarUrl: '/images/games/freefire.png',
        region: 'Cambodia (Asia)'
      };
    }

    // 2. Try mrxtopup fallback
    const mrxResult = await mrxApiLookup(gameSlug, trimmedId);
    if (mrxResult && mrxResult.success && mrxResult.nickname) {
      console.log(`[Free Fire Real Name] ✅ Found via mrxtopup: ${mrxResult.nickname}`);
      return {
        ...mrxResult,
        region: 'Cambodia (Asia)',
        playerId: trimmedId,
        avatarUrl: '/images/games/freefire.png'
      };
    }

    // If VNGZZ explicitly returned user not found
    if (vngzzResult && !vngzzResult.success && vngzzResult.error) {
      return vngzzResult;
    }

    console.log(`[Game Provider API] Live APIs unavailable for ${gameSlug}. Using sandbox resolver.`);
    return sandboxLookup(gameSlug, trimmedId);
  }

  // ── 0. VNGZZ2GAME Official API Lookup for other games ─────────────────────
  const vngzzResult = await vngzz2gameLookup(gameSlug, trimmedId, playerZoneId);
  if (vngzzResult !== null) {
    return vngzzResult;
  }

  // ── 2. Roblox: use official Roblox API ──────────────────────────────────
  if (gameSlug === 'roblox') {
    const liveResult = await robloxLiveLookup(trimmedId);
    if (liveResult !== null) {
      return liveResult;
    }
    console.log('[Game Provider API] Roblox live API unavailable. Using sandbox resolver.');
    return sandboxLookup(gameSlug, trimmedId, playerZoneId);
  }

  // ── 3. Steam Voucher: no validation needed ──────────────────────────────
  if (gameSlug === 'steam-voucher') {
    return { success: true, nickname: 'Steam Wallet Recipient' };
  }

  // ── 4. Games supported by the vercel validation API ─────────────────────
  const LIVE_API_SLUGS: Record<string, string> = {
    'pubg-mobile': 'pubg_mobile',
    'honor-of-kings': 'honor_of_kings',
    'farlight-84': 'farlight',
    'mobile-legends': 'mobile_legends',
    'mobile-legend': 'mobile_legends',
    'mlbb': 'mobile_legends',
  };

  const typeName = LIVE_API_SLUGS[gameSlug];

  if (typeName) {
    const liveResult = await liveApiLookup(typeName, trimmedId, playerZoneId);

    if (liveResult !== null) {
      if (!liveResult.success) {
        return liveResult;
      }
      return liveResult;
    }

    console.log(`[Game Provider API] Live API unavailable for ${gameSlug}. Using sandbox resolver.`);
    return sandboxLookup(gameSlug, trimmedId, playerZoneId);
  }

  // ── 5. All other games: sandbox resolver only ────────────────────────────
  return sandboxLookup(gameSlug, trimmedId, playerZoneId);
}

// ─────────────────────────────────────────────────────────────────────────────
// PRODUCT CODE RESOLVER: Maps game slug, package name, and count to live API codes
// ─────────────────────────────────────────────────────────────────────────────
export function resolveLiveProductCode(gameSlug: string, packageName: string, amount?: number): string | null {
  const slug = (gameSlug || '').toLowerCase();
  const name = (packageName || '').toLowerCase();
  const numMatch = packageName.match(/\d+/);
  const amt = Number(amount) || (numMatch ? parseInt(numMatch[0], 10) : 0);

  // 1. Free Fire (SGMY & Global)
  if (slug.includes('free-fire') || slug.includes('freefire')) {
    // Lite passes: "W.Lite", "2× W.Lite", "2x W.Lite", etc.
    if (name.includes('w.lite') || name.includes('weeklylite') || (name.includes('weekly') && name.includes('lite'))) {
      if (name.includes('2×') || name.includes('2x')) return 'FF_WEEKLITE_X2';
      if (name.includes('3×') || name.includes('3x')) return 'FF_WEEKLYLITE_X3';
      return 'FREEFIRE_SGMY_WeeklyLite';
    }

    // Weekly cards/passes: "W.Card", "2× W.Card", etc.
    if (name.includes('w.card') || name.includes('weekly')) {
      if (name.includes('2×') || name.includes('2x')) return 'UNGS_WEEKLYX2';
      if (name.includes('3×') || name.includes('3x')) return 'UNGS_WEEKLYX3';
      return 'FREEFIRE_SGMY_Weekly';
    }

    // Monthly cards: "M.Card", "2× M.Card", etc.
    if (name.includes('m.card') || name.includes('monthly')) {
      if (name.includes('2×') || name.includes('2x')) return 'UNGS_MONTHLYX2';
      if (name.includes('3×') || name.includes('3x')) return 'UNGS_MONTHLYX3';
      return 'UNGS_FFSG_Monthly';
    }

    // Combo passes: "M+W+L", "2× M+W+L", etc.
    if (name.includes('m+w+l') || name.includes('3 in 1') || name.includes('3in1')) {
      return 'FreeFireSG_3IN1_3035';
    }

    // Level up packages: "LvUp L6", "LvUp L10", "Level Up Pass", etc.
    if (name.includes('lvup') || name.includes('level up')) {
      if (name.includes('l6') || name.includes('level 6')) return 'FREEFIRE_SGMY_Level_Up_Package___Level_6';
      if (name.includes('l10') || name.includes('level 10')) return 'FREEFIRE_SGMY_Level_Up_Package___Level_10';
      if (name.includes('l15') || name.includes('level 15')) return 'FREEFIRE_SGMY_Level_Up_Package___Level_15';
      if (name.includes('l20') || name.includes('level 20')) return 'FREEFIRE_SGMY_Level_Up_Package___Level_20';
      if (name.includes('l25') || name.includes('level 25')) return 'FREEFIRE_SGMY_Level_Up_Package___Level_25';
      if (name.includes('l30') || name.includes('level 30')) return 'FREEFIRE_SGMY_Level_Up_Package___Level_30';
      return 'FREEFIRE_SGMY_Level_Up_Package___Level_6';
    }

    // Diamonds count
    if (slug.includes('global')) {
      if (amt <= 150) return 'FREEFIRE_GLOBAL_110';
      if (amt <= 400) return 'FREEFIRE_GLOBAL_341';
      if (amt <= 700) return 'FREEFIRE_GLOBAL_572';
      if (amt <= 1500) return 'FREEFIRE_GLOBAL_1166';
      if (amt <= 3000) return 'FREEFIRE_GLOBAL_2398';
      return 'FREEFIRE_GLOBAL_6160';
    }

    if (amt <= 30) return 'FREEFIRE_SG_25';
    if (amt <= 70) return 'FREEFIRE_SG_25';
    if (amt <= 150) return 'FREEFIRE_SG_100';
    if (amt <= 250) return 'FREEFIRE_SG_100';
    if (amt <= 350) return 'FREEFIRE_SG_310';
    if (amt <= 450) return 'FREEFIRE_SG_310';
    if (amt <= 600) return 'FREEFIRE_SG_520';
    if (amt <= 800) return 'FREEFIRE_SG_520';
    if (amt <= 1200) return 'FREEFIRE_SG_1060';
    if (amt <= 2500) return 'FREEFIRE_SG_2180';
    if (amt <= 6000) return 'FREEFIRE_SG_5600';
    return 'FREEFIRE_SG_11500';
  }

  // 2. Mobile Legends: Bang Bang
  if (slug.includes('mobile-legend') || slug.includes('mlbb') || slug.includes('moonton')) {
    if (name.includes('twilight')) return 'MLBB_Twilight';
    if (name.includes('w.elite') || (name.includes('weekly') && name.includes('elite'))) return 'MLBB_Weekly_Elite_Pack';
    if (name.includes('m.epic') || (name.includes('monthly') && name.includes('epic'))) return 'MLBB_Monthly_Epic';
    if (name.includes('w.pass') || name.includes('weekly')) {
      if (name.includes('2x') || name.includes('2×')) return 'MLBB_Weekly_X2';
      if (name.includes('3x') || name.includes('3×')) return 'MLBB_Weekly_X3';
      if (name.includes('4x') || name.includes('4×')) return 'MLBB_Weekly_X4';
      if (name.includes('5x') || name.includes('5×')) return 'MLBB_Weekly_X5';
      if (name.includes('10x') || name.includes('10×')) return 'MLBB_Weekly_X10';
      return 'MLBB_Weekly';
    }
    if (name.includes('monthly')) return 'MLBB_Monthly_Elite_Pack';

    const knownAmounts = [55, 86, 165, 172, 257, 275, 343, 429, 514, 516, 565, 600, 706, 792, 878, 963, 1049, 1135, 1220, 1412, 1584, 1755, 2195, 2901, 3688, 4390, 5532, 9288];
    if (knownAmounts.includes(amt)) {
      return `MLBB_${amt}`;
    }
    return `MLBB_${amt || 86}`;
  }

  // 3. PUBG Mobile
  if (slug.includes('pubg')) {
    if (name.includes('elite') && name.includes('plus')) return 'PUBGM_Elite_Pass_Plus_LV1_100';
    if (name.includes('elite')) return 'PUBGM_Elite_Pass_LV1_100';
    if (name.includes('prime') && name.includes('plus')) return 'PUBGM_Prime_Plus_1_Month';
    if (name.includes('prime')) return 'PUBGM_Prime_1_Month';
    if (amt <= 80) return 'PUBGM_60';
    if (amt <= 150) return 'PUBGM_60';
    if (amt <= 400) return 'PUBGM_325';
    if (amt <= 800) return 'PUBGM_660';
    if (amt <= 2000) return 'PUBGM_1800';
    if (amt <= 4000) return 'PUBGM_3850';
    return 'PUBGM_8100';
  }

  // 4. Honor of Kings
  if (slug.includes('honor-of-kings') || slug.includes('hok')) {
    if (name.includes('weekly') && name.includes('plus')) return 'HOK_Weekly_Card_Plus';
    if (name.includes('weekly')) return 'HOK_Weekly_Card';
    if (amt <= 30) return 'HOK_16';
    if (amt <= 100) return 'HOK_80';
    if (amt <= 300) return 'HOK_240';
    if (amt <= 450) return 'HOK_400';
    if (amt <= 650) return 'HOK_560';
    if (amt <= 1000) return 'HOK_830';
    if (amt <= 1500) return 'HOK_1245';
    if (amt <= 3000) return 'HOK_2508';
    if (amt <= 5000) return 'HOK_4180';
    return 'HOK_8360';
  }

  // 5. Farlight 84
  if (slug.includes('farlight')) {
    if (amt <= 8) return 'FARLIGHT84_5';
    if (amt <= 15) return 'FARLIGHT84_10';
    if (amt <= 25) return 'FARLIGHT84_20';
    if (amt <= 45) return 'FARLIGHT84_40';
    if (amt <= 55) return 'FARLIGHT84_50';
    if (amt <= 70) return 'FARLIGHT84_60';
    if (amt <= 90) return 'FARLIGHT84_80';
    if (amt <= 120) return 'FARLIGHT84_100';
    if (amt <= 180) return 'FARLIGHT84_165';
    if (amt <= 250) return 'FARLIGHT84_220';
    if (amt <= 400) return 'FARLIGHT84_330';
    if (amt <= 1000) return 'FARLIGHT84_880';
    if (amt <= 2500) return 'FARLIGHT84_2240';
    return 'FARLIGHT84_4700';
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// DELIVERY: Delivers top-up directly to VNGZZ2GAME Provider API
// ─────────────────────────────────────────────────────────────────────────────
export async function deliverTopup(
  gameSlug: string,
  playerId: string,
  playerZoneId: string | null,
  packageName: string,
  price: number,
  orderTxnId?: string,
  productCode?: string,
  packageAmount?: number
): Promise<DeliveryResult> {
  const apiKey = getVngzzApiKey();
  const candidateBases = getCandidateBases();
  const ref = orderTxnId || `ORD-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

  console.log(
    `[Game Provider API] [VNGZZ2GAME] Delivering topup of "${packageName}" for ${gameSlug} ` +
    `(Player: ${playerId}${playerZoneId ? ` / Zone: ${playerZoneId}` : ''}) Ref: ${ref}`
  );

  // 1. Resolve product_code using explicit code or smart resolver
  const resolvedCode = productCode || resolveLiveProductCode(gameSlug, packageName, packageAmount);

  // 2. Attempt live delivery via VNGZZ2GAME API
  if (apiKey && resolvedCode) {
    const candidateCodes = [
      resolvedCode,
      resolvedCode.replace('FREEFIRE_SGMY_', 'FREEFIRE_SG_'),
      resolvedCode.replace('FREEFIRE_SG_', 'FREEFIRE_SGMY_'),
      resolvedCode.startsWith('MLBB_') && !resolvedCode.startsWith('MLBB_SPECIAL_') ? resolvedCode.replace('MLBB_', 'MLBB_SPECIAL_') : null,
      resolvedCode.startsWith('MLBB_SPECIAL_') ? resolvedCode.replace('MLBB_SPECIAL_', 'MLBB_') : null,
    ].filter(Boolean) as string[];
    const uniqueCodes = Array.from(new Set(candidateCodes));

    let lastError = '';
    for (const apiUrl of candidateBases) {
      for (const code of uniqueCodes) {
        const orderPayload: any = {
          product_code: code,
          game_user_id: playerId.trim(),
          userid: playerId.trim(),
          reference: ref,
        };
        if (playerZoneId && playerZoneId.trim()) {
          orderPayload.server_id = playerZoneId.trim();
          orderPayload.serverid = playerZoneId.trim();
          orderPayload.game_zone_id = playerZoneId.trim();
          orderPayload.zone_id = playerZoneId.trim();
        }

        try {
          console.log(`[VNGZZ2GAME API] Calling create_order: ${apiUrl}/create_order with code ${code}:`, orderPayload);
          const res = await fetch(`${apiUrl}/create_order`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-API-Key': apiKey,
            },
            body: JSON.stringify(orderPayload),
            signal: AbortSignal.timeout(12000),
          });

          if (res.status === 404 || res.status >= 500) {
            console.warn(`[VNGZZ2GAME API] create_order status ${res.status} on ${apiUrl}, trying next...`);
            continue;
          }

          const data = await res.json().catch(() => ({})) as any;
          console.log('[VNGZZ2GAME API] create_order response:', res.status, JSON.stringify(data));

          if (res.ok && (data.status === 'SUCCESS' || data.status === 'success' || data.status === 'APPROVED' || data.success === true)) {
            const upstreamRef = data.reference || data.order?.reference || data.order_id || data.id || ref;
            console.log(`[VNGZZ2GAME API] ✅ Top-up order successfully created! Reference: ${upstreamRef}`);
            return {
              success: true,
              referenceId: upstreamRef,
            };
          } else {
            lastError = data.message || data.error || `HTTP ${res.status}`;
            console.warn(`[VNGZZ2GAME API] ⚠️ create_order with code ${code} failed:`, lastError);
            if (data.message && data.message.toLowerCase().includes('balance')) {
              return {
                success: false,
                referenceId: data.reference || ref,
                error: lastError,
              };
            }
          }
        } catch (apiErr: any) {
          lastError = apiErr.message || apiErr;
          console.error(`[VNGZZ2GAME API] Error calling create_order on ${apiUrl}:`, lastError);
        }
      }
    }
    if (process.env.SANDBOX_MODE === 'true') {
      return {
        success: true,
        referenceId: `SIM-${ref}`,
      };
    }

    return {
      success: false,
      referenceId: ref,
      error: lastError || 'All upstream provider routes failed',
    };
  }

  // No product code could be resolved
  console.warn(
    `[VNGZZ2GAME API] ⚠️ No product_code resolved for "${packageName}" (${gameSlug}). ` +
    `Set the productCode field on the Package or update the name-to-code mapping.`
  );

  return {
    success: false,
    referenceId: ref,
    error: `No product code mapped for package "${packageName}". Please configure productCode in admin.`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CHECK ORDER STATUS: Queries live status from VNGZZ2GAME API
// ─────────────────────────────────────────────────────────────────────────────
export async function checkTopupOrderStatus(reference: string): Promise<any> {
  const apiKey = getVngzzApiKey();
  const candidateBases = getCandidateBases();

  for (const apiUrl of candidateBases) {
    try {
      const res = await fetch(`${apiUrl}/check_order?reference=${encodeURIComponent(reference)}`, {
        method: 'GET',
        headers: {
          'X-API-Key': apiKey,
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(8000),
      });

      if (res.status === 404 || res.status >= 500) {
        continue;
      }

      if (res.ok) {
        return await res.json();
      }
    } catch (err: any) {
      console.warn(`[VNGZZ2GAME API] check_order error on ${apiUrl}:`, err.message);
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// PROVIDER HELPER CALLS: Profile, Categories, Products, Deposit
// ─────────────────────────────────────────────────────────────────────────────
export async function fetchProviderProfile(): Promise<any> {
  const apiKey = getVngzzApiKey();
  const candidateBases = getCandidateBases();

  for (const apiUrl of candidateBases) {
    try {
      const res = await fetch(`${apiUrl}/profile`, {
        method: 'GET',
        headers: { 'X-API-Key': apiKey, 'Accept': 'application/json' },
        signal: AbortSignal.timeout(6000),
      });
      if (res.status === 404 || res.status >= 500) continue;
      return await res.json();
    } catch (e: any) {
      // try next
    }
  }
  return { status: 'FAILED', message: 'Provider profile unreachable' };
}

export async function fetchProviderCategories(): Promise<any> {
  const apiKey = getVngzzApiKey();
  const candidateBases = getCandidateBases();

  for (const apiUrl of candidateBases) {
    try {
      const res = await fetch(`${apiUrl}/categories`, {
        method: 'GET',
        headers: { 'X-API-Key': apiKey, 'Accept': 'application/json' },
        signal: AbortSignal.timeout(6000),
      });
      if (res.status === 404 || res.status >= 500) continue;
      return await res.json();
    } catch (e: any) {
      // try next
    }
  }
  return { status: 'FAILED', message: 'Categories unreachable' };
}

export async function fetchProviderProducts(gameCode: string): Promise<any> {
  const apiKey = getVngzzApiKey();
  const candidateBases = getCandidateBases();

  for (const apiUrl of candidateBases) {
    try {
      const res = await fetch(`${apiUrl}/products?game_code=${encodeURIComponent(gameCode)}`, {
        method: 'GET',
        headers: { 'X-API-Key': apiKey, 'Accept': 'application/json' },
        signal: AbortSignal.timeout(6000),
      });
      if (res.status === 404 || res.status >= 500) continue;
      return await res.json();
    } catch (e: any) {
      // try next
    }
  }
  return { status: 'FAILED', message: 'Products unreachable' };
}

export async function depositProviderBalance(amount: number, currency: string = 'USD'): Promise<any> {
  const apiKey = getVngzzApiKey();
  const candidateBases = getCandidateBases();

  for (const apiUrl of candidateBases) {
    try {
      const res = await fetch(`${apiUrl}/deposit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
          'Accept': 'application/json',
        },
        body: JSON.stringify({ amount, currency }),
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const json: any = await res.json();
        const qrString = json.data?.qr_string || json.qr_string || json.qrCode || '';
        if (qrString && (!json.md5 && !json.data?.md5)) {
          const md5 = require('crypto').createHash('md5').update(qrString).digest('hex').toLowerCase();
          json.md5 = md5;
          if (json.data) json.data.md5 = md5;
        }
        json.success = true;
        return json;
      }
    } catch (e: any) {
      // try next
    }
  }

  // Fallback to provider's live generate_qr endpoint for direct KHQR deposit
  try {
    const qrRes = await fetch('https://www.vngzz2game.site/api/v1/generate_qr', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
        'Accept': 'application/json',
      },
      body: JSON.stringify({ amount, currency }),
      signal: AbortSignal.timeout(10000),
    });
    if (qrRes.ok) {
      const qrData: any = await qrRes.json();
      const qrString = qrData.data?.qr_string || qrData.qr_string || qrData.qrCode || '';
      const md5 = qrData.data?.md5 || qrData.md5 || (qrString ? require('crypto').createHash('md5').update(qrString).digest('hex').toLowerCase() : '');
      return {
        success: true,
        status: 'SUCCESS',
        message: 'Deposit KHQR generated successfully',
        amount,
        currency,
        qr_string: qrString,
        qrCode: qrString,
        md5,
        qr_image_url: qrData.data?.qr_image_url || qrData.qr_image_url,
        qr_png_url: qrData.data?.qr_png_url || qrData.qr_png_url,
        deep_link: qrData.data?.deep_link || qrData.deep_link,
        check_payload: qrData.data?.check_payload || qrData.check_payload,
        data: qrData,
        payload: qrData,
      };
    }
  } catch (err: any) {
    console.warn('[VNGZZ2GAME API] generate_qr deposit error:', err.message);
  }

  return { status: 'FAILED', message: 'Deposit endpoint unreachable' };
}



