# Browser transition audit

Scope: tests only, with sources.lock.json regenerated last. No application, contract, generated acceptance view, workflow, dependency or release changes.

The search covered `opacity`, `getComputedStyle`, `toHaveCSS`, `transform`, and fixed browser sleeps in tests. No transform or toHaveCSS assertion needed repair.

| File | Prior timing assumption | Result |
| --- | --- | --- |
| tests/ui/service-notice-journey.mjs | Sampled hover opacity after 420 ms; read focus opacity immediately | Wait for exact computed opacity 1; keep 300 ms hover delay and zero-duration focus assertions |
| tests/ui/browser.mjs | Strict text locator assumed one offline notice | Poll visible network-error feedback inside the reply form and completed submission; keep unchanged unsent draft assertion |
| tests/ui/mailbox-journey.mjs | Sampled hidden/visible opacity after 120/400 ms | Capture hidden start within mouseenter, wait for settled 1 and 0, retain 300 ms delay and add explicit zero-duration keyboard proof |
| tests/ui/billing-browser.mjs | Sampled opacity immediately on focus and after 420 ms hover | Wait for exact focus/hover end state; retain focus-visible, hover delay and foreground/background contrast assertions and explicitly require zero-duration keyboard focus |
| tests/ui/commitment-restart.mjs | Sampled focus, fade-out and hover at fixed delays | Wait for exact end states; assert hidden hover start and explicit 300 ms hover delay |
| tests/ui/department-role-journey.mjs | Sampled hover start after driver round-trip and focus immediately | Capture start inside browser mouseenter and poll exact opacity; retain tooltip label/content, delay and immediate focus styling |
| tests/ui/okta-browser.mjs | Sampled opacity immediately on focus | Same settled-state helper, including reset before hover and explicit zero-duration keyboard focus |
| tests/ui/sandbox-journey.mjs | Sampled opacity immediately on focus | Same settled-state helper, including reset before hover and explicit zero-duration keyboard focus |

The new transition helper uses Playwright waitForFunction with the existing default deadline. It does not extend timeouts, retry failed journeys, suppress errors, skip tests or disable CSS transitions. Capturing hover start in the mouseenter event keeps that assertion independent of driver scheduling latency. A disconnected control cannot satisfy the settled-opacity condition.

Other computed-style reads are static brand custom properties and message-preview border color. They do not sample opacity, transforms or a fading element. Timing waits for scheduled provider readback, evidence freshness and active-effort measurement are unrelated to CSS transitions and remain unchanged.

The offline source has separate background-read and mutation error notices, so two copies can coexist. Strict text uniqueness is unrelated to the user-visible guarantee. The new condition requires a visible network error in the reply form after its Send control is enabled again; the existing assertion still proves that the submitted draft remains intact.

Held live-provider Okta and commitment restart journeys are not invoked: no held provider keys were admitted by this task. Their tooltip helper is covered on the same product account control by the ordinary browser journeys; no live-provider acceptance is claimed.

The offline section was extracted intact into tests/ui/offline-reply-journey.mjs and is called by the existing employee browser entrypoint. This adds no registered test and permits direct repetition of the actual changed journey. The evidence-only focused driver invokes the original monitoring and mailbox functions plus this offline helper, without mocks of their product UI.
