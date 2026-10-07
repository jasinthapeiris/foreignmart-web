'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import AdminDashboard from './admin-dashboard';
import { ArrowDown, ArrowLeft, ArrowRight, Check, ChevronDown, Clock3, Heart, Leaf, MapPin, Menu, Minus, PackageCheck, Plus, Search, ShoppingBag, ShoppingCart, Sparkles, Store, Trash2, X, Truck, ShieldCheck, CreditCard, UserRound, ChevronLeft, ChevronRight, Apple, Carrot, Fish, Drumstick, Milk, Croissant, Wheat, CupSoda, Package, Tag } from 'lucide-react';

const API = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api/v1').replace(/\/$/, '');
type AnyRecord = Record<string, any>;
type CartLine = { product: AnyRecord; quantity: number };
type Session = { accessToken: string; refreshToken: string; email: string; firstName?: string; role: string };

function roleFromToken(token: string): string {
  try {
    const payload = token.split('.')[1]?.replace(/-/g, '+').replace(/_/g, '/');
    return payload ? JSON.parse(atob(payload)).role || 'CUSTOMER' : 'CUSTOMER';
  } catch { return 'CUSTOMER'; }
}

async function request(path: string, init: RequestInit = {}, token?: string, email?: string) {
  let currentEmail = email;
  if (token && !currentEmail && typeof window !== 'undefined') {
    try { const stored = JSON.parse(localStorage.getItem('fm-session') || 'null'); if (stored?.accessToken === token) currentEmail = stored.email; } catch { /* ignore malformed session cache */ }
  }
  const response = await fetch(`${API}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(currentEmail ? { 'X-User-Email': currentEmail } : {}), ...init.headers }, cache: 'no-store' });
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.message || body?.detail || `Request failed (${response.status})`);
  return body;
}
const money = (n: unknown) => `¥${Number(n || 0).toLocaleString('en-US')}`;
const imageFor = (product: AnyRecord) => {
  const value = product.imageUrl || product.image_url || '';
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  try { return new URL(value, new URL(API).origin).toString(); } catch { return value; }
};
const nameFor = (product: AnyRecord) => product.productName || product.name || 'Market find';
const promoImageFor = (product: AnyRecord) => {
  const image = imageFor(product);
  const path = image.split('?')[0].split('/').pop()?.toLowerCase() || '';
  const terms = nameFor(product).toLowerCase().match(/[a-z]{4,}/g) || [];
  const generic = new Set(['canned', 'frozen', 'fresh', 'pack', 'pcs', 'with', 'from', 'market']);
  return terms.some((term: string) => !generic.has(term) && path.includes(term)) ? image : '';
};
const promoEmojiFor = (product: AnyRecord) => {
  const name = nameFor(product).toLowerCase();
  if (/fish|tuna|seafood|shrimp|salmon|gyoza/.test(name)) return '🐟';
  if (/croissant|bread|bakery|pastry/.test(name)) return '🥐';
  if (/apple|banana|fruit/.test(name)) return '🍎';
  if (/tea|coffee|drink/.test(name)) return '🍵';
  if (/milk|cheese|yogurt/.test(name)) return '🥛';
  if (/peanut|butter|spread/.test(name)) return '🥜';
  return '🛍️';
};
const priceFor = (product: AnyRecord) => Number(product.effectivePriceJpy ?? product.discountPriceJpy ?? product.priceJpy ?? 0);
const categoryNames = ['All picks', 'Fresh produce', 'Pantry', 'Japanese favourites', 'Snacks & treats', 'Drinks'];
const categoryEmoji = (label: string) => {
  const value = label.toLowerCase();
  if (/all|everything/.test(value)) return '🛍️';
  if (/vegetable|produce|fruit|fresh|farm/.test(value)) return '🥬';
  if (/meat|beef|poultry|chicken/.test(value)) return '🍗';
  if (/fish|seafood/.test(value)) return '🐟';
  if (/bread|bakery|grain|rice|pantry|staple/.test(value)) return '🍞';
  if (/drink|beverage|tea|coffee/.test(value)) return '🧃';
  if (/snack|treat|sweet|dessert/.test(value)) return '🍪';
  if (/dairy|milk|cheese/.test(value)) return '🥛';
  if (/japan|japanese/.test(value)) return '🍙';
  return '🧺';
};

export default function Home() {
  const [markets, setMarkets] = useState<AnyRecord[]>([]);
  const [countries, setCountries] = useState<AnyRecord[]>([]);
  const [countryId, setCountryId] = useState('all');
  const [market, setMarket] = useState<AnyRecord | null>(null);
  const [categories, setCategories] = useState<AnyRecord[]>([]);
  const [products, setProducts] = useState<AnyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [category, setCategory] = useState('All picks');
  const [categoryFilters, setCategoryFilters] = useState<string[]>([]);
  const [productView, setProductView] = useState<'grid' | 'list'>('grid');
  const [query, setQuery] = useState('');
  const [sortOrder, setSortOrder] = useState('recommended');
  const [cartByMarket, setCartByMarket] = useState<Record<string, CartLine[]>>({});
  const marketKey = String(market?.id || 'guest');
  const cart = cartByMarket[marketKey] || [];
  const [session, setSession] = useState<Session | null>(null);
  const [modal, setModal] = useState<'login' | 'register' | 'checkout' | 'address' | null>(null);
  const [addressRequired, setAddressRequired] = useState(false);
  const [checkoutAddressId, setCheckoutAddressId] = useState('');
  const [checkoutMarketId, setCheckoutMarketId] = useState('');
  const [checkoutAfterAuth, setCheckoutAfterAuth] = useState(false);
  const [editingAddress, setEditingAddress] = useState<AnyRecord | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [page, setPage] = useState<'home' | 'shop' | 'deals' | 'new' | 'stores' | 'watchlist' | 'orders' | 'product' | 'account' | 'cart'>('shop');
  const [selectedProduct, setSelectedProduct] = useState<AnyRecord | null>(null);
  const [productDetails, setProductDetails] = useState<AnyRecord | null>(null);
  const [reviews, setReviews] = useState<AnyRecord[]>([]);
  const [watchlist, setWatchlist] = useState<AnyRecord[]>([]);
  const [orders, setOrders] = useState<AnyRecord[]>([]);
  const [addresses, setAddresses] = useState<AnyRecord[]>([]);
  const [profile, setProfile] = useState<AnyRecord>({});
  const [postalHint, setPostalHint] = useState('');
  const [locationBusy, setLocationBusy] = useState(false);
  const [productQuantity, setProductQuantity] = useState(1);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewText, setReviewText] = useState('');
  const [pageIndex, setPageIndex] = useState(0);
  const [cartCacheLoaded, setCartCacheLoaded] = useState(false);
  const [homeSlide, setHomeSlide] = useState(0);
  const [shopSlide, setShopSlide] = useState(0);
  const [marketMenu, setMarketMenu] = useState(false);
  const [accountMenu, setAccountMenu] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const mainSearchInput = useRef<HTMLInputElement | null>(null);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const lastPostalLookup = useRef('');
  const categoryTrack = useRef<HTMLDivElement | null>(null);
  const promotionTrack = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      const savedCart = localStorage.getItem('fm-cart'); if (savedCart) { const parsed = JSON.parse(savedCart); setCartByMarket(Array.isArray(parsed) ? { guest: parsed } : parsed); }
      const savedSession = localStorage.getItem('fm-session'); if (savedSession) { const cached = JSON.parse(savedSession); setSession({ ...cached, role: cached.role || roleFromToken(cached.accessToken) }); }
    } catch { /* ignore malformed local cache */ }
    setCartCacheLoaded(true);
    Promise.all([request('/supermarkets?page=0&size=100&sort=name,asc'), request('/categories'), request('/countries')]).then(([s, c, countryData]) => {
      const list = Array.isArray(s) ? s : s?.content || [];
      const flatten = (items: AnyRecord[]): AnyRecord[] => items.flatMap((item) => [item, ...flatten(item.children || [])]);
      setMarkets(list); setMarket(list[0] || null); setCategories(flatten(Array.isArray(c) ? c : [])); setCountries(Array.isArray(countryData) ? countryData : []);
      if (!list.length) setLoading(false);
    }).catch((e) => { setError(e.message); setLoading(false); });
  }, []);
  useEffect(() => { if (cartCacheLoaded) localStorage.setItem('fm-cart', JSON.stringify(cartByMarket)); }, [cartByMarket, cartCacheLoaded]);
  function setCart(update: CartLine[] | ((previous: CartLine[]) => CartLine[])) { setCartByMarket((previous) => ({ ...previous, [marketKey]: typeof update === 'function' ? update(previous[marketKey] || []) : update })); }
  useEffect(() => {
    if (market) {
      setLoading(true); setError(''); setProducts([]); Promise.all([request(`/supermarkets/${market.id}/products`), request('/products?page=0&size=100&sort=name,asc')]).then(([inventory, catalog]) => {
        const catalogRows: AnyRecord[] = Array.isArray(catalog) ? catalog : catalog?.content || [];
        const byId = new Map(catalogRows.map((p) => [String(p.id), p]));
        const rows: AnyRecord[] = Array.isArray(inventory) ? inventory : [];
        setProducts(rows.map((p) => { const details = byId.get(String(p.productId)); return { ...p, categoryId: details?.categoryId, categories: details?.categories || [], description: details?.description }; }));
      }).catch((e) => setError(e.message)).finally(() => setLoading(false));
    }
  }, [market]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 2600); return () => clearTimeout(timer); }, [notice]);
  useEffect(() => { const timer = window.setInterval(() => setHomeSlide((n) => (n + 1) % 3), 6500); return () => window.clearInterval(timer); }, []);
  useEffect(() => { if (page !== 'shop') return; const timer = window.setInterval(() => setShopSlide((n) => (n + 1) % 2), 7000); return () => window.clearInterval(timer); }, [page]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      const track = categoryTrack.current;
      if (!track || track.scrollWidth <= track.clientWidth) return;
      const atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 12;
      track.scrollTo({ left: atEnd ? 0 : track.scrollLeft + Math.max(170, track.clientWidth * 0.65), behavior: 'smooth' });
    }, 4500);
    return () => window.clearInterval(timer);
  }, [categories.length]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      const track = promotionTrack.current;
      if (!track || track.scrollWidth <= track.clientWidth) return;
      const atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 12;
      track.scrollTo({ left: atEnd ? 0 : track.scrollLeft + track.clientWidth, behavior: 'smooth' });
    }, 5200);
    return () => window.clearInterval(timer);
  }, [markets.length, products.length]);
  useEffect(() => {
    if (!accountMenu) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (!accountMenuRef.current?.contains(event.target as Node)) setAccountMenu(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setAccountMenu(false); };
    document.addEventListener('pointerdown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => { document.removeEventListener('pointerdown', closeOnOutside); document.removeEventListener('keydown', closeOnEscape); };
  }, [accountMenu]);
  useEffect(() => {
    if (!session || session.role !== 'CUSTOMER') return;
    Promise.all([request('/orders?page=0&size=100&sort=placedAt,desc', {}, session.accessToken), request('/wishlist', {}, session.accessToken), request('/users/me', {}, session.accessToken), request('/addresses', {}, session.accessToken)]).then(([o, w, p, a]) => {
      setOrders(Array.isArray(o) ? o : o?.content || []); setWatchlist(Array.isArray(w) ? w : []); setProfile(p || {}); setAddresses(Array.isArray(a) ? a : []);
    }).catch((e) => setNotice(e.message));
  }, [session]);
  useEffect(() => {
    if (!session || session.role !== 'CUSTOMER' || !market) return;
    request(`/cart?supermarketId=${market.id}`, {}, session.accessToken).then((remote) => {
      const items: AnyRecord[] = remote?.items || [];
      const mapped = items.map((item) => ({ product: { id: Number(item.supermarketProductId), productId: item.productId, productName: item.productName, imageUrl: item.imageUrl, effectivePriceJpy: item.unitPriceJpy, priceJpy: item.unitPriceJpy, unit: item.unit || 'each', cartItemId: item.id }, quantity: Number(item.quantity) }));
      setCartByMarket((old) => ({ ...old, [String(market.id)]: mapped }));
    }).catch(() => undefined);
  }, [session, market]);

  const visible = useMemo(() => products.filter((p) => {
    const q = query.toLowerCase();
    const matchesText = !q || `${nameFor(p)} ${p.brand || ''} ${p.unit || ''}`.toLowerCase().includes(q);
    const selectedNames = categoryFilters.length ? categoryFilters : category === 'All picks' ? [] : [category];
    if (!selectedNames.length) return matchesText;
    const productCategories = (p.categories || []).map((c: AnyRecord) => String(c.id));
    const categoryIds = new Set<string>(selectedNames.flatMap((name) => { const cat = categories.find((c) => c.name === name || c.slug === name.toLowerCase().replaceAll(' ', '-')); if (!cat) return []; const ids = new Set([String(cat.id)]); let changed = true; while (changed) { changed = false; for (const child of categories) if (ids.has(String(child.parentId)) && !ids.has(String(child.id))) { ids.add(String(child.id)); changed = true; } } return [...ids]; }));
    return matchesText && (!categoryIds.size || categoryIds.has(String(p.categoryId)) || productCategories.some((id: string) => categoryIds.has(id)));
  }), [products, query, category, categoryFilters, categories]);
  const searchSuggestions = query.trim() ? visible.slice(0, 6) : [];
  const cartCount = Object.values(cartByMarket).flat().reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = cart.reduce((sum, item) => sum + priceFor(item.product) * item.quantity, 0);
  const categoryLabels = categories.length ? ['All picks', ...categories.map((c) => c.name)] : categoryNames;
  const categoryIcon = (label: string) => { const text = label.toLowerCase(); const Icon = text.includes('fruit') ? Apple : text.includes('veget') ? Carrot : text.includes('seafood') || text.includes('fish') ? Fish : text.includes('meat') || text.includes('poultry') || text.includes('chicken') ? Drumstick : text.includes('dairy') ? Milk : text.includes('bak') ? Croissant : text.includes('rice') || text.includes('grain') ? Wheat : text.includes('drink') || text.includes('beverage') ? CupSoda : text === 'all picks' ? Package : Tag; return <Icon size={17} aria-hidden="true" />; };

  function setCartForKey(key: string, update: CartLine[] | ((previous: CartLine[]) => CartLine[])) { setCartByMarket((previous) => ({ ...previous, [key]: typeof update === 'function' ? update(previous[key] || []) : update })); }
  async function add(product: AnyRecord, quantity = 1) {
    if (!market) { setNotice('Choose a supermarket before adding products.'); return false; }
    if (session) {
      try {
        const remote = await request('/cart/items', { method: 'POST', body: JSON.stringify({ supermarketProductId: Number(product.id), quantity }) }, session.accessToken);
        const mapped = (remote?.items || []).map((item: AnyRecord) => ({ product: { id: Number(item.supermarketProductId), productId: item.productId, productName: item.productName, imageUrl: item.imageUrl, effectivePriceJpy: item.unitPriceJpy, priceJpy: item.unitPriceJpy, cartItemId: item.id }, quantity: Number(item.quantity) }));
        setCartForKey(String(market.id), mapped);
      } catch (e: any) { setNotice(e.message); return false; }
    } else setCart((old) => { const existing = old.find((i) => i.product.id === product.id); return existing ? old.map((i) => i.product.id === product.id ? { ...i, quantity: i.quantity + quantity } : i) : [...old, { product, quantity }]; });
    setNotice(`${nameFor(product)} added to your bag`);
    return true;
  }
  async function buyNow(product: AnyRecord) { if (await add(product, productQuantity)) await beginCheckout(String(market?.id || '')); }
  async function changeQty(id: number, delta: number, key = marketKey) {
    const current = cartByMarket[key] || [];
    const line = current.find((item) => item.product.id === id);
    if (!line) return;
    const nextQuantity = line.quantity + delta;
    if (session && line.product.cartItemId) {
      try {
        const remote = nextQuantity < 1
          ? await request(`/cart/items/${line.product.cartItemId}`, { method: 'DELETE' }, session.accessToken)
          : await request(`/cart/items/${line.product.cartItemId}`, { method: 'PUT', body: JSON.stringify({ quantity: nextQuantity }) }, session.accessToken);
        const mapped = (remote?.items || []).map((item: AnyRecord) => ({ product: { id: Number(item.supermarketProductId), productId: item.productId, productName: item.productName, imageUrl: item.imageUrl, effectivePriceJpy: item.unitPriceJpy, priceJpy: item.unitPriceJpy, cartItemId: item.id }, quantity: Number(item.quantity) }));
        setCartForKey(key, mapped);
      } catch (e: any) { setNotice(e.message); }
    } else setCartForKey(key, (old) => old.map((i) => i.product.id === id ? { ...i, quantity: nextQuantity } : i).filter((i) => i.quantity > 0));
  }
  async function authenticate(mode: 'login' | 'register', form: FormData) {
    const data: AnyRecord = mode === 'login' ? { email: form.get('email'), password: form.get('password') } : { firstName: form.get('firstName'), lastName: form.get('lastName'), email: form.get('email'), phoneNumber: form.get('phoneNumber'), password: form.get('password') };
    const result = await request(`/auth/${mode}`, { method: 'POST', body: JSON.stringify(data) });
    const next: Session = { accessToken: result.accessToken, refreshToken: result.refreshToken, email: data.email, firstName: data.firstName, role: roleFromToken(result.accessToken) };
    localStorage.setItem('fm-session', JSON.stringify(next)); setSession(next);
    if (next.role === 'CUSTOMER') await syncCart(next.accessToken, cart);
    setModal(null); setNotice('Welcome to ForeignMart');
    if (checkoutAfterAuth) { setCheckoutAfterAuth(false); await beginCheckout(String(market?.id || ''), next.accessToken); }
  }
  async function syncCart(token: string, lines: CartLine[], storeId = String(market?.id || '')) {
    const desired = new Map(lines.map((line) => [Number(line.product.id), line.quantity]));
    const remote = await request(`/cart${storeId ? `?supermarketId=${storeId}` : ''}`, {}, token).catch(() => null);
    const existing: AnyRecord[] = remote?.items || [];
    for (const item of existing) {
      const inventoryId = Number(item.supermarketProductId);
      if (desired.has(inventoryId)) {
        await request(`/cart/items/${item.id}`, { method: 'PUT', body: JSON.stringify({ quantity: desired.get(inventoryId) }) }, token);
        desired.delete(inventoryId);
      }
    }
    for (const [supermarketProductId, quantity] of desired) {
      await request('/cart/items', { method: 'POST', body: JSON.stringify({ supermarketProductId, quantity }) }, token);
    }
  }
  async function beginCheckout(storeId = String(market?.id || ''), accessToken = session?.accessToken) {
    if (!accessToken) { setCheckoutAfterAuth(true); setCheckoutMarketId(storeId); setModal('login'); setNotice('Sign in to continue to checkout'); return; }
    try {
      const saved = await request('/addresses', {}, accessToken);
      setAddresses(Array.isArray(saved) ? saved : []);
      setAddressRequired(!saved?.length);
      setCheckoutAddressId(String(saved?.find((item: AnyRecord) => item.defaultAddress)?.id || saved?.[0]?.id || 'new'));
      setCheckoutMarketId(storeId);
      setModal('checkout');
    } catch (e: any) { setNotice(e.message); }
  }
  async function checkout(form: FormData) {
    const orderStoreId = checkoutMarketId || marketKey;
    if (!session) { setCheckoutAfterAuth(true); setModal('login'); setNotice('Sign in to continue to checkout'); return; }
    const orderLines = cartByMarket[orderStoreId] || [];
    await syncCart(session.accessToken, orderLines, orderStoreId);
    const saved = await request('/addresses', {}, session.accessToken);
    let addressId = checkoutAddressId !== 'new' ? Number(checkoutAddressId || saved?.find((item: AnyRecord) => item.defaultAddress)?.id || saved?.[0]?.id) : 0;
    if (!addressId) {
      const address = await request('/addresses', { method: 'POST', body: JSON.stringify({ label: 'Home', recipientName: form.get('recipientName'), phoneNumber: form.get('phoneNumber'), postalCode: form.get('postalCode'), prefecture: form.get('prefecture'), city: form.get('city'), town: form.get('town'), addressLine: form.get('addressLine'), buildingName: form.get('buildingName') || null, roomNumber: form.get('roomNumber') || null, defaultAddress: true }) }, session.accessToken);
      addressId = Number(address.id);
    }
    await request('/orders/checkout', { method: 'POST', body: JSON.stringify({ addressId, supermarketId: Number(orderStoreId), couponCode: form.get('coupon') || null }) }, session.accessToken);
    setCartForKey(orderStoreId, []); setCartOpen(false); setModal(null); setNotice('Order placed — thank you!'); setPage('orders');
    const latest = await request('/orders?page=0&size=100&sort=placedAt,desc', {}, session.accessToken); setOrders(Array.isArray(latest) ? latest : latest?.content || []);
  }
  async function cancelOrder(order: AnyRecord) {
    if (!session || !window.confirm(`Cancel order ${order.orderNumber || ''}?`)) return;
    try { await request(`/orders/${order.id}/cancel`, { method: 'POST' }, session.accessToken); const latest = await request('/orders?page=0&size=100&sort=placedAt,desc', {}, session.accessToken); setOrders(Array.isArray(latest) ? latest : latest?.content || []); setNotice('Order cancelled.'); } catch (e: any) { setNotice(e.message); }
  }
  async function saveProfile(form: FormData) {
    if (!session) return;
    try { const result = await request('/users/me', { method: 'PUT', body: JSON.stringify({ firstName: form.get('firstName'), lastName: form.get('lastName'), phoneNumber: form.get('phoneNumber') }) }, session.accessToken); setProfile(result); setNotice('Account details saved.'); } catch (e: any) { setNotice(e.message); }
  }
  async function saveAddress(form: FormData) {
    if (!session) return;
    const values = { label: form.get('label') || 'Home', recipientName: form.get('recipientName'), phoneNumber: form.get('phoneNumber'), postalCode: form.get('postalCode'), prefecture: form.get('prefecture'), city: form.get('city'), town: form.get('town'), addressLine: form.get('addressLine'), buildingName: form.get('buildingName') || null, roomNumber: form.get('roomNumber') || null, defaultAddress: form.get('defaultAddress') === 'on' };
    try { if (editingAddress) await request(`/addresses/${editingAddress.id}`, { method: 'PUT', body: JSON.stringify(values) }, session.accessToken); else await request('/addresses', { method: 'POST', body: JSON.stringify(values) }, session.accessToken); const result = await request('/addresses', {}, session.accessToken); setAddresses(Array.isArray(result) ? result : []); setModal(null); setEditingAddress(null); setPostalHint(''); setNotice(editingAddress ? 'Address updated.' : 'Address added.'); } catch (e: any) { setNotice(e.message); }
  }
  async function defaultAddress(address: AnyRecord) { if (!session) return; try { await request(`/addresses/${address.id}/default`, { method: 'PUT' }, session.accessToken); setAddresses(await request('/addresses', {}, session.accessToken)); } catch (e: any) { setNotice(e.message); } }
  async function deleteAddress(address: AnyRecord) { if (!session || !window.confirm('Delete this delivery address?')) return; try { await request(`/addresses/${address.id}`, { method: 'DELETE' }, session.accessToken); setAddresses(await request('/addresses', {}, session.accessToken)); setNotice('Address deleted.'); } catch (e: any) { setNotice(e.message); } }
  const filteredMarkets = markets.filter((shop) => countryId === 'all' || String(shop.countryId) === countryId);
  const deals = products.filter((p) => p.available && Number(p.discountPriceJpy) > 0 && Number(p.discountPriceJpy) < Number(p.priceJpy));
  const promotionItems = deals.slice(0, 8).map((product) => ({ key: `deal-${product.id}`, product, shop: market }));
  const promotionPages = Array.from({ length: Math.ceil(promotionItems.length / 4) }, (_, index) => promotionItems.slice(index * 4, index * 4 + 4));
  const arrivals = [...products].sort((a, b) => Number(b.productId) - Number(a.productId));
  const pageProducts = page === 'deals' ? deals : page === 'new' ? arrivals : page === 'watchlist' ? products.filter((p) => watchlist.some((item) => Number(item.id || item.productId) === Number(p.productId))) : visible;
  function productCard(p: AnyRecord, i: number) {
    const saved = watchlist.some((item) => Number(item.id || item.productId) === Number(p.productId));
    const unavailable = p.available === false || Number(p.stockQuantity) < 1;
    const cartLine = cart.find((line) => Number(line.product.id) === Number(p.id));
    const quantity = cartLine?.quantity || 0;
    const adjustQuantity = (delta: number) => { if (quantity === 0 && delta > 0) void add(p); else if (quantity > 0 || delta > 0) void changeQty(p.id, delta); };
    const quantityControl = <div className="cart-quantity-control"><button type="button" aria-label={`Remove one ${nameFor(p)}`} disabled={quantity === 0} onClick={() => adjustQuantity(-1)}><Minus size={14} /></button><b>{quantity}</b><button type="button" aria-label={`Add one ${nameFor(p)}`} onClick={() => adjustQuantity(1)}><Plus size={14} /></button></div>;
    return <article className="product-card" key={p.id}><div className={`product-image tone-${i % 6}`} onClick={() => void openProduct(p)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && void openProduct(p)}>{imageFor(p) ? <img src={imageFor(p)} alt={nameFor(p)} loading="lazy" /> : <span className="product-emoji">{['🍅', '🍊', '🥬', '🍞', '🍵', '🍓'][i % 6]}</span>}<button className={`save-button ${saved ? 'saved' : ''}`} aria-label={saved ? 'Remove from watchlist' : 'Save product'} onClick={(e) => { e.stopPropagation(); void toggleWatchlist(p); }}><Heart size={16} fill={saved ? 'currentColor' : 'none'} /></button>{Number(p.discountPriceJpy) > 0 && Number(p.discountPriceJpy) < Number(p.priceJpy) && <span className="product-tag">SALE</span>}{quantity > 0 ? <span className="product-quantity-badge">{quantity} in cart</span> : <button className="quick-add" disabled={unavailable} aria-label={`Add ${nameFor(p)} to cart`} onClick={(e) => { e.stopPropagation(); void add(p); }}><Plus size={17} /></button>}{unavailable && <span className="unavailable-tag">Sold out</span>}</div><div className="product-info"><div className="product-meta"><span>{p.brand || 'MARKET PICK'}</span><span>{p.unit || 'Selected with care'}</span></div><h3 role="button" onClick={() => void openProduct(p)}>{nameFor(p)}</h3><div className="price-row"><b>{money(priceFor(p))}</b>{Number(p.discountPriceJpy) > 0 && <del>{money(p.priceJpy)}</del>}<span>/ {p.unit || 'each'}</span></div>{unavailable ? <button className="card-add-button" disabled>Currently unavailable</button> : quantity > 0 ? <div className="product-purchase-controls">{quantityControl}<button className="card-add-button" onClick={() => void add(p)}><ShoppingBag size={14} /> Add to cart</button></div> : <button className="card-add-button" onClick={() => void add(p)}><ShoppingBag size={14} /> Add to cart</button>}</div></article>;
  }
  async function openProduct(product: AnyRecord) {
    setSelectedProduct(product); setProductDetails(null); setReviews([]); setProductQuantity(1); setPage('product');
    try { const [detail, reviewData] = await Promise.all([request(`/products/${product.productId}`), request(`/products/${product.productId}/reviews`)]); setProductDetails(detail); setReviews(Array.isArray(reviewData) ? reviewData : []); } catch { /* product remains viewable from inventory data */ }
  }
  async function toggleWatchlist(product: AnyRecord) {
    if (!session) { setModal('login'); setNotice('Sign in to save products to your watchlist.'); return; }
    const id = Number(product.productId); const already = watchlist.some((item) => Number(item.id || item.productId) === id);
    try { await request(`/wishlist/${id}`, { method: already ? 'DELETE' : 'POST', ...(already ? {} : { body: '{}' }) }, session.accessToken); const data = await request('/wishlist', {}, session.accessToken); setWatchlist(Array.isArray(data) ? data : []); setNotice(already ? 'Removed from your watchlist.' : 'Added to your watchlist.'); } catch (e: any) { setNotice(e.message); }
  }
  async function submitReview() {
    if (!session) { setModal('login'); setNotice('Sign in to write a product review.'); return; }
    if (!selectedProduct) return;
    try { await request(`/products/${selectedProduct.productId}/reviews`, { method: 'PUT', body: JSON.stringify({ rating: reviewRating, comment: reviewText }) }, session.accessToken); const data = await request(`/products/${selectedProduct.productId}/reviews`); setReviews(Array.isArray(data) ? data : []); setReviewText(''); setNotice('Your review was saved.'); } catch (e: any) { setNotice(e.message); }
  }
  async function signOut() { if (session) { await request('/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken: session.refreshToken }) }).catch(() => undefined); } localStorage.removeItem('fm-session'); setSession(null); setProfile({}); setOrders([]); setAddresses([]); setWatchlist([]); setPage('shop'); }
  async function loadPostalCode(value: string, form?: HTMLFormElement | null) {
    const digits = value.replace(/\D/g, '');
    if (digits.length !== 7) { lastPostalLookup.current = ''; setPostalHint(''); return; }
    if (lastPostalLookup.current === digits) return;
    lastPostalLookup.current = digits;
    const formatted = `${digits.slice(0, 3)}-${digits.slice(3)}`;
    const field = (name: string) => form?.querySelector<HTMLInputElement>(`[name="${name}"]`);
    const postal = field('postalCode'); if (postal) postal.value = formatted;
    try {
      const response = await fetch(`https://zipcloud.ibsnet.co.jp/api/search?zipcode=${digits}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Postal lookup failed');
      const data = await response.json(); const found = data.results?.[0];
      if (found) {
        const prefecture = field('prefecture'); const city = field('city'); const town = field('town');
        if (prefecture) prefecture.value = found.address1 || '';
        if (city) city.value = found.address2 || '';
        if (town) town.value = found.address3 || '';
        setPostalHint('Prefecture, city, and town were filled in. Add the street address and check the details.');
      } else { lastPostalLookup.current = ''; setPostalHint(data.message || 'Postal code not found. You can enter the address manually.'); }
    } catch { lastPostalLookup.current = ''; setPostalHint('Postal lookup is unavailable. Check your connection or enter the address manually.'); }
  }
  function useCurrentLocation(form?: HTMLFormElement | null) {
    if (!navigator.geolocation) { setPostalHint('This browser does not support location access. Enter your address manually.'); return; }
    setLocationBusy(true); setPostalHint('Requesting permission to use your current location…');
    navigator.geolocation.getCurrentPosition(async ({ coords }) => {
      try {
        const url = new URL('https://api.bigdatacloud.net/data/reverse-geocode-client');
        url.searchParams.set('latitude', String(coords.latitude)); url.searchParams.set('longitude', String(coords.longitude)); url.searchParams.set('localityLanguage', 'ja');
        const response = await fetch(url, { cache: 'no-store' }); if (!response.ok) throw new Error('Address lookup failed');
        const place = await response.json();
        const field = (name: string) => form?.querySelector<HTMLInputElement>(`[name="${name}"]`);
        const postal = field('postalCode'); const prefecture = field('prefecture'); const city = field('city'); const town = field('town');
        if (postal) postal.value = place.postcode || '';
        if (prefecture) prefecture.value = place.principalSubdivision || '';
        if (city) city.value = place.city || place.locality || '';
        if (town) town.value = place.locality && place.locality !== (place.city || '') ? place.locality : '';
        lastPostalLookup.current = '';
        if (place.postcode && place.postcode.replace(/\D/g, '').length === 7) await loadPostalCode(place.postcode, form);
        else setPostalHint('Nearby area filled in. Enter your street address and check the delivery details.');
      } catch { setPostalHint('Could not look up this location. Enter your address manually.'); }
      finally { setLocationBusy(false); }
    }, (error) => {
      setLocationBusy(false);
      setPostalHint(error.code === error.PERMISSION_DENIED ? 'Location permission was denied. Allow location access in your browser or enter the address manually.' : 'Could not get your location. Check browser permissions and try again.');
    }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 });
  }
  function retryCatalog() {
    setError(''); setLoading(true);
    Promise.all([request('/supermarkets?page=0&size=100&sort=name,asc'), request('/categories'), request('/countries')]).then(([s, c, countryData]) => {
      const list = Array.isArray(s) ? s : s?.content || []; const flatten = (items: AnyRecord[]): AnyRecord[] => items.flatMap((item) => [item, ...flatten(item.children || [])]);
      setMarkets(list); setMarket(list.find((item: AnyRecord) => String(item.id) === String(market?.id)) || list[0] || null); setCategories(flatten(Array.isArray(c) ? c : [])); setCountries(Array.isArray(countryData) ? countryData : []);
    }).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }
  function chooseCountry(value: string) {
    setCountryId(value);
    const options = markets.filter((shop) => value === 'all' || String(shop.countryId) === value);
    if (options.length && !options.some((shop) => String(shop.id) === String(market?.id))) setMarket(options[0]);
    if (!options.length) { setMarket(null); setProducts([]); }
  }

  const navItems = [
    ['home', 'Deals'], ['shop', 'Shop'], ['deals', 'Discount products'], ['new', 'New arrivals'], ['stores', 'Shop details'], ['watchlist', 'Watchlist'],
  ] as const;
  const selectedCategory = categories.find((item) => item.name === category);
  const activeStore = markets.find((item) => String(item.id) === String(market?.id));
  const sortedProducts = [...pageProducts].sort((a, b) => sortOrder === 'price-low' ? priceFor(a) - priceFor(b) : sortOrder === 'price-high' ? priceFor(b) - priceFor(a) : 0);
  const displayedProducts = sortedProducts.slice(0, 40 * (pageIndex + 1));
  const promoSlides = [
    { eyebrow: 'MARKET PICKS · THIS WEEK', title: 'Good things are in season.', body: `Fresh finds and special prices from ${activeStore?.name || 'your local market'}.`, action: 'Explore this week’s deals', onClick: () => setPage('deals'), className: 'slide-produce', icon: '🥬' },
    { eyebrow: 'YOUR NEIGHBOURHOOD MARKET', title: activeStore?.name || 'Meet your local market.', body: activeStore?.description || 'Discover the people and products behind your neighbourhood shop.', action: 'Discover the market', onClick: () => setPage('stores'), className: 'slide-market', icon: '🛍️' },
    { eyebrow: 'SHOP MORE MARKETS', title: 'A world of flavour, nearby.', body: `Explore ${markets.length || 'local'} markets and find something new for your table.`, action: 'Browse all products', onClick: () => setPage('shop'), className: 'slide-discover', icon: '🍊' },
  ];
  const activeSlide = promoSlides[homeSlide % promoSlides.length];
  const heroProduct = deals.length ? deals[homeSlide % deals.length] : products[homeSlide % Math.max(products.length, 1)];
  const heroPhotos = Array.from({ length: 4 }, (_, index) => products[(homeSlide * 4 + index) % Math.max(products.length, 1)]).filter((product) => product && imageFor(product));
  const miniProduct = deals.length ? deals[shopSlide % deals.length] : products[shopSlide % Math.max(products.length, 1)];
  const bannerProduce = products.find((product) => /vegetable|tomato|onion|lettuce|carrot|broccoli|cabbage|pepper|fruit|apple|orange/i.test(nameFor(product))) || products[0];
  const bannerMeat = products.find((product) => /meat|beef|pork|chicken|lamb|sausage/i.test(nameFor(product))) || products.find((product) => product !== bannerProduce);
  const categoryImage = (item: AnyRecord, index: number) => {
    const label = String(item.name || '').toLowerCase();
    const imageTerms: Record<string, string[]> = {
      fruit: ['apple', 'banana', 'orange', 'grape', 'melon', 'strawberry', 'mango', 'fruit'],
      vegetable: ['vegetable', 'tomato', 'potato', 'onion', 'lettuce', 'carrot', 'broccoli', 'cabbage', 'pepper'],
      meat: ['beef', 'pork', 'chicken', 'lamb', 'meat', 'sausage'],
      seafood: ['fish', 'tuna', 'salmon', 'shrimp', 'prawn', 'seafood', 'squid', 'crab'],
      dairy: ['milk', 'cheese', 'yogurt', 'butter', 'egg', 'cream'],
      bakery: ['bread', 'croissant', 'bun', 'cake', 'bakery', 'pastry'],
      rice: ['rice', 'grain', 'quinoa', 'barley'],
      noodle: ['noodle', 'pasta', 'spaghetti', 'ramen'],
      beverage: ['juice', 'water', 'soda', 'drink', 'tea', 'coffee'],
    };
    const group = Object.keys(imageTerms).find((term) => label.includes(term));
    const terms = group ? imageTerms[group] : [label];
    const product = products.find((p) => terms.some((term) => nameFor(p).toLowerCase().includes(term)) && imageFor(p));
    return product ? imageFor(product) : '';
  };
  const setShopCategory = (value: string) => { setCategory(value); setCategoryFilters([]); setQuery(''); setPageIndex(0); setPage('shop'); setSelectedProduct(null); setMarketMenu(false); };
  const slidePromotions = (direction: number) => { const track = promotionTrack.current; if (!track) return; track.scrollBy({ left: direction * track.clientWidth, behavior: 'smooth' }); };
  const blurMainSearch = () => { setSearchFocused(false); mainSearchInput.current?.blur(); };
  if (session && (session.role === 'SYSTEM_ADMIN' || session.role === 'SUPERMARKET_ADMIN')) {
    return <AdminDashboard session={session} onSignOut={() => void signOut()} />;
  }
  return <main className="app-shell">
    <header className="header header-with-search"><a className="brand" href="#" onClick={(e) => { e.preventDefault(); setPage('home'); setSelectedProduct(null); }}><span className="brand-mark"><Store size={19} /></span><span>ForeignMart Hub<small>YOUR NEIGHBOURHOOD MARKET</small></span></a><form className="large-search" onSubmit={(e) => { e.preventDefault(); setPageIndex(0); setSearchFocused(false); setPage('shop'); setSelectedProduct(null) }}><Search size={21} /><input ref={mainSearchInput} value={query} onFocus={() => setSearchFocused(true)} onBlur={() => window.setTimeout(() => setSearchFocused(false), 160)} onChange={(e) => { setQuery(e.target.value); setPageIndex(0) }} placeholder="What are you looking for today?" aria-label="Search products" autoComplete="off" /><span className="search-divider" /><select aria-label="Search within category" value={category} onChange={(e) => { setCategory(e.target.value); setCategoryFilters([]); setPageIndex(0) }}>{categoryLabels.map((label) => <option value={label} key={label}>{label === 'All picks' ? 'All categories' : label}</option>)}</select><button type="submit" aria-label="Search"><Search size={18} /></button>{searchFocused && query.trim() && <div className="search-suggestions">{searchSuggestions.length ? searchSuggestions.map((product) => <button type="button" key={product.id} onMouseDown={(e) => e.preventDefault()} onClick={() => { setQuery(nameFor(product)); setCategory('All picks'); setCategoryFilters([]); setPageIndex(0); setSelectedProduct(null); setPage('shop'); setSearchFocused(false); mainSearchInput.current?.blur(); }}><span className="suggestion-image">{imageFor(product) ? <img src={imageFor(product)} alt="" /> : <span>🥬</span>}</span><span className="suggestion-copy"><b>{nameFor(product)}</b><small>{product.brand || product.unit || 'From your selected market'}</small></span><strong>{money(priceFor(product))}</strong></button>) : <p>No matching products in this market.</p>}</div>}</form><div className="header-actions">{session ? <div className="account-menu-wrap" ref={accountMenuRef}><button className="account-link" aria-expanded={accountMenu} onClick={() => setAccountMenu((open) => !open)} title="Open your account menu"><UserRound size={16} /><span>{profile.firstName || session.firstName || session.email.split('@')[0]}</span><ChevronDown size={14} /></button>{accountMenu && <div className="account-dropdown"><b>{profile.email || session.email}</b><button onClick={() => { setPage('orders'); setAccountMenu(false) }}><PackageCheck size={15} />Previous orders</button><button onClick={() => { setPage('account'); setAccountMenu(false) }}><UserRound size={15} />User profile</button><button onClick={() => { setPage('watchlist'); setAccountMenu(false) }}><Heart size={15} />Watchlist</button><button onClick={() => { setAccountMenu(false); void signOut() }}>Sign out</button></div>}</div> : <button className="signin-link" onClick={() => { blurMainSearch(); setModal('login') }}>Sign in</button>}<button className="bag-button cart-header-button" aria-label={`Cart, ${cartCount} items`} onClick={() => { blurMainSearch(); setCartOpen(true) }}><ShoppingCart size={19} /><b>{cartCount}</b></button></div></header>
    <nav className="customer-nav" aria-label="Customer navigation"><div className="shop-nav-wrap"><button className={`shop-nav-trigger ${page === 'shop' ? 'active' : ''}`} onClick={() => { setPage('shop'); setSelectedProduct(null); setPageIndex(0) }}>Shop <ChevronDown size={14} /></button><div className="shop-mega-menu"><div><span className="mega-label">SHOP BY COUNTRY</span><button onClick={() => { setCountryId('all'); setPage('shop') }}><MapPin size={15} />All countries</button>{countries.filter((country) => markets.some((shop) => String(shop.countryId) === String(country.id))).map((country) => <button key={country.id} onClick={() => { chooseCountry(String(country.id)); setPage('shop') }}><MapPin size={15} />{country.name}</button>)}</div><div><span className="mega-label">SHOP BY CATEGORY</span>{categoryLabels.map((label) => <button key={label} onClick={() => setShopCategory(label)}>{label}</button>)}</div><div className="mega-feature"><span className="mega-label">YOUR LOCAL PICKS</span><b>Good food, close to home.</b><p>Browse every product from the selected market, no account needed.</p><button onClick={() => { setPage('shop'); setCategory('All picks'); setQuery('') }}>Browse the full shop <ArrowRight size={14} /></button></div></div></div><button className={page === 'home' ? 'active' : ''} onClick={() => { setPage('home'); setSelectedProduct(null) }}>Deals</button>{navItems.filter(([key]) => key !== 'shop' && key !== 'home').map(([key, label]) => <button key={key} className={page === key ? 'active' : ''} onClick={() => { if (key === 'watchlist' && !session) { setModal('login'); setNotice('Sign in to view your watchlist.'); return; } setPage(key); setSelectedProduct(null); setPageIndex(0); }}>{label}{key === 'watchlist' && watchlist.length > 0 && <small>{watchlist.length}</small>}</button>)}</nav>

    <div className="main-content">
      {page === 'home' && <>
        <section className={`home-hero ${activeSlide.className}`}><div className="home-hero-copy"><span className="eyebrow"><span className="eyebrow-line" />{activeSlide.eyebrow}</span><h1>{activeSlide.title}</h1><p>{activeSlide.body}</p><button className="hero-cta" onClick={activeSlide.onClick}>{activeSlide.action}<ArrowRight size={16} /></button></div><div className="home-hero-art"><span className="hero-art-orbit orbit-one" /><span className="hero-art-orbit orbit-two" />{heroPhotos.length ? <div className="hero-photo-collage">{heroPhotos.map((product, index) => <img key={`${product.id}-${index}`} className={`hero-photo hero-photo-${index}`} src={imageFor(product)} alt={nameFor(product)} loading="lazy" />)}</div> : heroProduct && imageFor(heroProduct) ? <img className="hero-product-image" src={imageFor(heroProduct)} alt={nameFor(heroProduct)} /> : <span className="hero-art-emoji">{activeSlide.icon}</span>}{deals.length > 0 && <div className="hero-product-chip"><span className="sale-dot">−</span><span><small>MARKET OFFER</small><b>{nameFor(deals[homeSlide % deals.length])}</b><strong>{money(priceFor(deals[homeSlide % deals.length]))}</strong></span></div>}</div><button className="hero-arrow hero-prev" onClick={() => setHomeSlide((n) => (n + promoSlides.length - 1) % promoSlides.length)} aria-label="Previous slide"><ChevronLeft /></button><button className="hero-arrow hero-next" onClick={() => setHomeSlide((n) => (n + 1) % promoSlides.length)} aria-label="Next slide"><ChevronRight /></button><div className="hero-dots">{promoSlides.map((slide, i) => <button key={slide.title} className={i === homeSlide ? 'active' : ''} onClick={() => setHomeSlide(i)} aria-label={`Show slide ${i + 1}`} />)}</div></section>
        <section className="service-promises"><div><span className="promise-icon peach"><Truck size={19} /></span><span><b>Free delivery over ¥10,000</b><small>Delivered from your local store</small></span></div><i /><div><span className="promise-icon lilac"><Clock3 size={19} /></span><span><b>Delivery, right on time</b><small>Choose a convenient delivery address</small></span></div><i /><div><span className="promise-icon blue"><ShieldCheck size={19} /></span><span><b>Secure checkout</b><small>Your account and payment stay protected</small></span></div><i /><div><span className="promise-icon gold"><CreditCard size={19} /></span><span><b>Simple, trusted payment</b><small>Clear totals before you place your order</small></span></div></section>
        <section className="home-section promotion-section"><div className="section-title-row"><div><span className="eyebrow">PICKED FOR YOUR TABLE</span><h2>Promotions from your markets</h2><p>Special prices and local favourites, refreshed as you browse.</p></div><div className="promotion-controls"><button className="promotion-arrow" aria-label="Previous promotion" onClick={() => slidePromotions(-1)}><ChevronLeft size={18} /></button><button className="promotion-arrow" aria-label="Next promotion" onClick={() => slidePromotions(1)}><ChevronRight size={18} /></button><button className="text-link" onClick={() => setPage('deals')}>View all offers <ArrowRight size={15} /></button></div></div><div className="promotion-slider" ref={promotionTrack}>{promotionPages.length ? promotionPages.map((items, pageIndex) => <div className={`promotion-page promotion-page-count-${items.length}`} key={`promotion-page-${pageIndex}`}>{items.map((item, cardIndex) => <article className={`promo-tile promo-color-${(pageIndex * 3 + cardIndex) % 5}`} key={item.key}><div className="promo-tile-copy"><span className="promo-pill">WEEKLY OFFER · {item.shop?.name || 'LOCAL MARKET'}</span><h3>{nameFor(item.product)}</h3><p>Find a new favourite at this week’s special price.</p><div className="promo-price"><b>{money(priceFor(item.product))}</b><del>{money(item.product.priceJpy)}</del></div><button onClick={() => setPage('deals')}>Shop now <ArrowRight size={15} /></button></div>{promoImageFor(item.product) ? <img className="promo-tile-image" src={promoImageFor(item.product)} alt={nameFor(item.product)} loading="lazy" /> : <span className="promo-tile-image promo-tile-emoji" aria-hidden="true">{promoEmojiFor(item.product)}</span>}</article>)}</div>) : <div className="empty-state compact-empty"><Sparkles size={22} /><h3>New promotions are on their way</h3><p>Check back soon for offers from your local market.</p></div>}</div></section>
        <section className="home-section category-section"><div className="section-title-row"><div><span className="eyebrow">A LITTLE OF EVERYTHING</span><h2>Shop by category</h2><p>Find the right thing for today’s table.</p></div><button className="text-link" onClick={() => { setCategory('All picks'); setPage('shop') }}>Browse all categories <ArrowRight size={15} /></button></div><div className="category-slider" ref={categoryTrack}>{categories.map((item, i) => <button className="category-tile" key={item.id} onClick={() => setShopCategory(item.name)}><span className={`category-tile-image cat-tone-${i % 5}`}>{categoryImage(item, i) ? <img src={categoryImage(item, i)} alt="" loading="lazy" /> : <span>{['🥬', '🍊', '🍞', '🍵', '🍓'][i % 5]}</span>}</span><b>{item.name}</b><small>Explore category <ArrowRight size={12} /></small></button>)}</div></section>
        <section className="home-section home-deals"><div className="section-title-row"><div><span className="eyebrow">GOOD FINDS, BETTER PRICES</span><h2>Deals worth discovering</h2><p>Limited-time prices from {activeStore?.name || 'your selected market'}.</p></div><button className="text-link" onClick={() => setPage('deals')}>See all deals <ArrowRight size={15} /></button></div>{deals.length ? <div className="product-grid">{deals.slice(0, 4).map(productCard)}</div> : <div className="empty-state compact-empty"><Sparkles size={22} /><h3>New offers are on their way</h3><p>Check back soon for special prices from this market.</p></div>}</section>
        <section className="home-bottom-banner"><div><span className="eyebrow">A MARKET THAT FEELS CLOSE</span><h2>Your neighbourhood, delivered.</h2><p>Shop from the markets you know, discover something new, and get it brought to your door.</p><button className="hero-cta" onClick={() => setPage('shop')}>Explore the shop <ArrowRight size={16} /></button></div><div className="bottom-banner-art">🧺</div></section>
      </>}
      {page === 'shop' && <>
        <div className="shop-banner-benefits"><section className={`shop-mini-slider ${shopSlide % 2 ? 'mini-second' : ''}`}><div><span className="eyebrow">{shopSlide % 2 ? 'MEET YOUR MARKET' : 'A LITTLE SOMETHING SPECIAL'}</span><h1>{shopSlide % 2 ? activeStore?.name || 'Your neighbourhood market' : `${deals.length || 'Weekly'} offers to enjoy`}</h1><p>{shopSlide % 2 ? activeStore?.description || 'Discover the market behind your everyday favourites.' : miniProduct ? `Save on ${nameFor(miniProduct)} and discover more weekly picks from ${activeStore?.name || 'your local market'}.` : 'Discover discounted favourites and fresh picks, updated by your local shop.'}</p><button onClick={() => shopSlide % 2 ? setPage('stores') : setPage('deals')}>{shopSlide % 2 ? 'Shop details' : 'Shop offers'} <ArrowRight size={15} /></button></div><div className="mini-banner-collage"><div className="mini-banner-bubble bubble-produce">{bannerProduce && imageFor(bannerProduce) ? <img src={imageFor(bannerProduce)} alt={nameFor(bannerProduce)} /> : <span>🥬</span>}</div><div className="mini-banner-bubble bubble-meat">{bannerMeat && imageFor(bannerMeat) ? <img src={imageFor(bannerMeat)} alt={nameFor(bannerMeat)} /> : <span>🥩</span>}</div><div className="mini-banner-bubble bubble-feature">{miniProduct && imageFor(miniProduct) ? <img src={imageFor(miniProduct)} alt={nameFor(miniProduct)} /> : <span>{shopSlide % 2 ? '🏪' : '🍊'}</span>}</div><span className="mini-banner-stamp">FRESH<br/>TODAY</span></div><button className="mini-slide-arrow" onClick={() => setShopSlide((n) => (n + 1) % 2)} aria-label="Next shop banner"><ChevronRight size={20} /></button><div className="mini-slide-dots"><i className={shopSlide % 2 ? '' : 'active'} /><i className={shopSlide % 2 ? 'active' : ''} /></div></section><div className="shop-benefit-rows"><div><span><Apple size={20}/></span><b>Fresh &amp; thoughtful picks</b><small>Everyday favourites from your local market</small></div><div><span><Truck size={20}/></span><b>Free delivery over ¥10,000</b><small>More in your basket, less on delivery</small></div><div><span><ShieldCheck size={20}/></span><b>Secure payment</b><small>Protected checkout for every order</small></div></div></div>
        <div className="market-choice-block"><div className="market-choice-heading"><div className="market-choice-copy"><span className="eyebrow">COMPARE LOCAL MARKETS</span></div><div className="market-choice-summary"><strong>{activeStore?.name || 'Choose a market'}</strong><span>{visible.length} products</span></div></div><div className="market-choice-grid">{filteredMarkets.slice(0, 8).map((shop) => <article className={`market-choice-card ${String(shop.id) === String(market?.id) ? 'selected' : ''}`} key={shop.id}><div className="market-choice-icon"><Store size={20} /></div><div className="market-choice-info"><b>{shop.name}{shop.city && <small className="market-choice-city"> · {shop.city}</small>}</b></div><button onClick={() => { setMarket(shop); setPageIndex(0); setCategory('All picks'); setCategoryFilters([]) }}>{String(shop.id) === String(market?.id) ? 'Viewing prices' : 'View prices'}</button></article>)}</div>{filteredMarkets.length > 8 && <><div className="market-choice-more-label">MORE LOCAL MARKETS <span>Swipe to explore</span></div><div className="market-choice-slider">{filteredMarkets.slice(8).map((shop) => <article className={`market-choice-card ${String(shop.id) === String(market?.id) ? 'selected' : ''}`} key={shop.id}><div className="market-choice-icon"><Store size={20} /></div><div className="market-choice-info"><b>{shop.name}{shop.city && <small className="market-choice-city"> · {shop.city}</small>}</b></div><button onClick={() => { setMarket(shop); setPageIndex(0); setCategory('All picks'); setCategoryFilters([]) }}>{String(shop.id) === String(market?.id) ? 'Viewing prices' : 'View prices'}</button></article>)}</div></>}</div><div className="shop-layout"><aside className="shop-sidebar"><div className="sidebar-title"><span className="eyebrow">REFINE YOUR SHOP</span><button onClick={() => { setCategory('All picks'); setCategoryFilters([]); setQuery(''); setSortOrder('recommended') }}>Clear</button></div><h3>Country</h3><label className="sidebar-select"><MapPin size={15} /><select aria-label="Filter markets by country" value={countryId} onChange={(e) => chooseCountry(e.target.value)}><option value="all">All countries</option>{countries.filter((c) => markets.some((m) => String(m.countryId) === String(c.id))).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select><ChevronDown size={14} /></label><h3>Categories</h3><div className="sidebar-categories">{categoryLabels.map((label) => { const checked = label === 'All picks' ? categoryFilters.length === 0 && category === 'All picks' : categoryFilters.includes(label); return <label key={label} className={`sidebar-category-option ${checked ? 'active' : ''}`}><input type="checkbox" checked={checked} onChange={() => { setPageIndex(0); if (label === 'All picks') { setCategory('All picks'); setCategoryFilters([]); } else { setCategory('All picks'); setCategoryFilters((old) => old.includes(label) ? old.filter((name) => name !== label) : [...old, label]); } }} />{categoryIcon(label)}<span className="category-option-name">{label}</span><span>{label === 'All picks' ? products.length : products.filter((p) => String(p.categoryId) === String(categories.find((c) => c.name === label)?.id)).length}</span></label>; })}</div><div className="sidebar-help"><span>Need a hand?</span><p>Browse products freely. Sign in only when you’re ready to check out.</p><button onClick={() => setNotice('For order help, contact the supermarket listed on your order.')}>Customer help <ArrowRight size={13} /></button></div></aside><section className="shop-results"><div className="shop-search-inline"><Search size={19} /><input value={query} onChange={(e) => { setQuery(e.target.value); setPageIndex(0) }} placeholder="Search this market" /><select aria-label="Filter products by category" value={category} onChange={(e) => { setCategory(e.target.value); setCategoryFilters([]); setPageIndex(0) }}>{categoryLabels.map((label) => <option key={label} value={label}>{label === 'All picks' ? 'All categories' : label}</option>)}</select></div>
          {error && <div className="backend-state inline-backend"><div><b>Catalog connection failed</b><p>{error}. Check the backend service and database, then reload.</p></div><button onClick={retryCatalog}>Retry</button></div>}{loading ? <div className="loading-state"><span className="loader" />Loading products from {activeStore?.name || 'the selected supermarket'}…</div> : !market ? <div className="empty-state"><Store size={30} /><h3>Choose a supermarket to start</h3><p>Select a market to browse all of its products.</p></div> : visible.length ? <><div className="catalog-heading shop-catalog-heading"><span>{visible.length} products · prices in JPY</span><div className="catalog-view-tools"><button className={productView === 'grid' ? 'active' : ''} aria-label="Show products in grid" title="Grid view" onClick={() => setProductView('grid')}>▦</button><button className={productView === 'list' ? 'active' : ''} aria-label="Show products in list" title="List view" onClick={() => setProductView('list')}>☷</button><select aria-label="Sort products" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)}><option value="recommended">Recommended</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option></select></div></div><div className={`product-grid ${productView === 'list' ? 'product-list-view' : ''}`}>{displayedProducts.map(productCard)}</div>{visible.length > displayedProducts.length && <div className="load-more"><button onClick={() => setPageIndex((n) => n + 1)}>Load more products <ArrowDown size={15} /></button></div>}</> : error ? null : <div className="empty-state"><span>✳</span><h3>{products.length ? 'No matching products' : 'This market is getting its shelves ready'}</h3><p>{products.length ? 'Try another search term or category.' : 'Product ranges vary by market. Choose another local shop to browse what is available there.'}</p>{products.length > 0 ? <button onClick={() => { setQuery(''); setCategory('All picks'); setCategoryFilters([]) }}>Clear filters</button> : <div className="empty-market-actions">{markets.filter((shop) => String(shop.id) !== String(market?.id)).map((shop) => <button key={shop.id} onClick={() => { setMarket(shop); setCategory('All picks'); setCategoryFilters([]); setQuery('') }}><Store size={14} />{shop.name}<ArrowRight size={13} /></button>)}</div>}</div>}</section></div>
      </>}
      {page === 'cart' && <section className="cart-page"><div className="cart-page-heading"><span className="eyebrow">YOUR BASKET</span><h1>Your cart</h1><p>Review quantities and totals for each market.</p></div>{cartCount ? <div className="cart-page-groups">{Object.entries(cartByMarket).filter(([, lines]) => lines.length).map(([key, lines]) => { const shop = markets.find((item) => String(item.id) === key); const total = lines.reduce((sum, line) => sum + priceFor(line.product) * line.quantity, 0); return <section className="cart-page-group" key={key}><div className="cart-page-store"><Store size={18} /><div><b>{shop?.name || 'Selected market'}</b><small>{lines.length} {lines.length === 1 ? 'product' : 'products'}</small></div></div>{lines.map(({ product, quantity }) => <article className="cart-page-line" key={product.id}><div className="cart-page-thumb">{imageFor(product) ? <img src={imageFor(product)} alt="" /> : <span>🛒</span>}</div><div className="cart-page-product"><b>{nameFor(product)}</b><small>{product.unit || 'Market pick'}</small><strong>{money(priceFor(product))}</strong></div><div className="cart-quantity-control"><button aria-label={`Remove one ${nameFor(product)}`} onClick={() => void changeQty(product.id, -1, key)}><Minus size={14} /></button><b>{quantity}</b><button aria-label={`Add one ${nameFor(product)}`} onClick={() => void changeQty(product.id, 1, key)}><Plus size={14} /></button></div><strong className="cart-page-line-total">{money(priceFor(product) * quantity)}</strong></article>)}<div className="cart-page-subtotal"><span>Market subtotal</span><b>{money(total)}</b></div><button className="primary-button" onClick={() => { setMarket(shop || market); void beginCheckout(key) }}>Checkout from {shop?.name || 'this market'} <ArrowRight size={15} /></button></section>; })}<div className="cart-page-total"><span>All markets total</span><b>{money(Object.values(cartByMarket).flat().reduce((sum, line) => sum + priceFor(line.product) * line.quantity, 0))}</b></div><button className="text-link" onClick={() => setPage('shop')}>Continue shopping <ArrowRight size={15} /></button></div> : <div className="empty-state"><ShoppingCart size={30} /><h3>Your cart is empty</h3><p>Add a product and its quantity will appear here.</p><button onClick={() => setPage('shop')}>Browse products</button></div>}</section>}
      {page === 'deals' && <PageSection eyebrow="CURRENT OFFERS" title="Discount products" description={`Special prices from ${activeStore?.name || 'the selected supermarket'}.`} loading={loading} empty={!deals.length} emptyTitle="No discounts right now" emptyText="Check back later for special prices from this supermarket."><div className="product-grid">{deals.map(productCard)}</div></PageSection>}
      {page === 'new' && <PageSection eyebrow="JUST ADDED" title="New arrivals" description="Recently added products from this supermarket." loading={loading} empty={!arrivals.length} emptyTitle="No new products yet" emptyText="New products from this supermarket will appear here."><div className="product-grid">{arrivals.slice(0, 40).map(productCard)}</div></PageSection>}
      {page === 'stores' && <PageSection className="stores-page" eyebrow="OUR MARKETS" title="Shop details" description="Contact and location information for each supermarket." loading={loading && !markets.length} empty={!filteredMarkets.length} emptyTitle="No supermarkets available" emptyText="Market information will appear here when available."><div className="store-detail-grid">{filteredMarkets.map((shop) => <article className="store-detail-card" key={shop.id}><div className="store-detail-top"><span className="store-choice-logo"><Store size={21} /></span><div><h3>{shop.name}</h3><small>{shop.active ? 'Open for shopping' : 'Currently unavailable'}</small></div><button className={String(shop.id) === String(market?.id) ? 'selected-store-button' : 'select-store-button'} onClick={() => { setMarket(shop); setPage('shop') }}>{String(shop.id) === String(market?.id) ? 'Selected' : 'Shop here'}</button></div><p>{shop.description || 'Local supermarket serving the community.'}</p><dl><div><dt>Location</dt><dd>{[shop.postalCode, shop.prefecture, shop.city, shop.town, shop.addressLine, shop.buildingName].filter(Boolean).join(' ') || 'Address not provided'}</dd></div><div><dt>Contact</dt><dd>{shop.phoneNumber || shop.mobileNumber || shop.email || 'Contact details not provided'}</dd></div>{shop.website && <div><dt>Website</dt><dd><a href={shop.website} target="_blank" rel="noreferrer">{shop.website}</a></dd></div>}</dl></article>)}</div></PageSection>}
      {page === 'watchlist' && <PageSection eyebrow="SAVED FOR LATER" title="Your watchlist" description="Products you have saved from their detail page." loading={false} empty={!watchlist.length} emptyTitle="Your watchlist is empty" emptyText="Save products from their detail page and they will appear here.">{pageProducts.length ? <div className="product-grid">{pageProducts.map(productCard)}</div> : watchlist.length ? <div className="empty-state"><Heart size={28} /><h3>Not in this market</h3><p>These products are not listed at the selected supermarket. Choose another store above.</p><div className="watchlist-names">{watchlist.map((w) => <span key={w.id}>{w.name || w.productName || 'Saved product'}</span>)}</div></div> : null}</PageSection>}
      {page === 'orders' && <PageSection className="orders-page" eyebrow="YOUR ACCOUNT" title="Your orders" description="A clear view of your recent purchases and delivery progress." loading={false} empty={!session || !orders.length} emptyTitle={!session ? 'Sign in to see your orders' : 'No orders yet'} emptyText={!session ? 'Your purchases and delivery updates will appear here after you sign in.' : 'Your completed checkouts will appear here.'}><div className="orders-list">{orders.map((order) => { const canCancel = ['PENDING', 'CONFIRMED'].includes(order.status); return <article className="order-card order-card-rich" key={order.id}><div className="order-card-head"><span className="order-icon"><PackageCheck size={20} /></span><div><b>{order.orderNumber || `Order #${order.id}`}</b><small>{new Date(order.placedAt || order.createdAt || Date.now()).toLocaleDateString()}</small></div><span className={`status-pill status-${String(order.status || 'pending').toLowerCase()}`}>{order.status || 'PENDING'}</span></div><div className="order-store-line"><Store size={15} />{order.supermarketName || 'Supermarket'}<span>·</span>{(order.items || []).length} {(order.items || []).length === 1 ? 'item' : 'items'}</div>{(order.items || []).length > 0 && <div className="order-item-previews">{(order.items || []).slice(0, 4).map((item: AnyRecord, index: number) => <div key={item.id || index} title={item.productName || item.name}>{item.imageUrl ? <img src={imageFor({ imageUrl: item.imageUrl })} alt="" /> : <span>{['🥬', '🍊', '🍞', '🍵'][index % 4]}</span>}</div>)}{(order.items || []).length > 4 && <small>+{order.items.length - 4} more</small>}</div>}<div className="order-card-footer"><span>{canCancel ? 'Your order is being prepared' : 'Order total'}</span><b>{money(order.totalJpy)}</b></div>{canCancel && <button className="cancel-order" onClick={() => void cancelOrder(order)}>Cancel order</button>}</article>; })}<button className="subtle-button order-account-link" onClick={() => setPage('account')}>Manage profile and delivery addresses <ArrowRight size={14} /></button></div></PageSection>}
      {page === 'product' && selectedProduct && <section className="product-detail-page"><button className="back-link" onClick={() => setPage('shop')}><ArrowLeft size={16} /> Back to {activeStore?.name || 'products'}</button><div className="product-detail-layout"><div className="product-detail-image">{imageFor(selectedProduct) ? <img src={imageFor(selectedProduct)} alt={nameFor(selectedProduct)} /> : <span>🛒</span>}<button className={`save-button ${watchlist.some((w) => Number(w.id || w.productId) === Number(selectedProduct.productId)) ? 'saved' : ''}`} onClick={() => void toggleWatchlist(selectedProduct)} aria-label="Toggle watchlist"><Heart size={19} /></button></div><div className="product-detail-info"><span className="eyebrow"><span className="eyebrow-line" /> {selectedProduct.brand || activeStore?.name || 'MARKET PRODUCT'}</span><h1>{nameFor(selectedProduct)}</h1><p className="detail-unit">{selectedProduct.unit || 'Market selection'} · SKU {selectedProduct.sku || '—'}</p><div className="detail-price">{money(priceFor(selectedProduct))}{Number(selectedProduct.discountPriceJpy) > 0 && <del>{money(selectedProduct.priceJpy)}</del>}</div><p className="detail-description">{productDetails?.description || selectedProduct.description || 'Product information is provided by the supermarket.'}</p><p className="availability"><span className={selectedProduct.available ? 'available-dot' : 'unavailable-dot'} />{selectedProduct.available && Number(selectedProduct.stockQuantity) > 0 ? `In stock · ${selectedProduct.stockQuantity} available` : 'Currently unavailable'}</p><div className="detail-actions"><div className="qty-control"><button onClick={() => setProductQuantity((n) => Math.max(1, n - 1))}><Minus size={13} /></button><span>{productQuantity}</span><button onClick={() => setProductQuantity((n) => n + 1)}><Plus size={13} /></button></div><button className="primary-button" disabled={!selectedProduct.available} onClick={() => void add(selectedProduct, productQuantity)}>Add to bag <ShoppingBag size={16} /></button><button className="buy-now-button" disabled={!selectedProduct.available} onClick={() => void buyNow(selectedProduct)}>Buy now</button></div><div className="detail-facts"><div><span>Market</span><b>{activeStore?.name || '—'}</b></div><div><span>Brand</span><b>{selectedProduct.brand || '—'}</b></div><div><span>Unit</span><b>{selectedProduct.unit || '—'}</b></div></div></div></div><section className="reviews-section"><div className="catalog-heading"><div><span className="eyebrow"><span className="eyebrow-line" /> CUSTOMER VOICES</span><h2>Reviews</h2></div><span>{reviews.length} reviews</span></div>{session ? <form className="review-form" action={() => void submitReview()}><label>Rate it <select value={reviewRating} onChange={(e) => setReviewRating(Number(e.target.value))}>{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{'★'.repeat(n)} ({n})</option>)}</select></label><textarea value={reviewText} onChange={(e) => setReviewText(e.target.value)} placeholder="Share your thoughts about this product" maxLength={2000} /><button className="primary-button">Save review <ArrowRight size={15} /></button></form> : <button className="subtle-button" onClick={() => setModal('login')}>Sign in to leave a review</button>}{reviews.map((review) => <article className="review-card" key={review.id}><b>{review.customerName || review.userName || 'Customer'}</b><span className="review-stars">{'★'.repeat(Number(review.rating || 0))}</span><p>{review.comment}</p></article>)}</section></section>}
      {page === 'product' && selectedProduct && products.some((item) => item.id !== selectedProduct.id) && <section className="related-section"><div className="catalog-heading"><div><span className="eyebrow"><span className="eyebrow-line" /> FROM THIS MARKET</span><h2>More to explore</h2></div></div><div className="product-grid">{products.filter((item) => item.id !== selectedProduct.id).slice(0, 5).map(productCard)}</div></section>}
      {page === 'account' && <PageSection eyebrow="YOUR ACCOUNT" title="Manage account" description="Profile information and saved delivery addresses." loading={false} empty={!session} emptyTitle="Sign in to manage your account" emptyText="Your profile and delivery addresses are available after sign-in."><div className="account-grid"><section className="account-panel"><h2>Profile details</h2><form action={(form) => void saveProfile(form)}><label>Email address<input value={profile.email || session?.email || ''} readOnly /></label><label>First name<input name="firstName" required defaultValue={profile.firstName || ''} /></label><label>Last name<input name="lastName" required defaultValue={profile.lastName || ''} /></label><label>Phone number<input name="phoneNumber" required defaultValue={profile.phoneNumber || ''} /></label><button className="primary-button">Save profile <Check size={15} /></button></form></section><section className="account-panel"><div className="account-panel-head"><div><h2>Delivery addresses</h2><p>Choose a default address for faster checkout.</p></div><button className="subtle-button" onClick={() => { setEditingAddress(null); setPostalHint(''); setModal('address') }}>+ Add address</button></div>{addresses.length ? addresses.map((address) => <article className="address-card" key={address.id}><div><b>{address.label || address.recipientName}</b>{address.defaultAddress && <span className="default-badge">Default</span>}<p>{address.recipientName} · {address.phoneNumber}<br />{address.postalCode} {address.prefecture} {address.city} {address.town}<br />{address.addressLine} {address.buildingName || ''} {address.roomNumber || ''}</p></div><div className="address-actions"><button onClick={() => { setEditingAddress(address); setPostalHint(''); setModal('address') }}>Edit</button>{!address.defaultAddress && <button onClick={() => void defaultAddress(address)}>Set default</button>}<button className="danger-link" onClick={() => void deleteAddress(address)}><Trash2 size={14} /></button></div></article>) : <div className="empty-address">No saved addresses yet. Add one for a faster checkout.</div>}</section></div></PageSection>}
    </div>
    <footer className="site-footer"><div className="footer-main"><div className="footer-brand-col"><a className="brand" href="#" onClick={(e) => { e.preventDefault(); setPage('home') }}><span className="brand-mark"><Store size={19} /></span><span>ForeignMart<small>YOUR NEIGHBOURHOOD MARKET</small></span></a><p>Good food, familiar markets, delivered with care. Browse freely and find something lovely for the table.</p><div className="footer-promise"><Truck size={16} /><span>Free delivery on orders over ¥10,000</span></div></div><div className="footer-links"><b>Explore</b><button onClick={() => setPage('shop')}>Shop all products</button><button onClick={() => setPage('deals')}>Current offers</button><button onClick={() => setPage('new')}>New arrivals</button><button onClick={() => setPage('stores')}>Our markets</button></div><div className="footer-links"><b>Your account</b><button onClick={() => session ? setPage('orders') : setModal('login')}>Previous orders</button><button onClick={() => session ? setPage('account') : setModal('login')}>Profile & addresses</button><button onClick={() => session ? setPage('watchlist') : setModal('login')}>Saved watchlist</button><button onClick={() => setNotice('For order help, contact the supermarket listed on your order.')}>Customer help</button></div><div className="footer-market-card"><span className="eyebrow">YOUR SELECTED MARKET</span><div className="footer-market-info">{activeStore?.logoUrl ? <img src={imageFor({ imageUrl: activeStore.logoUrl })} alt="" /> : <span className="footer-market-icon"><Store size={19} /></span>}<span><b>{activeStore?.name || 'Choose a local market'}</b><small>{activeStore?.city || 'Explore neighbourhood shops'}</small></span></div><button onClick={() => { setMarketMenu(true); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Change market <ArrowRight size={14} /></button><div className="footer-secure"><ShieldCheck size={15} /> Secure checkout when you’re ready</div></div></div><div className="footer-bottom"><span>© 2026 ForeignMart · Shopping with your neighbourhood markets.</span><span>Thoughtful finds, close to home.</span></div></footer>

    {notice && <div className="toast"><Check size={16} />{notice}<button onClick={() => setNotice('')}><X size={15} /></button></div>}
    {cartOpen && <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) setCartOpen(false) }}><aside className="cart-drawer"><div className="drawer-head"><div><span className="eyebrow">YOUR BAG</span><h2>Shopping cart <span>({cartCount} items)</span></h2></div><button className="icon-button" onClick={() => setCartOpen(false)} aria-label="Close bag"><X size={20} /></button></div><div className="cart-lines multi-cart">{Object.entries(cartByMarket).filter(([, lines]) => lines.length).length ? Object.entries(cartByMarket).filter(([, lines]) => lines.length).map(([key, lines]) => { const shop = markets.find((item) => String(item.id) === key); const total = lines.reduce((sum, line) => sum + priceFor(line.product) * line.quantity, 0); return <section className="cart-store-group" key={key}><div className="cart-store-title"><Store size={16} /><b>{shop?.name || 'Selected supermarket'}</b><span>{lines.length} products</span></div>{lines.map(({ product, quantity }) => <div className="cart-line" key={product.id}><div className="cart-thumb">{imageFor(product) ? <img src={imageFor(product)} alt="" /> : <span>🛒</span>}</div><div className="cart-description"><b>{nameFor(product)}</b><small>{product.unit || 'Market pick'}</small><strong>{money(priceFor(product))}</strong></div><div className="qty-control"><button onClick={() => void changeQty(product.id, -1, key)} aria-label="Decrease quantity"><Minus size={13} /></button><span>{quantity}</span><button onClick={() => void changeQty(product.id, 1, key)} aria-label="Increase quantity"><Plus size={13} /></button></div></div>)}<div className="store-cart-bottom"><span>Subtotal</span><b>{money(total)}</b><button className="primary-button" onClick={() => { setMarket(shop || market); setCartOpen(false); void beginCheckout(key) }}>Checkout this store <ArrowRight size={15} /></button></div></section>; }) : <div className="empty-bag"><span>🛍</span><h3>Your bag is empty</h3><p>Choose a supermarket and add products to get started.</p><button onClick={() => { setCartOpen(false); setPage('shop') }}>Browse products</button></div>}</div><div className="cart-bottom"><small>Products from different supermarkets are checked out as separate orders.</small><div className="cart-drawer-actions"><button className="continue-shopping" onClick={() => setCartOpen(false)}>Keep browsing</button><button className="primary-button" onClick={() => { setCartOpen(false); setPage('cart') }}>View cart <ArrowRight size={15} /></button></div></div></aside></div>}
    {modal && <div className="scrim modal-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) setModal(null) }}><section className="auth-modal"><button className="modal-close icon-button" onClick={() => setModal(null)} aria-label="Close dialog"><X size={20} /></button>{modal === 'login' || modal === 'register' ? <><span className="eyebrow"><span className="eyebrow-line" /> {checkoutAfterAuth ? 'CHECKOUT' : 'YOUR ACCOUNT'}</span><h2>{modal === 'login' ? 'Welcome back.' : 'Create your account.'}</h2><p>{checkoutAfterAuth ? 'Sign in to continue to your supermarket checkout.' : 'You can browse the market without signing in.'}</p><form action={(form) => authenticate(modal as 'login' | 'register', form).catch((e) => setNotice(e.message))}>{modal === 'register' && <div className="form-row"><input name="firstName" required placeholder="First name" /><input name="lastName" required placeholder="Last name" /></div>}<input type="email" name="email" required placeholder="Email address" />{modal === 'register' && <input name="phoneNumber" required placeholder="Phone number" />}<input type="password" name="password" required minLength={8} placeholder="Password" /><button className="primary-button full-button">{modal === 'login' ? 'Sign in' : 'Create account'} <ArrowRight size={16} /></button></form><div className="modal-switch">{modal === 'login' ? <>New to ForeignMart? <button onClick={() => setModal('register')}>Create an account</button></> : <>Already have an account? <button onClick={() => setModal('login')}>Sign in</button></>}</div></> : modal === 'checkout' ? <><span className="eyebrow"><span className="eyebrow-line" /> CHECKOUT · {markets.find((s) => String(s.id) === checkoutMarketId)?.name || activeStore?.name}</span><h2>Delivery details</h2><p>Choose an address or add one for this order.</p><form action={(form) => checkout(form).catch((e) => setNotice(e.message))}>{addresses.length > 0 && <select value={checkoutAddressId} onChange={(e) => { setCheckoutAddressId(e.target.value); setAddressRequired(e.target.value === 'new') }}><option value="new">Add a new address</option>{addresses.map((a) => <option key={a.id} value={a.id}>{a.label || a.recipientName} · {a.city}{a.defaultAddress ? ' (Default)' : ''}</option>)}</select>}{(addressRequired || checkoutAddressId === 'new') && <><button type="button" className="location-fill-button" disabled={locationBusy} onClick={(e) => useCurrentLocation(e.currentTarget.form)}><MapPin size={15} />{locationBusy ? 'Finding location…' : 'Use current location'}</button><input name="recipientName" required placeholder="Recipient name" /><input name="phoneNumber" required placeholder="Phone number" /><div className="form-row"><input name="postalCode" required pattern="[0-9]{3}-[0-9]{4}" placeholder="Postal code (123-4567)" onChange={(e) => { const digits = e.currentTarget.value.replace(/\D/g, ''); if (digits.length === 7) void loadPostalCode(e.currentTarget.value, e.currentTarget.form); else lastPostalLookup.current = ''; }} onBlur={(e) => void loadPostalCode(e.currentTarget.value, e.currentTarget.form)} /><input name="prefecture" required placeholder="Prefecture" /></div><div className="form-row"><input name="city" required placeholder="City" /><input name="town" required placeholder="Town / ward" /></div><input name="addressLine" required placeholder="Street address" /><input name="buildingName" placeholder="Building (optional)" /><input name="roomNumber" placeholder="Room number (optional)" /><small className="checkout-hint">{postalHint}</small></>}<button className="primary-button full-button">Place order <span>{money((cartByMarket[checkoutMarketId] || []).reduce((sum, line) => sum + priceFor(line.product) * line.quantity, 0))}</span><ArrowRight size={16} /></button></form></> : <><span className="eyebrow"><span className="eyebrow-line" /> SAVED ADDRESS</span><h2>{editingAddress ? 'Edit address' : 'Add delivery address'}</h2><p>Japanese postal codes use the format 123-4567. Enter one to fill in the area automatically.</p><form action={(form) => saveAddress(form)}><button type="button" className="location-fill-button" disabled={locationBusy} onClick={(e) => useCurrentLocation(e.currentTarget.form)}><MapPin size={15} />{locationBusy ? 'Finding location…' : 'Use current location'}</button><input name="label" placeholder="Address label (Home, Work)" defaultValue={editingAddress?.label || ''} /><input name="recipientName" required placeholder="Recipient name" defaultValue={editingAddress?.recipientName || ''} /><input name="phoneNumber" required placeholder="Phone number" defaultValue={editingAddress?.phoneNumber || ''} /><div className="form-row"><input name="postalCode" required placeholder="Postal code (123-4567)" defaultValue={editingAddress?.postalCode || ''} onChange={(e) => { const digits = e.currentTarget.value.replace(/\D/g, ''); if (digits.length === 7) void loadPostalCode(e.currentTarget.value, e.currentTarget.form); else lastPostalLookup.current = ''; }} onBlur={(e) => void loadPostalCode(e.currentTarget.value, e.currentTarget.form)} /><input name="prefecture" required placeholder="Prefecture" defaultValue={editingAddress?.prefecture || ''} /></div><div className="form-row"><input name="city" required placeholder="City" defaultValue={editingAddress?.city || ''} /><input name="town" required placeholder="Town / ward" defaultValue={editingAddress?.town || ''} /></div><input name="addressLine" required placeholder="Street address" defaultValue={editingAddress?.addressLine || ''} /><div className="form-row"><input name="buildingName" placeholder="Building" defaultValue={editingAddress?.buildingName || ''} /><input name="roomNumber" placeholder="Room" defaultValue={editingAddress?.roomNumber || ''} /></div><label className="checkbox-label"><input type="checkbox" name="defaultAddress" defaultChecked={editingAddress?.defaultAddress || addresses.length === 0} /> Set as default address</label><small className="checkout-hint">{postalHint}</small><button className="primary-button full-button">Save address <Check size={15} /></button></form></>}</section></div>}
  </main>;
}

function PageSection({ eyebrow, title, description, loading, empty, emptyTitle, emptyText, children, className = '' }: { eyebrow: string; title: string; description: string; loading: boolean; empty: boolean; emptyTitle: string; emptyText: string; children: React.ReactNode; className?: string }) {
  return <section className={`catalog-section page-section ${className}`}><div className="catalog-heading"><div><span className="eyebrow"><span className="eyebrow-line" /> {eyebrow}</span><h2>{title}</h2><p>{description}</p></div></div>{loading ? <div className="loading-state"><span className="loader" />Loading…</div> : empty ? <div className="empty-state"><span>✳</span><h3>{emptyTitle}</h3><p>{emptyText}</p></div> : children}</section>;
}
