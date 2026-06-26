'use client';
import { useState, useEffect, useCallback, useRef } from 'react';

type Shop = { id: number; name: string; url: string; is_shopify: boolean; search_selector: string; login_email: string; login_password: string; };
type Drop = { id: number; name: string; url: string; shop_id: number | null; search_term: string; drop_mode: string; monitor_interval: number; quantity: number; profile_id: number | null; use_proxy: boolean; keyword: string; atc_selector: string; checkout_mode: string; status: string; found_url: string; };
type Profile = { id: number; name: string; first_name: string; last_name: string; email: string; phone: string; address1: string; address2: string; city: string; postcode: string; country: string; card_name: string; card_number: string; card_expiry: string; card_cvv: string; };
type Log = { id: number; drop_id: number | null; level: string; message: string; created_at: string; };

const STATUS: Record<string, { bg: string; color: string; label: string }> = {
  idle: { bg: '#1a1a1a', color: '#888', label: 'Idle' },
  searching: { bg: '#1a1a2b', color: '#a78bfa', label: 'Searching…' },
  monitoring: { bg: '#0d2b1a', color: '#4ade80', label: 'Monitoring' },
  carted: { bg: '#0d1f2b', color: '#60a5fa', label: 'Carted' },
  checking_out: { bg: '#2b2b0d', color: '#facc15', label: 'Checking out' },
  success: { bg: '#0d2b0d', color: '#4ade80', label: 'Order placed ✓' },
  error: { bg: '#2b0d0d', color: '#f87171', label: 'Error' },
};

const card = { background: '#141414', border: '0.5px solid #2a2a2a', borderRadius: 12, padding: '1rem 1.25rem' };
const inp = { background: '#1a1a1a', border: '0.5px solid #333', borderRadius: 8, color: '#e5e5e5', fontFamily: 'inherit', fontSize: 13, padding: '7px 10px', width: '100%', boxSizing: 'border-box' as const };
const btn = (extra?: object) => ({ background: '#1a1a1a', border: '0.5px solid #333', borderRadius: 8, color: '#e5e5e5', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, padding: '7px 14px', ...extra });

function Badge({ status }: { status: string }) {
  const s = STATUS[status] || STATUS.idle;
  return <span style={{ background: s.bg, color: s.color, fontSize: 11, fontWeight: 500, padding: '3px 10px', borderRadius: 20, border: `0.5px solid ${s.color}44`, display: 'inline-block', fontFamily: 'monospace' }}>{s.label}</span>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: '#141414', border: '0.5px solid #2a2a2a', borderRadius: 12, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', padding: '1.25rem 1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 500 }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888', fontSize: 22, lineHeight: 1, padding: 0 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div style={{ marginBottom: 12 }}><label style={{ display: 'block', fontSize: 12, color: '#888', marginBottom: 4 }}>{label}</label>{children}</div>;
}

function ShopForm({ shop, onSave, onClose }: { shop: Partial<Shop> | null; onSave: () => void; onClose: () => void }) {
  const [s, setS] = useState({ name: '', url: '', is_shopify: false, search_selector: '', login_email: '', login_password: '', ...shop });
  const [detecting, setDetecting] = useState(false);
  const [detected, setDetected] = useState<boolean | null>(null);
  const [showLogin, setShowLogin] = useState(!!(shop?.login_email));

  async function detect() {
    if (!s.url) return;
    setDetecting(true);
    try {
      const res = await fetch('/api/shops/detect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: s.url }) });
      const data = await res.json();
      setS(p => ({ ...p, is_shopify: data.is_shopify }));
      setDetected(data.is_shopify);
    } finally { setDetecting(false); }
  }

  async function save() {
    if (s.id) {
      await fetch(`/api/shops/${s.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(s) });
    } else {
      await fetch('/api/shops', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(s) });
    }
    onSave();
  }

  return (
    <div>
      <F label="Shop name"><input style={inp} value={s.name} onChange={e => setS(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Topps UK" /></F>
      <F label="Shop URL">
        <div style={{ display: 'flex', gap: 8 }}>
          <input style={{ ...inp, fontFamily: 'monospace', flex: 1 }} value={s.url} onChange={e => setS(p => ({ ...p, url: e.target.value }))} placeholder="https://uk.topps.com" />
          <button style={btn({ flexShrink: 0 })} onClick={detect} disabled={detecting}>{detecting ? 'Detecting…' : 'Detect'}</button>
        </div>
        {detected !== null && (
          <div style={{ fontSize: 12, marginTop: 6, color: detected ? '#4ade80' : '#facc15' }}>
            {detected ? '✓ Shopify — fast API mode' : '⚠ Non-Shopify — search crawl mode'}
          </div>
        )}
      </F>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <input type="checkbox" id="isShopify" checked={s.is_shopify} onChange={e => setS(p => ({ ...p, is_shopify: e.target.checked }))} />
        <label htmlFor="isShopify" style={{ fontSize: 13, color: '#888', cursor: 'pointer' }}>Shopify store (manual override)</label>
      </div>
      <F label="Search results CSS selector (optional)">
        <input style={{ ...inp, fontFamily: 'monospace' }} value={s.search_selector} onChange={e => setS(p => ({ ...p, search_selector: e.target.value }))} placeholder=".product-item" />
      </F>

      {/* Login section */}
      <div style={{ borderTop: '0.5px solid #2a2a2a', marginTop: 16, paddingTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: showLogin ? 12 : 0 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>Site login (optional)</div>
            <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>Bot will log in automatically if the site requires it</div>
          </div>
          <button onClick={() => setShowLogin(!showLogin)} style={btn({ fontSize: 12, color: showLogin ? '#f87171' : '#4ade80', borderColor: showLogin ? '#f8717155' : '#16a34a55', background: showLogin ? '#2b0d0d' : '#0d2b1a' })}>
            {showLogin ? 'Remove login' : '+ Add login'}
          </button>
        </div>
        {showLogin && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
            <F label="Email / username"><input style={inp} value={s.login_email} onChange={e => setS(p => ({ ...p, login_email: e.target.value }))} placeholder="your@email.com" /></F>
            <F label="Password"><input style={inp} type="password" value={s.login_password} onChange={e => setS(p => ({ ...p, login_password: e.target.value }))} placeholder="••••••••" /></F>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: '1.25rem', justifyContent: 'flex-end' }}>
        <button style={btn()} onClick={onClose}>Cancel</button>
        <button style={btn({ background: '#0d2b1a', borderColor: '#16a34a55', color: '#4ade80' })} onClick={save}>Save shop</button>
      </div>
    </div>
  );
}

function DropForm({ drop, shops, profiles, onSave, onClose }: { drop: Partial<Drop> | null; shops: Shop[]; profiles: Profile[]; onSave: () => void; onClose: () => void }) {
  const [d, setD] = useState<Partial<Drop>>({ name: '', url: '', shop_id: null, search_term: '', drop_mode: 'search', monitor_interval: 3, quantity: 1, profile_id: profiles[0]?.id || null, use_proxy: false, keyword: '', atc_selector: '', checkout_mode: 'browser', ...drop });
  const s = (k: string) => (v: unknown) => setD(p => ({ ...p, [k]: v }));
  const selectedShop = shops.find(sh => sh.id === d.shop_id);

  async function save() {
    if (d.id) {
      await fetch(`/api/drops/${d.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) });
    } else {
      await fetch('/api/drops', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) });
    }
    onSave();
  }

  return (
    <div>
      <F label="Drop name"><input style={inp} value={d.name} onChange={e => s('name')(e.target.value)} placeholder="e.g. 2024 Topps Chrome Hobby Box" /></F>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {['search', 'url'].map(mode => (
          <button key={mode} onClick={() => s('drop_mode')(mode)} style={btn({ flex: 1, background: d.drop_mode === mode ? '#0d2b1a' : '#1a1a1a', borderColor: d.drop_mode === mode ? '#16a34a55' : '#333', color: d.drop_mode === mode ? '#4ade80' : '#888' })}>
            {mode === 'search' ? '🔍 Search mode' : '🔗 Direct URL'}
          </button>
        ))}
      </div>
      {d.drop_mode === 'search' ? (
        <>
          <F label="Shop">
            <select style={inp} value={d.shop_id || ''} onChange={e => s('shop_id')(Number(e.target.value) || null)}>
              <option value="">— Select a shop —</option>
              {shops.map(sh => <option key={sh.id} value={sh.id}>{sh.name} {sh.is_shopify ? '(Shopify)' : ''}</option>)}
            </select>
            {shops.length === 0 && <div style={{ fontSize: 12, color: '#facc15', marginTop: 4 }}>No shops yet — add one in the Shops tab first</div>}
          </F>
          <F label="Search term"><input style={inp} value={d.search_term} onChange={e => s('search_term')(e.target.value)} placeholder="e.g. topps chrome hobby 2024" /></F>
          {selectedShop && (
            <div style={{ fontSize: 12, color: '#888', marginBottom: 12, padding: '8px 10px', background: '#1a1a1a', borderRadius: 8 }}>
              {selectedShop.is_shopify ? `✓ Shopify API — ${selectedShop.url}/products.json` : `Search crawl — ${selectedShop.url}/search?q=...`}
              {selectedShop.login_email && <span style={{ color: '#4ade80', marginLeft: 8 }}>🔐 Login saved</span>}
            </div>
          )}
        </>
      ) : (
        <>
          <F label="Product URL"><input style={{ ...inp, fontFamily: 'monospace' }} value={d.url} onChange={e => s('url')(e.target.value)} placeholder="https://shop.com/products/item" /></F>
          <F label="In-stock keyword"><input style={inp} value={d.keyword} onChange={e => s('keyword')(e.target.value)} placeholder="add to cart" /></F>
        </>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 4 }}>
        <F label="Monitor interval (seconds)"><input style={inp} type="number" value={d.monitor_interval} onChange={e => s('monitor_interval')(Number(e.target.value))} /></F>
        <F label="Quantity to buy"><input style={inp} type="number" value={d.quantity} onChange={e => s('quantity')(Number(e.target.value))} /></F>
        <F label="Profile">
          <select style={inp} value={d.profile_id || ''} onChange={e => s('profile_id')(Number(e.target.value))}>
            <option value="">— Select profile —</option>
            {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </F>
        <F label="Checkout mode">
          <select style={inp} value={d.checkout_mode} onChange={e => s('checkout_mode')(e.target.value)}>
            <option value="browser">Browser (Playwright)</option>
            <option value="fast">Fast (API)</option>
          </select>
        </F>
        <div style={{ gridColumn: '1/-1' }}><F label="Add-to-cart selector (optional)"><input style={{ ...inp, fontFamily: 'monospace' }} value={d.atc_selector} onChange={e => s('atc_selector')(e.target.value)} placeholder="#add-to-cart or [name=add]" /></F></div>
        <div style={{ gridColumn: '1/-1', display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" id="proxy" checked={d.use_proxy} onChange={e => s('use_proxy')(e.target.checked)} />
          <label htmlFor="proxy" style={{ fontSize: 13, color: '#888', cursor: 'pointer' }}>Use proxy rotation</label>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: '1.25rem', justifyContent: 'flex-end' }}>
        <button style={btn()} onClick={onClose}>Cancel</button>
        <button style={btn({ background: '#0d2b1a', borderColor: '#16a34a55', color: '#4ade80' })} onClick={save}>Save drop</button>
      </div>
    </div>
  );
}

function ProfileForm({ profile, onSave, onClose }: { profile: Partial<Profile> | null; onSave: () => void; onClose: () => void }) {
  const [p, setP] = useState({ name: 'New Profile', first_name: '', last_name: '', email: '', phone: '', address1: '', address2: '', city: '', postcode: '', country: 'GB', card_name: '', card_number: '', card_expiry: '', card_cvv: '', ...profile });
  const s = (k: string) => (v: string) => setP(x => ({ ...x, [k]: v }));
  async function save() {
    if (p.id) {
      await fetch(`/api/profiles/${p.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
    } else {
      await fetch('/api/profiles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
    }
    onSave();
  }
  return (
    <div>
      <p style={{ fontSize: 12, color: '#888', marginBottom: 16, marginTop: 0 }}>Card details are stored in your private Neon database.</p>
      <F label="Profile name"><input style={inp} value={p.name} onChange={e => s('name')(e.target.value)} /></F>
      <p style={{ fontSize: 12, color: '#888', margin: '16px 0 8px', fontWeight: 500 }}>Delivery address</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <F label="First name"><input style={inp} value={p.first_name} onChange={e => s('first_name')(e.target.value)} /></F>
        <F label="Last name"><input style={inp} value={p.last_name} onChange={e => s('last_name')(e.target.value)} /></F>
        <div style={{ gridColumn: '1/-1' }}><F label="Address line 1"><input style={inp} value={p.address1} onChange={e => s('address1')(e.target.value)} /></F></div>
        <div style={{ gridColumn: '1/-1' }}><F label="Address line 2"><input style={inp} value={p.address2} onChange={e => s('address2')(e.target.value)} /></F></div>
        <F label="City"><input style={inp} value={p.city} onChange={e => s('city')(e.target.value)} /></F>
        <F label="Postcode"><input style={inp} value={p.postcode} onChange={e => s('postcode')(e.target.value)} /></F>
        <F label="Email"><input style={inp} type="email" value={p.email} onChange={e => s('email')(e.target.value)} /></F>
        <F label="Phone"><input style={inp} value={p.phone} onChange={e => s('phone')(e.target.value)} /></F>
      </div>
      <p style={{ fontSize: 12, color: '#888', margin: '16px 0 8px', fontWeight: 500 }}>Payment card</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div style={{ gridColumn: '1/-1' }}><F label="Name on card"><input style={inp} value={p.card_name} onChange={e => s('card_name')(e.target.value)} /></F></div>
        <div style={{ gridColumn: '1/-1' }}><F label="Card number"><input style={{ ...inp, fontFamily: 'monospace' }} value={p.card_number} onChange={e => s('card_number')(e.target.value)} placeholder="1234567890124242" /></F></div>
        <F label="Expiry (MM/YY)"><input style={{ ...inp, fontFamily: 'monospace' }} value={p.card_expiry} onChange={e => s('card_expiry')(e.target.value)} placeholder="12/27" /></F>
        <F label="CVV"><input style={{ ...inp, fontFamily: 'monospace' }} value={p.card_cvv} onChange={e => s('card_cvv')(e.target.value)} placeholder="123" /></F>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: '1.25rem', justifyContent: 'flex-end' }}>
        <button style={btn()} onClick={onClose}>Cancel</button>
        <button style={btn({ background: '#0d2b1a', borderColor: '#16a34a55', color: '#4ade80' })} onClick={save}>Save profile</button>
      </div>
    </div>
  );
}

function LiveLog({ logs }: { logs: Log[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  const prevLen = useRef(0);

  useEffect(() => {
    if (logs.length !== prevLen.current && ref.current && !collapsed) {
      ref.current.scrollTop = ref.current.scrollHeight;
      prevLen.current = logs.length;
    }
  }, [logs, collapsed]);

  const recent = logs.slice(0, 50);
  const activeCount = recent.filter(l => ['monitoring','searching','carted','checking_out'].some(s => l.message.toLowerCase().includes(s))).length;

  return (
    <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50, background: '#0a0a0a', borderTop: '0.5px solid #2a2a2a' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 16px', cursor: 'pointer', userSelect: 'none' }} onClick={() => setCollapsed(!collapsed)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#4ade80', boxShadow: '0 0 6px #4ade80', animation: 'pulse 2s infinite' }} />
          <span style={{ fontSize: 12, fontWeight: 500, color: '#e5e5e5' }}>Live log</span>
          <span style={{ fontSize: 11, color: '#888' }}>{logs.length} entries</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {!collapsed && logs[0] && (
            <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#888', maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {logs[0].message}
            </span>
          )}
          <span style={{ fontSize: 18, color: '#888', lineHeight: 1 }}>{collapsed ? '▲' : '▼'}</span>
        </div>
      </div>
      {!collapsed && (
        <div ref={ref} style={{ height: 180, overflowY: 'auto', padding: '0 16px 8px', fontFamily: 'monospace', fontSize: 12 }}>
          {logs.length === 0 && <div style={{ color: '#555', padding: '8px 0' }}>No activity yet — start a drop to see live updates here.</div>}
          {logs.map(e => {
            const col = e.level === 'success' ? '#4ade80' : e.level === 'warn' ? '#facc15' : e.level === 'error' ? '#f87171' : '#666';
            return (
              <div key={e.id} style={{ display: 'flex', gap: 12, padding: '3px 0', borderBottom: '0.5px solid #151515' }}>
                <span style={{ color: '#444', flexShrink: 0, fontSize: 10 }}>{new Date(e.created_at).toLocaleTimeString()}</span>
                <span style={{ color: col }}>{e.message}</span>
              </div>
            );
          })}
        </div>
      )}
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  );
}

export default function Home() {
  const [tab, setTab] = useState('Drops');
  const [drops, setDrops] = useState<Drop[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [modal, setModal] = useState<null | 'drop' | 'shop' | 'profile'>(null);
  const [editDrop, setEditDrop] = useState<Partial<Drop> | null>(null);
  const [editShop, setEditShop] = useState<Partial<Shop> | null>(null);
  const [editProfile, setEditProfile] = useState<Partial<Profile> | null>(null);

  const load = useCallback(async () => {
    const [d, sh, p, l] = await Promise.all([
      fetch('/api/drops').then(r => r.json()),
      fetch('/api/shops').then(r => r.json()),
      fetch('/api/profiles').then(r => r.json()),
      fetch('/api/logs').then(r => r.json()),
    ]);
    setDrops(Array.isArray(d) ? d : []);
    setShops(Array.isArray(sh) ? sh : []);
    setProfiles(Array.isArray(p) ? p : []);
    setLogs(Array.isArray(l) ? l : []);
  }, []);

  useEffect(() => { load(); const t = setInterval(load, 3000); return () => clearInterval(t); }, [load]);

  async function toggleDrop(drop: Drop) {
    const newStatus = ['monitoring','carted','checking_out','searching'].includes(drop.status) ? 'idle' : 'monitoring';
    await fetch(`/api/drops/${drop.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: newStatus }) });
    load();
  }

  async function deleteDrop(id: number) { await fetch(`/api/drops/${id}`, { method: 'DELETE' }); load(); }
  async function deleteShop(id: number) { await fetch(`/api/shops/${id}`, { method: 'DELETE' }); load(); }
  async function deleteProfile(id: number) { await fetch(`/api/profiles/${id}`, { method: 'DELETE' }); load(); }

  const monitoring = drops.filter(d => ['monitoring','searching'].includes(d.status)).length;
  const ordered = drops.filter(d => d.status === 'success').length;
  const TABS = ['Drops', 'Shops', 'Profiles', 'Activity Log'];

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '2rem 1rem', paddingBottom: '240px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 22, color: '#4ade80' }}>⚡</span>
          <span style={{ fontSize: 20, fontWeight: 600 }}>Drop Bot</span>
          {monitoring > 0 && <span style={{ background: '#0d2b1a', color: '#4ade80', border: '0.5px solid #16a34a55', fontSize: 11, fontWeight: 500, padding: '2px 10px', borderRadius: 20 }}>{monitoring} live</span>}
        </div>
        <div style={{ display: 'flex', gap: 20, fontSize: 13, color: '#888' }}>
          <span><b style={{ color: '#e5e5e5', fontWeight: 500 }}>{drops.length}</b> drops</span>
          <span><b style={{ color: '#4ade80', fontWeight: 500 }}>{ordered}</b> orders placed</span>
          <span><b style={{ color: '#e5e5e5', fontWeight: 500 }}>{shops.length}</b> shops</span>
        </div>
      </div>

      <div style={{ display: 'flex', borderBottom: '0.5px solid #2a2a2a', marginBottom: '1.5rem', gap: 4 }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ background: 'none', border: 'none', borderBottom: tab === t ? '2px solid #4ade80' : '2px solid transparent', color: tab === t ? '#e5e5e5' : '#888', padding: '8px 16px', cursor: 'pointer', fontSize: 13, fontWeight: tab === t ? 500 : 400, marginBottom: -1, borderRadius: 0 }}>{t}</button>
        ))}
      </div>

      {tab === 'Drops' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button style={btn()} onClick={() => { setEditDrop({}); setModal('drop'); }}>+ Add drop</button>
          </div>
          {drops.length === 0 && <div style={{ textAlign: 'center', padding: '3rem 0', color: '#888' }}>No drops yet. Add a shop first, then add your first drop.</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {drops.map(d => {
              const prof = profiles.find(p => p.id === d.profile_id);
              const shop = shops.find(s => s.id === d.shop_id);
              const running = ['monitoring','carted','checking_out','searching'].includes(d.status);
              return (
                <div key={d.id} style={card}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 500 }}>{d.name}</span>
                        <Badge status={d.status} />
                        {d.drop_mode === 'search' && <span style={{ fontSize: 11, color: '#a78bfa', background: '#1a1a2b', padding: '2px 8px', borderRadius: 20, border: '0.5px solid #a78bfa44' }}>search</span>}
                      </div>
                      {d.drop_mode === 'search'
                        ? <div style={{ fontSize: 12, color: '#888' }}>{shop?.name || '—'} · <span style={{ fontFamily: 'monospace' }}>{d.search_term}</span></div>
                        : <div style={{ fontSize: 12, color: '#888', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 400 }}>{d.url}</div>
                      }
                      {d.found_url && <div style={{ fontSize: 11, color: '#4ade80', marginTop: 4, fontFamily: 'monospace' }}>Found: {d.found_url}</div>}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <button onClick={() => toggleDrop(d)} style={btn({ background: running ? '#2b0d0d' : '#0d2b1a', borderColor: running ? '#f8717155' : '#16a34a55', color: running ? '#f87171' : '#4ade80' })}>
                        {running ? '⏸ Stop' : '▶ Start'}
                      </button>
                      <button onClick={() => { setEditDrop(d); setModal('drop'); }} style={btn()}>✎</button>
                      <button onClick={() => deleteDrop(d.id)} style={btn({ color: '#f87171' })}>🗑</button>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 20, marginTop: 10, flexWrap: 'wrap' }}>
                    {[['Interval', `${d.monitor_interval}s`], ['Qty', d.quantity], ['Profile', prof?.name || '—'], ['Mode', d.checkout_mode]].map(([l, v]) => (
                      <div key={String(l)} style={{ fontSize: 12 }}>
                        <span style={{ color: '#888' }}>{l}: </span>
                        <span style={{ fontFamily: 'monospace', fontWeight: 500 }}>{String(v)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'Shops' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button style={btn()} onClick={() => { setEditShop({}); setModal('shop'); }}>+ Add shop</button>
          </div>
          {shops.length === 0 && <div style={{ textAlign: 'center', padding: '3rem 0', color: '#888' }}>No shops yet.</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {shops.map(sh => (
              <div key={sh.id} style={card}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 500 }}>{sh.name}</span>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, border: '0.5px solid', ...(sh.is_shopify ? { color: '#4ade80', background: '#0d2b1a', borderColor: '#16a34a55' } : { color: '#facc15', background: '#2b2b0d', borderColor: '#facc1555' }) }}>
                        {sh.is_shopify ? 'Shopify' : 'Non-Shopify'}
                      </span>
                      {sh.login_email && <span style={{ fontSize: 11, color: '#a78bfa', background: '#1a1a2b', padding: '2px 8px', borderRadius: 20, border: '0.5px solid #a78bfa44' }}>🔐 Login saved</span>}
                    </div>
                    <div style={{ fontSize: 12, color: '#888', fontFamily: 'monospace' }}>{sh.url}</div>
                    {sh.login_email && <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>{sh.login_email}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => { setEditShop(sh); setModal('shop'); }} style={btn()}>✎</button>
                    <button onClick={() => deleteShop(sh.id)} style={btn({ color: '#f87171' })}>🗑</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'Profiles' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button style={btn()} onClick={() => { setEditProfile({}); setModal('profile'); }}>+ Add profile</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
            {profiles.map(p => (
              <div key={p.id} style={card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#0d2b1a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 500, color: '#4ade80' }}>
                      {(p.first_name?.[0] || '') + (p.last_name?.[0] || '')}
                    </div>
                    <span style={{ fontWeight: 500 }}>{p.name}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => { setEditProfile(p); setModal('profile'); }} style={btn({ fontSize: 12 })}>✎</button>
                    <button onClick={() => deleteProfile(p.id)} style={btn({ fontSize: 12, color: '#f87171' })}>🗑</button>
                  </div>
                </div>
                <table style={{ fontSize: 12, width: '100%', borderCollapse: 'collapse' }}>
                  {[['Name', `${p.first_name} ${p.last_name}`], ['Email', p.email], ['City', p.city], ['Card', p.card_number ? '•••• ' + p.card_number.slice(-4) : '—'], ['Expiry', p.card_expiry]].map(([l, v]) => (
                    <tr key={String(l)}>
                      <td style={{ color: '#888', padding: '3px 0', width: '40%' }}>{l}</td>
                      <td style={{ fontFamily: 'monospace', padding: '3px 0' }}>{String(v) || '—'}</td>
                    </tr>
                  ))}
                </table>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'Activity Log' && (
        <div>
          <div style={{ marginBottom: 12 }}>
            <span style={{ fontSize: 13, color: '#888' }}>{logs.length} entries — updates every 3s</span>
          </div>
          <div style={{ background: '#0a0a0a', border: '0.5px solid #2a2a2a', borderRadius: 12, padding: '0.75rem 1rem', maxHeight: 400, overflowY: 'auto', fontFamily: 'monospace', fontSize: 12 }}>
            {logs.length === 0 && <div style={{ color: '#888', padding: '1rem 0' }}>No log entries yet.</div>}
            {logs.map(e => {
              const col = e.level === 'success' ? '#4ade80' : e.level === 'warn' ? '#facc15' : e.level === 'error' ? '#f87171' : '#666';
              return (
                <div key={e.id} style={{ display: 'flex', gap: 12, padding: '4px 0', borderBottom: '0.5px solid #111' }}>
                  <span style={{ color: '#444', flexShrink: 0, fontSize: 11 }}>{new Date(e.created_at).toLocaleTimeString()}</span>
                  <span style={{ color: col }}>{e.message}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {modal === 'drop' && (
        <Modal title={editDrop?.id ? 'Edit drop' : 'Add new drop'} onClose={() => { setModal(null); setEditDrop(null); }}>
          <DropForm drop={editDrop} shops={shops} profiles={profiles} onSave={() => { load(); setModal(null); setEditDrop(null); }} onClose={() => { setModal(null); setEditDrop(null); }} />
        </Modal>
      )}
      {modal === 'shop' && (
        <Modal title={editShop?.id ? 'Edit shop' : 'Add new shop'} onClose={() => { setModal(null); setEditShop(null); }}>
          <ShopForm shop={editShop} onSave={() => { load(); setModal(null); setEditShop(null); }} onClose={() => { setModal(null); setEditShop(null); }} />
        </Modal>
      )}
      {modal === 'profile' && (
        <Modal title={editProfile?.id ? 'Edit profile' : 'Add new profile'} onClose={() => { setModal(null); setEditProfile(null); }}>
          <ProfileForm profile={editProfile} onSave={() => { load(); setModal(null); setEditProfile(null); }} onClose={() => { setModal(null); setEditProfile(null); }} />
        </Modal>
      )}

      <LiveLog logs={logs} />
    </div>
  );
}
