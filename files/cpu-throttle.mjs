// Browser-only load reproduction: do not create host CPU-burn processes.
import {createRequire} from 'node:module';
const require=createRequire('/workspace/run-linen/package.json');
const {chromium}=require('playwright');
const launch=chromium.launch.bind(chromium);
chromium.launch=async(...args)=>{
  const browser=await launch(...args);
  const throttle=async page=>{
    const session=await page.context().newCDPSession(page);
    await session.send('Emulation.setCPUThrottlingRate',{rate:4});
    return page;
  };
  const newContext=browser.newContext.bind(browser);
  browser.newContext=async(...args)=>{
    const context=await newContext(...args),newPage=context.newPage.bind(context);
    context.newPage=async(...args)=>throttle(await newPage(...args));
    return context;
  };
  const newPage=browser.newPage.bind(browser);
  browser.newPage=async(...args)=>throttle(await newPage(...args));
  console.log('BROWSER_CPU_THROTTLE rate=4');
  return browser;
};
