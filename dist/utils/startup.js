"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.seedDatabase = seedDatabase;
exports.runDatabaseStartup = runDatabaseStartup;
const child_process_1 = require("child_process");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const prisma_1 = __importDefault(require("../prisma"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
function generateDefaultPackages(currency, multiplier = 1) {
    return [
        { name: `${Math.round(60 * multiplier)} ${currency}`, amount: Math.round(60 * multiplier), price: 0.99, category: 'BEST_SELLER', badge: 'ពេញនិយម' },
        { name: `${Math.round(300 * multiplier)} ${currency}`, amount: Math.round(300 * multiplier), price: 4.99, category: 'BEST_SELLER', badge: 'Hot 🔥' },
        { name: `${Math.round(680 * multiplier)} ${currency}`, amount: Math.round(680 * multiplier), price: 9.99, category: 'NORMAL', badge: 'Bonus 10%' },
        { name: `${Math.round(1980 * multiplier)} ${currency}`, amount: Math.round(1980 * multiplier), price: 29.99, category: 'NORMAL', badge: 'Bonus 15%' },
        { name: `${Math.round(3280 * multiplier)} ${currency}`, amount: Math.round(3280 * multiplier), price: 49.99, category: 'NORMAL', badge: 'ពេញនិយម' },
        { name: `${Math.round(6480 * multiplier)} ${currency}`, amount: Math.round(6480 * multiplier), price: 99.99, category: 'NORMAL', badge: 'កញ្ចប់ពិសេស 💎' },
    ];
}
const ALL_GAMES = [
    // MOBA & Action
    { name: 'Mobile Legends: Bang Bang', slug: 'mobile-legends', category: 'MOBILE_GAME', currency: 'Diamonds', image: '/images/games/mlbb.png' },
    { name: 'MOBILE LEGENDS | KHMER', slug: 'mobile-legends-khmer', category: 'MOBILE_GAME', currency: 'Diamonds', image: '/images/games/mlbb.png' },
    { name: 'MOBILE LEGENDS | PHILIPPINES', slug: 'mobile-legends-philippines', category: 'MOBILE_GAME', currency: 'Diamonds', image: '/images/games/mlbb.png' },
    { name: 'MOBILE LEGENDS | KHMER (VIP)', slug: 'mobile-legends-indonesia', category: 'MOBILE_GAME', currency: 'Diamonds', image: '/images/games/mlbb.png' },
    { name: 'Honor of Kings', slug: 'honor-of-kings', category: 'MOBILE_GAME', currency: 'Tokens', image: '/images/games/hok.png' },
    { name: 'Arena of Valor', slug: 'arena-of-valor', category: 'MOBILE_GAME', currency: 'Vouchers' },
    { name: 'League of Legends: Wild Rift', slug: 'wild-rift', category: 'MOBILE_GAME', currency: 'Wild Cores' },
    { name: 'Pokémon UNITE', slug: 'pokemon-unite', category: 'MOBILE_GAME', currency: 'Aeos Gems' },
    { name: 'Onmyoji Arena', slug: 'onmyoji-arena', category: 'MOBILE_GAME', currency: 'Jade' },
    { name: 'Marvel Super War', slug: 'marvel-super-war', category: 'MOBILE_GAME', currency: 'Star Credits' },
    { name: 'Extraordinary Ones', slug: 'extraordinary-ones', category: 'MOBILE_GAME', currency: 'Gems' },
    { name: 'Heroes Evolved', slug: 'heroes-evolved', category: 'MOBILE_GAME', currency: 'Tokens' },
    { name: 'Vainglory', slug: 'vainglory', category: 'MOBILE_GAME', currency: 'ICE' },
    { name: 'Auto Chess', slug: 'auto-chess', category: 'MOBILE_GAME', currency: 'Donuts' },
    { name: 'Chess Rush', slug: 'chess-rush', category: 'MOBILE_GAME', currency: 'Vouchers' },
    { name: 'Magic Chess: Go Go', slug: 'magic-chess-gogo', category: 'MOBILE_GAME', currency: 'Diamonds', image: '/images/games/magicchess.png' },
    { name: 'Brawl Stars', slug: 'brawl-stars', category: 'MOBILE_GAME', currency: 'Gems' },
    { name: 'Zooba', slug: 'zooba', category: 'MOBILE_GAME', currency: 'Gems' },
    { name: 'T3 Arena', slug: 't3-arena', category: 'MOBILE_GAME', currency: 'T-Gems' },
    { name: 'Garena RoV', slug: 'garena-rov', category: 'MOBILE_GAME', currency: 'Coupons' },
    { name: 'Garena Liên Quân Mobile', slug: 'garena-lien-quan', category: 'MOBILE_GAME', currency: 'Quân Huy' },
    { name: 'Moonton Mobile Legends', slug: 'moonton-mlbb', category: 'MOBILE_GAME', currency: 'Diamonds', image: '/images/games/mlbb.png' },
    { name: 'Tencent Honor of Kings', slug: 'tencent-hok', category: 'MOBILE_GAME', currency: 'Tokens', image: '/images/games/hok.png' },
    { name: 'League of Legends', slug: 'league-of-legends', category: 'PC_GAME', currency: 'RP' },
    { name: 'Dota 2', slug: 'dota-2', category: 'PC_GAME', currency: 'Steam Wallet' },
    { name: 'Teamfight Tactics', slug: 'teamfight-tactics', category: 'PC_GAME', currency: 'TFT Coins' },
    // Shooters & Battle Royale
    { name: 'Free Fire', slug: 'free-fire', category: 'MOBILE_GAME', currency: 'Diamonds', image: '/images/games/freefire.png' },
    { name: 'FREE FIRE | KHMER', slug: 'free-fire-khmer', category: 'MOBILE_GAME', currency: 'Diamonds', image: '/images/games/freefire.png' },
    { name: 'FREE FIRE | KHMER (VIP)', slug: 'free-fire-indonesia', category: 'MOBILE_GAME', currency: 'Diamonds', image: '/images/games/freefire.png' },
    { name: 'FREE FIRE | VIETNAM', slug: 'free-fire-vietnam', category: 'MOBILE_GAME', currency: 'Diamonds', image: '/images/games/freefire.png' },
    { name: 'FREE FIRE | TAIWAN', slug: 'free-fire-taiwan', category: 'MOBILE_GAME', currency: 'Diamonds', image: '/images/games/freefire.png' },
    { name: 'Free Fire MAX', slug: 'free-fire-max', category: 'MOBILE_GAME', currency: 'Diamonds', image: '/images/games/freefire.png' },
    { name: 'Garena Free Fire', slug: 'garena-free-fire', category: 'MOBILE_GAME', currency: 'Diamonds', image: '/images/games/freefire.png' },
    { name: 'PUBG Mobile', slug: 'pubg-mobile', category: 'MOBILE_GAME', currency: 'UC', image: '/images/games/pubgm.png' },
    { name: 'Tencent PUBG Mobile', slug: 'tencent-pubgm', category: 'MOBILE_GAME', currency: 'UC', image: '/images/games/pubgm.png' },
    { name: 'PUBG: New State', slug: 'pubg-new-state', category: 'MOBILE_GAME', currency: 'NC' },
    { name: 'PUBG PC', slug: 'pubg-pc', category: 'PC_GAME', currency: 'G-Coins' },
    { name: 'PUBG Console', slug: 'pubg-console', category: 'PC_GAME', currency: 'G-Coins' },
    { name: 'Call of Duty: Mobile', slug: 'call-of-duty-mobile', category: 'MOBILE_GAME', currency: 'CP' },
    { name: 'Call of Duty: Warzone Mobile', slug: 'cod-warzone-mobile', category: 'MOBILE_GAME', currency: 'CP' },
    { name: 'Critical Ops', slug: 'critical-ops', category: 'MOBILE_GAME', currency: 'Credits' },
    { name: 'Modern Combat 5', slug: 'modern-combat-5', category: 'MOBILE_GAME', currency: 'Credits' },
    { name: 'Shadowgun Legends', slug: 'shadowgun-legends', category: 'MOBILE_GAME', currency: 'Gold' },
    { name: 'Into the Dead 2', slug: 'into-the-dead-2', category: 'MOBILE_GAME', currency: 'Gold' },
    { name: 'World War Heroes', slug: 'world-war-heroes', category: 'MOBILE_GAME', currency: 'Gold' },
    { name: 'Combat Master', slug: 'combat-master', category: 'MOBILE_GAME', currency: 'Gold' },
    { name: 'Farlight 84', slug: 'farlight-84', category: 'MOBILE_GAME', currency: 'Diamonds', image: '/images/games/farlight.png' },
    { name: 'Blood Strike', slug: 'blood-strike', category: 'MOBILE_GAME', currency: 'Gold', image: '/images/games/bloodstrike.png' },
    { name: 'Bullet Echo', slug: 'bullet-echo', category: 'MOBILE_GAME', currency: 'Bucks', image: '/images/games/bullet-echo.png' },
    { name: 'Arena Breakout', slug: 'arena-breakout', category: 'MOBILE_GAME', currency: 'Bonds' },
    { name: 'Standoff 2', slug: 'standoff-2', category: 'MOBILE_GAME', currency: 'Gold' },
    { name: 'Delta Force', slug: 'delta-force', category: 'PC_GAME', currency: 'Delta Coins', image: '/images/games/deltaforce.png' },
    { name: 'Garena Delta Force', slug: 'garena-delta-force', category: 'PC_GAME', currency: 'Delta Coins', image: '/images/games/deltaforce.png' },
    { name: 'Rainbow Six Mobile', slug: 'rainbow-six-mobile', category: 'MOBILE_GAME', currency: 'R6 Credits' },
    { name: 'Valorant', slug: 'valorant', category: 'PC_GAME', currency: 'VP', image: '/images/games/valorant.png' },
    { name: 'Counter-Strike 2', slug: 'counter-strike-2', category: 'PC_GAME', currency: 'Wallet' },
    { name: 'Overwatch 2', slug: 'overwatch-2', category: 'PC_GAME', currency: 'Coins' },
    { name: 'Apex Legends', slug: 'apex-legends', category: 'PC_GAME', currency: 'Apex Coins' },
    { name: 'Fortnite', slug: 'fortnite', category: 'PC_GAME', currency: 'V-Bucks' },
    { name: 'Fortnite Save the World', slug: 'fortnite-save-the-world', category: 'PC_GAME', currency: 'V-Bucks' },
    { name: 'Battlefield 2042', slug: 'battlefield-2042', category: 'PC_GAME', currency: 'BFC' },
    { name: 'The Finals', slug: 'the-finals', category: 'PC_GAME', currency: 'Multibucks' },
    { name: 'XDefiant', slug: 'xdefiant', category: 'PC_GAME', currency: 'XCoins' },
    { name: 'Splitgate', slug: 'splitgate', category: 'PC_GAME', currency: 'Splitcoin' },
    { name: 'Halo Infinite', slug: 'halo-infinite', category: 'PC_GAME', currency: 'Credits' },
    { name: 'Paladins', slug: 'paladins', category: 'PC_GAME', currency: 'Crystals' },
    { name: 'Warframe', slug: 'warframe', category: 'PC_GAME', currency: 'Platinum' },
    { name: 'Destiny 2', slug: 'destiny-2', category: 'PC_GAME', currency: 'Silver' },
    { name: 'War Thunder', slug: 'war-thunder', category: 'PC_GAME', currency: 'Golden Eagles' },
    { name: 'World of Tanks', slug: 'world-of-tanks', category: 'PC_GAME', currency: 'Gold' },
    { name: 'World of Warships', slug: 'world-of-warships', category: 'PC_GAME', currency: 'Doubloons' },
    { name: 'World of Warplanes', slug: 'world-of-warplanes', category: 'PC_GAME', currency: 'Gold' },
    { name: 'CrossFire', slug: 'crossfire', category: 'PC_GAME', currency: 'ZP' },
    { name: 'Point Blank', slug: 'point-blank', category: 'PC_GAME', currency: 'PB Cash' },
    { name: 'Combat Arms', slug: 'combat-arms', category: 'PC_GAME', currency: 'NX Prepaid' },
    { name: 'Wolfteam', slug: 'wolfteam', category: 'PC_GAME', currency: 'Cash' },
    { name: 'Zula', slug: 'zula', category: 'PC_GAME', currency: 'Zula Gold' },
    { name: 'Special Force', slug: 'special-force', category: 'PC_GAME', currency: 'SF Coins' },
    { name: 'Special Force 2', slug: 'special-force-2', category: 'PC_GAME', currency: 'Cash' },
    { name: 'Sudden Attack', slug: 'sudden-attack', category: 'PC_GAME', currency: 'Nexon Cash' },
    { name: 'Warhammer 40,000: Darktide', slug: 'darktide', category: 'PC_GAME', currency: 'Aquilas' },
    { name: 'Helldivers 2', slug: 'helldivers-2', category: 'PC_GAME', currency: 'Super Credits' },
    { name: 'Deep Rock Galactic', slug: 'deep-rock-galactic', category: 'PC_GAME', currency: 'Miner Credits' },
    { name: 'Killing Floor 2', slug: 'killing-floor-2', category: 'PC_GAME', currency: 'Vault Dosh' },
    { name: 'Left 4 Dead 2', slug: 'left-4-dead-2', category: 'PC_GAME', currency: 'Steam Item Pack' },
    { name: 'Back 4 Blood', slug: 'back-4-blood', category: 'PC_GAME', currency: 'Supply Points' },
    { name: 'Borderlands 3', slug: 'borderlands-3', category: 'PC_GAME', currency: 'Golden Keys' },
    { name: 'Escape from Tarkov', slug: 'escape-from-tarkov', category: 'PC_GAME', currency: 'Roubles' },
    { name: 'Hunt: Showdown', slug: 'hunt-showdown', category: 'PC_GAME', currency: 'Blood Bonds' },
    // Anime, RPG & Gacha
    { name: 'Genshin Impact', slug: 'genshin-impact', category: 'MOBILE_GAME', currency: 'Genesis Crystals', image: '/images/games/genshin-impact.png' },
    { name: 'Honkai: Star Rail', slug: 'honkai-star-rail', category: 'MOBILE_GAME', currency: 'Oneiric Shards' },
    { name: 'Honkai Impact 3rd', slug: 'honkai-impact-3rd', category: 'MOBILE_GAME', currency: 'Crystals' },
    { name: 'Zenless Zone Zero', slug: 'zenless-zone-zero', category: 'MOBILE_GAME', currency: 'Monochromes' },
    { name: 'Wuthering Waves', slug: 'wuthering-waves', category: 'MOBILE_GAME', currency: 'Lunites' },
    { name: 'Solo Leveling: ARISE', slug: 'solo-leveling-arise', category: 'MOBILE_GAME', currency: 'Diamonds' },
    { name: 'Tower of Fantasy', slug: 'tower-of-fantasy', category: 'MOBILE_GAME', currency: 'Tanium' },
    { name: 'AFK Journey', slug: 'afk-journey', category: 'MOBILE_GAME', currency: 'Dragon Crystals' },
    { name: 'AFK Arena', slug: 'afk-arena', category: 'MOBILE_GAME', currency: 'Diamonds' },
    { name: 'Black Clover M', slug: 'black-clover-m', category: 'MOBILE_GAME', currency: 'Black Crystals' },
    { name: 'One Punch Man: World', slug: 'one-punch-man-world', category: 'MOBILE_GAME', currency: 'Drawing Coins' },
    { name: 'Naruto: Slugfest', slug: 'naruto-slugfest', category: 'MOBILE_GAME', currency: 'Gold' },
    { name: 'Naruto Mobile', slug: 'naruto-mobile', category: 'MOBILE_GAME', currency: 'Gold' },
    { name: 'Naruto: Ultimate Ninja Storm', slug: 'naruto-ninja-storm', category: 'PC_GAME', currency: 'Ninja Pass' },
    { name: 'One Piece Fighting Path', slug: 'one-piece-fighting-path', category: 'MOBILE_GAME', currency: 'Gold Fruit' },
    { name: 'One Piece Treasure Cruise', slug: 'one-piece-treasure-cruise', category: 'MOBILE_GAME', currency: 'Rainbow Gems' },
    { name: 'One Piece Bounty Rush', slug: 'one-piece-bounty-rush', category: 'MOBILE_GAME', currency: 'Rainbow Diamonds' },
    { name: 'Dragon Ball Legends', slug: 'dragon-ball-legends', category: 'MOBILE_GAME', currency: 'Chrono Crystals' },
    { name: 'Dragon Ball Z Dokkan Battle', slug: 'dragon-ball-dokkan', category: 'MOBILE_GAME', currency: 'Dragon Stones' },
    { name: 'Bleach: Soul Resonance', slug: 'bleach-soul-resonance', category: 'MOBILE_GAME', currency: 'Soul Jade' },
    { name: 'Bleach Brave Souls', slug: 'bleach-brave-souls', category: 'MOBILE_GAME', currency: 'Spirit Orbs' },
    { name: 'Jujutsu Kaisen: Phantom Parade', slug: 'jujutsu-kaisen-phantom-parade', category: 'MOBILE_GAME', currency: 'Cursed Stones' },
    { name: 'Jujutsu Kaisen: Cursed Clash', slug: 'jujutsu-kaisen-cursed-clash', category: 'PC_GAME', currency: 'DLC Pack' },
    { name: 'Demon Slayer: Kimetsu no Yaiba', slug: 'demon-slayer-kimetsu', category: 'PC_GAME', currency: 'Kimetsu Points' },
    { name: 'Demon Slayer: Sweep the Board!', slug: 'demon-slayer-sweep', category: 'PC_GAME', currency: 'Board Coins' },
    { name: 'My Hero Ultra Rumble', slug: 'my-hero-ultra-rumble', category: 'PC_GAME', currency: 'Hero Crystals' },
    { name: 'My Hero Ultra Impact', slug: 'my-hero-ultra-impact', category: 'MOBILE_GAME', currency: 'Hero Gems' },
    { name: 'Blue Lock: PWC', slug: 'blue-lock-pwc', category: 'MOBILE_GAME', currency: 'Blue Gems' },
    { name: 'Haikyuu!! Fly High', slug: 'haikyuu-fly-high', category: 'MOBILE_GAME', currency: 'Diamonds' },
    { name: 'NetEase Harry Potter: Magic Awakened', slug: 'harry-potter-magic-awakened', category: 'MOBILE_GAME', currency: 'Jewels' },
    { name: 'Harry Potter: Hogwarts Mystery', slug: 'harry-potter-hogwarts-mystery', category: 'MOBILE_GAME', currency: 'Gems' },
    { name: 'Pokémon GO', slug: 'pokemon-go', category: 'MOBILE_GAME', currency: 'PokéCoins' },
    { name: 'Pokémon Masters EX', slug: 'pokemon-masters-ex', category: 'MOBILE_GAME', currency: 'Gems' },
    { name: 'Pokémon Sleep', slug: 'pokemon-sleep', category: 'MOBILE_GAME', currency: 'Diamonds' },
    { name: 'Pokémon Quest', slug: 'pokemon-quest', category: 'MOBILE_GAME', currency: 'PM Tickets' },
    { name: 'Pokémon Café ReMix', slug: 'pokemon-cafe-remix', category: 'MOBILE_GAME', currency: 'Golden Acorns' },
    { name: 'Monster Hunter Now', slug: 'monster-hunter-now', category: 'MOBILE_GAME', currency: 'Gems' },
    { name: 'Pikmin Bloom', slug: 'pikmin-bloom', category: 'MOBILE_GAME', currency: 'Coins' },
    { name: 'Disney Speedstorm', slug: 'disney-speedstorm', category: 'PC_GAME', currency: 'Tokens' },
    { name: 'Disney Mirrorverse', slug: 'disney-mirrorverse', category: 'MOBILE_GAME', currency: 'Orbs' },
    { name: 'Grand Chase Classic', slug: 'grand-chase-classic', category: 'PC_GAME', currency: 'VP' },
    { name: 'Elsword', slug: 'elsword', category: 'PC_GAME', currency: 'K-Ching' },
    { name: 'Dungeon Fighter Online', slug: 'dungeon-fighter-online', category: 'PC_GAME', currency: 'CERA' },
    { name: 'MapleStory', slug: 'maplestory', category: 'PC_GAME', currency: 'NX Cash' },
    { name: 'Mabinogi', slug: 'mabinogi', category: 'PC_GAME', currency: 'NX Cash' },
    { name: 'Blade & Soul', slug: 'blade-and-soul', category: 'PC_GAME', currency: 'NCoin' },
    { name: 'Aion', slug: 'aion', category: 'PC_GAME', currency: 'NCoin' },
    { name: 'ArcheAge', slug: 'archeage', category: 'PC_GAME', currency: 'Credits' },
    { name: 'Black Desert', slug: 'black-desert', category: 'PC_GAME', currency: 'Pearls' },
    { name: 'Audition Online', slug: 'audition-online', category: 'PC_GAME', currency: 'Bana Cash' },
    // MMORPG
    { name: 'Ragnarok Origin', slug: 'ragnarok-origin', category: 'MOBILE_GAME', currency: 'Nyan Berries' },
    { name: 'Ragnarok M: Eternal Love', slug: 'ragnarok-m-eternal-love', category: 'MOBILE_GAME', currency: 'Big Cat Coins' },
    { name: 'Ragnarok X: Next Generation', slug: 'ragnarok-x-next-generation', category: 'MOBILE_GAME', currency: 'Diamonds' },
    { name: 'MapleStory M', slug: 'maplestory-m', category: 'MOBILE_GAME', currency: 'Crystals' },
    { name: 'Black Desert Mobile', slug: 'black-desert-mobile', category: 'MOBILE_GAME', currency: 'Black Pearls' },
    { name: 'Albion Online', slug: 'albion-online', category: 'PC_GAME', currency: 'Gold' },
    { name: 'World of Warcraft', slug: 'world-of-warcraft', category: 'PC_GAME', currency: 'Game Time' },
    { name: 'Final Fantasy XIV', slug: 'final-fantasy-xiv', category: 'PC_GAME', currency: 'Crysta' },
    { name: 'Final Fantasy XI', slug: 'final-fantasy-xi', category: 'PC_GAME', currency: 'Sub Points' },
    { name: 'RuneScape', slug: 'runescape', category: 'PC_GAME', currency: 'Bonds' },
    { name: 'Old School RuneScape', slug: 'old-school-runescape', category: 'PC_GAME', currency: 'OSRS Bonds' },
    { name: 'Lost Ark', slug: 'lost-ark', category: 'PC_GAME', currency: 'Royal Crystals' },
    { name: 'Guild Wars 2', slug: 'guild-wars-2', category: 'PC_GAME', currency: 'Gems' },
    { name: 'EVE Online', slug: 'eve-online', category: 'PC_GAME', currency: 'PLEX' },
    { name: 'MU Origin 3', slug: 'mu-origin-3', category: 'MOBILE_GAME', currency: 'Diamonds' },
    { name: 'MU Origin 2', slug: 'mu-origin-2', category: 'MOBILE_GAME', currency: 'Diamonds' },
    { name: 'MU Online', slug: 'mu-online', category: 'PC_GAME', currency: 'W-Coins' },
    { name: 'Lineage 2M', slug: 'lineage-2m', category: 'MOBILE_GAME', currency: 'Diamonds' },
    { name: 'Lineage W', slug: 'lineage-w', category: 'MOBILE_GAME', currency: 'Diamonds' },
    { name: 'Lineage M', slug: 'lineage-m', category: 'MOBILE_GAME', currency: 'Diamonds' },
    { name: 'Perfect World Mobile', slug: 'perfect-world-mobile', category: 'MOBILE_GAME', currency: 'Gold' },
    { name: 'Perfect World International', slug: 'perfect-world-international', category: 'PC_GAME', currency: 'Gold' },
    { name: 'Justice Mobile', slug: 'justice-mobile', category: 'MOBILE_GAME', currency: 'Ingots' },
    { name: 'Justice Online', slug: 'justice-online', category: 'PC_GAME', currency: 'Ingots' },
    { name: 'Naraka: Bladepoint', slug: 'naraka-bladepoint', category: 'PC_GAME', currency: 'Gold' },
    { name: 'Once Human', slug: 'once-human', category: 'PC_GAME', currency: 'Crystagin' },
    { name: 'Where Winds Meet', slug: 'where-winds-meet', category: 'PC_GAME', currency: 'Silver / Gold' },
    { name: 'Throne and Liberty', slug: 'throne-and-liberty', category: 'PC_GAME', currency: 'Lucent' },
    { name: 'New World', slug: 'new-world', category: 'PC_GAME', currency: 'Marks of Fortune' },
    { name: 'Diablo IV', slug: 'diablo-iv', category: 'PC_GAME', currency: 'Platinum' },
    { name: 'Diablo Immortal', slug: 'diablo-immortal', category: 'MOBILE_GAME', currency: 'Eternal Orbs' },
    { name: 'Diablo III', slug: 'diablo-iii', category: 'PC_GAME', currency: 'Battle.net Balance' },
    { name: 'Path of Exile', slug: 'path-of-exile', category: 'PC_GAME', currency: 'Points' },
    { name: 'Path of Exile 2', slug: 'path-of-exile-2', category: 'PC_GAME', currency: 'Points' },
    { name: 'Torchlight: Infinite', slug: 'torchlight-infinite', category: 'MOBILE_GAME', currency: 'Primocryst' },
    { name: 'Undecember', slug: 'undecember', category: 'MOBILE_GAME', currency: 'Diamonds' },
    { name: 'Last Epoch', slug: 'last-epoch', category: 'PC_GAME', currency: 'Epoch Points' },
    { name: 'Grim Dawn', slug: 'grim-dawn', category: 'PC_GAME', currency: 'DLC Keys' },
    // Survival, Sandbox & Open World
    { name: 'Minecraft Java Edition', slug: 'minecraft-java-edition', category: 'PC_GAME', currency: 'Minecoins' },
    { name: 'Minecraft Bedrock Edition', slug: 'minecraft-bedrock-edition', category: 'PC_GAME', currency: 'Minecoins' },
    { name: 'Minecraft Dungeons', slug: 'minecraft-dungeons', category: 'PC_GAME', currency: 'Season Pass' },
    { name: 'Minecraft Legends', slug: 'minecraft-legends', category: 'PC_GAME', currency: 'Minecoins' },
    { name: 'Roblox', slug: 'roblox', category: 'MOBILE_GAME', currency: 'Robux', image: '/images/games/roblox.png' },
    { name: 'Terraria', slug: 'terraria', category: 'PC_GAME', currency: 'Digital License' },
    { name: 'ARK: Survival Evolved', slug: 'ark-survival-evolved', category: 'PC_GAME', currency: 'Amber / Pass' },
    { name: 'Ark: Survival Ascended', slug: 'ark-survival-ascended', category: 'PC_GAME', currency: 'Season Pass' },
    { name: 'Don’t Starve Together', slug: 'dont-starve-together', category: 'PC_GAME', currency: 'Spools' },
    { name: 'Rust', slug: 'rust', category: 'PC_GAME', currency: 'Rust Coins' },
    { name: 'DayZ', slug: 'dayz', category: 'PC_GAME', currency: 'DLC Keys' },
    { name: 'Palworld', slug: 'palworld', category: 'PC_GAME', currency: 'Server Keys' },
    { name: 'Valheim', slug: 'valheim', category: 'PC_GAME', currency: 'Game Code' },
    { name: 'Conan Exiles', slug: 'conan-exiles', category: 'PC_GAME', currency: 'Crom Coins' },
    { name: '7 Days to Die', slug: '7-days-to-die', category: 'PC_GAME', currency: 'Duke Tokens' },
    { name: 'The Forest', slug: 'the-forest', category: 'PC_GAME', currency: 'Survival Pack' },
    { name: 'Sons of the Forest', slug: 'sons-of-the-forest', category: 'PC_GAME', currency: 'Item Pack' },
    { name: 'Raft', slug: 'raft', category: 'PC_GAME', currency: 'Game Code' },
    { name: 'Unturned', slug: 'unturned', category: 'PC_GAME', currency: 'Gold Upgrade' },
    { name: 'Project Zomboid', slug: 'project-zomboid', category: 'PC_GAME', currency: 'Gift Code' },
    { name: 'Core Keeper', slug: 'core-keeper', category: 'PC_GAME', currency: 'Ancient Coins' },
    { name: 'Starbound', slug: 'starbound', category: 'PC_GAME', currency: 'Pixels Pack' },
    { name: 'No Man’s Sky', slug: 'no-mans-sky', category: 'PC_GAME', currency: 'Quicksilver' },
    { name: 'Enshrouded', slug: 'enshrouded', category: 'PC_GAME', currency: 'Flame Keys' },
    { name: 'V Rising', slug: 'v-rising', category: 'PC_GAME', currency: 'Castlevania Pack' },
    { name: 'Subnautica', slug: 'subnautica', category: 'PC_GAME', currency: 'Digital License' },
    { name: 'Subnautica: Below Zero', slug: 'subnautica-below-zero', category: 'PC_GAME', currency: 'Digital Key' },
    { name: 'Grounded', slug: 'grounded', category: 'PC_GAME', currency: 'Raw Science Pack' },
    { name: 'Astroneer', slug: 'astroneer', category: 'PC_GAME', currency: 'QBIT' },
    { name: 'Satisfactory', slug: 'satisfactory', category: 'PC_GAME', currency: 'FICSIT Coupon' },
    { name: 'Factorio', slug: 'factorio', category: 'PC_GAME', currency: 'Space Age Pass' },
    { name: 'GTA V', slug: 'gta-v', category: 'PC_GAME', currency: 'Shark Cards' },
    { name: 'GTA Online', slug: 'gta-online', category: 'PC_GAME', currency: 'Shark Cash' },
    { name: 'GTA IV', slug: 'gta-iv', category: 'PC_GAME', currency: 'Complete Edition' },
    { name: 'GTA San Andreas', slug: 'gta-san-andreas', category: 'PC_GAME', currency: 'Classic Edition' },
    { name: 'GTA Vice City', slug: 'gta-vice-city', category: 'PC_GAME', currency: 'Definitive Pack' },
    { name: 'GTA Trilogy', slug: 'gta-trilogy', category: 'PC_GAME', currency: 'Definitive Edition' },
    { name: 'Red Dead Redemption 2', slug: 'red-dead-redemption-2', category: 'PC_GAME', currency: 'Gold Bars' },
    { name: 'Red Dead Online', slug: 'red-dead-online', category: 'PC_GAME', currency: 'Gold Bars' },
    { name: 'Cyberpunk 2077', slug: 'cyberpunk-2077', category: 'PC_GAME', currency: 'Phantom Liberty' },
    { name: 'The Witcher 3', slug: 'the-witcher-3', category: 'PC_GAME', currency: 'Expansion Pass' },
    { name: 'Elden Ring', slug: 'elden-ring', category: 'PC_GAME', currency: 'Shadow of the Erdtree' },
    { name: 'Dark Souls III', slug: 'dark-souls-3', category: 'PC_GAME', currency: 'Season Pass' },
    { name: 'Sekiro', slug: 'sekiro', category: 'PC_GAME', currency: 'GOTY Edition' },
    { name: 'Assassin’s Creed Shadows', slug: 'assassins-creed-shadows', category: 'PC_GAME', currency: 'Helix Credits' },
    { name: 'Assassin’s Creed Valhalla', slug: 'assassins-creed-valhalla', category: 'PC_GAME', currency: 'Helix Credits' },
    { name: 'Assassin’s Creed Odyssey', slug: 'assassins-creed-odyssey', category: 'PC_GAME', currency: 'Helix Credits' },
    { name: 'Assassin’s Creed Mirage', slug: 'assassins-creed-mirage', category: 'PC_GAME', currency: 'Dirhams Pack' },
    { name: 'Hogwarts Legacy', slug: 'hogwarts-legacy', category: 'PC_GAME', currency: 'Dark Arts Pack' },
    { name: 'Marvel’s Spider-Man 2', slug: 'spiderman-2', category: 'PC_GAME', currency: 'Deluxe Upgrade' },
    { name: 'Spider-Man Remastered', slug: 'spiderman-remastered', category: 'PC_GAME', currency: 'DLC Pack' },
    { name: 'Ghost of Tsushima', slug: 'ghost-of-tsushima', category: 'PC_GAME', currency: 'Expansion Pass' },
    { name: 'Sea of Thieves', slug: 'sea-of-thieves', category: 'PC_GAME', currency: 'Ancient Coins' },
    { name: 'The Sims 4', slug: 'the-sims-4', category: 'PC_GAME', currency: 'DLC Pack' },
    { name: 'The Sims Mobile', slug: 'the-sims-mobile', category: 'MOBILE_GAME', currency: 'SimCash' },
    { name: 'Rec Room', slug: 'rec-room', category: 'PC_GAME', currency: 'Tokens' },
    { name: 'VRChat', slug: 'vrchat', category: 'PC_GAME', currency: 'VRChat Plus' },
    { name: 'Second Life', slug: 'second-life', category: 'PC_GAME', currency: 'Linden Dollars' },
    { name: 'Habbo', slug: 'habbo', category: 'PC_GAME', currency: 'Credits' },
    { name: 'IMVU', slug: 'imvu', category: 'PC_GAME', currency: 'Credits' },
    // Strategy & City Building
    { name: 'Civilization VI', slug: 'civilization-6', category: 'PC_GAME', currency: 'Leader Pass' },
    { name: 'Age of Empires IV', slug: 'age-of-empires-4', category: 'PC_GAME', currency: 'Sultans Ascend' },
    { name: 'StarCraft II', slug: 'starcraft-2', category: 'PC_GAME', currency: 'War Chest' },
    { name: 'Warcraft III', slug: 'warcraft-3', category: 'PC_GAME', currency: 'Reforged Spoils' },
    { name: 'Total War: Warhammer III', slug: 'total-war-warhammer-3', category: 'PC_GAME', currency: 'Blood Pack' },
    { name: 'Europa Universalis IV', slug: 'europa-universalis-4', category: 'PC_GAME', currency: 'Subscription' },
    { name: 'Hearts of Iron IV', slug: 'hearts-of-iron-4', category: 'PC_GAME', currency: 'Expansion Pack' },
    { name: 'Crusader Kings III', slug: 'crusader-kings-3', category: 'PC_GAME', currency: 'Chapter Pass' },
    { name: 'Stellaris', slug: 'stellaris', category: 'PC_GAME', currency: 'Season Pass' },
    { name: 'Cities: Skylines II', slug: 'cities-skylines-2', category: 'PC_GAME', currency: 'Expansion Pass' },
    { name: 'SimCity BuildIt', slug: 'simcity-buildit', category: 'MOBILE_GAME', currency: 'SimCash' },
    // Racing & Sports
    { name: 'Asphalt 9', slug: 'asphalt-9', category: 'MOBILE_GAME', currency: 'Tokens' },
    { name: 'Asphalt Legends Unite', slug: 'asphalt-legends-unite', category: 'MOBILE_GAME', currency: 'Tokens' },
    { name: 'Asphalt 8', slug: 'asphalt-8', category: 'MOBILE_GAME', currency: 'Tokens' },
    { name: 'Real Racing 3', slug: 'real-racing-3', category: 'MOBILE_GAME', currency: 'Gold' },
    { name: 'Need for Speed Mobile', slug: 'need-for-speed-mobile', category: 'MOBILE_GAME', currency: 'Speed Points' },
    { name: 'Need for Speed Heat', slug: 'need-for-speed-heat', category: 'PC_GAME', currency: 'Deluxe Key' },
    { name: 'Need for Speed Unbound', slug: 'need-for-speed-unbound', category: 'PC_GAME', currency: 'Speed Pass' },
    { name: 'CarX Street', slug: 'carx-street', category: 'MOBILE_GAME', currency: 'Gold' },
    { name: 'CarX Drift Racing 2', slug: 'carx-drift-racing-2', category: 'MOBILE_GAME', currency: 'Gold' },
    { name: 'CarX Drift Racing Online', slug: 'carx-drift-racing-online', category: 'PC_GAME', currency: 'Coin Pack' },
    { name: 'CSR Racing 2', slug: 'csr-racing-2', category: 'MOBILE_GAME', currency: 'Gold' },
    { name: 'Real Racing Next', slug: 'real-racing-next', category: 'MOBILE_GAME', currency: 'Gold' },
    { name: 'F1 Mobile Racing', slug: 'f1-mobile-racing', category: 'MOBILE_GAME', currency: 'Credits' },
    { name: 'F1 24', slug: 'f1-24', category: 'PC_GAME', currency: 'PitCoin' },
    { name: 'F1 25', slug: 'f1-25', category: 'PC_GAME', currency: 'PitCoin' },
    { name: 'GRID Legends', slug: 'grid-legends', category: 'PC_GAME', currency: 'Mechanic Pass' },
    { name: 'GRID Autosport', slug: 'grid-autosport', category: 'MOBILE_GAME', currency: 'Full Unlock' },
    { name: 'Mario Kart Tour', slug: 'mario-kart-tour', category: 'MOBILE_GAME', currency: 'Rubies' },
    { name: 'KartRider: Drift', slug: 'kartrider-drift', category: 'MOBILE_GAME', currency: 'K-COIN' },
    { name: 'Traffic Rider', slug: 'traffic-rider', category: 'MOBILE_GAME', currency: 'Gold' },
    { name: 'Trackmania', slug: 'trackmania', category: 'PC_GAME', currency: 'Club Access' },
    { name: 'Forza Horizon 5', slug: 'forza-horizon-5', category: 'PC_GAME', currency: 'Car Pass' },
    { name: 'Forza Motorsport', slug: 'forza-motorsport', category: 'PC_GAME', currency: 'VIP Membership' },
    { name: 'Gran Turismo 7', slug: 'gran-turismo-7', category: 'PC_GAME', currency: 'Credits' },
    { name: 'The Crew Motorfest', slug: 'the-crew-motorfest', category: 'PC_GAME', currency: 'Crew Credits' },
    { name: 'Assetto Corsa', slug: 'assetto-corsa', category: 'PC_GAME', currency: 'Ultimate Pass' },
    { name: 'Assetto Corsa Competizione', slug: 'assetto-corsa-competizione', category: 'PC_GAME', currency: 'GT World Pass' },
    { name: 'BeamNG.drive', slug: 'beamng-drive', category: 'PC_GAME', currency: 'Game License' },
    { name: 'Euro Truck Simulator 2', slug: 'euro-truck-simulator-2', category: 'PC_GAME', currency: 'Expansion Pack' },
    { name: 'American Truck Simulator', slug: 'american-truck-simulator', category: 'PC_GAME', currency: 'State DLC Pack' },
    { name: 'Farming Simulator 25', slug: 'farming-simulator-25', category: 'PC_GAME', currency: 'Season Pass' },
    { name: 'Fishing Planet', slug: 'fishing-planet', category: 'PC_GAME', currency: 'BaitCoins' },
    { name: 'Rocket League', slug: 'rocket-league', category: 'PC_GAME', currency: 'Credits' },
    { name: 'EA SPORTS FC Mobile', slug: 'ea-sports-fc-mobile', category: 'MOBILE_GAME', currency: 'FC Points' },
    { name: 'EA SPORTS FC 25', slug: 'ea-sports-fc-25', category: 'PC_GAME', currency: 'FC Points' },
    { name: 'EA SPORTS FC 26', slug: 'ea-sports-fc-26', category: 'PC_GAME', currency: 'FC Points' },
    { name: 'eFootball', slug: 'efootball', category: 'PC_GAME', currency: 'eFootball Coins' },
    { name: 'eFootball Mobile', slug: 'efootball-mobile', category: 'MOBILE_GAME', currency: 'eFootball Coins' },
    { name: 'FIFA Online 4', slug: 'fifa-online-4', category: 'PC_GAME', currency: 'FC Cash' },
    { name: 'FIFA Online 3', slug: 'fifa-online-3', category: 'PC_GAME', currency: 'Cash' },
    { name: 'NBA 2K Mobile', slug: 'nba-2k-mobile', category: 'MOBILE_GAME', currency: 'Coins' },
    { name: 'NBA 2K25', slug: 'nba-2k25', category: 'PC_GAME', currency: 'VC' },
    { name: 'NBA 2K26', slug: 'nba-2k26', category: 'PC_GAME', currency: 'VC' },
    { name: 'WWE 2K25', slug: 'wwe-2k25', category: 'PC_GAME', currency: 'SuperTokens' },
    { name: 'WWE 2K26', slug: 'wwe-2k26', category: 'PC_GAME', currency: 'SuperTokens' },
    { name: 'Tennis Clash', slug: 'tennis-clash', category: 'MOBILE_GAME', currency: 'Gems' },
    { name: 'Golf Clash', slug: 'golf-clash', category: 'MOBILE_GAME', currency: 'Gems' },
    { name: '8 Ball Pool', slug: '8-ball-pool', category: 'MOBILE_GAME', currency: 'Cash' },
    { name: 'Dream League Soccer', slug: 'dream-league-soccer', category: 'MOBILE_GAME', currency: 'Gems' },
    { name: 'Score! Hero', slug: 'score-hero', category: 'MOBILE_GAME', currency: 'Bux' },
    { name: 'Score! Match', slug: 'score-match', category: 'MOBILE_GAME', currency: 'Gems' },
    { name: 'Football Manager Mobile', slug: 'football-manager-mobile', category: 'MOBILE_GAME', currency: 'Unlockables' },
    { name: 'MLB 9 Innings', slug: 'mlb-9-innings', category: 'MOBILE_GAME', currency: 'Stars' },
    // Strategy & Cards
    { name: 'Hearthstone', slug: 'hearthstone', category: 'PC_GAME', currency: 'Runestones' },
    { name: 'Marvel Snap', slug: 'marvel-snap', category: 'MOBILE_GAME', currency: 'Gold' },
    { name: 'Yu-Gi-Oh! Master Duel', slug: 'yugioh-master-duel', category: 'PC_GAME', currency: 'Gems' },
    { name: 'Yu-Gi-Oh! Duel Links', slug: 'yugioh-duel-links', category: 'MOBILE_GAME', currency: 'Gems' },
    { name: 'Pokémon TCG Pocket', slug: 'pokemon-tcg-pocket', category: 'MOBILE_GAME', currency: 'Poké Gold' },
    { name: 'Magic: The Gathering Arena', slug: 'mtg-arena', category: 'PC_GAME', currency: 'Gems' },
    { name: 'Legends of Runeterra', slug: 'legends-of-runeterra', category: 'PC_GAME', currency: 'Coins' },
    { name: 'Shadowverse', slug: 'shadowverse', category: 'MOBILE_GAME', currency: 'Crystals' },
    { name: 'Clash Royale', slug: 'clash-royale', category: 'MOBILE_GAME', currency: 'Gems' },
    { name: 'Clash of Clans', slug: 'clash-of-clans', category: 'MOBILE_GAME', currency: 'Gems' },
    { name: 'Boom Beach', slug: 'boom-beach', category: 'MOBILE_GAME', currency: 'Diamonds' },
    { name: 'Lords Mobile', slug: 'lords-mobile', category: 'MOBILE_GAME', currency: 'Gems' },
    { name: 'Rise of Kingdoms', slug: 'rise-of-kingdoms', category: 'MOBILE_GAME', currency: 'Gems' },
    { name: 'State of Survival', slug: 'state-of-survival', category: 'MOBILE_GAME', currency: 'Biocaps' },
    { name: 'Whiteout Survival', slug: 'whiteout-survival', category: 'MOBILE_GAME', currency: 'Frost Star' },
    { name: 'Last War: Survival Game', slug: 'last-war-survival', category: 'MOBILE_GAME', currency: 'Diamonds' },
    { name: 'Evony', slug: 'evony', category: 'MOBILE_GAME', currency: 'Gems' },
    { name: 'Top War', slug: 'top-war', category: 'MOBILE_GAME', currency: 'Gems' },
    { name: 'Age of Origins', slug: 'age-of-origins', category: 'MOBILE_GAME', currency: 'Gold' },
    { name: 'Call of Dragons', slug: 'call-of-dragons', category: 'MOBILE_GAME', currency: 'Gems' },
    // Horror & Action
    { name: 'Identity V', slug: 'identity-v', category: 'MOBILE_GAME', currency: 'Echoes' },
    { name: 'NetEase Identity V', slug: 'netease-identity-v', category: 'MOBILE_GAME', currency: 'Echoes' },
    { name: 'Dead by Daylight Mobile', slug: 'dead-by-daylight-mobile', category: 'MOBILE_GAME', currency: 'Auric Cells' },
    { name: 'Dead by Daylight', slug: 'dead-by-daylight', category: 'PC_GAME', currency: 'Auric Cells' },
    { name: 'The Walking Dead: Survivors', slug: 'walking-dead-survivors', category: 'MOBILE_GAME', currency: 'Rubies' },
    { name: 'LifeAfter', slug: 'lifeafter', category: 'MOBILE_GAME', currency: 'Fed Credits' },
    { name: 'Undawn', slug: 'undawn', category: 'MOBILE_GAME', currency: 'RC' },
    { name: 'Garena Undawn', slug: 'garena-undawn', category: 'MOBILE_GAME', currency: 'RC' },
    { name: 'Life is Strange', slug: 'life-is-strange', category: 'PC_GAME', currency: 'Episode Pass' },
    { name: 'Granny', slug: 'granny', category: 'MOBILE_GAME', currency: 'No Ads Pass' },
    { name: 'Granny 2', slug: 'granny-2', category: 'MOBILE_GAME', currency: 'Supporter Pack' },
    { name: 'Granny 3', slug: 'granny-3', category: 'MOBILE_GAME', currency: 'Supporter Pack' },
    { name: 'Eyes: The Horror Game', slug: 'eyes-horror-game', category: 'MOBILE_GAME', currency: 'Coins' },
    { name: 'Specimen Zero', slug: 'specimen-zero', category: 'MOBILE_GAME', currency: 'Coins' },
    { name: 'Mimicry', slug: 'mimicry', category: 'MOBILE_GAME', currency: 'Gold' },
    { name: 'Horrorfield', slug: 'horrorfield', category: 'MOBILE_GAME', currency: 'Gold' },
    { name: 'Evil Nun', slug: 'evil-nun', category: 'MOBILE_GAME', currency: 'Coins' },
    { name: 'Ice Scream', slug: 'ice-scream', category: 'MOBILE_GAME', currency: 'Coins' },
    { name: 'Poppy Playtime', slug: 'poppy-playtime', category: 'PC_GAME', currency: 'Chapter Pass' },
    { name: 'Five Nights at Freddy’s', slug: 'fnaf', category: 'PC_GAME', currency: 'Faz-Coins' },
    { name: 'Phasmophobia', slug: 'phasmophobia', category: 'PC_GAME', currency: 'Ghost Hunter License' },
    { name: 'Outlast Trials', slug: 'outlast-trials', category: 'PC_GAME', currency: 'Murkoff Tokens' },
    // Casual & Party
    { name: 'Candy Crush Saga', slug: 'candy-crush-saga', category: 'MOBILE_GAME', currency: 'Gold Bars' },
    { name: 'Candy Crush Soda Saga', slug: 'candy-crush-soda-saga', category: 'MOBILE_GAME', currency: 'Gold Bars' },
    { name: 'Coin Master', slug: 'coin-master', category: 'MOBILE_GAME', currency: 'Spins & Coins' },
    { name: 'Gardenscapes', slug: 'gardenscapes', category: 'MOBILE_GAME', currency: 'Coins' },
    { name: 'Homescapes', slug: 'homescapes', category: 'MOBILE_GAME', currency: 'Coins' },
    { name: 'Township', slug: 'township', category: 'MOBILE_GAME', currency: 'T-cash' },
    { name: 'Hay Day', slug: 'hay-day', category: 'MOBILE_GAME', currency: 'Diamonds' },
    { name: 'My Talking Tom', slug: 'my-talking-tom', category: 'MOBILE_GAME', currency: 'Coins & Diamonds' },
    { name: 'My Talking Angela', slug: 'my-talking-angela', category: 'MOBILE_GAME', currency: 'Coins & Diamonds' },
    { name: 'Subway Surfers', slug: 'subway-surfers', category: 'MOBILE_GAME', currency: 'Keys & Coins' },
    { name: 'Temple Run 2', slug: 'temple-run-2', category: 'MOBILE_GAME', currency: 'Gems' },
    { name: 'Angry Birds 2', slug: 'angry-birds-2', category: 'MOBILE_GAME', currency: 'Gems' },
    { name: 'Fruit Ninja', slug: 'fruit-ninja', category: 'MOBILE_GAME', currency: 'Starfruit' },
    { name: 'Jetpack Joyride', slug: 'jetpack-joyride', category: 'MOBILE_GAME', currency: 'Coins' },
    { name: 'Hill Climb Racing', slug: 'hill-climb-racing', category: 'MOBILE_GAME', currency: 'Gems' },
    { name: 'Hill Climb Racing 2', slug: 'hill-climb-racing-2', category: 'MOBILE_GAME', currency: 'Gems' },
    { name: 'Pou', slug: 'pou-game', category: 'MOBILE_GAME', currency: 'Coins' },
    { name: 'Blockman GO', slug: 'blockman-go', category: 'MOBILE_GAME', currency: 'Gcubes' },
    { name: 'PK XD', slug: 'pk-xd', category: 'MOBILE_GAME', currency: 'Gems' },
    { name: 'Stumble Guys', slug: 'stumble-guys', category: 'MOBILE_GAME', currency: 'Gems' },
    { name: 'Squad Busters', slug: 'squad-busters', category: 'MOBILE_GAME', currency: 'Coins & Pass' },
    { name: 'Clash Mini', slug: 'clash-mini', category: 'MOBILE_GAME', currency: 'Gems' },
    { name: 'Eggy Party', slug: 'eggy-party', category: 'MOBILE_GAME', currency: 'Eggy Coins' },
    { name: 'Fall Guys', slug: 'fall-guys', category: 'PC_GAME', currency: 'Show-Bucks' },
    { name: 'Among Us', slug: 'among-us', category: 'PC_GAME', currency: 'Stars' },
    { name: 'Lethal Company', slug: 'lethal-company', category: 'PC_GAME', currency: 'Supporter Pack' },
];
async function seedDatabase() {
    console.log('[Startup] Seeding database with full product catalog...');
    const existingAdmin = await prisma_1.default.user.findFirst({ where: { role: 'ADMIN' } });
    if (!existingAdmin) {
        const adminPassword = bcryptjs_1.default.hashSync('admin123', 10);
        await prisma_1.default.user.create({
            data: { email: 'mdara9695@gmail.com', password: adminPassword, role: 'ADMIN' },
        });
        console.log('[Startup] Created default admin: mdara9695@gmail.com / admin123');
    }
    let count = 0;
    for (const game of ALL_GAMES) {
        const packages = generateDefaultPackages(game.currency);
        try {
            await prisma_1.default.product.upsert({
                where: { slug: game.slug },
                update: {
                    name: game.name,
                    category: game.category,
                    isActive: true,
                    image: game.image || `/images/games/${game.slug}.png`,
                },
                create: {
                    name: game.name,
                    slug: game.slug,
                    image: game.image || `/images/games/${game.slug}.png`,
                    category: game.category,
                    isActive: true,
                    packages: {
                        create: packages.map((pkg) => ({
                            name: pkg.name,
                            amount: pkg.amount,
                            price: pkg.price,
                            category: pkg.category,
                            badge: pkg.badge ?? null,
                            isActive: true,
                        })),
                    },
                },
            });
            count++;
        }
        catch (err) {
            console.error(`[Startup] Failed to seed ${game.slug}:`, err.message);
        }
    }
    console.log(`[Startup] ✅ Synced and verified ${count} game products successfully.`);
}
async function runDatabaseStartup() {
    console.log('[Startup] Initializing database...');
    const schemaPath = path_1.default.join(__dirname, '..', '..', 'prisma', 'schema.prisma');
    const prodSchemaPath = path_1.default.join(__dirname, '..', '..', 'prisma', 'schema.prod.prisma');
    const backendRoot = path_1.default.join(__dirname, '..', '..');
    const dbUrl = process.env.DATABASE_URL || '';
    const isPostgres = dbUrl.startsWith('postgresql:') || dbUrl.startsWith('postgres:');
    const isProd = process.env.NODE_ENV === 'production' || process.env.RENDER === 'true' || Boolean(process.env.RENDER_SERVICE_ID) || isPostgres;
    // Auto-heal schema mismatch: if PostgreSQL is configured, ensure postgresql schema is active
    if (isPostgres) {
        try {
            if (fs_1.default.existsSync(schemaPath) && fs_1.default.existsSync(prodSchemaPath)) {
                const currentSchema = fs_1.default.readFileSync(schemaPath, 'utf8');
                if (currentSchema.includes('provider = "sqlite"') || currentSchema.includes("provider = 'sqlite'")) {
                    console.log('[Startup] Detected PostgreSQL DATABASE_URL with SQLite schema. Synchronizing schema.prod.prisma...');
                    fs_1.default.copyFileSync(prodSchemaPath, schemaPath);
                    (0, child_process_1.execSync)(`npx prisma generate --schema="${schemaPath}"`, {
                        cwd: backendRoot,
                        stdio: 'pipe',
                        env: { ...process.env },
                    });
                    console.log('[Startup] ✅ Prisma Client synchronized for PostgreSQL.');
                }
            }
        }
        catch (healErr) {
            console.warn('[Startup] Auto-heal warning:', healErr.message);
        }
    }
    try {
        if (isProd) {
            console.log('[Startup] Running prisma migrate deploy...');
            try {
                (0, child_process_1.execSync)(`npx prisma migrate deploy --schema="${schemaPath}"`, {
                    cwd: backendRoot,
                    stdio: 'pipe',
                    env: { ...process.env },
                    timeout: 60_000,
                });
                console.log('[Startup] ✅ Database migrations applied successfully.');
            }
            catch (migrateErr) {
                console.warn('[Startup] Migrate deploy warning, falling back to db push:', migrateErr.message);
                (0, child_process_1.execSync)(`npx prisma db push --schema="${schemaPath}" --skip-generate --accept-data-loss`, {
                    cwd: backendRoot,
                    stdio: 'pipe',
                    env: { ...process.env },
                    timeout: 60_000,
                });
                console.log('[Startup] ✅ Database schema pushed successfully.');
            }
        }
        else {
            console.log('[Startup] Syncing SQLite schema (prisma db push)...');
            (0, child_process_1.execSync)(`npx prisma db push --schema="${schemaPath}" --skip-generate --accept-data-loss`, {
                cwd: backendRoot,
                stdio: 'pipe',
                env: { ...process.env },
                timeout: 60_000,
            });
            console.log('[Startup] ✅ Local database schema synchronized.');
        }
    }
    catch (err) {
        const msg = (err.stderr?.toString() || err.stdout?.toString() || err.message || '').trim();
        console.warn('[Startup] Database init warning (non-fatal):', msg.substring(0, 300));
    }
    try {
        await prisma_1.default.$connect();
        const productCount = await prisma_1.default.product.count();
        console.log(`[Startup] Found ${productCount} products in database.`);
        // Ensure default administrator accounts exist
        // Delete legacy admin@topup.com if present
        await prisma_1.default.user.deleteMany({
            where: { email: { in: ['admin@topup.com', 'admin@gmail.com'] } },
        }).catch(() => { });
        // Ensure mdara9695@gmail.com is designated administrator
        const adminPassword = await bcryptjs_1.default.hash('admin123', 10);
        for (const email of ['mdara9695@gmail.com']) {
            const existing = await prisma_1.default.user.findUnique({ where: { email } });
            if (!existing) {
                await prisma_1.default.user.create({
                    data: { email, password: adminPassword, role: 'ADMIN' },
                });
                console.log(`[Startup] Created administrator account: ${email}`);
            }
            else if (existing.role !== 'ADMIN') {
                await prisma_1.default.user.update({
                    where: { email },
                    data: { role: 'ADMIN' },
                });
                console.log(`[Startup] Confirmed ADMIN role for: ${email}`);
            }
        }
        if (productCount === 0) {
            console.log('[Startup] Empty database detected — running initial seed for catalog...');
            await seedDatabase();
        }
        else {
            console.log(`[Startup] Database catalog active with ${productCount} products — ready.`);
        }
    }
    catch (err) {
        console.error('[Startup] Database connection/seed error:', err.message);
    }
}
