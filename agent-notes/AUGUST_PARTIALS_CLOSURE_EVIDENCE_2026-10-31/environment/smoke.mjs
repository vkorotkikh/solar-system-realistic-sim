import assert from 'node:assert/strict';
import { webkit } from '/home/nomad/ai/projects/worktrees/solar-close-partials-20261031/node_modules/playwright/index.mjs';
const browser = await webkit.launch({headless:true,timeout:20000,executablePath:'/home/nomad/.cache/solar-webkit-noble-20261101/browsers/webkit-2370/pw_run.sh'});
try {
 const page=await browser.newPage({viewport:{width:640,height:480}});
 await page.setContent('<title>WebKit runtime restored</title><button id="probe" onclick="this.textContent=\'passed\'">Run check</button><canvas id="pixel" width="2" height="2"></canvas>');
 await page.locator('#probe').click();
 const text=await page.locator('#probe').textContent(); assert.equal(text,'passed');
 const result=await page.evaluate(()=>{const c=document.querySelector('#pixel').getContext('2d');c.fillStyle='rgb(23,45,67)';c.fillRect(0,0,2,2);return {userAgent:navigator.userAgent,pixel:Array.from(c.getImageData(0,0,1,1).data)}});
 assert.deepEqual(result.pixel,[23,45,67,255]);
 await page.screenshot({path:'/home/nomad/.cache/solar-webkit-noble-20261101/smoke.png'});
 console.log(JSON.stringify({browser:browser.version(),title:await page.title(),button:text,...result},null,2));
} finally { await browser.close(); }
