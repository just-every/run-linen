import assert from 'node:assert/strict';

// Wait for the computed end state, including the tooltip's hover delay and fade.
export async function waitForTooltipOpacity(control, opacity) {
  const element = await control.elementHandle();
  try {
    const settled = await control.page().waitForFunction(
      ({element, opacity}) => element.isConnected && getComputedStyle(element, '::after').opacity === opacity,
      {element, opacity},
    );
    await settled.dispose();
  } finally { await element.dispose(); }
}

// Read the start of hover in the browser event, before a delayed driver can
// sample a later animation frame. Keep proving that hover starts hidden.
export async function hoverTooltip(control) {
  const page = control.page();
  await control.evaluate(element => element.blur());
  await page.mouse.move(0, 0);
  await waitForTooltipOpacity(control, '0');
  await control.evaluate(element => {
    element.addEventListener('mouseenter', () => {
      element.dataset.tooltipStartOpacity = getComputedStyle(element, '::after').opacity;
    }, {once: true});
  });
  await control.hover();
  assert.equal(await control.getAttribute('data-tooltip-start-opacity'), '0', 'Tooltip stays hidden at the start of hover');
  await waitForTooltipOpacity(control, '1');
}
