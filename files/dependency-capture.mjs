// VM-only evidence selection. Normal Verify does not capture these screenshots.
// Preserve every browser action and assertion, and capture this clause's pages.
import {chromium} from './repo/node_modules/playwright/index.mjs';
const launch=chromium.launch.bind(chromium);
const configured=new WeakSet();
function configurePage(page) {
  if(configured.has(page))return;
  configured.add(page);
  const screenshot=page.screenshot.bind(page);
  page.screenshot=options=>{
    const path=options?.path;
    if(path&&!path.includes('/ASSET-009-')&&!path.endsWith('/failure.png'))return Promise.resolve(Buffer.alloc(0));
    return screenshot(options);
  };
}
chromium.launch=async(...args)=>{
  const browser=await launch(...args);
  const newContext=browser.newContext.bind(browser);
  browser.newContext=async(...args)=>{
    const context=await newContext(...args);
    context.on('page',configurePage);
    return context;
  };
  return browser;
};
