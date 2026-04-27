import sharp from 'sharp';
import { mkdirSync, readFileSync } from 'node:fs';

mkdirSync('store/assets', { recursive: true });
mkdirSync('store/screenshots', { recursive: true });

function svgShell(width, height, body) {
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#0E0E10"/>
  ${body}
</svg>`;
}

function esc(text) {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function text(x, y, content, size, weight = 600, fill = '#FFFFFF') {
  return `<text x="${x}" y="${y}" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}">${esc(content)}</text>`;
}

function fauxFrame(x, y, w, h) {
  const left = x + 28;
  const top = y + 32;
  return `
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="#18181B" stroke="#33333B" stroke-width="2"/>
  <rect x="${left}" y="${top}" width="${w - 56}" height="${h - 112}" rx="8" fill="#252631"/>
  <path d="M${left} ${top + h - 118} C${left + 120} ${top + h - 270}, ${left + 250} ${top + h - 50}, ${left + 410} ${top + h - 200} S${left + 600} ${top + h - 120}, ${left + w - 70} ${top + h - 230}" fill="none" stroke="#6B5CFF" stroke-width="18" opacity="0.34"/>
  <path d="M${left + 70} ${top + h - 160} L${left + 180} ${top + 84} L${left + 300} ${top + h - 170} Z" fill="#3E4050"/>
  <path d="M${left + 330} ${top + h - 160} L${left + 454} ${top + 64} L${left + 600} ${top + h - 158} Z" fill="#323442"/>
  <circle cx="${left + 620}" cy="${top + 92}" r="34" fill="#9146FF" opacity="0.72"/>
  <rect x="${left + 24}" y="${top + 22}" width="86" height="26" rx="13" fill="#0E0E10" opacity="0.84"/>
  ${text(left + 44, top + 41, 'LIVE', 14, 850)}
  <rect x="${left + w - 260}" y="${top + 24}" width="220" height="30" rx="15" fill="#101014" opacity="0.76"/>
  ${text(left + w - 238, top + 45, 'Quality restored to Source', 15, 800)}
  <rect x="${left}" y="${y + h - 78}" width="${w - 56}" height="50" fill="#101014" opacity="0.92"/>
  <rect x="${left + 24}" y="${y + h - 59}" width="116" height="12" rx="6" fill="#9146FF"/>
  <rect x="${left + 160}" y="${y + h - 59}" width="230" height="12" rx="6" fill="#FFFFFF" opacity="0.28"/>
  <circle cx="${left + w - 96}" cy="${y + h - 53}" r="14" fill="#9146FF"/>
  <path d="M${left + w - 96} ${y + h - 63} L${left + w - 84} ${y + h - 47} H${left + w - 108} Z" fill="#FFFFFF"/>
  `;
}

function qualityMenu(x, y) {
  return `
  <rect x="${x}" y="${y}" width="236" height="248" rx="8" fill="#FFFFFF" stroke="#D9D9E3" stroke-width="2"/>
  ${text(x + 18, y + 34, 'Quality', 18, 800, '#1F1F23')}
  <rect x="${x + 18}" y="${y + 54}" width="200" height="34" rx="6" fill="#F0E9FF"/>
  <circle cx="${x + 36}" cy="${y + 71}" r="7" fill="#9146FF"/>
  ${text(x + 54, y + 77, 'Source', 15, 800, '#1F1F23')}
  ${text(x + 54, y + 113, '1080p60', 15, 600, '#353540')}
  ${text(x + 54, y + 149, '720p60', 15, 600, '#353540')}
  ${text(x + 54, y + 185, '480p', 15, 600, '#353540')}
  ${text(x + 54, y + 221, '160p', 15, 600, '#353540')}
  <line x1="${x + 18}" y1="${y + 130}" x2="${x + 218}" y2="${y + 130}" stroke="#E7E7EE"/>
  <line x1="${x + 18}" y1="${y + 166}" x2="${x + 218}" y2="${y + 166}" stroke="#E7E7EE"/>
  <line x1="${x + 18}" y1="${y + 202}" x2="${x + 218}" y2="${y + 202}" stroke="#E7E7EE"/>
  `;
}

async function writePng(name, width, height, body) {
  await sharp(Buffer.from(svgShell(width, height, body)))
    .flatten({ background: '#0E0E10' })
    .removeAlpha()
    .png()
    .toFile(name);
  console.log(`wrote ${name}`);
}

const iconSvg = readFileSync('icons/source.svg');
await sharp(iconSvg)
  .resize(128, 128)
  .flatten({ background: '#1F1F23' })
  .removeAlpha()
  .png()
  .toFile('store/assets/store-icon-128.png');
console.log('wrote store/assets/store-icon-128.png');

await writePng('store/screenshots/qualityguard-popup-1280x800.png', 1280, 800, `
  <rect x="0" y="0" width="1280" height="800" fill="#0E0E10"/>
  ${fauxFrame(76, 76, 790, 456)}
  ${qualityMenu(610, 174)}

  <rect x="900" y="96" width="300" height="436" rx="8" fill="#FFFFFF"/>
  <rect x="900" y="96" width="300" height="436" rx="8" fill="none" stroke="#D8D8E0" stroke-width="2"/>
  ${text(924, 134, 'QualityGuard', 22, 800, '#1F1F23')}
  <rect x="1100" y="114" width="66" height="28" rx="14" fill="#9146FF"/>
  <circle cx="1153" cy="128" r="10" fill="#FFFFFF"/>
  ${text(924, 184, 'Trigger', 14, 700, '#55555F')}
  <rect x="924" y="196" width="232" height="40" rx="6" fill="#F4F4F8" stroke="#D7D7E0"/>
  ${text(940, 221, 'Any drop from preferred quality', 14, 600, '#1F1F23')}
  ${text(924, 272, 'Target quality', 14, 700, '#55555F')}
  <rect x="924" y="284" width="232" height="40" rx="6" fill="#F4F4F8" stroke="#D7D7E0"/>
  ${text(940, 309, 'Source', 14, 700, '#1F1F23')}
  <rect x="924" y="354" width="232" height="92" rx="6" fill="#F7F7FA" stroke="#E2E2EA"/>
  ${text(944, 386, 'Lifetime resets', 14, 600, '#55555F')}
  ${text(1116, 386, '7', 14, 800, '#1F1F23')}
  ${text(944, 418, 'This tab', 14, 600, '#55555F')}
  ${text(1116, 418, '3', 14, 800, '#1F1F23')}
  <rect x="924" y="470" width="232" height="40" rx="6" fill="#9146FF"/>
  ${text(972, 496, 'Copy debug info', 14, 800)}

  ${text(88, 620, 'QualityGuard for Twitch', 48, 800)}
  ${text(90, 670, 'Restores your preferred player quality automatically after forced drops.', 24, 500, '#D7D7DF')}
  ${text(90, 710, 'No accounts. No tracking. Settings stay in Chrome.', 20, 500, '#A8A8B3')}
`);

await writePng('store/assets/small-promo-440x280.png', 440, 280, `
  <rect width="440" height="280" fill="#0E0E10"/>
  <path d="M0 280 L440 0 L440 280 Z" fill="#17171C"/>
  <path d="M220 0 L440 0 L220 280 L0 280 Z" fill="#9146FF" opacity="0.18"/>
  <rect x="296" y="164" width="88" height="88" rx="18" fill="#1F1F23"/>
  <path fill="#9146FF" d="M340 176 L374 188 L374 216 C374 235 359 248 340 254 C321 248 306 235 306 216 L306 188 Z"/>
  <path fill="#FFFFFF" d="M340 202 L358 224 L347 224 L347 239 L333 239 L333 224 L322 224 Z"/>
  ${text(32, 84, 'No more 160p.', 36, 850)}
  ${text(34, 126, 'QualityGuard for Twitch', 20, 700, '#DADAE2')}
  <rect x="34" y="162" width="178" height="34" rx="17" fill="#9146FF"/>
  ${text(54, 185, 'Auto-restores quality', 15, 800)}
`);

await writePng('store/assets/marquee-promo-1400x560.png', 1400, 560, `
  <rect width="1400" height="560" fill="#0E0E10"/>
  <path d="M760 0 H1400 V560 H620 C770 430 800 192 760 0 Z" fill="#17171C"/>
  ${fauxFrame(730, 74, 570, 350)}
  ${qualityMenu(1030, 126)}
  ${text(92, 178, 'QualityGuard for Twitch', 58, 850)}
  ${text(96, 244, 'One-second recovery from forced quality drops.', 31, 600, '#E6E6EE')}
  ${text(98, 298, 'Privacy-respecting. No tracking. No external servers.', 24, 500, '#A8A8B3')}
  <rect x="98" y="352" width="240" height="46" rx="23" fill="#9146FF"/>
  ${text(132, 382, 'Keep streams sharp', 20, 800)}
`);
