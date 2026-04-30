import sharp from 'sharp';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';

mkdirSync('store/assets', { recursive: true });
mkdirSync('store/screenshots', { recursive: true });
mkdirSync('store/source', { recursive: true });

const gameplaySourceCandidates = [
  'store/source/minecraft-stream.png',
  'store/wp7560600-desktop-minecraft-wallpapers.jpg'
];
const gameplaySourcePath = gameplaySourceCandidates.find(path => existsSync(path));
if (!gameplaySourcePath) {
  console.error(`Missing gameplay source. Save the Minecraft screenshot as ${gameplaySourceCandidates[0]} or keep it at ${gameplaySourceCandidates[1]}.`);
  process.exit(1);
}

const gameplaySource = await sharp(gameplaySourcePath)
  .resize(1280, 720, { fit: 'cover', position: 'center' })
  .png()
  .toBuffer();
const gameplaySourceHref = `data:image/png;base64,${gameplaySource.toString('base64')}`;
const gameplay160pHref = `data:image/png;base64,${(await sharp(gameplaySource)
  .resize(284, 160, { fit: 'cover', position: 'center', kernel: sharp.kernel.nearest })
  .png()
  .toBuffer()).toString('base64')}`;

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

function logo(x, y, size, { slashed = false } = {}) {
  return `
  <svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="56 64 400 400">
    <path fill="#9146FF" fill-rule="evenodd" d="M256 64 L432 128 L432 272 C432 368 352 432 256 464 C160 432 80 368 80 272 L80 128 Z M256 168 L352 280 L296 280 L296 360 L216 360 L216 280 L160 280 Z"/>
    ${slashed ? '<path d="M104 408 L408 104" fill="none" stroke="#FF4D4D" stroke-width="52" stroke-linecap="round"/><path d="M104 408 L408 104" fill="none" stroke="#18181B" stroke-width="24" stroke-linecap="round"/>' : ''}
  </svg>`;
}

function fallbackGameScene(x, y, w, h, { degraded = false } = {}) {
  const unit = w / 640;
  const sy = h / 360;
  const s = Math.min(unit, sy);
  const top = y;
  const left = x;
  const blur = degraded ? `filter="url(#blur-${Math.round(x)}-${Math.round(y)})"` : '';
  const overlay = degraded ? `
    <defs>
      <filter id="blur-${Math.round(x)}-${Math.round(y)}"><feGaussianBlur stdDeviation="3.2"/></filter>
      <pattern id="pixels-${Math.round(x)}-${Math.round(y)}" width="${Math.max(14, 18 * s)}" height="${Math.max(14, 18 * s)}" patternUnits="userSpaceOnUse">
        <rect width="${Math.max(14, 18 * s)}" height="${Math.max(14, 18 * s)}" fill="#000" opacity="0.12"/>
        <path d="M0 0 H${Math.max(14, 18 * s)} V${Math.max(14, 18 * s)}" fill="none" stroke="#fff" stroke-opacity="0.08"/>
      </pattern>
    </defs>` : '';

  return `
  ${overlay}
  <g ${blur}>
    <rect x="${left}" y="${top}" width="${w}" height="${h}" fill="#7BA8F3"/>
    <rect x="${left}" y="${top + h * 0.22}" width="${w}" height="${h * 0.2}" fill="#BFD7F8" opacity="0.85"/>
    <rect x="${left}" y="${top + h * 0.44}" width="${w * 0.38}" height="${h * 0.32}" fill="#2C7494"/>
    <path d="M${left + w * 0.2} ${top + h * 0.76} C${left + w * 0.36} ${top + h * 0.42}, ${left + w * 0.66} ${top + h * 0.35}, ${left + w} ${top + h * 0.58} V${top + h} H${left} V${top + h * 0.82} Z" fill="#70814D"/>
    <path d="M${left + w * 0.28} ${top + h * 0.82} L${left + w * 0.46} ${top + h * 0.3} L${left + w * 0.74} ${top + h * 0.86} Z" fill="#6B7C42"/>
    <path d="M${left + w * 0.44} ${top + h * 0.83} L${left + w * 0.62} ${top + h * 0.28} L${left + w * 0.94} ${top + h * 0.84} Z" fill="#51683B"/>
    <path d="M${left + w * 0.34} ${top + h * 0.84} H${left + w * 0.88} V${top + h} H${left + w * 0.2} Z" fill="#3D532F"/>
    ${Array.from({ length: 9 }, (_, i) => {
      const cx = left + w * (0.33 + i * 0.06);
      const cy = top + h * (0.5 + (i % 3) * 0.05);
      return `
        <rect x="${cx}" y="${cy + 20 * s}" width="${10 * s}" height="${42 * s}" fill="#4D3826"/>
        <rect x="${cx - 18 * s}" y="${cy}" width="${46 * s}" height="${30 * s}" fill="#32471E"/>
        <rect x="${cx - 8 * s}" y="${cy - 14 * s}" width="${34 * s}" height="${28 * s}" fill="#273A18"/>`;
    }).join('')}
    ${Array.from({ length: 12 }, (_, i) => {
      const bx = left + w * (0.24 + i * 0.045);
      const by = top + h * (0.62 + (i % 4) * 0.04);
      return `<rect x="${bx}" y="${by}" width="${16 * s}" height="${10 * s}" fill="${i % 3 === 0 ? '#A53325' : '#8CA150'}" opacity="0.9"/>`;
    }).join('')}
    <g opacity="0.82">
      <rect x="${left + w * 0.08}" y="${top + h * 0.06}" width="${72 * s}" height="${12 * s}" fill="#E7EEF9"/>
      <rect x="${left + w * 0.14}" y="${top + h * 0.09}" width="${52 * s}" height="${10 * s}" fill="#D2DCEA"/>
      <rect x="${left + w * 0.46}" y="${top + h * 0.08}" width="${92 * s}" height="${12 * s}" fill="#E7EEF9"/>
      <rect x="${left + w * 0.54}" y="${top + h * 0.11}" width="${64 * s}" height="${10 * s}" fill="#D2DCEA"/>
      <rect x="${left + w * 0.73}" y="${top + h * 0.03}" width="${110 * s}" height="${16 * s}" fill="#D6E0EE"/>
    </g>
    <g transform="translate(${left + w * 0.78} ${top + h * 0.52}) rotate(-18)">
      <rect x="0" y="${68 * s}" width="${150 * s}" height="${20 * s}" fill="#5C4229"/>
      <rect x="${100 * s}" y="0" width="${42 * s}" height="${80 * s}" fill="#747678"/>
      <rect x="${88 * s}" y="${20 * s}" width="${76 * s}" height="${38 * s}" fill="#A6AAAD"/>
    </g>
  </g>
  ${degraded ? `<rect x="${left}" y="${top}" width="${w}" height="${h}" fill="url(#pixels-${Math.round(x)}-${Math.round(y)})"/>` : ''}
  <g>
    ${Array.from({ length: 10 }, (_, i) => `<path d="M${left + w * 0.26 + i * 18 * s} ${top + h - 52 * s} l${7 * s} ${-8 * s} l${7 * s} ${8 * s} l${7 * s} ${-8 * s} l${7 * s} ${8 * s} v${10 * s} h${-28 * s}z" fill="#EF243A" stroke="#18070A" stroke-width="${2 * s}"/>`).join('')}
    <rect x="${left + w * 0.27}" y="${top + h - 38 * s}" width="${280 * s}" height="${32 * s}" fill="#111" opacity="0.72"/>
    ${Array.from({ length: 7 }, (_, i) => `<rect x="${left + w * 0.28 + i * 39 * s}" y="${top + h - 34 * s}" width="${34 * s}" height="${28 * s}" fill="${i === 0 ? '#3B3E38' : '#59613A'}" stroke="#B9B9B9" stroke-width="${2 * s}"/>`).join('')}
  </g>`;
}

function playerFrame(x, y, w, h, opts = {}) {
  const {
    degraded = false,
    badge = '160p',
    toast = null,
    menu = false,
    menuSelection = 'Source',
    status = null
  } = opts;
  const left = x + 28;
  const top = y + 32;
  const imageW = w - 56;
  const imageH = h - 112;
  const clipId = `clip-${Math.round(x)}-${Math.round(y)}-${badge.replaceAll(' ', '-')}`;
  const gameplayHref = degraded ? gameplay160pHref : gameplaySourceHref;
  const rendering = degraded ? 'image-rendering="pixelated"' : '';
  const scene = gameplayHref
    ? `<image x="${left}" y="${top}" width="${imageW}" height="${imageH}" href="${gameplayHref}" preserveAspectRatio="xMidYMid slice" ${rendering}/>`
    : fallbackGameScene(left, top, imageW, imageH, { degraded });
  return `
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="#18181B" stroke="#33333B" stroke-width="2"/>
  <clipPath id="${clipId}"><rect x="${left}" y="${top}" width="${imageW}" height="${imageH}" rx="8"/></clipPath>
  <g clip-path="url(#${clipId})">${scene}</g>
  <rect x="${left + 24}" y="${top + 22}" width="84" height="26" rx="13" fill="#0E0E10" opacity="0.88"/>
  ${text(left + 44, top + 41, badge, 14, 850)}
  ${toast ? `<rect x="${left + imageW - 272}" y="${top + 24}" width="246" height="30" rx="15" fill="#101014" opacity="0.82"/>${text(left + imageW - 252, top + 45, toast, 15, 800)}` : ''}
  ${status ? `<rect x="${left + 24}" y="${top + imageH - 54}" width="270" height="34" rx="17" fill="#101014" opacity="0.84"/>${text(left + 44, top + imageH - 31, status, 15, 800, '#DAD2EA')}` : ''}
  <rect x="${left}" y="${y + h - 78}" width="${imageW}" height="50" fill="#101014" opacity="0.94"/>
  <rect x="${left + 24}" y="${y + h - 59}" width="${116}" height="12" rx="6" fill="#9146FF"/>
  <rect x="${left + 160}" y="${y + h - 59}" width="${230}" height="12" rx="6" fill="#FFFFFF" opacity="0.28"/>
  <circle cx="${left + imageW - 40}" cy="${y + h - 53}" r="16" fill="rgba(255,255,255,0.16)"/>
  ${logo(left + imageW - 54, y + h - 67, 28)}
  ${menu ? qualityMenu(left + imageW - 236, top + 68, menuSelection) : ''}
  `;
}

function qualityMenu(x, y, selected = 'Source') {
  const rows = ['Source', '1080p60', '720p60', '480p', '160p'];
  return `
  <rect x="${x}" y="${y}" width="236" height="248" rx="8" fill="#FFFFFF" stroke="#D9D9E3" stroke-width="2"/>
  ${text(x + 18, y + 34, 'Quality', 18, 800, '#1F1F23')}
  ${rows.map((row, i) => {
    const ry = y + 54 + i * 36;
    const selectedRow = row === selected;
    return `
      ${selectedRow ? `<rect x="${x + 18}" y="${ry}" width="200" height="34" rx="6" fill="#F0E9FF"/>` : ''}
      ${selectedRow ? `<circle cx="${x + 36}" cy="${ry + 17}" r="7" fill="#9146FF"/>` : ''}
      ${text(x + 54, ry + 23, row, 15, selectedRow ? 800 : 600, '#1F1F23')}
      ${i > 0 ? `<line x1="${x + 18}" y1="${ry - 4}" x2="${x + 218}" y2="${ry - 4}" stroke="#E7E7EE"/>` : ''}`;
  }).join('')}
  `;
}

function popupMock(x, y) {
  return `
  <rect x="${x}" y="${y}" width="300" height="468" rx="10" fill="#F4F5F8"/>
  <rect x="${x}" y="${y}" width="300" height="468" rx="10" fill="none" stroke="#D8D8E0" stroke-width="2"/>
  <path d="M${x} ${y} H${x + 300} V${y + 468} H${x} Z" fill="#9146FF" opacity="0.05"/>
  <rect x="${x + 14}" y="${y + 14}" width="272" height="76" rx="8" fill="#231732"/>
  <path d="M${x + 14} ${y + 14} H${x + 286} V${y + 90} H${x + 14} Z" fill="#9146FF" opacity="0.16"/>
  ${logo(x + 28, y + 35, 34)}
  ${text(x + 72, y + 46, 'QualityGuard', 16, 850, '#FFFFFF')}
  <circle cx="${x + 76}" cy="${y + 67}" r="4" fill="#00A66A"/>
  ${text(x + 86, y + 71, 'Guard active', 11, 700, '#D9D1E6')}
  <rect x="${x + 230}" y="${y + 40}" width="40" height="22" rx="11" fill="#00A66A"/>
  <circle cx="${x + 257}" cy="${y + 51}" r="8" fill="#FFFFFF"/>
  <rect x="${x + 14}" y="${y + 102}" width="272" height="124" rx="8" fill="#FFFFFF" stroke="#E4E0EB"/>
  ${text(x + 28, y + 125, 'TRIGGER', 11, 760, '#686273')}
  <rect x="${x + 28}" y="${y + 134}" width="244" height="36" rx="7" fill="#FAFAFE" stroke="#E4E0EB"/>
  ${text(x + 40, y + 157, 'Any drop from preferred quality', 13, 650, '#18151F')}
  ${text(x + 28, y + 191, 'TARGET QUALITY', 11, 760, '#686273')}
  <rect x="${x + 28}" y="${y + 200}" width="244" height="36" rx="7" fill="#FAFAFE" stroke="#E4E0EB"/>
  ${text(x + 40, y + 223, 'Source', 13, 750, '#18151F')}
  <rect x="${x + 14}" y="${y + 236}" width="272" height="104" rx="8" fill="#FFFFFF" stroke="#E4E0EB"/>
  ${text(x + 28, y + 266, 'Show toast in player', 13, 760, '#18151F')}
  ${text(x + 28, y + 285, 'Visible recovery confirmation', 11, 560, '#8D8798')}
  <rect x="${x + 230}" y="${y + 258}" width="40" height="22" rx="11" fill="#9146FF"/>
  <circle cx="${x + 257}" cy="${y + 269}" r="8" fill="#FFFFFF"/>
  <line x1="${x + 28}" y1="${y + 295}" x2="${x + 272}" y2="${y + 295}" stroke="#E4E0EB"/>
  ${text(x + 28, y + 321, 'Debug mode', 13, 760, '#18151F')}
  ${text(x + 28, y + 335, 'Record extra diagnostic events', 11, 560, '#8D8798')}
  <rect x="${x + 230}" y="${y + 311}" width="40" height="22" rx="11" fill="#ECE8F1" stroke="#D7D1DF"/>
  <circle cx="${x + 241}" cy="${y + 322}" r="8" fill="#FFFFFF"/>
  <rect x="${x + 14}" y="${y + 352}" width="272" height="100" rx="8" fill="#FFFFFF" stroke="#E4E0EB"/>
  ${text(x + 28, y + 376, 'STATS', 11, 760, '#686273')}
  <rect x="${x + 28}" y="${y + 388}" width="116" height="42" rx="7" fill="#FAFAFE" stroke="#E4E0EB"/>
  ${text(x + 40, y + 410, '7', 22, 850, '#772CE8')}
  ${text(x + 74, y + 410, 'Lifetime', 11, 680, '#686273')}
  <rect x="${x + 156}" y="${y + 388}" width="116" height="42" rx="7" fill="#FAFAFE" stroke="#E4E0EB"/>
  ${text(x + 168, y + 410, '3', 22, 850, '#772CE8')}
  ${text(x + 202, y + 410, 'This tab', 11, 680, '#686273')}
  <line x1="${x + 28}" y1="${y + 428}" x2="${x + 272}" y2="${y + 428}" stroke="#E4E0EB"/>
  ${text(x + 28, y + 446, 'Last reset', 12, 650, '#686273')}
  ${text(x + 208, y + 446, 'just now', 12, 760, '#18151F')}
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
await sharp(iconSvg).resize(128, 128).png().toFile('store/assets/store-icon-128.png');
console.log('wrote store/assets/store-icon-128.png');

await writePng('store/screenshots/01-detected-160p-1280x800.png', 1280, 800, `
  ${playerFrame(76, 86, 820, 462, { degraded: true, badge: '160p', status: 'Quality dropped below preferred' })}
  <rect x="934" y="118" width="248" height="162" rx="10" fill="#18181B" stroke="#33333B"/>
  ${logo(958, 146, 46)}
  ${text(1018, 164, 'Drop detected', 28, 850)}
  ${text(958, 222, 'The stream is stuck at 160p.', 22, 650, '#D7D7DF')}
  ${text(958, 258, 'QualityGuard sees it immediately.', 18, 560, '#A8A8B3')}
  ${text(88, 640, 'Detects forced quality drops', 48, 850)}
  ${text(90, 690, 'When Twitch starts or falls back to 160p, QualityGuard treats it as a real problem.', 23, 500, '#D7D7DF')}
`);

await writePng('store/screenshots/02-restoring-source-1280x800.png', 1280, 800, `
  ${playerFrame(76, 86, 820, 462, { degraded: true, badge: '160p', toast: 'Restoring Source...', menu: true, menuSelection: 'Source' })}
  ${popupMock(918, 86)}
  ${text(88, 640, 'Restores your preferred quality', 48, 850)}
  ${text(90, 690, 'The extension opens the same player quality path and selects Source or your target quality.', 23, 500, '#D7D7DF')}
`);

await writePng('store/screenshots/03-restored-source-1280x800.png', 1280, 800, `
  ${playerFrame(76, 86, 820, 462, { degraded: false, badge: 'Source', toast: 'Quality restored to Source' })}
  <rect x="934" y="118" width="248" height="190" rx="10" fill="#18181B" stroke="#33333B"/>
  <circle cx="986" cy="174" r="30" fill="#00A66A"/>
  <path d="M972 174 l10 10 l24 -28" fill="none" stroke="#FFFFFF" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
  ${text(958, 238, 'Back to Source', 29, 850)}
  ${text(958, 274, 'Sharp stream, no manual menu clicks.', 17, 560, '#A8A8B3')}
  ${text(88, 640, 'Keeps streams sharp', 48, 850)}
  ${text(90, 690, 'Startup checks and a watchdog keep enforcing the target if the player drops again.', 23, 500, '#D7D7DF')}
`);

await writePng('store/screenshots/qualityguard-popup-1280x800.png', 1280, 800, `
  ${playerFrame(76, 76, 790, 456, { degraded: false, badge: 'Source', toast: 'Quality restored to Source', menu: true, menuSelection: 'Source' })}
  ${popupMock(900, 86)}
  ${text(88, 620, 'QualityGuard for Twitch', 48, 800)}
  ${text(90, 670, 'Restores your preferred player quality automatically after forced drops.', 24, 500, '#D7D7DF')}
  ${text(90, 710, 'Now with startup enforcement and an in-player on/off button.', 20, 500, '#A8A8B3')}
`);

await writePng('store/assets/small-promo-440x280.png', 440, 280, `
  <path d="M0 280 L440 0 L440 280 Z" fill="#17171C"/>
  <path d="M220 0 L440 0 L220 280 L0 280 Z" fill="#9146FF" opacity="0.18"/>
  <rect x="296" y="164" width="88" height="88" rx="18" fill="#1F1F23"/>
  ${logo(301, 170, 78)}
  ${text(32, 84, 'No more 160p.', 36, 850)}
  ${text(34, 126, 'QualityGuard for Twitch', 20, 700, '#DADAE2')}
  <rect x="34" y="162" width="178" height="34" rx="17" fill="#9146FF"/>
  ${text(54, 185, 'Auto-restores quality', 15, 800)}
`);

await writePng('store/assets/marquee-promo-1400x560.png', 1400, 560, `
  <path d="M760 0 H1400 V560 H620 C770 430 800 192 760 0 Z" fill="#17171C"/>
  ${playerFrame(805, 74, 500, 350, { degraded: false, badge: 'Source', toast: 'Quality restored', menu: true, menuSelection: 'Source' })}
  ${text(92, 178, 'QualityGuard for Twitch', 58, 850)}
  ${text(96, 244, 'Recovers from forced quality drops automatically.', 31, 600, '#E6E6EE')}
  ${text(98, 298, 'Privacy-respecting. No tracking. No external servers.', 24, 500, '#A8A8B3')}
  <rect x="98" y="352" width="240" height="46" rx="23" fill="#9146FF"/>
  ${text(132, 382, 'Keep streams sharp', 20, 800)}
`);
