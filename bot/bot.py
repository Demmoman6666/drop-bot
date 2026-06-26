import asyncio
import os
import logging
import psycopg2
import psycopg2.extras

try:
    import httpx
except ImportError:
    httpx = None

try:
    from playwright.async_api import async_playwright
except ImportError:
    async_playwright = None

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("dropbot")

DATABASE_URL = os.environ.get("DATABASE_URL", "")
NOTIFY_WEBHOOK = os.environ.get("NOTIFY_WEBHOOK", "")

def get_conn():
    return psycopg2.connect(DATABASE_URL, sslmode='require')

def get_active_drops():
    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT * FROM drops WHERE status = 'monitoring'")
            return cur.fetchall()

def get_profile(profile_id):
    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT * FROM profiles WHERE id = %s", (profile_id,))
            return cur.fetchone()

def write_log(drop_id, level, message):
    log.info(f"[DROP {drop_id}] {message}")
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("INSERT INTO logs (drop_id, level, message) VALUES (%s, %s, %s)", (drop_id, level, message))
            conn.commit()
    except Exception as e:
        log.error(f"Failed to write log: {e}")

def set_drop_status(drop_id, status):
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("UPDATE drops SET status = %s WHERE id = %s", (status, drop_id))
            conn.commit()
    except Exception as e:
        log.error(f"Failed to update status: {e}")

async def notify(msg):
    if not NOTIFY_WEBHOOK or httpx is None:
        return
    try:
        async with httpx.AsyncClient() as client:
            await client.post(NOTIFY_WEBHOOK, json={"content": msg}, timeout=5)
    except Exception as e:
        log.warning(f"Notify failed: {e}")

async def check_stock(url, keyword, proxy=None):
    if httpx is None:
        return False
    try:
        transport = httpx.AsyncHTTPTransport(proxy=proxy) if proxy else None
        async with httpx.AsyncClient(transport=transport, follow_redirects=True, timeout=10) as client:
            headers = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0 Safari/537.36"}
            resp = await client.get(url, headers=headers)
            text = resp.text.lower()
            if keyword:
                return keyword.lower() in text
            return not any(s in text for s in ["out of stock", "sold out", "unavailable", "notify me when available"])
    except Exception as e:
        log.warning(f"Stock check error: {e}")
        return False

async def checkout_browser(drop, profile, proxy=None):
    if async_playwright is None:
        log.error("playwright not installed")
        return False
    drop_id = drop['id']
    write_log(drop_id, 'info', "Launching browser checkout…")
    proxy_config = {"server": proxy} if proxy else None
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, proxy=proxy_config)
        context = await browser.new_context(viewport={"width": 1280, "height": 800}, locale="en-GB")
        page = await context.new_page()
        try:
            await page.goto(drop['url'], wait_until="domcontentloaded", timeout=20000)
            atc = drop.get('atc_selector') or "text=Add to cart"
            await page.wait_for_selector(atc, timeout=10000)
            await page.click(atc)
            write_log(drop_id, 'info', "Added to cart")
            await asyncio.sleep(1)
            for sel in ["text=Checkout", "text=Proceed to checkout", "#checkout", ".checkout-btn"]:
                try: await page.click(sel, timeout=3000); break
                except: continue
            await page.wait_for_load_state("domcontentloaded")
            fields = {
                "#email": profile.get('email',''), "#first-name": profile.get('first_name',''),
                "#last-name": profile.get('last_name',''), "#address1": profile.get('address1',''),
                "#city": profile.get('city',''), "#zip": profile.get('postcode',''),
                "#phone": profile.get('phone',''),
            }
            for sel, val in fields.items():
                if val:
                    try: await page.fill(sel, val, timeout=2000)
                    except: pass
            for sel in ["text=Continue to payment", "text=Continue to shipping", "#continue"]:
                try: await page.click(sel, timeout=3000); break
                except: pass
            await asyncio.sleep(1.5)
            card_fields = {
                "#card-number": profile.get('card_number','').replace(' ',''),
                "#card-expiry": profile.get('card_expiry',''),
                "#card-cvv": profile.get('card_cvv',''),
                "[name=number]": profile.get('card_number','').replace(' ',''),
                "[name=expiry]": profile.get('card_expiry',''),
                "[name=verification_value]": profile.get('card_cvv',''),
            }
            for sel, val in card_fields.items():
                if val:
                    try: await page.fill(sel, val, timeout=2000)
                    except: pass
            for sel in ["text=Pay now", "text=Place order", "text=Complete order", "#pay-now", "[type=submit]"]:
                try:
                    await page.click(sel, timeout=3000)
                    write_log(drop_id, 'success', f"ORDER PLACED: {drop['name']}")
                    await notify(f"ORDER PLACED: {drop['name']}")
                    await asyncio.sleep(3)
                    return True
                except: continue
            write_log(drop_id, 'warn', "Could not click submit button")
            return False
        except Exception as e:
            write_log(drop_id, 'error', f"Checkout error: {e}")
            return False
        finally:
            await browser.close()

async def monitor_drop(drop):
    drop_id = drop['id']
    name = drop['name']
    interval = int(drop.get('monitor_interval', 3))
    qty = int(drop.get('quantity', 1))
    check_count = 0
    write_log(drop_id, 'info', f"Started monitoring every {interval}s — qty: {qty}")
    await notify(f"Monitoring: {name}")
    while True:
        try:
            with get_conn() as conn:
                with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                    cur.execute("SELECT status FROM drops WHERE id = %s", (drop_id,))
                    row = cur.fetchone()
                    if not row or row['status'] not in ('monitoring', 'carted', 'checking_out'):
                        write_log(drop_id, 'info', "Stopped")
                        return
        except Exception as e:
            log.warning(f"DB check failed: {e}")
        in_stock = await check_stock(drop['url'], drop.get('keyword', ''))
        check_count += 1
        if check_count % 20 == 0:
            write_log(drop_id, 'info', f"Still monitoring… ({check_count} checks)")
        if in_stock:
            write_log(drop_id, 'info', f"STOCK DETECTED — buying x{qty}")
            await notify(f"STOCK DETECTED: {name}")
            set_drop_status(drop_id, 'carted')
            profile = get_profile(drop['profile_id'])
            if not profile:
                write_log(drop_id, 'error', "No profile found")
                set_drop_status(drop_id, 'error')
                return
            set_drop_status(drop_id, 'checking_out')
            tasks = [checkout_browser(dict(drop), dict(profile)) for _ in range(qty)]
            results = await asyncio.gather(*tasks, return_exceptions=True)
            success = sum(1 for r in results if r is True)
            final = 'success' if success > 0 else 'error'
            write_log(drop_id, final, f"Done — {success}/{qty} orders placed")
            set_drop_status(drop_id, final)
            return
        await asyncio.sleep(interval)

async def main():
    log.info("Drop Bot starting…")
    running = set()
    while True:
        try:
            active_drops = get_active_drops()
            for drop in active_drops:
                if drop['id'] not in running:
                    running.add(drop['id'])
                    asyncio.create_task(monitor_drop(dict(drop)))
        except Exception as e:
            log.error(f"Main loop error: {e}")
        await asyncio.sleep(10)

if __name__ == "__main__":
    asyncio.run(main())
