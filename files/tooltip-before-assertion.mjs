import {chromium} from '/workspace/run-linen/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const css=execFileSync('git',['show','origin/main:src/styles/base.css'],{cwd:'/workspace/run-linen',encoding:'utf8'});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try {
 const page=await browser.newPage();
 await page.setContent('<button class="profile" aria-label="Your workspace and account" data-tip="Your account">Account</button>');
 await page.addStyleTag({content:css});
 const profile=page.getByRole('button',{name:'Your workspace and account',exact:true});
 await profile.hover();
 await page.waitForFunction(()=>getComputedStyle(document.querySelector('button'),'::after').opacity==='1');
 console.log('Original main CSS, normal-motion hover, after tooltip settles; same duration equality as response-journey.mjs:53');
 assert.equal(await profile.evaluate(element=>getComputedStyle(element,'::after').transitionDuration),'0s');
} finally {await browser.close();}
