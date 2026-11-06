import { chromium } from "playwright";
import { preview, executablePath } from "./preview-utils.mjs";
const server = await preview();
const browser = await chromium.launch({
  headless: true,
  ...(executablePath ? { executablePath } : {}),
});
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
  });
  await page.route("https://api.squeekchain.com/**", (route) =>
    route.fulfill({ status: 503, contentType: "application/json", body: "{}" }),
  );
  await page.goto(server.url);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(
    () =>
      document
        .querySelector("canvas")
        ?.getContext("2d")
        ?.getImageData(269, 127, 1, 1).data[3] > 0,
  );
  await page.evaluate(() => {
    const art = document.querySelector("canvas").toDataURL();
    document.body.innerHTML = `<div class="share-layout"><div class="share-copy"><div class="share-brand"><img src="./favicon.svg" width="48" height="48"/><div>Squeek Escape<span>Overdrive ↗</span></div></div><h1>Bail before<br/>he stops.</h1><p>The hamster-powered arcade.</p><div class="share-footer">Ride the wheel. Make your escape.</div></div><div class="share-art"><img src="${art}"/><div><span class="share-dot"></span>One tiny power plant.<span>Sepolia testnet</span></div></div></div>`;
    const style = document.createElement("style");
    style.textContent = `body{width:1200px;height:630px;margin:0;background:#101311}.share-layout{height:100%;padding:52px;display:grid;grid-template-columns:500px 1fr;gap:0;align-items:center}.share-brand{display:flex;align-items:center;gap:14px;font-size:24px;font-weight:700;line-height:1.1}.share-brand span{display:block;font-size:16px;font-weight:600;color:#c3f85c;margin-top:6px}.share-copy h1{font-size:76px;line-height:1.05;letter-spacing:-.05em;margin-top:56px}.share-copy>p{font-size:24px;color:#a3ae9e;margin-top:22px}.share-footer{font-size:16px;color:#a3ae9e;margin-top:36px}.share-art{height:432px;background:#111d17;border:1px solid #323c31;border-radius:12px;overflow:hidden;position:relative}.share-art>img{height:100%;width:100%;object-fit:cover;object-position:61% 50%;image-rendering:pixelated}.share-art>div{position:absolute;bottom:0;padding:16px 20px;background:#171c18;width:100%;display:flex;align-items:center;gap:8px;font-size:12px;color:#c5d2b8}.share-art>div>span:last-child{margin-left:auto;color:#a3ae9e}.share-dot{width:6px;height:6px;border-radius:50%;background:#c3f85c}`;
    document.head.appendChild(style);
  });
  await page.screenshot({ path: "public/social-card.png" });
  console.log(
    "Generated public/social-card.png (1200 × 630). Rebuild to copy into dist/.",
  );
} finally {
  await browser.close();
  await server.close();
}
