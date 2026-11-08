import assert from 'node:assert/strict';

// Shared by the service-desk entrypoint and focused transition-flake proof.
export async function offlineReplyJourney({page, context}) {
  await context.setOffline(true);
  await page
    .getByLabel("Keep the conversation going")
    .fill("Still not working while offline");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  // A background refresh and the failed submission can display the same
  // notice together. Wait for visible feedback in the reply form without a
  // strict single-message locator racing those independently rendered errors.
  await page.waitForFunction(() => {
    const form = document.querySelector('form.composer');
    return form && !form.querySelector('button.send').disabled &&
      [...form.querySelectorAll('[role="alert"]')].some(notice =>
        notice.checkVisibility() && notice.textContent.includes('Linen could not reach the service.'));
  });
  assert.equal(
    await page.getByLabel("Keep the conversation going").inputValue(),
    "Still not working while offline",
  );
  await context.setOffline(false);
}
