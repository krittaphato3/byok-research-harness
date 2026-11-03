"""
Playwright End-to-End Automated Browser Test.
Verifies WebUI layout, run dispatch, SSE streaming, and live markdown rendering.
"""

import sys
from playwright.sync_api import sync_playwright, expect


def test_research_workbench_e2e():
    print("Launching headless Chromium...")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # 1. Navigate to WebUI
        print("Navigating to http://localhost:8000...")
        page.goto("http://localhost:8000", wait_until="networkidle")

        # 2. Check title and UI elements
        expect(page).to_have_title("BYOK AI Research Harness")
        print("Page title verified.")

        # Check top status bar
        expect(page.get_by_text("[BYOK Harness]", exact=True)).to_be_visible()
        expect(page.get_by_text("SQLite FTS5", exact=True)).to_be_visible()
        expect(page.locator("header")).to_contain_text("VAULT:")
        print("Status bar and Vault badge verified.")

        # 3. Enter research prompt
        prompt_box = page.locator("#prompt-input")
        prompt_box.fill("Explain SQLite FTS5 BM25 scoring in one concise paragraph")

        # 4. Dispatch Run
        dispatch_btn = page.locator("#dispatch-btn")
        print("Clicking DISPATCH RUN...")
        dispatch_btn.click()

        # 5. Wait for streaming to complete
        status_label = page.locator("#stream-status")
        print("Waiting for streaming completion...")
        expect(status_label).to_have_text("COMPLETED", timeout=45000)

        # 6. Verify streamed content
        content_box = page.locator("#stream-content")
        text = content_box.inner_text()
        print(f"\nStreamed Output Captured ({len(text)} chars):\n{text[:300]}...")
        assert len(text.strip()) > 50, "Streamed output was too short or empty."

        # 7. Take screenshot artifact
        screenshot_path = "tests/playwright_live_stream_passed.png"
        page.screenshot(path=screenshot_path)
        print(f"\nScreenshot saved to: {screenshot_path}")

        browser.close()
        print("\nPLAYWRIGHT E2E TEST GREEN: Browser interaction and SSE streaming verified.")


if __name__ == "__main__":
    test_research_workbench_e2e()
