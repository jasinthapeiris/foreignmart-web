'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, Check, ChevronDown, Clock3, Heart, Leaf, MapPin, Menu, Minus, PackageCheck, Plus, Search, ShoppingBag, Sparkles, Store, Trash2, X, Truck, ShieldCheck, CreditCard, UserRound, ChevronLeft, ChevronRight } from 'lucide-react';

const API = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api/v1').replace(/\/$/, '');
type AnyRecord = Record<string, any>;
type CartLine = { product: AnyRecord; quantity: number };
type Session = { accessToken: string; refreshToken: string; email: string; firstName?: string };

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
  return terms.some((term) => !generic.has(term) && path.includes(term)) ? image : '';
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
  const [page, setPage] = useState<'home' | 'shop' | 'deals' | 'new' | 'stores' | 'watchlist' | 'orders' | 'product' | 'account'>('home');
  const [selectedProduct, setSelectedProduct] = useState<AnyRecord | null>(null);
  const [productDetails, setProductDetails] = useState<AnyRecord | null>(null);
  const [reviews, setReviews] = useState<AnyRecord[]>([]);
  const [watchlist, setWatchlist] = useState<AnyRecord[]>([]);
  const [orders, setOrders] = useState<AnyRecord[]>([]);
  const [addresses, setAddresses] = useState<AnyRecord[]>([]);
  const [profile, setProfile] = useState<AnyRecord>({});
  const [postalHint, setPostalHint] = useState('');
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
  const categoryTrack = useRef<HTMLDivElement | null>(null);
  const promotionTrack = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      const savedCart = localStorage.getItem('fm-cart'); if (savedCart) { const parsed = JSON.parse(savedCart); setCartByMarket(Array.isArray(parsed) ? { guest: parsed } : parsed); }
      const savedSession = localStorage.getItem('fm-session'); if (savedSession) setSession(JSON.parse(savedSession));
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
  useEffect(() => { if (market) { setLoading(true); setError(''); setProducts([]); Promise.all([request(`/supermarkets/${market.id}/products`), request('/products?page=0&size=100&sort=name,asc')]).then(([inventory, catalog]) => {
    const catalogRows: AnyRecord[] = Array.isArray(catalog) ? catalog : catalog?.content || [];
    const byId = new Map(catalogRows.map((p) => [String(p.id), p]));
    const rows: AnyRecord[] = Array.isArray(inventory) ? inventory : [];
    setProducts(rows.map((p) => { const details = byId.get(String(p.productId)); return { ...p, categoryId: details?.categoryId, categories: details?.categories || [], description: details?.description }; }));
  }).catch((e) => setError(e.message)).finally(() => setLoading(false)); } }, [market]);
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
    if (!session) return;
    Promise.all([request('/orders?page=0&size=100&sort=placedAt,desc', {}, session.accessToken), request('/wishlist', {}, session.accessToken), request('/users/me', {}, session.accessToken), request('/addresses', {}, session.accessToken)]).then(([o, w, p, a]) => {
      setOrders(Array.isArray(o) ? o : o?.content || []); setWatchlist(Array.isArray(w) ? w : []); setProfile(p || {}); setAddresses(Array.isArray(a) ? a : []);
    }).catch((e) => setNotice(e.message));
  }, [session]);
  useEffect(() => {
    if (!session || !market) return;
    request(`/cart?supermarketId=${market.id}`, {}, session.accessToken).then((remote) => {
      const items: AnyRecord[] = remote?.items || [];
      const mapped = items.map((item) => ({ product: { id: Number(item.supermarketProductId), productId: item.productId, productName: item.productName, imageUrl: item.imageUrl, effectivePriceJpy: item.unitPriceJpy, priceJpy: item.unitPriceJpy, unit: item.unit || 'each', cartItemId: item.id }, quantity: Number(item.quantity) }));
      setCartByMarket((old) => ({ ...old, [String(market.id)]: mapped }));
    }).catch(() => undefined);
  }, [session, market]);

  const visible = useMemo(() => products.filter((p) => {
    const q = query.toLowerCase();
    const matchesText = !q || `${nameFor(p)} ${p.brand || ''} ${p.unit || ''}`.toLowerCase().includes(q);
    if (category === 'All picks') return matchesText;
    const cat = categories.find((c) => c.name === category || c.slug === category.toLowerCase().replaceAll(' ', '-'));
    const productCategories = (p.categories || []).map((c: AnyRecord) => String(c.id));
    const categoryIds = new Set<string>(cat ? [String(cat.id)] : []);
    if (cat) { let changed = true; while (changed) { changed = false; for (const child of categories) if (categoryIds.has(String(child.parentId)) && !categoryIds.has(String(child.id))) { categoryIds.add(String(child.id)); changed = true; } } }
    return matchesText && (!cat || categoryIds.has(String(p.categoryId)) || productCategories.some((id: string) => categoryIds.has(id)));
  }), [products, query, category, categories]);
  const searchSuggestions = query.trim() ? visible.slice(0, 6) : [];
  const cartCount = Object.values(cartByMarket).flat().reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = cart.reduce((sum, item) => sum + priceFor(item.product) * item.quantity, 0);
  const categoryLabels = categories.length ? ['All picks', ...categories.map((c) => c.name)] : categoryNames;

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
    const next = { accessToken: result.accessToken, refreshToken: result.refreshToken, email: data.email, firstName: data.firstName };
    localStorage.setItem('fm-session', JSON.stringify(next)); setSession(next);
    await syncCart(next.accessToken, cart);
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
    return <article className="product-card" key={p.id}><div className={`product-image tone-${i % 6}`} onClick={() => void openProduct(p)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && void openProduct(p)}>{imageFor(p) ? <img src={imageFor(p)} alt={nameFor(p)} loading="lazy"/> : <span className="product-emoji">{['🍅','🍊','🥬','🍞','🍵','🍓'][i%6]}</span>}<button className={`save-button ${saved ? 'saved' : ''}`} aria-label={saved ? 'Remove from watchlist' : 'Save product'} onClick={(e) => { e.stopPropagation(); void toggleWatchlist(p); }}><Heart size={16} fill={saved ? 'currentColor' : 'none'}/></button>{Number(p.discountPriceJpy) > 0 && Number(p.discountPriceJpy) < Number(p.priceJpy) && <span className="product-tag">SALE</span>}<button className="quick-add" disabled={unavailable} aria-label={`Add ${nameFor(p)} to bag`} onClick={(e) => { e.stopPropagation(); void add(p); }}><Plus size={17}/></button>{unavailable && <span className="unavailable-tag">Sold out</span>}</div><div className="product-info"><div className="product-meta"><span>{p.brand || 'MARKET PICK'}</span><span>{p.unit || 'Selected with care'}</span></div><h3 role="button" onClick={() => void openProduct(p)}>{nameFor(p)}</h3><div className="price-row"><b>{money(priceFor(p))}</b>{Number(p.discountPriceJpy) > 0 && <del>{money(p.priceJpy)}</del>}<span>/ {p.unit || 'each'}</span></div><button className="card-add-button" disabled={unavailable} onClick={() => void add(p)}>{unavailable ? 'Currently unavailable' : <><ShoppingBag size={14}/> Add to bag</>}</button></div></article>;
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
  async function signOut() { if (session) { await request('/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken: session.refreshToken }) }).catch(() => undefined); } localStorage.removeItem('fm-session'); setSession(null); setProfile({}); setOrders([]); setAddresses([]); setWatchlist([]); setPage('home'); }
  async function loadPostalCode(value: string) {
    const digits = value.replace(/\D/g, '');
    if (digits.length !== 7) { setPostalHint(''); return; }
    const formatted = `${digits.slice(0, 3)}-${digits.slice(3)}`;
    const postal = document.querySelector<HTMLInputElement>('[name="postalCode"]'); if (postal) postal.value = formatted;
    try { const response = await fetch(`https://zipcloud.ibsnet.co.jp/api/search?zipcode=${digits}`); const data = await response.json(); const found = data.results?.[0]; if (found) { const prefecture = document.querySelector<HTMLInputElement>('[name="prefecture"]'); const city = document.querySelector<HTMLInputElement>('[name="city"]'); const town = document.querySelector<HTMLInputElement>('[name="town"]'); if (prefecture) prefecture.value = found.address1; if (city) city.value = found.address2; if (town) town.value = found.address3; setPostalHint('Address suggestions filled in. Please check the details.'); } else setPostalHint('Address not found. You can enter it manually.'); } catch { setPostalHint('Address lookup is unavailable. You can enter it manually.'); }
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
    ['home', 'Home'], ['shop', 'Shop'], ['deals', 'Discount products'], ['new', 'New arrivals'], ['watchlist', 'Watchlist'],
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
  const setShopCategory = (value: string) => { setCategory(value); setQuery(''); setPageIndex(0); setPage('shop'); setSelectedProduct(null); setMarketMenu(false); };
  const slidePromotions = (direction: number) => { const track = promotionTrack.current; if (!track) return; track.scrollBy({ left: direction * track.clientWidth, behavior: 'smooth' }); };
  const blurMainSearch = () => { setSearchFocused(false); mainSearchInput.current?.blur(); };
  return <main className="app-shell">
    <div className="announcement"><PackageCheck size={14}/> Shop local markets in Japan <span className="announcement-link">Browse without an account</span></div>
    <header className="header"><a className="brand" href="#" onClick={(e) => { e.preventDefault(); setPage('home'); setSelectedProduct(null); }}><span className="brand-mark"><Store size={19}/></span><span>ForeignMart<small>YOUR NEIGHBOURHOOD MARKET</small></span></a><div className="header-actions">{session ? <div className="account-menu-wrap"><button className="account-link" aria-expanded={accountMenu} onClick={() => setAccountMenu((open) => !open)} title="Open your account menu"><UserRound size={16}/><span>{profile.firstName || session.firstName || session.email.split('@')[0]}</span><ChevronDown size={14}/></button>{accountMenu && <div className="account-dropdown"><b>{profile.email || session.email}</b><button onClick={() => {setPage('orders');setAccountMenu(false)}}><PackageCheck size={15}/>Previous orders</button><button onClick={() => {setPage('account');setAccountMenu(false)}}><UserRound size={15}/>User profile</button><button onClick={() => {setPage('watchlist');setAccountMenu(false)}}><Heart size={15}/>Watchlist</button><button onClick={() => {setAccountMenu(false);void signOut()}}>Sign out</button></div>}</div> : <button className="signin-link" onClick={() => {blurMainSearch();setModal('login')}}>Sign in</button>}<button className="bag-button" onClick={() => {blurMainSearch();setCartOpen(true)}}><ShoppingBag size={18}/><span>Bag</span>{cartCount > 0 && <b>{cartCount}</b>}</button></div></header>
    <div className="market-search-row"><div className="market-search-inner"><div className="market-switch-wrap"><button className="market-switch" onClick={() => setMarketMenu((v) => !v)} aria-expanded={marketMenu}><span className="market-switch-logo">{activeStore?.logoUrl ? <img src={imageFor({imageUrl: activeStore.logoUrl})} alt=""/> : <Store size={20}/>}</span><span><small>SHOPPING AT</small><b>{activeStore?.name || 'Choose a market'}</b><em>{activeStore?.city || 'Select your local store'}</em></span><ChevronDown size={17}/></button>{marketMenu && <div className="market-popover"><label className="country-picker"><MapPin size={15}/><select aria-label="Filter markets by country" value={countryId} onChange={(e) => chooseCountry(e.target.value)}><option value="all">All countries</option>{countries.filter((c) => markets.some((m) => String(m.countryId) === String(c.id))).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>{filteredMarkets.map((shop) => <button key={shop.id} className={String(shop.id) === String(market?.id) ? 'current' : ''} onClick={() => {setMarket(shop);setPage('home');setCategory('All picks');setMarketMenu(false)}}><Store size={16}/><span><b>{shop.name}</b><small>{[shop.city,shop.countryCode].filter(Boolean).join(' · ')}</small></span>{String(shop.id) === String(market?.id) && <Check size={15}/>}</button>)}</div>}</div><form className="large-search" onSubmit={(e) => {e.preventDefault();setPageIndex(0);setSearchFocused(false);setPage('shop');setSelectedProduct(null)}}><Search size={21}/><input ref={mainSearchInput} value={query} onFocus={() => setSearchFocused(true)} onBlur={() => window.setTimeout(() => setSearchFocused(false), 160)} onChange={(e) => {setQuery(e.target.value);setPageIndex(0)}} placeholder="What are you looking for today?" aria-label="Search products" autoComplete="off"/><span className="search-divider"/><select aria-label="Search within category" value={category} onChange={(e) => {setCategory(e.target.value);setPageIndex(0)}}>{categoryLabels.map((label) => <option value={label} key={label}>{label === 'All picks' ? 'All categories' : label}</option>)}</select><button type="submit" aria-label="Search"><Search size={18}/></button>{searchFocused && query.trim() && <div className="search-suggestions">{searchSuggestions.length ? searchSuggestions.map((product) => <button type="button" key={product.id} onMouseDown={(e) => e.preventDefault()} onClick={() => {setQuery(nameFor(product));setSearchFocused(false);void openProduct(product)}}><span className="suggestion-image">{imageFor(product) ? <img src={imageFor(product)} alt=""/> : <span>🥬</span>}</span><span className="suggestion-copy"><b>{nameFor(product)}</b><small>{product.brand || product.unit || 'From your selected market'}</small></span><strong>{money(priceFor(product))}</strong></button>) : <p>No matching products in this market.</p>}</div>}</form></div></div>
    <nav className="customer-nav" aria-label="Customer navigation"><button className={page === 'home' ? 'active' : ''} onClick={() => {setPage('home');setSelectedProduct(null)}}>Home</button><div className="shop-nav-wrap"><button className={`shop-nav-trigger ${page === 'shop' ? 'active' : ''}`} onClick={() => {setPage('shop');setSelectedProduct(null);setPageIndex(0)}}>Shop <ChevronDown size={14}/></button><div className="shop-mega-menu"><div><span className="mega-label">CHOOSE A MARKET</span>{markets.map((shop) => <button key={shop.id} onClick={() => {setMarket(shop);setPage('shop');setCategory('All picks');setQuery('')}}><Store size={15}/>{shop.name}</button>)}</div><div><span className="mega-label">SHOP BY CATEGORY</span>{categoryLabels.map((label) => <button key={label} onClick={() => setShopCategory(label)}>{label}</button>)}</div><div className="mega-feature"><span className="mega-label">YOUR LOCAL PICKS</span><b>Good food, close to home.</b><p>Browse every product from the selected market, no account needed.</p><button onClick={() => {setPage('shop');setCategory('All picks');setQuery('')}}>Browse the full shop <ArrowRight size={14}/></button></div></div></div>{navItems.filter(([key]) => key !== 'shop' && key !== 'home').map(([key, label]) => <button key={key} className={page === key ? 'active' : ''} onClick={() => { if (key === 'watchlist' && !session) { setModal('login'); setNotice('Sign in to view your watchlist.'); return; } setPage(key); setSelectedProduct(null); setPageIndex(0); }}>{label}{key === 'watchlist' && watchlist.length > 0 && <small>{watchlist.length}</small>}</button>)}{session && <button className="signout-link" onClick={() => void signOut()}>Sign out</button>}</nav>

    <div className="main-content">
      {page === 'home' && <>
        <section className={`home-hero ${activeSlide.className}`}><div className="home-hero-copy"><span className="eyebrow"><span className="eyebrow-line"/>{activeSlide.eyebrow}</span><h1>{activeSlide.title}</h1><p>{activeSlide.body}</p><button className="hero-cta" onClick={activeSlide.onClick}>{activeSlide.action}<ArrowRight size={16}/></button></div><div className="home-hero-art"><span className="hero-art-orbit orbit-one"/><span className="hero-art-orbit orbit-two"/>{heroPhotos.length ? <div className="hero-photo-collage">{heroPhotos.map((product, index) => <img key={`${product.id}-${index}`} className={`hero-photo hero-photo-${index}`} src={imageFor(product)} alt={nameFor(product)} loading="lazy"/> )}</div> : heroProduct && imageFor(heroProduct) ? <img className="hero-product-image" src={imageFor(heroProduct)} alt={nameFor(heroProduct)}/> : <span className="hero-art-emoji">{activeSlide.icon}</span>}{deals.length > 0 && <div className="hero-product-chip"><span className="sale-dot">−</span><span><small>MARKET OFFER</small><b>{nameFor(deals[homeSlide % deals.length])}</b><strong>{money(priceFor(deals[homeSlide % deals.length]))}</strong></span></div>}</div><button className="hero-arrow hero-prev" onClick={() => setHomeSlide((n) => (n + promoSlides.length - 1) % promoSlides.length)} aria-label="Previous slide"><ChevronLeft/></button><button className="hero-arrow hero-next" onClick={() => setHomeSlide((n) => (n + 1) % promoSlides.length)} aria-label="Next slide"><ChevronRight/></button><div className="hero-dots">{promoSlides.map((slide, i) => <button key={slide.title} className={i === homeSlide ? 'active' : ''} onClick={() => setHomeSlide(i)} aria-label={`Show slide ${i + 1}`}/>)}</div></section>
        <section className="service-promises"><div><span className="promise-icon peach"><Truck size={19}/></span><span><b>Free delivery over ¥10,000</b><small>Delivered from your local store</small></span></div><i/><div><span className="promise-icon lilac"><Clock3 size={19}/></span><span><b>Delivery, right on time</b><small>Choose a convenient delivery address</small></span></div><i/><div><span className="promise-icon blue"><ShieldCheck size={19}/></span><span><b>Secure checkout</b><small>Your account and payment stay protected</small></span></div><i/><div><span className="promise-icon gold"><CreditCard size={19}/></span><span><b>Simple, trusted payment</b><small>Clear totals before you place your order</small></span></div></section>
        <section className="home-section promotion-section"><div className="section-title-row"><div><span className="eyebrow">PICKED FOR YOUR TABLE</span><h2>Promotions from your markets</h2><p>Special prices and local favourites, refreshed as you browse.</p></div><div className="promotion-controls"><button className="promotion-arrow" aria-label="Previous promotion" onClick={() => slidePromotions(-1)}><ChevronLeft size={18}/></button><button className="promotion-arrow" aria-label="Next promotion" onClick={() => slidePromotions(1)}><ChevronRight size={18}/></button><button className="text-link" onClick={() => setPage('deals')}>View all offers <ArrowRight size={15}/></button></div></div><div className="promotion-slider" ref={promotionTrack}>{promotionPages.length ? promotionPages.map((items, pageIndex) => <div className={`promotion-page promotion-page-count-${items.length}`} key={`promotion-page-${pageIndex}`}>{items.map((item, cardIndex) => <article className={`promo-tile promo-color-${(pageIndex * 3 + cardIndex) % 5}`} key={item.key}><div className="promo-tile-copy"><span className="promo-pill">WEEKLY OFFER · {item.shop?.name || 'LOCAL MARKET'}</span><h3>{nameFor(item.product)}</h3><p>Find a new favourite at this week’s special price.</p><div className="promo-price"><b>{money(priceFor(item.product))}</b><del>{money(item.product.priceJpy)}</del></div><button onClick={() => setPage('deals')}>Shop now <ArrowRight size={15}/></button></div>{promoImageFor(item.product) ? <img className="promo-tile-image" src={promoImageFor(item.product)} alt={nameFor(item.product)} loading="lazy"/> : <span className="promo-tile-image promo-tile-emoji" aria-hidden="true">{promoEmojiFor(item.product)}</span>}</article>)}</div>) : <div className="empty-state compact-empty"><Sparkles size={22}/><h3>New promotions are on their way</h3><p>Check back soon for offers from your local market.</p></div>}</div></section>
        <section className="home-section category-section"><div className="section-title-row"><div><span className="eyebrow">A LITTLE OF EVERYTHING</span><h2>Shop by category</h2><p>Find the right thing for today’s table.</p></div><button className="text-link" onClick={() => {setCategory('All picks');setPage('shop')}}>Browse all categories <ArrowRight size={15}/></button></div><div className="category-slider" ref={categoryTrack}>{categories.map((item, i) => <button className="category-tile" key={item.id} onClick={() => setShopCategory(item.name)}><span className={`category-tile-image cat-tone-${i % 5}`}>{categoryImage(item, i) ? <img src={categoryImage(item, i)} alt="" loading="lazy"/> : <span>{['🥬','🍊','🍞','🍵','🍓'][i % 5]}</span>}</span><b>{item.name}</b><small>Explore category <ArrowRight size={12}/></small></button>)}</div></section>
        <section className="home-section home-deals"><div className="section-title-row"><div><span className="eyebrow">GOOD FINDS, BETTER PRICES</span><h2>Deals worth discovering</h2><p>Limited-time prices from {activeStore?.name || 'your selected market'}.</p></div><button className="text-link" onClick={() => setPage('deals')}>See all deals <ArrowRight size={15}/></button></div>{deals.length ? <div className="product-grid">{deals.slice(0, 4).map(productCard)}</div> : <div className="empty-state compact-empty"><Sparkles size={22}/><h3>New offers are on their way</h3><p>Check back soon for special prices from this market.</p></div>}</section>
        <section className="home-bottom-banner"><div><span className="eyebrow">A MARKET THAT FEELS CLOSE</span><h2>Your neighbourhood, delivered.</h2><p>Shop from the markets you know, discover something new, and get it brought to your door.</p><button className="hero-cta" onClick={() => setPage('shop')}>Explore the shop <ArrowRight size={16}/></button></div><div className="bottom-banner-art">🧺</div></section>
      </>}
      {page === 'shop' && <>
        <section className={`shop-mini-slider ${shopSlide % 2 ? 'mini-second' : ''}`}><div><span className="eyebrow">{shopSlide % 2 ? 'MEET YOUR MARKET' : 'A LITTLE SOMETHING SPECIAL'}</span><h1>{shopSlide % 2 ? activeStore?.name || 'Your neighbourhood market' : `${deals.length || 'Weekly'} offers to enjoy`}</h1><p>{shopSlide % 2 ? activeStore?.description || 'Discover the market behind your everyday favourites.' : miniProduct ? `Save on ${nameFor(miniProduct)} and discover more weekly picks from ${activeStore?.name || 'your local market'}.` : 'Discover discounted favourites and fresh picks, updated by your local shop.'}</p><button onClick={() => shopSlide % 2 ? setPage('stores') : setPage('deals')}>{shopSlide % 2 ? 'Shop details' : 'Shop offers'} <ArrowRight size={15}/></button></div>{!(shopSlide % 2) && miniProduct && imageFor(miniProduct) ? <img className="mini-slider-product" src={imageFor(miniProduct)} alt={nameFor(miniProduct)}/> : <span className="mini-slider-art">{shopSlide % 2 ? '🏪' : '🥑'}</span>}<button className="mini-slide-arrow" onClick={() => setShopSlide((n) => (n + 1) % 2)} aria-label="Next shop banner"><ChevronRight size={20}/></button><div className="mini-slide-dots"><i className={shopSlide % 2 ? '' : 'active'}/><i className={shopSlide % 2 ? 'active' : ''}/></div></section>
        <div className="shop-layout"><aside className="shop-sidebar"><div className="sidebar-title"><span className="eyebrow">REFINE YOUR SHOP</span><button onClick={() => {setCategory('All picks');setQuery('');setSortOrder('recommended')}}>Clear</button></div><h3>Market</h3><label className="sidebar-select"><Store size={15}/><select aria-label="Choose supermarket" value={String(market?.id || '')} onChange={(e) => {const shop = markets.find((item) => String(item.id) === e.target.value);if(shop) setMarket(shop)}}>{markets.map((shop) => <option key={shop.id} value={shop.id}>{shop.name}</option>)}</select><ChevronDown size={14}/></label><h3>Categories</h3><div className="sidebar-categories">{categoryLabels.map((label) => <button key={label} className={category === label ? 'active' : ''} onClick={() => setCategory(label)}><span className="sidebar-radio"/>{label}<span>{label === 'All picks' ? products.length : products.filter((p) => String(p.categoryId) === String(categories.find((c) => c.name === label)?.id)).length}</span></button>)}</div><div className="sidebar-help"><span>Need a hand?</span><p>Browse products freely. Sign in only when you’re ready to check out.</p><button onClick={() => setNotice('For order help, contact the supermarket listed on your order.')}>Customer help <ArrowRight size={13}/></button></div></aside><section className="shop-results"><div className="shop-results-head"><div><span className="eyebrow">{activeStore?.city || activeStore?.countryCode || 'LOCAL MARKET'} · {activeStore?.name || 'FOREIGNMART'}</span><h1>{category === 'All picks' ? 'The full market' : category}</h1><p>Thoughtful picks from {activeStore?.name || 'your local supermarket'}.</p></div><span className="shop-result-count">{visible.length} products</span></div><div className="shop-search-inline"><Search size={19}/><input value={query} onChange={(e) => {setQuery(e.target.value);setPageIndex(0)}} placeholder="Search this market"/><select aria-label="Filter products by category" value={category} onChange={(e) => {setCategory(e.target.value);setPageIndex(0)}}>{categoryLabels.map((label) => <option key={label} value={label}>{label === 'All picks' ? 'All categories' : label}</option>)}</select></div>
          {error && <div className="backend-state inline-backend"><div><b>Catalog connection failed</b><p>{error}. Check the backend service and database, then reload.</p></div><button onClick={retryCatalog}>Retry</button></div>}{loading ? <div className="loading-state"><span className="loader"/>Loading products from {activeStore?.name || 'the selected supermarket'}…</div> : !market ? <div className="empty-state"><Store size={30}/><h3>Choose a supermarket to start</h3><p>Select a market to browse all of its products.</p></div> : visible.length ? <><div className="catalog-heading shop-catalog-heading"><span>{visible.length} products · prices in JPY</span><select aria-label="Sort products" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)}><option value="recommended">Recommended</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option></select></div><div className="product-grid">{displayedProducts.map(productCard)}</div>{visible.length > displayedProducts.length && <div className="load-more"><button onClick={() => setPageIndex((n) => n + 1)}>Load more products <ArrowDown size={15}/></button></div>}</> : error ? null : <div className="empty-state"><span>✳</span><h3>{products.length ? 'No matching products' : 'This market is getting its shelves ready'}</h3><p>{products.length ? 'Try another search term or category.' : 'Product ranges vary by market. Choose another local shop to browse what is available there.'}</p>{products.length > 0 ? <button onClick={() => {setQuery('');setCategory('All picks')}}>Clear filters</button> : <div className="empty-market-actions">{markets.filter((shop) => String(shop.id) !== String(market?.id)).map((shop) => <button key={shop.id} onClick={() => {setMarket(shop);setCategory('All picks');setQuery('')}}><Store size={14}/>{shop.name}<ArrowRight size={13}/></button>)}</div>}</div>}</section></div>
      </>}
      {page === 'deals' && <PageSection eyebrow="CURRENT OFFERS" title="Discount products" description={`Special prices from ${activeStore?.name || 'the selected supermarket'}.`} loading={loading} empty={!deals.length} emptyTitle="No discounts right now" emptyText="Check back later for special prices from this supermarket."><div className="product-grid">{deals.map(productCard)}</div></PageSection>}
      {page === 'new' && <PageSection eyebrow="JUST ADDED" title="New arrivals" description="Recently added products from this supermarket." loading={loading} empty={!arrivals.length} emptyTitle="No new products yet" emptyText="New products from this supermarket will appear here."><div className="product-grid">{arrivals.slice(0, 40).map(productCard)}</div></PageSection>}
      {page === 'stores' && <PageSection eyebrow="OUR MARKETS" title="Shop details" description="Contact and location information for each supermarket." loading={loading && !markets.length} empty={!filteredMarkets.length} emptyTitle="No supermarkets available" emptyText="Market information will appear here when available."><div className="store-detail-grid">{filteredMarkets.map((shop) => <article className="store-detail-card" key={shop.id}><div className="store-detail-top"><span className="store-choice-logo"><Store size={21}/></span><div><h3>{shop.name}</h3><small>{shop.active ? 'Open for shopping' : 'Currently unavailable'}</small></div><button className={String(shop.id) === String(market?.id) ? 'selected-store-button' : 'select-store-button'} onClick={() => {setMarket(shop);setPage('shop')}}>{String(shop.id) === String(market?.id) ? 'Selected' : 'Shop here'}</button></div><p>{shop.description || 'Local supermarket serving the community.'}</p><dl><div><dt>Location</dt><dd>{[shop.postalCode, shop.prefecture, shop.city, shop.town, shop.addressLine, shop.buildingName].filter(Boolean).join(' ') || 'Address not provided'}</dd></div><div><dt>Contact</dt><dd>{shop.phoneNumber || shop.mobileNumber || shop.email || 'Contact details not provided'}</dd></div>{shop.website && <div><dt>Website</dt><dd><a href={shop.website} target="_blank" rel="noreferrer">{shop.website}</a></dd></div>}</dl></article>)}</div></PageSection>}
      {page === 'watchlist' && <PageSection eyebrow="SAVED FOR LATER" title="Your watchlist" description="Products you have saved from their detail page." loading={false} empty={!watchlist.length} emptyTitle="Your watchlist is empty" emptyText="Save products from their detail page and they will appear here.">{pageProducts.length ? <div className="product-grid">{pageProducts.map(productCard)}</div> : watchlist.length ? <div className="empty-state"><Heart size={28}/><h3>Not in this market</h3><p>These products are not listed at the selected supermarket. Choose another store above.</p><div className="watchlist-names">{watchlist.map((w) => <span key={w.id}>{w.name || w.productName || 'Saved product'}</span>)}</div></div> : null}</PageSection>}
      {page === 'orders' && <PageSection eyebrow="YOUR ACCOUNT" title="Your orders" description="A clear view of your recent purchases and delivery progress." loading={false} empty={!session || !orders.length} emptyTitle={!session ? 'Sign in to see your orders' : 'No orders yet'} emptyText={!session ? 'Your purchases and delivery updates will appear here after you sign in.' : 'Your completed checkouts will appear here.'}><div className="orders-list">{orders.map((order) => { const canCancel = ['PENDING', 'CONFIRMED'].includes(order.status); return <article className="order-card order-card-rich" key={order.id}><div className="order-card-head"><span className="order-icon"><PackageCheck size={20}/></span><div><b>{order.orderNumber || `Order #${order.id}`}</b><small>{new Date(order.placedAt || order.createdAt || Date.now()).toLocaleDateString()}</small></div><span className={`status-pill status-${String(order.status || 'pending').toLowerCase()}`}>{order.status || 'PENDING'}</span></div><div className="order-store-line"><Store size={15}/>{order.supermarketName || 'Supermarket'}<span>·</span>{(order.items || []).length} {(order.items || []).length === 1 ? 'item' : 'items'}</div>{(order.items || []).length > 0 && <div className="order-item-previews">{(order.items || []).slice(0, 4).map((item: AnyRecord, index: number) => <div key={item.id || index} title={item.productName || item.name}>{item.imageUrl ? <img src={imageFor({imageUrl:item.imageUrl})} alt=""/> : <span>{['🥬','🍊','🍞','🍵'][index % 4]}</span>}</div>)}{(order.items || []).length > 4 && <small>+{order.items.length - 4} more</small>}</div>}<div className="order-card-footer"><span>{canCancel ? 'Your order is being prepared' : 'Order total'}</span><b>{money(order.totalJpy)}</b></div>{canCancel && <button className="cancel-order" onClick={() => void cancelOrder(order)}>Cancel order</button>}</article>; })}<button className="subtle-button order-account-link" onClick={() => setPage('account')}>Manage profile and delivery addresses <ArrowRight size={14}/></button></div></PageSection>}
      {page === 'product' && selectedProduct && <section className="product-detail-page"><button className="back-link" onClick={() => setPage('shop')}><ArrowLeft size={16}/> Back to {activeStore?.name || 'products'}</button><div className="product-detail-layout"><div className="product-detail-image">{imageFor(selectedProduct) ? <img src={imageFor(selectedProduct)} alt={nameFor(selectedProduct)}/> : <span>🛒</span>}<button className={`save-button ${watchlist.some((w) => Number(w.id || w.productId) === Number(selectedProduct.productId)) ? 'saved' : ''}`} onClick={() => void toggleWatchlist(selectedProduct)} aria-label="Toggle watchlist"><Heart size={19}/></button></div><div className="product-detail-info"><span className="eyebrow"><span className="eyebrow-line"/> {selectedProduct.brand || activeStore?.name || 'MARKET PRODUCT'}</span><h1>{nameFor(selectedProduct)}</h1><p className="detail-unit">{selectedProduct.unit || 'Market selection'} · SKU {selectedProduct.sku || '—'}</p><div className="detail-price">{money(priceFor(selectedProduct))}{Number(selectedProduct.discountPriceJpy) > 0 && <del>{money(selectedProduct.priceJpy)}</del>}</div><p className="detail-description">{productDetails?.description || selectedProduct.description || 'Product information is provided by the supermarket.'}</p><p className="availability"><span className={selectedProduct.available ? 'available-dot' : 'unavailable-dot'}/>{selectedProduct.available && Number(selectedProduct.stockQuantity) > 0 ? `In stock · ${selectedProduct.stockQuantity} available` : 'Currently unavailable'}</p><div className="detail-actions"><div className="qty-control"><button onClick={() => setProductQuantity((n) => Math.max(1, n - 1))}><Minus size={13}/></button><span>{productQuantity}</span><button onClick={() => setProductQuantity((n) => n + 1)}><Plus size={13}/></button></div><button className="primary-button" disabled={!selectedProduct.available} onClick={() => void add(selectedProduct, productQuantity)}>Add to bag <ShoppingBag size={16}/></button><button className="buy-now-button" disabled={!selectedProduct.available} onClick={() => void buyNow(selectedProduct)}>Buy now</button></div><div className="detail-facts"><div><span>Market</span><b>{activeStore?.name || '—'}</b></div><div><span>Brand</span><b>{selectedProduct.brand || '—'}</b></div><div><span>Unit</span><b>{selectedProduct.unit || '—'}</b></div></div></div></div><section className="reviews-section"><div className="catalog-heading"><div><span className="eyebrow"><span className="eyebrow-line"/> CUSTOMER VOICES</span><h2>Reviews</h2></div><span>{reviews.length} reviews</span></div>{session ? <form className="review-form" action={() => void submitReview()}><label>Rate it <select value={reviewRating} onChange={(e) => setReviewRating(Number(e.target.value))}>{[5,4,3,2,1].map((n) => <option key={n} value={n}>{'★'.repeat(n)} ({n})</option>)}</select></label><textarea value={reviewText} onChange={(e) => setReviewText(e.target.value)} placeholder="Share your thoughts about this product" maxLength={2000}/><button className="primary-button">Save review <ArrowRight size={15}/></button></form> : <button className="subtle-button" onClick={() => setModal('login')}>Sign in to leave a review</button>}{reviews.map((review) => <article className="review-card" key={review.id}><b>{review.customerName || review.userName || 'Customer'}</b><span className="review-stars">{'★'.repeat(Number(review.rating || 0))}</span><p>{review.comment}</p></article>)}</section></section>}
      {page === 'product' && selectedProduct && products.some((item) => item.id !== selectedProduct.id) && <section className="related-section"><div className="catalog-heading"><div><span className="eyebrow"><span className="eyebrow-line"/> FROM THIS MARKET</span><h2>More to explore</h2></div></div><div className="product-grid">{products.filter((item) => item.id !== selectedProduct.id).slice(0,5).map(productCard)}</div></section>}
      {page === 'account' && <PageSection eyebrow="YOUR ACCOUNT" title="Manage account" description="Profile information and saved delivery addresses." loading={false} empty={!session} emptyTitle="Sign in to manage your account" emptyText="Your profile and delivery addresses are available after sign-in."><div className="account-grid"><section className="account-panel"><h2>Profile details</h2><form action={(form) => void saveProfile(form)}><label>Email address<input value={profile.email || session?.email || ''} readOnly/></label><label>First name<input name="firstName" required defaultValue={profile.firstName || ''}/></label><label>Last name<input name="lastName" required defaultValue={profile.lastName || ''}/></label><label>Phone number<input name="phoneNumber" required defaultValue={profile.phoneNumber || ''}/></label><button className="primary-button">Save profile <Check size={15}/></button></form></section><section className="account-panel"><div className="account-panel-head"><div><h2>Delivery addresses</h2><p>Choose a default address for faster checkout.</p></div><button className="subtle-button" onClick={() => {setEditingAddress(null);setPostalHint('');setModal('address')}}>+ Add address</button></div>{addresses.length ? addresses.map((address) => <article className="address-card" key={address.id}><div><b>{address.label || address.recipientName}</b>{address.defaultAddress && <span className="default-badge">Default</span>}<p>{address.recipientName} · {address.phoneNumber}<br/>{address.postalCode} {address.prefecture} {address.city} {address.town}<br/>{address.addressLine} {address.buildingName || ''} {address.roomNumber || ''}</p></div><div className="address-actions"><button onClick={() => {setEditingAddress(address);setPostalHint('');setModal('address')}}>Edit</button>{!address.defaultAddress && <button onClick={() => void defaultAddress(address)}>Set default</button>}<button className="danger-link" onClick={() => void deleteAddress(address)}><Trash2 size={14}/></button></div></article>) : <div className="empty-address">No saved addresses yet. Add one for a faster checkout.</div>}</section></div></PageSection>}
    </div>
    <footer className="site-footer"><div className="footer-main"><div className="footer-brand-col"><a className="brand" href="#" onClick={(e) => {e.preventDefault();setPage('home')}}><span className="brand-mark"><Store size={19}/></span><span>ForeignMart<small>YOUR NEIGHBOURHOOD MARKET</small></span></a><p>Good food, familiar markets, delivered with care. Browse freely and find something lovely for the table.</p><div className="footer-promise"><Truck size={16}/><span>Free delivery on orders over ¥10,000</span></div></div><div className="footer-links"><b>Explore</b><button onClick={() => setPage('shop')}>Shop all products</button><button onClick={() => setPage('deals')}>Current offers</button><button onClick={() => setPage('new')}>New arrivals</button><button onClick={() => setPage('stores')}>Our markets</button></div><div className="footer-links"><b>Your account</b><button onClick={() => session ? setPage('orders') : setModal('login')}>Previous orders</button><button onClick={() => session ? setPage('account') : setModal('login')}>Profile & addresses</button><button onClick={() => session ? setPage('watchlist') : setModal('login')}>Saved watchlist</button><button onClick={() => setNotice('For order help, contact the supermarket listed on your order.')}>Customer help</button></div><div className="footer-market-card"><span className="eyebrow">YOUR SELECTED MARKET</span><div className="footer-market-info">{activeStore?.logoUrl ? <img src={imageFor({imageUrl:activeStore.logoUrl})} alt=""/> : <span className="footer-market-icon"><Store size={19}/></span>}<span><b>{activeStore?.name || 'Choose a local market'}</b><small>{activeStore?.city || 'Explore neighbourhood shops'}</small></span></div><button onClick={() => {setMarketMenu(true);window.scrollTo({top:0,behavior:'smooth'})}}>Change market <ArrowRight size={14}/></button><div className="footer-secure"><ShieldCheck size={15}/> Secure checkout when you’re ready</div></div></div><div className="footer-bottom"><span>© 2026 ForeignMart · Shopping with your neighbourhood markets.</span><span>Thoughtful finds, close to home.</span></div></footer>

    {notice && <div className="toast"><Check size={16}/>{notice}<button onClick={() => setNotice('')}><X size={15}/></button></div>}
    {cartOpen && <div className="scrim" onMouseDown={(e) => {if (e.target === e.currentTarget) setCartOpen(false)}}><aside className="cart-drawer"><div className="drawer-head"><div><span className="eyebrow">YOUR BAG</span><h2>Shopping cart <span>({cartCount} items)</span></h2></div><button className="icon-button" onClick={() => setCartOpen(false)} aria-label="Close bag"><X size={20}/></button></div><div className="cart-lines multi-cart">{Object.entries(cartByMarket).filter(([, lines]) => lines.length).length ? Object.entries(cartByMarket).filter(([, lines]) => lines.length).map(([key, lines]) => { const shop = markets.find((item) => String(item.id) === key); const total = lines.reduce((sum, line) => sum + priceFor(line.product) * line.quantity, 0); return <section className="cart-store-group" key={key}><div className="cart-store-title"><Store size={16}/><b>{shop?.name || 'Selected supermarket'}</b><span>{lines.length} products</span></div>{lines.map(({product, quantity}) => <div className="cart-line" key={product.id}><div className="cart-thumb">{imageFor(product) ? <img src={imageFor(product)} alt=""/> : <span>🛒</span>}</div><div className="cart-description"><b>{nameFor(product)}</b><small>{product.unit || 'Market pick'}</small><strong>{money(priceFor(product))}</strong></div><div className="qty-control"><button onClick={() => void changeQty(product.id, -1, key)} aria-label="Decrease quantity"><Minus size={13}/></button><span>{quantity}</span><button onClick={() => void changeQty(product.id, 1, key)} aria-label="Increase quantity"><Plus size={13}/></button></div></div>)}<div className="store-cart-bottom"><span>Subtotal</span><b>{money(total)}</b><button className="primary-button" onClick={() => {setMarket(shop || market);setCartOpen(false);void beginCheckout(key)}}>Checkout this store <ArrowRight size={15}/></button></div></section>; }) : <div className="empty-bag"><span>🛍</span><h3>Your bag is empty</h3><p>Choose a supermarket and add products to get started.</p><button onClick={() => {setCartOpen(false);setPage('shop')}}>Browse products</button></div>}</div><div className="cart-bottom"><small>Products from different supermarkets are checked out as separate orders.</small><button className="continue-shopping" onClick={() => setCartOpen(false)}>Keep browsing</button></div></aside></div>}
    {modal && <div className="scrim modal-scrim" onMouseDown={(e) => {if (e.target === e.currentTarget) setModal(null)}}><section className="auth-modal"><button className="modal-close icon-button" onClick={() => setModal(null)} aria-label="Close dialog"><X size={20}/></button>{modal === 'login' || modal === 'register' ? <><span className="eyebrow"><span className="eyebrow-line"/> {checkoutAfterAuth ? 'CHECKOUT' : 'YOUR ACCOUNT'}</span><h2>{modal === 'login' ? 'Welcome back.' : 'Create your account.'}</h2><p>{checkoutAfterAuth ? 'Sign in to continue to your supermarket checkout.' : 'You can browse the market without signing in.'}</p><form action={(form) => authenticate(modal as 'login' | 'register', form).catch((e) => setNotice(e.message))}>{modal === 'register' && <div className="form-row"><input name="firstName" required placeholder="First name"/><input name="lastName" required placeholder="Last name"/></div>}<input type="email" name="email" required placeholder="Email address"/>{modal === 'register' && <input name="phoneNumber" required placeholder="Phone number"/>}<input type="password" name="password" required minLength={8} placeholder="Password"/><button className="primary-button full-button">{modal === 'login' ? 'Sign in' : 'Create account'} <ArrowRight size={16}/></button></form><div className="modal-switch">{modal === 'login' ? <>New to ForeignMart? <button onClick={() => setModal('register')}>Create an account</button></> : <>Already have an account? <button onClick={() => setModal('login')}>Sign in</button></>}</div></> : modal === 'checkout' ? <><span className="eyebrow"><span className="eyebrow-line"/> CHECKOUT · {markets.find((s) => String(s.id) === checkoutMarketId)?.name || activeStore?.name}</span><h2>Delivery details</h2><p>Choose an address or add one for this order.</p><form action={(form) => checkout(form).catch((e) => setNotice(e.message))}>{addresses.length > 0 && <select value={checkoutAddressId} onChange={(e) => {setCheckoutAddressId(e.target.value);setAddressRequired(e.target.value === 'new')}}><option value="new">Add a new address</option>{addresses.map((a) => <option key={a.id} value={a.id}>{a.label || a.recipientName} · {a.city}{a.defaultAddress ? ' (Default)' : ''}</option>)}</select>}{(addressRequired || checkoutAddressId === 'new') && <><input name="recipientName" required placeholder="Recipient name"/><input name="phoneNumber" required placeholder="Phone number"/><div className="form-row"><input name="postalCode" required pattern="[0-9]{3}-[0-9]{4}" placeholder="Postal code (123-4567)" onBlur={(e) => void loadPostalCode(e.target.value)}/><input name="prefecture" required placeholder="Prefecture"/></div><div className="form-row"><input name="city" required placeholder="City"/><input name="town" required placeholder="Town / ward"/></div><input name="addressLine" required placeholder="Street address"/><input name="buildingName" placeholder="Building (optional)"/><input name="roomNumber" placeholder="Room number (optional)"/><small className="checkout-hint">{postalHint}</small></>}<button className="primary-button full-button">Place order <span>{money((cartByMarket[checkoutMarketId] || []).reduce((sum, line) => sum + priceFor(line.product) * line.quantity, 0))}</span><ArrowRight size={16}/></button></form></> : <><span className="eyebrow"><span className="eyebrow-line"/> SAVED ADDRESS</span><h2>{editingAddress ? 'Edit address' : 'Add delivery address'}</h2><p>Japanese postal codes use the format 123-4567. Enter one to fill in the area automatically.</p><form action={(form) => saveAddress(form)}><input name="label" placeholder="Address label (Home, Work)" defaultValue={editingAddress?.label || ''}/><input name="recipientName" required placeholder="Recipient name" defaultValue={editingAddress?.recipientName || ''}/><input name="phoneNumber" required placeholder="Phone number" defaultValue={editingAddress?.phoneNumber || ''}/><div className="form-row"><input name="postalCode" required placeholder="Postal code (123-4567)" defaultValue={editingAddress?.postalCode || ''} onBlur={(e) => void loadPostalCode(e.target.value)}/><input name="prefecture" required placeholder="Prefecture" defaultValue={editingAddress?.prefecture || ''}/></div><div className="form-row"><input name="city" required placeholder="City" defaultValue={editingAddress?.city || ''}/><input name="town" required placeholder="Town / ward" defaultValue={editingAddress?.town || ''}/></div><input name="addressLine" required placeholder="Street address" defaultValue={editingAddress?.addressLine || ''}/><div className="form-row"><input name="buildingName" placeholder="Building" defaultValue={editingAddress?.buildingName || ''}/><input name="roomNumber" placeholder="Room" defaultValue={editingAddress?.roomNumber || ''}/></div><label className="checkbox-label"><input type="checkbox" name="defaultAddress" defaultChecked={editingAddress?.defaultAddress || addresses.length === 0}/> Set as default address</label><small className="checkout-hint">{postalHint}</small><button className="primary-button full-button">Save address <Check size={15}/></button></form></>}</section></div>}
  </main>;
}

function PageSection({ eyebrow, title, description, loading, empty, emptyTitle, emptyText, children }: { eyebrow: string; title: string; description: string; loading: boolean; empty: boolean; emptyTitle: string; emptyText: string; children: React.ReactNode }) {
  return <section className="catalog-section page-section"><div className="catalog-heading"><div><span className="eyebrow"><span className="eyebrow-line"/> {eyebrow}</span><h2>{title}</h2><p>{description}</p></div></div>{loading ? <div className="loading-state"><span className="loader"/>Loading…</div> : empty ? <div className="empty-state"><span>✳</span><h3>{emptyTitle}</h3><p>{emptyText}</p></div> : children}</section>;
}
