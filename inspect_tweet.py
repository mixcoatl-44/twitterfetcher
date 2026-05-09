import os
import asyncio
from playwright.async_api import async_playwright

TWEET_URL = os.environ["TWEET_URL"]
CT0 = os.environ.get("TWITTER_CT0", "")
AUTH_TOKEN = os.environ.get("TWITTER_AUTH_TOKEN", "")

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        page = await context.new_page()

        # Set authentication cookies if provided
        if CT0 and AUTH_TOKEN:
            await context.add_cookies([
                {"name": "ct0", "value": CT0, "domain": ".x.com", "path": "/"},
                {"name": "auth_token", "value": AUTH_TOKEN, "domain": ".x.com", "path": "/"},
            ])
            print("✅ Twitter cookies set")

        print(f"🔗 Navigating to {TWEET_URL}")
        # Use domcontentloaded to avoid the never‑ending networkidle
        await page.goto(TWEET_URL, wait_until="domcontentloaded", timeout=30000)

        # Try to wait for the tweet container (with a longer timeout)
        try:
            await page.wait_for_selector('[data-testid="tweet"]', timeout=20000)
        except Exception as e:
            print(f"⚠️  Tweet element not found: {e}")
            # Save screenshot and HTML for debugging
            await page.screenshot(path="debug.png", full_page=True)
            with open("tweet.html", "w", encoding="utf-8") as f:
                f.write(await page.content())
            print("📸 Screenshot and HTML saved for debugging")
            await browser.close()
            return

        # Extract the first tweet element's outer HTML
        tweet = await page.query_selector('[data-testid="tweet"]')
        outer = await tweet.evaluate("el => el.outerHTML") if tweet else ""

        with open("tweet.html", "w", encoding="utf-8") as f:
            f.write(outer)
        print("📄 Saved tweet HTML to tweet.html")

        # Extract all links
        links = await page.eval_on_selector(
            '[data-testid="tweet"]',
            """(el) => {
                const anchors = el.querySelectorAll('a');
                return Array.from(anchors).map(a => ({
                    href: a.href,
                    text: a.textContent.trim().substring(0, 80)
                }));
            }"""
        )
        with open("links.txt", "w", encoding="utf-8") as f:
            for i, link in enumerate(links, 1):
                f.write(f"{i}. {link['href']}\n   Text: {link['text']}\n\n")
        print(f"🔗 Extracted {len(links)} links → links.txt")

        await browser.close()

asyncio.run(main())
