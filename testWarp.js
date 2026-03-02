import puppeteer from 'puppeteer';

(async () => {
    console.log('Starting puppeteer tests...');
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();

    let hasErrors = false;
    page.on('console', msg => {
        if (msg.type() === 'error') {
            hasErrors = true;
            console.error(`Browser Console Error: ${msg.text()}`);
        }
    });

    page.on('pageerror', error => {
        hasErrors = true;
        console.error(`Page Error: ${error.message}`);
    });

    console.log('Navigating to http://localhost:5173/');
    await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2' });

    console.log('Waiting 2 seconds for initial render...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Trigger the H29 Warp Wave event
    console.log('Selecting H29 Preset...');
    await page.select('#agn-preset', 'SgrA_WarpWave_H29');

    console.log('Selecting H29 Hypothesis...');
    await page.select('#agn-hypothesis', 'h29');

    console.log('Clicking trigger button...');
    await page.click('#trigger-agn-shockwave');

    console.log('Waiting 10 seconds for warp wave visual sequence...');
    await new Promise(resolve => setTimeout(resolve, 10000));

    await browser.close();

    if (hasErrors) {
        console.error('Test completed with console errors.');
        process.exit(1);
    } else {
        console.log('Test completed successfully. No console errors found.');
        process.exit(0);
    }
})();
