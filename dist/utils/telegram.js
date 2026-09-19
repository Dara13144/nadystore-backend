"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendTelegramNotification = sendTelegramNotification;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const GROUP_CHAT_ID = process.env.TELEGRAM_GROUP_CHAT_ID;
const SANDBOX_MODE = process.env.SANDBOX_MODE === 'true';
async function sendTelegramNotification(message) {
    const logPrefix = '[Telegram Bot Notification]';
    const rawTargets = [];
    if (CHAT_ID && !CHAT_ID.includes('MOCK'))
        rawTargets.push(CHAT_ID.trim());
    if (GROUP_CHAT_ID && !GROUP_CHAT_ID.includes('MOCK') && !rawTargets.includes(GROUP_CHAT_ID.trim())) {
        rawTargets.push(GROUP_CHAT_ID.trim());
    }
    if (SANDBOX_MODE || !BOT_TOKEN || BOT_TOKEN.includes('MOCK') || rawTargets.length === 0) {
        console.log(`\n🔔 ${logPrefix} (SANDBOX MODE - MOCK SEND)`);
        console.log(`-------------------------------------------`);
        console.log(message);
        console.log(`-------------------------------------------\n`);
        return true;
    }
    let atLeastOneDelivered = false;
    for (const target of rawTargets) {
        const candidateIds = [target];
        if (target.startsWith('-') && !target.startsWith('-100')) {
            candidateIds.push(`-100${target.slice(1)}`);
        }
        else if (target.startsWith('-100')) {
            candidateIds.push(`-${target.slice(4)}`);
        }
        const uniqueChatIds = Array.from(new Set(candidateIds));
        for (const cid of uniqueChatIds) {
            try {
                const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
                const response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        chat_id: cid,
                        text: message,
                        parse_mode: 'HTML',
                    }),
                });
                if (response.ok) {
                    console.log(`${logPrefix} ✅ Notification successfully delivered to chat: ${cid}`);
                    atLeastOneDelivered = true;
                    break;
                }
                const errorText = await response.text();
                console.warn(`${logPrefix} Send attempt to ${cid} returned HTTP ${response.status}:`, errorText);
            }
            catch (error) {
                console.error(`${logPrefix} Error sending telegram notification to ${cid}:`, error.message);
            }
        }
    }
    return atLeastOneDelivered;
}
