import assert from 'node:assert/strict';

export async function captureCommitment(page, options) {
    await page.waitForFunction(()=>!document.querySelector('.loading'));
    await page.evaluate(()=>document.fonts.ready);
    await page.waitForFunction(()=>[...document.images].every(image=>image.complete));
    const previous=page.viewportSize();
    try {
        for(const width of [1440,390,320]) {
            await page.setViewportSize({width,height:width===1440?1000:844});
            await page.keyboard.press('Tab');
            assert.notEqual(await page.evaluate(()=>document.activeElement?.tagName),'BODY');
            await page.getByRole('button',{name:'Your workspace and account'}).focus();
            await page.evaluate(()=>window.scrollTo(0,0));
            await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
            assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${width}px overflow`);
            assert.equal(await page.locator('.commitment-observation').evaluateAll(rows=>rows.every(row=>{
                const name=row.querySelector('strong').getBoundingClientRect(),observation=row.querySelector('small').getBoundingClientRect();
                return name.bottom<=observation.top;
            })),true,'Beneficiary and observation remain separately readable');
            await page.screenshot({...options,path:width===1440?options.path:options.path.replace(/\.png$/,`-${width}px.png`)});
        }
    } finally {await page.setViewportSize(previous);}
}
