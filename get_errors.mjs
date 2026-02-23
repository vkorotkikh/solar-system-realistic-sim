import puppeteer from 'puppeteer';

(async () => {
    const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.goto('http://localhost:5175/', { waitUntil: 'networkidle0', timeout: 30000 }).catch(e => console.log(e));
    await new Promise(r => setTimeout(r, 3000));
    await page.screenshot({ path: 'debug_screenshot_full.png' });
    await browser.close();
    console.log("Screenshot saved to debug_screenshot_full.png");
})();
