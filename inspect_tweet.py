import os
import asyncio
from playwright.async_api import async_playwright

TWEET_URL = os.environ["TWEET_URL"]
CT0 = os.environ.get("TWITTER_CT0", "")
AUTH_TOKEN = os.environ.get("TWITTER_AUTH_TOKEN", "")

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()

        # Set authentication cookies if provided
        if CT0 and AUTH_TOKEN:
            await context.add_cookies([
                {
                    "name": "ct0",
                    "value": CT0,
                    "domain": ".x.com",
                    "path": "/",
                },
                {
                    "name": "auth_token",
                    "value": AUTH_TOKEN,
                    "domain": ".x.com",
                    "path": "/",
                },
            ])
            print("✅ Twitter cookies set")

        page = await context.new_page()
        print(f"🔗 Navigating to {TWEET_URL}")
        await page.goto(TWEET_URL, wait_until="networkidle", timeout=60000)

        # Wait for the tweet to appear
        try:
            await page.wait_for_selector('[data-testid="tweet"]', timeout=15000)
        except Exception as e:
            print(f"⚠️  Tweet element not found: {e}")
            # Save page HTML for debugging
            with open("tweet.html", "w", encoding="utf-8") as f:
                f.write(await page.content())
            await browser.close()
            return

        # Extract the first tweet element
        tweet = await page.query_selector('[data-testid="tweet"]')
        html = await tweet.inner_html() if tweet else ""
        outer = await tweet.evaluate("el => el.outerHTML") if tweet else ""

        # Save full tweet HTML
        with open("tweet.html", "w", encoding="utf-8") as f:
            f.write(outer)
        print("📄 Saved tweet HTML to tweet.html")

        # Extract all links (anchors) inside the tweet
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
