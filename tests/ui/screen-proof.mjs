/** Save the same changed screen at both review widths, then restore the journey viewport. */
export async function captureScreens(page, options) {
  const previous = page.viewportSize();
  await page.evaluate(() => document.fonts.ready);
  try {
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ ...options, path: options.path.replace(/\.png$/, `-${width}px.png`) });
    }
  } finally {
    await page.setViewportSize(previous);
  }
}
