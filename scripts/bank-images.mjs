/**
 * Draws the evidence images for the operator's question bank.
 *
 * Each is a small HTML scene (a receipt, a shipping label, a lookalike store, a
 * wallet's signing screen) screenshotted to PNG with headless Edge or Chrome.
 * They are invented, so nothing here is anyone's real receipt or a real site.
 * Run once; the PNGs are committed under packages/gateway/bank.
 *
 *   node scripts/bank-images.mjs
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const out = resolve('packages/gateway/bank')
const tmp = resolve('packages/gateway/bank/.html')
mkdirSync(tmp, { recursive: true })

const browser = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find(existsSync)
if (!browser) throw new Error('no Edge or Chrome found to draw with')

const base = `*{box-sizing:border-box}body{margin:0;font-family:Inter,Segoe UI,Arial,sans-serif;background:#e9edf3;display:flex;align-items:center;justify-content:center;width:100vw;height:100vh}`
const mono = `font-family:'Courier New',monospace`

const browserFrame = (url, body, { bad = false } = {}) => `<div style="width:760px;border-radius:12px;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,.18);background:#fff">
  <div style="background:#f1f3f4;padding:10px 14px;display:flex;align-items:center;gap:10px">
    <span style="width:11px;height:11px;border-radius:50%;background:#ff5f57"></span><span style="width:11px;height:11px;border-radius:50%;background:#febc2e"></span><span style="width:11px;height:11px;border-radius:50%;background:#28c840"></span>
    <div style="flex:1;margin-left:10px;background:#fff;border-radius:16px;padding:6px 14px;font-size:13px;color:#333">${bad ? '<span style="color:#888">&#9888; Not secure</span> &nbsp;' : '&#128274; '}${url}</div>
  </div>${body}</div>`

const SCENES = {
  'receipt-total': `<div style="width:340px;background:#fffdf7;padding:26px 24px;${mono};font-size:15px;color:#222;box-shadow:0 8px 24px rgba(0,0,0,.15)">
    <div style="text-align:center;font-weight:700;font-size:18px">HARBOUR CAFE &amp; CATERING</div>
    <div style="text-align:center;font-size:12px;margin-bottom:14px">12 Quay Road &middot; 14/10/2026 13:42</div>
    <div style="border-top:1px dashed #999;margin:8px 0"></div>
    ${[['2 x Flat white', '7.00'], ['1 x Club sandwich', '6.20'], ['1 x Catering tray', '31.80']].map(([a, b]) => `<div style="display:flex;justify-content:space-between;margin:6px 0"><span>${a}</span><span>${b}</span></div>`).join('')}
    <div style="border-top:1px dashed #999;margin:10px 0"></div>
    <div style="display:flex;justify-content:space-between;font-weight:700;font-size:20px"><span>TOTAL</span><span>4<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:radial-gradient(#9a8f7a,#d9d0bd 70%,transparent);margin:0 1px;vertical-align:middle"></span>5<span style="color:#cfc6b2">.</span>00</span></div>
    <div style="text-align:center;font-size:12px;margin-top:16px">CARD **** 4417 &middot; THANK YOU</div></div>`,

  'label-part': `<div style="width:420px;background:#fff;padding:22px;border:2px solid #222;${mono};color:#111">
    <div style="display:flex;justify-content:space-between;font-size:13px"><b>FROM: NORTHLINE PARTS</b><span>1 of 1</span></div>
    <div style="font-size:13px;margin:8px 0 16px">TO: Bay 4, Unit 9, Eastfield Trading Estate</div>
    <div style="height:56px;background:repeating-linear-gradient(90deg,#111 0 3px,#fff 3px 5px,#111 5px 6px,#fff 6px 10px)"></div>
    <div style="font-size:12px;margin-top:14px">PART NO.</div>
    <div style="font-size:40px;font-weight:700;letter-spacing:2px;filter:blur(.9px)"><span style="font-family:Arial;transform:scaleX(.92);display:inline-block">B</span>7-4492</div>
    <div style="font-size:12px;margin-top:8px">QTY 12 &middot; WEIGHT 3.4 KG</div></div>`,

  'handwritten-qty': `<div style="width:600px;background:#fff;padding:26px;box-shadow:0 8px 24px rgba(0,0,0,.15);background-image:repeating-linear-gradient(#fff 0 31px,#cfe0f5 31px 32px)">
    <div style="font-family:Segoe Script,Brush Script MT,cursive;font-size:26px;color:#1b2a6b;line-height:32px">
    Order for Monday<br/>Printer paper, A4 &mdash; boxes: <span style="font-size:34px">7</span><span style="position:relative;left:-19px;top:-2px;font-size:22px">-</span><br/>Toner, black &mdash; 2<br/>Staples &mdash; 1 pack</div></div>`,

  'fake-store': browserFrame('nike-outlet-sale.shop', `<div style="padding:26px 30px">
    <div style="display:flex;justify-content:space-between;align-items:center"><b style="font-size:24px;letter-spacing:-1px">NIKE <span style="font-weight:400;font-size:14px">Official Store</span></b><span style="background:#e11;color:#fff;padding:5px 10px;border-radius:4px;font-size:13px;font-weight:700">MEGA SALE -70%</span></div>
    <div style="display:flex;gap:16px;margin-top:20px">${['Air Max 270', 'Air Force 1', 'Dunk Low'].map((n, i) => `<div style="flex:1;border:1px solid #eee;border-radius:8px;padding:12px"><div style="height:90px;border-radius:6px;background:linear-gradient(135deg,${['#ddd,#bbb', '#f4f4f4,#d8d8d8', '#c9d6ff,#e2e2e2'][i]})"></div><div style="font-size:13px;margin-top:8px">${n}</div><div><s style="color:#999;font-size:12px">$150</s> <b style="color:#e11">$39.99</b></div></div>`).join('')}</div>
    <div style="font-size:11px;color:#999;margin-top:14px">Domain registered 9 days ago &middot; Payment: card or crypto only &middot; No returns</div></div>`, { bad: true }),

  'phishing-dapp': browserFrame('app.uniswap-claims.org/airdrop', `<div style="padding:34px;text-align:center;background:linear-gradient(180deg,#fff0f8,#fff)">
    <div style="font-size:30px;color:#ff007a;font-weight:800">&#129412; Uniswap</div>
    <div style="font-size:22px;font-weight:700;margin-top:14px">Claim your UNI airdrop</div>
    <div style="font-size:14px;color:#555;margin:8px 0 20px">Eligible wallets can claim 1,200 UNI. Offer ends in 00:14:52</div>
    <div style="display:inline-block;background:#ff007a;color:#fff;font-weight:700;padding:14px 34px;border-radius:14px">Connect wallet &amp; claim</div>
    <div style="font-size:11px;color:#999;margin-top:16px">You will be asked to approve the claim contract</div></div>`, { bad: true }),

  'token-lookalike': `<div style="width:520px;background:#fff;border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,.18);padding:20px">
    <div style="font-weight:700;font-size:17px;margin-bottom:12px">Select a token</div>
    <div style="background:#f3f4f6;border-radius:10px;padding:10px 12px;font-size:14px;color:#666">&#128269; usdc</div>
    ${[['USDC', 'USD Coin', '0xA0b8…eB48', '$1,204,551,230', false], ['USDC', 'USD Coin', '0x7f3c…91d2', '$4,812', true]].map(([s, n, a, l, hi]) => `<div style="display:flex;align-items:center;gap:12px;padding:12px;margin-top:10px;border-radius:10px;${hi ? 'outline:2px solid #2775ca;background:#f0f6ff' : ''}"><div style="width:36px;height:36px;border-radius:50%;background:#2775ca;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px">$</div><div style="flex:1"><b>${s}</b> <span style="color:#777;font-size:13px">${n}</span><div style="font-size:12px;color:#888;${mono}">${a}</div></div><div style="text-align:right;font-size:12px;color:#777">Liquidity<br/><b style="color:#222">${l}</b></div></div>`).join('')}
    <div style="font-size:11px;color:#999;margin-top:12px">The highlighted token is the one the agent selected.</div></div>`,

  'address-poison': `<div style="width:640px;background:#fff;border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.18);padding:24px;font-size:14px">
    <div style="font-weight:700;margin-bottom:6px">Invoice INV-2291 &middot; Pay to</div>
    <div style="${mono};font-size:17px;background:#f6f8fa;padding:12px;border-radius:8px">0x4E83<span>2c91f0aB7d3E5c6A1b9f4d02</span>3F9a</div>
    <div style="font-weight:700;margin:18px 0 6px">Address in the agent's recent transfers</div>
    <div style="${mono};font-size:17px;background:#f6f8fa;padding:12px;border-radius:8px">0x4E83<span>b07Dd19e2A64fC08e5a1c7B3</span>3F9a</div>
    <div style="font-size:12px;color:#888;margin-top:12px">Last transfer from this address: 0.00 USDC, 2 hours ago</div></div>`,

  'approval-unlimited': `<div style="width:380px;background:#fff;border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,.2);overflow:hidden;font-size:14px">
    <div style="background:#f7f7f9;padding:14px 18px;font-weight:700">Signature request</div>
    <div style="padding:18px">
      <div style="color:#666;font-size:12px">Site</div><div style="margin-bottom:12px">swap-bonus.finance</div>
      <div style="color:#666;font-size:12px">Action</div><div style="margin-bottom:12px"><b>Approve</b> spending of your USDC</div>
      <div style="color:#666;font-size:12px">Spending cap</div><div style="margin-bottom:12px;color:#c0392b;font-weight:700">Unlimited</div>
      <div style="color:#666;font-size:12px">Spender</div><div style="${mono};margin-bottom:12px">0x9f3A…c41E (unverified)</div>
      <div style="color:#666;font-size:12px">The agent is trying to</div><div>Swap 20 USDC for ETH</div>
      <div style="display:flex;gap:10px;margin-top:18px"><div style="flex:1;text-align:center;padding:11px;border:1px solid #ccc;border-radius:22px">Reject</div><div style="flex:1;text-align:center;padding:11px;background:#037dd6;color:#fff;border-radius:22px">Confirm</div></div>
    </div></div>`,

  'tx-compare': `<div style="display:flex;gap:18px">${[['A', '0x4E83…3F9a', '250.00'], ['B', '0x4E83…3F9a', '2,500.00']].map(([k, to, amt]) => `<div style="width:300px;background:#fff;border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.18);padding:20px;font-size:14px">
      <div style="font-weight:700;font-size:16px;margin-bottom:12px">Transaction ${k}</div>
      <div style="color:#666;font-size:12px">To</div><div style="${mono};margin-bottom:10px">${to}</div>
      <div style="color:#666;font-size:12px">Amount</div><div style="font-size:22px;font-weight:700;margin-bottom:10px">${amt} USDC</div>
      <div style="color:#666;font-size:12px">Memo</div><div>INV-2291</div></div>`).join('')}</div>`,

  'product-pair': `<div style="display:flex;gap:18px">${[['Apple AirPods Pro (2nd generation) with MagSafe Case (USB&#8209;C)', '$249.00', 'Sold by Apple'], ['AirPods Pro 2 &ndash; USB-C charging case, active noise cancellation', '$189.99', 'Sold by TechDeals Direct']].map(([t, p, s]) => `<div style="width:300px;background:#fff;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.15);padding:18px"><div style="height:150px;border-radius:10px;background:radial-gradient(circle at 40% 45%,#fff 0 22%,#e5e7eb 23% 26%,#f6f7f9 27%)"></div><div style="font-size:14px;margin-top:12px;line-height:1.4">${t}</div><div style="font-size:18px;font-weight:700;margin-top:8px">${p}</div><div style="font-size:12px;color:#777">${s}</div></div>`).join('')}</div>`,

  'listing-watch': `<div style="width:520px;background:#fff;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.15);padding:20px;display:flex;gap:18px">
    <div style="width:170px;height:170px;border-radius:50%;background:radial-gradient(circle,#0b3d2e 0 52%,#c9c9c9 53% 60%,#8a8a8a 61% 64%,#fff 65%)"></div>
    <div style="flex:1;font-size:14px"><b style="font-size:17px">Rolex Submariner Date &ndash; BRAND NEW</b><div style="font-size:22px;font-weight:700;margin:10px 0">$120.00</div>
    <div style="color:#555">Box and papers included. 100% authentic, best price online. Ships worldwide from private seller.</div>
    <div style="font-size:12px;color:#999;margin-top:10px">Seller: luxurydeals_88 &middot; 2 ratings &middot; Joined last week</div></div></div>`,
}

for (const [name, scene] of Object.entries(SCENES)) {
  const file = join(tmp, `${name}.html`)
  writeFileSync(file, `<!doctype html><meta charset="utf-8"><style>${base}</style>${scene}`)
  execFileSync(browser, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--window-size=820,520', `--screenshot=${join(out, `${name}.png`)}`, pathToFileURL(file).href], { stdio: 'ignore' })
  console.log(`drew ${name}.png`)
}
rmSync(tmp, { recursive: true, force: true })
