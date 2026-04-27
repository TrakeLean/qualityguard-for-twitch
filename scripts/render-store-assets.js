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
  <rect x="88" y="82" width="760" height="428" rx="10" fill="#18181B"/>
  <rect x="88" y="82" width="760" height="428" rx="10" fill="none" stroke="#2F2F35" stroke-width="2"/>
  <rect x="112" y="108" width="712" height="336" rx="8" fill="#26262C"/>
  <rect x="112" y="388" width="712" height="56" fill="#121216" opacity="0.86"/>
  <rect x="376" y="120" width="184" height="28" rx="14" fill="#9146FF"/>
  ${text(408, 140, 'Quality restored to Source', 16, 700)}
  <rect x="132" y="408" width="96" height="16" rx="8" fill="#9146FF"/>
  <rect x="248" y="408" width="196" height="16" rx="8" fill="#FFFFFF" opacity="0.26"/>
  <circle cx="728" cy="416" r="14" fill="#9146FF"/>
  <path d="M728 406 L738 421 H718 Z" fill="#FFFFFF"/>

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
  <rect x="710" y="74" width="560" height="314" rx="12" fill="#1F1F23" stroke="#33333B" stroke-width="3"/>
  <rect x="742" y="108" width="496" height="220" rx="8" fill="#282830"/>
  <rect x="742" y="290" width="496" height="38" fill="#111116" opacity="0.92"/>
  <rect x="910" y="124" width="160" height="28" rx="14" fill="#9146FF"/>
  ${text(937, 144, 'Restored to Source', 15, 800)}
  <circle cx="1198" cy="310" r="11" fill="#9146FF"/>
  <path d="M1198 302 L1206 315 H1190 Z" fill="#FFFFFF"/>
  ${text(92, 178, 'QualityGuard for Twitch', 58, 850)}
  ${text(96, 244, 'One-second recovery from forced quality drops.', 31, 600, '#E6E6EE')}
  ${text(98, 298, 'Privacy-respecting. No tracking. No external servers.', 24, 500, '#A8A8B3')}
  <rect x="98" y="352" width="240" height="46" rx="23" fill="#9146FF"/>
  ${text(132, 382, 'Keep streams sharp', 20, 800)}
`);
