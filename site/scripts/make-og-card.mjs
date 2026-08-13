import sharp from "sharp";

const W = 1200;
const H = 630;

const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#113EAE"/>
      <stop offset="45%" stop-color="#0B1752"/>
      <stop offset="100%" stop-color="#090C20"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect x="0" y="${H - 14}" width="${W}" height="14" fill="#B38259"/>
  <circle cx="1050" cy="80" r="260" fill="#113EAE" opacity="0.35"/>
  <text x="430" y="270" font-family="Arial Black, Arial, sans-serif" font-size="86" font-weight="900" fill="#f7f8ff" letter-spacing="2">SEOUL E-LAND</text>
  <text x="430" y="375" font-family="Arial Black, Arial, sans-serif" font-size="86" font-weight="900" fill="#d4a872" letter-spacing="10">DIGEST</text>
  <text x="434" y="448" font-family="Arial, sans-serif" font-size="30" font-weight="700" fill="#c9d4ff" letter-spacing="1">Match reports, previews and guides</text>
  <text x="434" y="492" font-family="Arial, sans-serif" font-size="30" font-weight="700" fill="#c9d4ff" letter-spacing="1">from the 2026 K League 2 promotion race</text>
  <text x="434" y="560" font-family="Arial, sans-serif" font-size="24" font-weight="700" fill="#B38259" letter-spacing="4">SUPPORTER PUBLICATION · EN / PT</text>
</svg>`;

const crest = await sharp("public/assets/crest.png")
  .resize({ height: 380 })
  .toBuffer();

await sharp(Buffer.from(svg))
  .composite([{ input: crest, left: 105, top: 125 }])
  .png()
  .toFile("public/assets/og-card.png");

console.log("og-card.png written");
