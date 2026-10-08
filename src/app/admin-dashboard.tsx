'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, ArrowRight, BarChart3, Check, ChevronDown, Edit3, Globe2, LogOut, Package, Plus, RefreshCw, Search, Store, Truck, Users } from 'lucide-react';

type Row = Record<string, any>;
type AdminSession = { accessToken: string; refreshToken: string; email: string; firstName?: string; role: string };
const API_ROOT = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api/v1').replace(/\/$/, '');

async function api(path: string, session: AdminSession, init: RequestInit = {}) {
  const response = await fetch(`${API_ROOT}/${path.replace(/^\//, '')}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.accessToken}`, 'X-User-Email': session.email, ...init.headers },
    cache: 'no-store',
  });
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const fields = body?.fieldErrors && typeof body.fieldErrors === 'object'
      ? Object.entries(body.fieldErrors).map(([field, message]) => `${field}: ${message}`).join(' · ')
      : '';
    throw new Error([body?.message || body?.detail, fields].filter(Boolean).join(' — ') || `Request failed (${response.status})`);
  }
  return body;
}
const rows = (value: any): Row[] => Array.isArray(value) ? value : Array.isArray(value?.content) ? value.content : [];
const price = (value: any) => `¥${Number(value || 0).toLocaleString('en-US')}`;
const moneyNumber = (value: any) => Number(value || 0).toLocaleString('en-US');
const orderNext: Record<string, string> = { PENDING: 'CONFIRMED', CONFIRMED: 'PREPARING', PREPARING: 'READY_FOR_DELIVERY', READY_FOR_DELIVERY: 'OUT_FOR_DELIVERY', OUT_FOR_DELIVERY: 'DELIVERED' };
const orderAction: Record<string, string> = { PENDING: 'Confirm order', CONFIRMED: 'Start preparing', PREPARING: 'Ready for delivery', READY_FOR_DELIVERY: 'Dispatch', OUT_FOR_DELIVERY: 'Complete delivery' };

export default function AdminDashboard({ session, onSignOut }: { session: AdminSession; onSignOut: () => void }) {
  const isSystem = session.role === 'SYSTEM_ADMIN';
  const [tab, setTab] = useState('Overview');
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [shops, setShops] = useState<Row[]>([]);
  const [shopId, setShopId] = useState('');
  const [metrics, setMetrics] = useState<Row>({});
  const [inventory, setInventory] = useState<Row[]>([]);
  const [orders, setOrders] = useState<Row[]>([]);
  const [products, setProducts] = useState<Row[]>([]);
  const [categories, setCategories] = useState<Row[]>([]);
  const [countries, setCountries] = useState<Row[]>([]);
  const [search, setSearch] = useState('');
  const [inventoryFilter, setInventoryFilter] = useState('all');
  const [dialog, setDialog] = useState<{ kind: string; record?: Row } | null>(null);

  const fetchAll = useCallback(async (path: string) => {
    const all: Row[] = [];
    for (let page = 0; page < 100; page++) {
      const data = await api(`${path}?page=${page}&size=100`, session);
      if (!data || !Array.isArray(data.content)) throw new Error('The backend returned an invalid page response.');
      all.push(...data.content);
      if (data.last === true || data.content.length === 0) break;
    }
    return all;
  }, [session]);

  const loadShop = useCallback(async (id: string) => {
    if (!id) { setMetrics({}); setInventory([]); setOrders([]); return; }
    const [dashboard, stock, shopOrders] = await Promise.all([
      api(`supermarkets/${id}/dashboard`, session),
      api(`supermarkets/${id}/products/management`, session),
      api(`orders/supermarkets/${id}`, session),
    ]);
    setMetrics(dashboard || {}); setInventory(rows(stock)); setOrders(rows(shopOrders));
  }, [session]);

  const load = useCallback(async () => {
    setBusy(true); setError('');
    try {
      const [shopData, productData, categoryData, countryData] = await Promise.all([
        isSystem ? fetchAll('supermarkets/management') : api('supermarkets/my-assigned', session),
        fetchAll(isSystem ? 'products/management' : 'products'),
        isSystem ? api('categories/management', session) : Promise.resolve([]),
        isSystem ? api('countries/management', session) : Promise.resolve([]),
      ]);
      const nextShops = rows(shopData);
      const selectedId = nextShops.some((shop) => String(shop.id) === shopId) ? shopId : String(nextShops[0]?.id || '');
      setShops(nextShops); setShopId(selectedId); setProducts(productData);
      const flattenCategories = (items: Row[]): Row[] => items.flatMap((item) => [item, ...flattenCategories(rows(item.children))]);
      setCategories(flattenCategories(rows(categoryData))); setCountries(rows(countryData));
      if (selectedId) await loadShop(selectedId); else { setMetrics({}); setInventory([]); setOrders([]); }
    } catch (e: any) { setError(e?.message || 'Could not load the admin dashboard.'); }
    finally { setBusy(false); }
  }, [fetchAll, isSystem, loadShop, session, shopId]);

  useEffect(() => { void load(); }, []); // Initial admin data load.
  const activeShop = shops.find((shop) => String(shop.id) === shopId);
  const visibleInventory = useMemo(() => inventory.filter((item) => {
    const query = search.trim().toLowerCase();
    const matches = !query || `${item.productName || ''} ${item.sku || ''}`.toLowerCase().includes(query);
    const stock = Number(item.stockQuantity || 0);
    const availability = inventoryFilter === 'available' ? item.available === true : inventoryFilter === 'hidden' ? item.available !== true : true;
    return matches && availability;
  }), [inventory, inventoryFilter, search]);
  const visibleProducts = useMemo(() => products.filter((p) => !search || `${p.name || ''} ${p.code || ''} ${p.barcode || ''} ${p.brand || ''}`.toLowerCase().includes(search.toLowerCase())), [products, search]);

  async function selectShop(id: string) {
    setShopId(id); setBusy(true); setError('');
    try { await loadShop(id); } catch (e: any) { setError(e?.message || 'Could not load store information.'); }
    finally { setBusy(false); }
  }
  async function advanceOrder(order: Row) {
    const status = orderNext[order.status]; if (!status || !shopId) return;
    try { await api(`orders/supermarkets/${shopId}/${order.id}/status`, session, { method: 'PUT', body: JSON.stringify({ status }) }); await loadShop(shopId); setNotice(`Order moved to ${status.replaceAll('_', ' ').toLowerCase()}.`); }
    catch (e: any) { setNotice(e?.message || 'Could not update the order.'); }
  }
  async function downloadInventoryTemplate() {
    if (!shopId) return;
    try {
      const response = await fetch(`${API_ROOT}/supermarkets/${shopId}/inventory/import-template`, { headers: { Authorization: `Bearer ${session.accessToken}`, 'X-User-Email': session.email }, cache: 'no-store' });
      if (!response.ok) { const body = await response.json().catch(() => null); throw new Error(body?.message || `Request failed (${response.status})`); }
      const blob = await response.blob(); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'inventory-import-template.csv'; link.click(); URL.revokeObjectURL(url);
      setNotice('Inventory CSV template downloaded.');
    } catch (e: any) { setNotice(e?.message || 'Could not download the inventory template.'); }
  }
  async function importInventoryCsv(file?: File) {
    if (!file || !shopId) return;
    try {
      const data = new FormData(); data.append('file', file);
      const response = await fetch(`${API_ROOT}/supermarkets/${shopId}/inventory/import`, { method: 'POST', headers: { Authorization: `Bearer ${session.accessToken}`, 'X-User-Email': session.email }, body: data, cache: 'no-store' });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.message || body?.detail || `Request failed (${response.status})`);
      await loadShop(shopId);
      setNotice(`Inventory imported: ${body?.successCount ?? body?.importedCount ?? 'completed'} rows succeeded${body?.failedCount ? `, ${body.failedCount} failed` : ''}.`);
    } catch (e: any) { setNotice(e?.message || 'Could not import the inventory CSV.'); }
  }
  async function saveDialog(form: FormData) {
    if (!dialog) return;
    const v = (name: string) => String(form.get(name) ?? '').trim();
    const nullable = (value: string) => value || null;
    const num = (name: string, fallback = 0) => Number(v(name) || fallback);
    const existing = dialog.record;
    try {
      if (dialog.kind === 'inventory-edit' && shopId && existing) {
        await api(`supermarkets/${shopId}/products/${existing.id}`, session, { method: 'PUT', body: JSON.stringify({ sku: v('sku'), priceJpy: num('priceJpy'), discountPriceJpy: v('discountPriceJpy') ? num('discountPriceJpy') : null, taxRate: num('taxRate'), stockQuantity: num('stockQuantity'), minStockLevel: num('minStockLevel'), sortOrder: num('sortOrder'), available: form.get('available') === 'on' }) });
        await loadShop(shopId); setNotice('Inventory updated.');
      } else if (dialog.kind === 'inventory-add' && shopId) {
        await api(`supermarkets/${shopId}/products`, session, { method: 'POST', body: JSON.stringify({ productId: num('productId'), sku: v('sku'), priceJpy: num('priceJpy'), discountPriceJpy: v('discountPriceJpy') ? num('discountPriceJpy') : null, taxRate: num('taxRate'), stockQuantity: num('stockQuantity'), minStockLevel: num('minStockLevel'), sortOrder: num('sortOrder'), available: true }) });
        await loadShop(shopId); setNotice('Product added to store inventory.');
      } else if (dialog.kind === 'product' || dialog.kind === 'product-edit') {
        const payload = { code: nullable(v('code')?.toUpperCase()), barcode: nullable(v('barcode')), name: v('name'), brand: nullable(v('brand')), brandId: null, unit: nullable(v('unit')), description: nullable(v('description')), imageUrl: nullable(v('imageUrl')), categoryIds: form.getAll('categoryIds').map(Number), sortOrder: num('sortOrder'), active: form.get('active') === 'on' };
        if (existing) await api(`products/${existing.id}`, session, { method: 'PUT', body: JSON.stringify(payload) }); else await api('products', session, { method: 'POST', body: JSON.stringify(payload) });
        setNotice(existing ? 'Product updated.' : 'Product created.'); await load();
      } else if (dialog.kind === 'category' || dialog.kind === 'category-edit') {
        const payload = { code: nullable(v('code')?.toUpperCase()), name: v('name'), slug: nullable(v('slug')?.toLowerCase()), description: nullable(v('description')), imageUrl: nullable(v('imageUrl')), parentId: v('parentId') ? num('parentId') : null, sortOrder: num('sortOrder'), active: form.get('active') === 'on' };
        if (existing) await api(`categories/${existing.id}`, session, { method: 'PUT', body: JSON.stringify(payload) }); else await api('categories', session, { method: 'POST', body: JSON.stringify(payload) });
        setNotice(existing ? 'Category updated.' : 'Category created.'); await load();
      } else if (dialog.kind === 'store' || dialog.kind === 'store-edit') {
        const rawPostalCode = v('postalCode');
        const postalCode = /^\d{7}$/.test(rawPostalCode) ? `${rawPostalCode.slice(0, 3)}-${rawPostalCode.slice(3)}` : rawPostalCode;
        const payload = { countryId: num('countryId'), name: v('name'), description: nullable(v('description')), businessRegistrationNumber: nullable(v('businessRegistrationNumber')), corporateNumber: nullable(v('corporateNumber')), taxRegistrationNumber: nullable(v('taxRegistrationNumber')), email: nullable(v('email')), phoneNumber: nullable(v('phoneNumber')), mobileNumber: nullable(v('mobileNumber')), website: nullable(v('website')), postalCode, prefecture: v('prefecture'), city: v('city'), town: v('town'), addressLine: v('addressLine'), buildingName: nullable(v('buildingName')), roomNumber: nullable(v('roomNumber')), logoUrl: nullable(v('logoUrl')), status: v('status') || 'ACTIVE', active: form.get('active') === 'on' };
        if (existing) await api(`supermarkets/${existing.id}`, session, { method: 'PUT', body: JSON.stringify(payload) }); else await api('supermarkets', session, { method: 'POST', body: JSON.stringify(payload) });
        setNotice(existing ? 'Store updated.' : 'Store created.'); await load();
      } else if (dialog.kind === 'country' || dialog.kind === 'country-edit') {
        const payload = { code: v('code').toUpperCase(), name: v('name'), active: form.get('active') === 'on' };
        if (existing) await api(`countries/${existing.id}`, session, { method: 'PUT', body: JSON.stringify(payload) }); else await api('countries', session, { method: 'POST', body: JSON.stringify(payload) });
        setNotice(existing ? 'Country updated.' : 'Country created.'); await load();
      }
      setDialog(null);
    } catch (e: any) { setNotice(e?.message || 'Could not save your changes.'); }
  }

  const tabs = ['Overview', 'Inventory', 'Orders', ...(isSystem ? ['Products', 'Stores'] : [])];
  return <main className="admin-shell">
    <aside className="admin-side"><a className="admin-brand" href="#"><span><Store size={19}/></span><b>ForeignMart<span>ADMIN CONSOLE</span></b></a><div className="admin-role-chip">{isSystem ? 'SYSTEM ADMIN' : 'SUPERMARKET ADMIN'}</div><nav>{tabs.map((name) => <button key={name} className={tab === name ? 'active' : ''} onClick={() => { setTab(name); setSearch(''); }}><span>{name === 'Overview' ? <BarChart3 size={18}/> : name === 'Inventory' ? <Package size={18}/> : name === 'Orders' ? <Truck size={18}/> : name === 'Products' ? <Activity size={18}/> : <Store size={18}/>}</span>{name}</button>)}</nav><div className="admin-side-bottom"><span>{session.email}</span><button onClick={() => void load()}><RefreshCw size={15}/>Refresh data</button><button onClick={onSignOut}><LogOut size={15}/>Sign out</button></div></aside>
    <section className="admin-main"><header className="admin-topbar"><div><span className="admin-kicker">FOREIGNMART MANAGEMENT</span><h1>{tab === 'Overview' ? isSystem ? 'Admin dashboard' : 'Store dashboard' : tab}</h1></div><div className="admin-top-actions">{shops.length > 0 && <label className="admin-shop-select"><Store size={16}/><select aria-label="Select managed store" value={shopId} onChange={(e) => void selectShop(e.target.value)}>{shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.name}</option>)}</select><ChevronDown size={15}/></label>}<button className="admin-profile" title={session.email}>{session.email.slice(0,1).toUpperCase()}</button></div></header>
      {error && <div className="admin-error"><b>Dashboard data could not be loaded</b><span>{error}</span><button onClick={() => void load()}>Retry</button></div>}
      {busy && <div className="admin-loading"><span/>Loading management data…</div>}
      {!busy && !isSystem && !shops.length ? <div className="admin-empty"><Store size={30}/><h2>No store is assigned</h2><p>Ask a system administrator to assign a supermarket to your account.</p></div> : <>
        {tab === 'Overview' && <div className="admin-content"><div className="admin-welcome"><div><span className="admin-kicker">{activeShop?.name || 'MARKET OVERVIEW'}</span><h2>Good to see you{session.firstName ? `, ${session.firstName}` : ''}.</h2><p>{isSystem ? 'Here’s what is happening across the markets you manage.' : 'Your store’s latest activity at a glance.'}</p></div><div className="admin-live"><span/>Live store data</div></div><div className="admin-metrics">{[['Orders', metrics.totalOrders || 0, 'Orders received', <Users size={19}/>], ['Pending', metrics.pendingOrders || 0, 'Need attention', <Activity size={19}/>], ['Deliveries', metrics.activeDeliveries || 0, 'On the way', <Truck size={19}/>], ['Revenue', price(metrics.deliveredRevenueJpy), 'Delivered orders', <BarChart3 size={19}/>]].map(([label, value, hint, icon]: any) => <article className="admin-metric" key={label}><span>{icon}</span><small>{label}</small><b>{value}</b><em>{hint}</em></article>)}</div><div className="admin-panel"><div className="admin-panel-heading"><div><h2>Low stock</h2><p>Items at or below their minimum level</p></div><button onClick={() => setTab('Inventory')}>View inventory <ArrowRight size={15}/></button></div>{rows(metrics.lowStockItems).length ? <div className="admin-table-wrap"><table><thead><tr><th>Product</th><th>SKU</th><th>In stock</th><th>Minimum</th></tr></thead><tbody>{rows(metrics.lowStockItems).map((item) => <tr key={item.id}><td>{item.productName}</td><td>{item.sku || '—'}</td><td><b className="admin-low-stock">{item.stockQuantity}</b></td><td>{item.minStockLevel ?? 5}</td></tr>)}</tbody></table></div> : <div className="admin-good-stock"><Check size={19}/>Stock levels look good. Items with five or fewer units will appear here.</div>}</div>{isSystem && <div className="admin-panel"><div className="admin-panel-heading"><div><h2>Your stores</h2><p>Manage markets, countries, and store availability.</p></div><button onClick={() => setTab('Stores')}>Manage stores <ArrowRight size={15}/></button></div><div className="admin-store-pills">{shops.slice(0,6).map((shop) => <button key={shop.id} onClick={() => void selectShop(String(shop.id))}><Store size={15}/>{shop.name}</button>)}</div></div>}</div>}
        {tab === 'Inventory' && <div className="admin-content"><div className="admin-toolbar"><div><h2>Store inventory</h2><p>{activeShop?.name || 'Select a store'} · Prices in JPY</p></div><div className="admin-toolbar-actions"><label className="admin-search"><Search size={17}/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search product or SKU"/></label><select value={inventoryFilter} onChange={(e) => setInventoryFilter(e.target.value)}><option value="all">All availability</option><option value="available">Available</option><option value="hidden">Hidden</option></select><button className="admin-quiet-button" disabled={!activeShop?.active} onClick={() => void downloadInventoryTemplate()}>CSV template</button><label className="admin-quiet-button admin-upload-button">Import CSV<input type="file" accept=".csv,text/csv" disabled={!activeShop?.active} onChange={(e) => { void importInventoryCsv(e.currentTarget.files?.[0]); e.currentTarget.value = ''; }}/></label><button className="admin-primary" disabled={!activeShop?.active} onClick={() => setDialog({kind:'inventory-add'})}><Plus size={16}/>Add product</button></div></div>{!activeShop?.active && activeShop && <div className="admin-warning">Activate this store before changing its inventory.</div>}<div className="admin-panel admin-table-panel">{!visibleInventory.length ? <div className="admin-empty"><Package size={28}/><h2>{inventory.length ? 'No matching inventory' : 'Inventory is empty'}</h2><p>{inventory.length ? 'Clear the search or availability filter.' : 'Add products to this store to start tracking stock.'}</p></div> : <div className="admin-table-wrap"><table><thead><tr><th>Product / SKU</th><th>Price</th><th>Discount</th><th>Tax</th><th>Stock</th><th>Minimum</th><th>Available</th><th></th></tr></thead><tbody>{visibleInventory.map((item) => <tr key={item.id}><td><b>{item.productName}</b><small>{item.sku || 'No SKU'}</small></td><td>{price(item.priceJpy)}</td><td>{item.discountPriceJpy ? price(item.discountPriceJpy) : '—'}</td><td>{item.taxRate ?? 0}%</td><td>{item.stockQuantity ?? 0}</td><td>{item.minStockLevel ?? 0}</td><td><span className={`admin-status ${item.available ? 'good' : 'muted'}`}>{item.available ? 'Available' : 'Hidden'}</span></td><td><button className="admin-icon-button" disabled={!activeShop?.active} title="Edit inventory" onClick={() => setDialog({kind:'inventory-edit',record:item})}><Edit3 size={16}/></button></td></tr>)}</tbody></table></div>}</div></div>}
        {tab === 'Orders' && <div className="admin-content"><div className="admin-toolbar"><div><h2>Incoming orders</h2><p>{activeShop?.name || 'Select a store'} · Update order progress</p></div><button className="admin-quiet-button" onClick={() => void loadShop(shopId)}><RefreshCw size={15}/>Refresh orders</button></div>{!orders.length ? <div className="admin-empty"><Package size={28}/><h2>No orders yet</h2><p>New customer orders will appear here.</p></div> : <div className="admin-order-list">{orders.map((order) => <article className="admin-order" key={order.id}><div className="admin-order-top"><div><span className="admin-kicker">ORDER</span><h3>{order.orderNumber || `#${order.id}`}</h3></div><span className="admin-status good">{String(order.status || 'PENDING').replaceAll('_',' ')}</span></div><div className="admin-order-meta"><span>{order.deliveryAddress?.recipientName || 'Customer'} · {rows(order.items).length} items</span><b>{price(order.totalJpy)}</b></div>{orderAction[order.status] && <button className="admin-primary" onClick={() => void advanceOrder(order)}>{orderAction[order.status]} <ArrowRight size={15}/></button>}</article>)}</div>}</div>}
        {tab === 'Products' && isSystem && <div className="admin-content"><div className="admin-toolbar"><div><h2>Product catalog</h2><p>Manage catalog products and product categories.</p></div><div className="admin-toolbar-actions"><label className="admin-search"><Search size={17}/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search product catalog"/></label><button className="admin-quiet-button" onClick={() => setDialog({kind:'category'})}><Plus size={15}/>New category</button><button className="admin-primary" onClick={() => setDialog({kind:'product'})}><Plus size={15}/>New product</button></div></div><div className="admin-panel"><h2>Categories ({categories.length})</h2>{categories.length ? <div className="admin-category-list">{categories.map((cat) => <article key={cat.id}><div><b>{cat.name}</b><small>{cat.code || cat.slug || 'Category'}{cat.active === false ? ' · Inactive' : ''}</small></div><button className="admin-icon-button" title="Edit category" onClick={() => setDialog({kind:'category-edit',record:cat})}><Edit3 size={16}/></button></article>)}</div> : <p className="admin-muted">Create a category before adding catalog products.</p>}</div><div className="admin-panel admin-table-panel"><h2>Products ({visibleProducts.length} of {products.length})</h2>{!visibleProducts.length ? <p className="admin-muted">No catalog products match this search.</p> : <div className="admin-table-wrap"><table><thead><tr><th>Product</th><th>Code</th><th>Barcode</th><th>Brand</th><th>Categories</th><th>Unit</th><th>Status</th><th></th></tr></thead><tbody>{visibleProducts.map((p) => <tr key={p.id}><td><b>{p.name}</b></td><td>{p.code || '—'}</td><td>{p.barcode || '—'}</td><td>{p.brand || '—'}</td><td>{rows(p.categories).map((c) => c.name).join(', ') || '—'}</td><td>{p.unit || '—'}</td><td><span className={`admin-status ${p.active ? 'good' : 'muted'}`}>{p.active ? 'Active' : 'Inactive'}</span></td><td><button className="admin-icon-button" title="Edit product" onClick={() => setDialog({kind:'product-edit',record:p})}><Edit3 size={16}/></button></td></tr>)}</tbody></table></div>}</div></div>}
        {tab === 'Stores' && isSystem && <div className="admin-content"><div className="admin-toolbar"><div><h2>All stores</h2><p>Manage supermarkets and supported countries.</p></div><button className="admin-primary" onClick={() => setDialog({kind:'store'})}><Plus size={15}/>New store</button></div><div className="admin-store-grid">{shops.map((shop) => <article className="admin-store-card" key={shop.id}><span className="admin-store-icon"><Store size={20}/></span><div><h3>{shop.name}</h3><p>{[shop.city, shop.prefecture, shop.countryCode].filter(Boolean).join(' · ') || 'Location not set'}</p><span className={`admin-status ${shop.active ? 'good' : 'muted'}`}>{shop.active ? 'Open for shopping' : 'Inactive'}</span></div><button className="admin-icon-button" title="Edit store" onClick={() => setDialog({kind:'store-edit',record:shop})}><Edit3 size={16}/></button></article>)}</div><div className="admin-panel admin-country-panel"><div className="admin-panel-heading"><div><h2>Countries</h2><p>Regions where ForeignMart operates.</p></div><button onClick={() => setDialog({kind:'country'})}><Plus size={15}/>New country</button></div><div className="admin-country-list">{countries.map((country) => <article key={country.id}><Globe2 size={17}/><b>{country.name}</b><span>{country.code} · {country.active ? 'Active' : 'Inactive'}</span><button className="admin-icon-button" title="Edit country" onClick={() => setDialog({kind:'country-edit',record:country})}><Edit3 size={15}/></button></article>)}</div></div></div>}
      </>}
      {notice && <div className="admin-toast" role="status">{notice}<button onClick={() => setNotice('')}>Dismiss</button></div>}
      {dialog && <AdminForm kind={dialog.kind} record={dialog.record} products={products} categories={categories} countries={countries} onClose={() => setDialog(null)} onSubmit={saveDialog}/>}
    </section>
  </main>;
}

function AdminForm({ kind, record, products, categories, countries, onClose, onSubmit }: { kind: string; record?: Row; products: Row[]; categories: Row[]; countries: Row[]; onClose: () => void; onSubmit: (form: FormData) => void }) {
  const fields: Record<string, Array<{ name: string; label: string; type?: string; options?: Row[] }>> = {
    'inventory-edit': [{name:'sku',label:'SKU'},{name:'priceJpy',label:'Price (JPY)',type:'number'},{name:'discountPriceJpy',label:'Discount price (optional)',type:'number'},{name:'taxRate',label:'Tax rate (%)',type:'number'},{name:'stockQuantity',label:'Stock quantity',type:'number'},{name:'minStockLevel',label:'Minimum stock alert',type:'number'},{name:'sortOrder',label:'Sort order',type:'number'}],
    'inventory-add': [{name:'productId',label:'Catalog product',type:'product'},{name:'sku',label:'SKU'},{name:'priceJpy',label:'Price (JPY)',type:'number'},{name:'discountPriceJpy',label:'Discount price (optional)',type:'number'},{name:'taxRate',label:'Tax rate (%)',type:'number'},{name:'stockQuantity',label:'Stock quantity',type:'number'},{name:'minStockLevel',label:'Minimum stock alert',type:'number'},{name:'sortOrder',label:'Sort order',type:'number'}],
    product: [{name:'code',label:'Product code'},{name:'barcode',label:'Barcode'},{name:'name',label:'Product name'},{name:'brand',label:'Brand'},{name:'unit',label:'Unit'},{name:'description',label:'Description',type:'textarea'},{name:'imageUrl',label:'Image URL'},{name:'categoryIds',label:'Categories',type:'categories'},{name:'sortOrder',label:'Sort order',type:'number'}],
    'product-edit': [{name:'code',label:'Product code'},{name:'barcode',label:'Barcode'},{name:'name',label:'Product name'},{name:'brand',label:'Brand'},{name:'unit',label:'Unit'},{name:'description',label:'Description',type:'textarea'},{name:'imageUrl',label:'Image URL'},{name:'categoryIds',label:'Categories',type:'categories'},{name:'sortOrder',label:'Sort order',type:'number'}],
    category: [{name:'code',label:'Category code'},{name:'name',label:'Category name'},{name:'slug',label:'Slug'},{name:'description',label:'Description',type:'textarea'},{name:'imageUrl',label:'Image URL'},{name:'parentId',label:'Parent category',type:'parent'},{name:'sortOrder',label:'Sort order',type:'number'}],
    'category-edit': [{name:'code',label:'Category code'},{name:'name',label:'Category name'},{name:'slug',label:'Slug'},{name:'description',label:'Description',type:'textarea'},{name:'imageUrl',label:'Image URL'},{name:'parentId',label:'Parent category',type:'parent'},{name:'sortOrder',label:'Sort order',type:'number'}],
    store: [{name:'countryId',label:'Country',type:'country'},{name:'name',label:'Store name'},{name:'description',label:'Description',type:'textarea'},{name:'email',label:'Email',type:'email'},{name:'phoneNumber',label:'Phone'},{name:'mobileNumber',label:'Mobile'},{name:'website',label:'Website'},{name:'postalCode',label:'Postal code (NNN-NNNN)'},{name:'prefecture',label:'Prefecture'},{name:'city',label:'City'},{name:'town',label:'Town / ward'},{name:'addressLine',label:'Street address'},{name:'buildingName',label:'Building'},{name:'roomNumber',label:'Room number'},{name:'logoUrl',label:'Logo URL'},{name:'businessRegistrationNumber',label:'Business registration number'},{name:'corporateNumber',label:'Corporate number'},{name:'taxRegistrationNumber',label:'Tax registration number'}],
    'store-edit': [{name:'countryId',label:'Country',type:'country'},{name:'name',label:'Store name'},{name:'description',label:'Description',type:'textarea'},{name:'email',label:'Email (optional)',type:'email'},{name:'phoneNumber',label:'Phone'},{name:'mobileNumber',label:'Mobile'},{name:'website',label:'Website'},{name:'postalCode',label:'Postal code (NNN-NNNN)'},{name:'prefecture',label:'Prefecture'},{name:'city',label:'City'},{name:'town',label:'Town / ward'},{name:'addressLine',label:'Street address'},{name:'buildingName',label:'Building'},{name:'roomNumber',label:'Room number'},{name:'logoUrl',label:'Logo URL'},{name:'businessRegistrationNumber',label:'Business registration number'},{name:'corporateNumber',label:'Corporate number'},{name:'taxRegistrationNumber',label:'Tax registration number'}],
    country: [{name:'code',label:'ISO country code (2 letters)'},{name:'name',label:'Country name'}],
    'country-edit': [{name:'code',label:'ISO country code (2 letters)'},{name:'name',label:'Country name'}],
  };
  if (kind === 'store') fields.store = fields['store-edit'];
  const title = kind.replaceAll('-', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const multiValues = (record?.categories || []).map((c: Row) => String(c.id));
  return <div className="admin-modal-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><section className="admin-modal"><header><div><span className="admin-kicker">ADMIN MANAGEMENT</span><h2>{record ? 'Edit' : 'Create'} {title.replace(/ Edit$/, '')}</h2></div><button type="button" onClick={onClose} aria-label="Close">×</button></header><form action={(form) => onSubmit(form)}><div className="admin-form-grid">{(fields[kind] || []).map((field) => <label className={field.type === 'textarea' || field.type === 'categories' ? 'wide' : ''} key={field.name}>{field.label}{field.type === 'textarea' ? <textarea name={field.name} defaultValue={record?.[field.name] || ''}/> : field.type === 'categories' ? <select name={field.name} multiple required defaultValue={multiValues}>{categories.filter((c) => c.active !== false).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select> : field.type === 'parent' ? <select name={field.name} defaultValue={record?.parentId || ''}><option value="">Top-level category</option>{categories.filter((c) => String(c.id) !== String(record?.id)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select> : field.type === 'country' ? <select name={field.name} required defaultValue={record?.countryId || countries.find((c) => c.active)?.id || ''}><option value="" disabled>Select a country</option>{countries.filter((c) => c.active !== false).map((c) => <option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}</select> : field.type === 'product' ? <select name={field.name} required defaultValue=""><option value="" disabled>Select a catalog product</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select> : <input name={field.name} required={['name','postalCode','prefecture','city','town','addressLine'].includes(field.name) || field.type === 'email' && kind !== 'store' && kind !== 'store-edit'} type={field.type || 'text'} min={field.type === 'number' ? 0 : undefined} step={field.name.toLowerCase().includes('price') || field.name === 'taxRate' ? 'any' : undefined} placeholder={field.name === 'postalCode' ? '123-4567 (or 1234567)' : undefined} defaultValue={record?.[field.name] ?? (field.name === 'sortOrder' || field.name === 'minStockLevel' || field.name === 'taxRate' ? 0 : '')}/>}</label>)}{kind.startsWith('inventory') && <label className="admin-check-label"><input type="checkbox" name="available" defaultChecked={record ? record.available === true : true}/> Available in this store</label>}{kind.startsWith('product') && <label className="admin-check-label"><input type="checkbox" name="active" defaultChecked={record ? record.active !== false : true}/> Active in catalog</label>}{kind.startsWith('category') && <label className="admin-check-label"><input type="checkbox" name="active" defaultChecked={record ? record.active !== false : true}/> Active category</label>}{kind.startsWith('store') && <><label><span>Store status</span><select name="status" defaultValue={record?.status || 'ACTIVE'}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option><option value="SUSPENDED">Suspended</option></select></label><label className="admin-check-label"><input type="checkbox" name="active" defaultChecked={record ? record.active !== false : true}/> Active for shopping</label></>}{kind.startsWith('country') && <label className="admin-check-label"><input type="checkbox" name="active" defaultChecked={record ? record.active !== false : true}/> Active country</label>}</div><footer><button type="button" className="admin-quiet-button" onClick={onClose}>Cancel</button><button className="admin-primary">{record ? 'Save changes' : 'Create'}</button></footer></form></section></div>;
}
