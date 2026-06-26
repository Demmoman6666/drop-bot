import asyncio
import os
import re
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

def db_fetchone(query, params=()):
    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(query, params)
            return cur.fetchone()

def db_fetch(query, params=()):
    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(query, params)
            return cur.fetchall()

def db_exec(query, params=()):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(query, params)
        conn.commit()

def get_active_drops():
    return db_fetch("SELECT * FROM drops WHERE status = 'monitoring'")

def get_shop(shop_id):
    return db_fetchone("SELECT * FROM shops WHERE id = %s", (shop_id,))

def get_profile(profile_id):
    return db_fetchone("SELECT * FROM profiles WHERE id = %s", (profile_id,))

def write_log(drop_id, level, message):
    log.info(f"[DROP {drop_id}] {message}")
    try:
        db_exec("INSERT INTO logs (drop_id, level, message) VALUES (%s, %s, %s)", (drop_id, level, message))
    except Exception as e:
        log.error(f"Log write failed: {e}")

def set_drop_status(drop_id, status, found_url=''):
    try:
        if found_url:
            db_exec("UPDATE drops SET status=%s, found_url=%s WHERE id=%s", (status, found_url, drop_id))
        else:
            db_exec("UPDATE drops SET status=%s WHERE id=%s", (status, drop_id))
    except Exception as e:
        log.error(f"Status update failed: {e}")

def is_stopped(drop_id):
    row = db_fetchone("SELECT status FROM drops WHERE id=%s", (drop_id,))
    return not row or row['status'] not in ('monitoring','carted','checking_out','searching')

async def notify(msg):
    if not NOTIFY_WEBHOOK or httpx is None:
        return
    try:
        async with httpx.AsyncClient() as client:
            await client.post(NOTIFY_WEBHOOK, json={"content": msg}, timeout=5)
    except Exception as e:
        log.warning(f"Notify failed: {e}")

# ── Login helper ──────────────────────────────────────────────────────────────

async def try_login(page, shop_url, login_email, login_password):
    """Attempt to log in on a site if login credentials are provided."""
    if not login_email or not login_password:
        return False
    try:
        clean = shop_url.rstrip('/')
        # Try common login page URLs
        login_urls = [
            f"{clean}/account/login",
            f"{clean}/login",
            f"{clean}/sign-in",
            f"{clean}/signin",
        ]
        for login_url in login_urls:
            try:
                await page.goto(login_url, wait_until="domcontentloaded", timeout=10000)
                # Try common email/password selectors
                email_selectors = ["#email", "[name=email]", "[type=email]", "#customer_email"]
                pass_selectors = ["#password", "[name=password]", "[type=password]", "#customer_password"]
                submit_selectors = ["[type=submit]", "text=Sign in", "text=Log in", "text=Login", "#login_submit"]
                email_filled = False
                for sel in email_selectors:
                    try:
                        await page.fill(sel, login_email, timeout=2000)
                        email_filled = True
                        break
                    except:
                        continue
                if not email_filled:
                    continue
                for sel in pass_selectors:
                    try:
                        await page.fill(sel, login_password, timeout=2000)
                        break
                    except:
                        continue
                for sel in submit_selectors:
                    try:
                        await page.click(sel, timeout=3000)
                        break
                    except:
                        continue
                await page.wait_for_load_state("domcontentloaded")
                await asyncio.sleep(1.5)
                # Check if login succeeded (not back on login page)
                if "login" not in page.url and "sign-in" not in page.url:
                    return True
            except:
                continue
        return False
    except Exception as e:
        log.warning(f"Login attempt failed: {e}")
        return False

# ── Shopify search ────────────────────────────────────────────────────────────

async def shopify_find_product(shop_url, search_term):
    if httpx is None:
        return None, False
    clean = shop_url.rstrip('/')
    words = search_term.lower().split()
    page = 1
    headers = {"User-Agent": "Mozilla/5.0"}
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=10) as client:
            while page <= 10:
                url = f"{clean}/products.json?limit=250&page={page}"
                resp = await client.get(url, headers=headers)
                if not resp.ok:
                    break
                data = resp.json()
                products = data.get('products', [])
                if not products:
                    break
                for product in products:
                    title = product.get('title', '').lower()
                    if all(w in title for w in words):
                        variants = product.get('variants', [])
                        available = any(v.get('available', False) for v in variants)
                        handle = product.get('handle', '')
                        product_url = f"{clean}/products/{handle}"
                        return product_url, available
                page += 1
    except Exception as e:
        log.warning(f"Shopify search error: {e}")
    return None, False

# ── Non-Shopify search ────────────────────────────────────────────────────────

async def generic_find_product(shop_url, search_term):
    if httpx is None:
        return None
    clean = shop_url.rstrip('/')
    encoded = search_term.replace(' ', '+')
    search_urls = [
        f"{clean}/search?q={encoded}",
        f"{clean}/search?query={encoded}",
        f"{clean}/catalogsearch/result/?q={encoded}",
    ]
    headers = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0 Safari/537.36"}
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=10) as client:
            for search_url in search_urls:
                try:
                    resp = await client.get(search_url, headers=headers)
                    if not resp.ok:
                        continue
                    text = resp.text
                    words = search_term.lower().split()
                    patterns = [
                        r'href="(/products/[^"?#]+)"',
                        r'href="(/shop/[^"?#]+)"',
                        r'href="(/collections/[^/]+/products/[^"?#]+)"',
                        r'href="(/p/[^"?#]+)"',
                    ]
                    for pattern in patterns:
                        matches = re.findall(pattern, text)
                        for match in matches:
                            if any(w in match.lower() for w in words):
                                return f"{clean}{match}"
                except:
                    continue
    except Exception as e:
        log.warning(f"Generic search error: {e}")
    return None

# ── Stock check ───────────────────────────────────────────────────────────────

async def check_stock_url(url, keyword):
    if httpx is None:
        return False
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=10) as client:
            headers = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0 Safari/537.36"}
            resp = await client.get(url, headers=headers)
            text = resp.text.lower()
            if keyword:
                return keyword.lower() in text
            return not any(s in text for s in ["out of stock", "sold out", "unavailable", "notify me when available"])
    except Exception as e:
        log.warning(f"Stock check error: {e}")
        return False

# ── Checkout ──────────────────────────────────────────────────────────────────

async def checkout_browser(drop, profile, shop=None, proxy=None):
    if async_playwright is None:
        log.error("playwright not installed")
        return False
    drop_id = drop['id']
    target_url = drop.get('found_url') or drop.get('url')
    write_log(drop_id, 'info', f"Launching checkout…")
    proxy_config = {"server": proxy} if proxy else None

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, proxy=proxy_config)
        context = await browser.new_context(viewport={"width": 1280, "height": 800}, locale="en-GB")
        page = await context.new_page()
        try:
            # Attempt login if credentials exist for this shop
            if shop and shop.get('login_email') and shop.get('login_password'):
                write_log(drop_id, 'info', "Attempting site login…")
                logged_in = await try_login(page, shop['url'], shop['login_email'], shop['login_password'])
                if logged_in:
                    write_log(drop_id, 'info', "Logged in successfully")
                else:
                    write_log(drop_id, 'info', "Login failed or not needed — continuing as guest")

            await page.goto(target_url, wait_until="domcontentloaded", timeout=20000)

            # Check if we hit a login wall mid-checkout
            if "login" in page.url or "sign-in" in page.url:
                if shop and shop.get('login_email'):
                    write_log(drop_id, 'info', "Login wall detected — logging in…")
                    await try_login(page, shop['url'], shop['login_email'], shop['login_password'])
                    await page.goto(target_url, wait_until="domcontentloaded", timeout=20000)

            atc = drop.get('atc_selector') or "text=Add to cart"
            await page.wait_for_selector(atc, timeout=10000)
            await page.click(atc)
            write_log(drop_id, 'info', "Added to cart")
            await asyncio.sleep(1)

            for sel in ["text=Checkout", "text=Proceed to checkout", "#checkout", ".checkout-btn"]:
                try: await page.click(sel, timeout=3000); break
                except: continue

            await page.wait_for_load_state("domcontentloaded")

            # Check for login wall at checkout
            if "login" in page.url or "sign-in" in page.url:
                if shop and shop.get('login_email'):
                    write_log(drop_id, 'info', "Login required at checkout — logging in…")
                    await try_login(page, shop['url'], shop['login_email'], shop['login_password'])
                    for sel in ["text=Checkout", "text=Proceed to checkout", "#checkout"]:
                        try: await page.click(sel, timeout=3000); break
                        except: continue
                    await page.wait_for_load_state("domcontentloaded")

            # Fill address fields
            fields = {
                "#email": profile.get('email',''),
                "#first-name": profile.get('first_name',''),
                "#last-name": profile.get('last_name',''),
                "#address1": profile.get('address1',''),
                "#city": profile.get('city',''),
                "#zip": profile.get('postcode',''),
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

            # Fill card fields
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

            write_log(drop_id, 'warn', "Could not click submit")
            return False

        except Exception as e:
            write_log(drop_id, 'error', f"Checkout error: {e}")
            return False
        finally:
            await browser.close()

# ── Monitor loop ──────────────────────────────────────────────────────────────

async def monitor_drop(drop):
    drop_id = drop['id']
    name = drop['name']
    interval = int(drop.get('monitor_interval', 3))
    qty = int(drop.get('quantity', 1))
    drop_mode = drop.get('drop_mode', 'url')
    check_count = 0

    write_log(drop_id, 'info', f"Started — mode: {drop_mode} — interval: {interval}s — qty: {qty}")
    await notify(f"Monitoring: {name}")

    shop = None
    if drop.get('shop_id'):
        shop = get_shop(drop['shop_id'])

    while True:
        if is_stopped(drop_id):
            write_log(drop_id, 'info', "Stopped")
            return

        in_stock = False
        product_url = None

        if drop_mode == 'search' and shop:
            if shop['is_shopify']:
                product_url, in_stock = await shopify_find_product(shop['url'], drop.get('search_term',''))
                check_count += 1
                if not product_url and check_count % 20 == 0:
                    write_log(drop_id, 'info', f"Product not listed yet… ({check_count} checks)")
                elif product_url and not in_stock and check_count % 20 == 0:
                    write_log(drop_id, 'info', f"Found — waiting for stock… ({check_count} checks)")
            else:
                product_url = await generic_find_product(shop['url'], drop.get('search_term',''))
                if product_url:
                    in_stock = await check_stock_url(product_url, 'add to cart')
                check_count += 1
                if check_count % 20 == 0:
                    write_log(drop_id, 'info', f"Searching… ({check_count} checks)")
        else:
            in_stock = await check_stock_url(drop.get('url',''), drop.get('keyword',''))
            check_count += 1
            if check_count % 20 == 0:
                write_log(drop_id, 'info', f"Still monitoring… ({check_count} checks)")

        if in_stock:
            found = product_url or drop.get('url','')
            write_log(drop_id, 'info', f"STOCK DETECTED — {found} — buying x{qty}")
            await notify(f"STOCK: {name} — buying x{qty}")
            set_drop_status(drop_id, 'carted', found)
            profile = get_profile(drop['profile_id'])
            if not profile:
                write_log(drop_id, 'error', "No profile found")
                set_drop_status(drop_id, 'error')
                return
            set_drop_status(drop_id, 'checking_out', found)
            drop_copy = dict(drop)
            drop_copy['found_url'] = found
            tasks = [checkout_browser(drop_copy, dict(profile), shop) for _ in range(qty)]
            results = await asyncio.gather(*tasks, return_exceptions=True)
            success = sum(1 for r in results if r is True)
            final = 'success' if success > 0 else 'error'
            write_log(drop_id, final, f"Done — {success}/{qty} orders placed")
            set_drop_status(drop_id, final, found)
            return

        await asyncio.sleep(interval)

# ── Main ──────────────────────────────────────────────────────────────────────

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
            running = running & {d['id'] for d in active_drops}
        except Exception as e:
            log.error(f"Main loop error: {e}")
        await asyncio.sleep(10)

if __name__ == "__main__":
    asyncio.run(main())
