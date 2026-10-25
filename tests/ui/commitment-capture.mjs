import {captureJourney} from './viewport-evidence.mjs';

export async function captureCommitment(page, options) {
    await page.getByRole('button',{name:'Your workspace and account'}).focus();
    await page.evaluate(()=>window.scrollTo(0,0));
    await captureJourney(page, options);
}
