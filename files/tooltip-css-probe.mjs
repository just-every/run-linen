import {chromium} from '/workspace/run-linen/node_modules/playwright/index.mjs';
import {readFile} from 'node:fs/promises';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try {
 const page=await browser.newPage();
 await page.setContent('<button data-tip="Your account">Account</button>');
 await page.addStyleTag({content:await readFile('/workspace/run-linen/src/styles/base.css','utf8')});
 const tip=page.locator('button');
 const sample=label=>tip.evaluate((e,label)=>({label,duration:getComputedStyle(e,'::after').transitionDuration,delay:getComputedStyle(e,'::after').transitionDelay,reduced:matchMedia('(prefers-reduced-motion: reduce)').matches}),label);
 await tip.hover(); console.log(JSON.stringify(await sample('hover, normal motion')));
 await page.emulateMedia({reducedMotion:'reduce'});console.log(JSON.stringify(await sample('hover, reduced motion')));
} finally {await browser.close();}
