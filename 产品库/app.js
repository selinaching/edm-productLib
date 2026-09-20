// ===== Constants =====
const STORAGE_KEY = 'productLibrary_v3';
const LEGACY_KEYS = ['productLibrary_v2', 'productLibrary_v1'];

const DEFAULT_FIELDS = [
  { id: 'f_features', name: '参数/功能' },
  { id: 'f_sp', name: '卖点' },
  { id: 'f_desc', name: '描述' },
  { id: 'f_cta', name: '引导购物语' },
];

// ===== State =====
// 按钮库种子数据：{ 场景, 文案 }
const DEFAULT_BUTTONS = [
  { scene: '限时折扣', content: 'Shop Now — Save 20% Today' },
  { scene: '限时折扣', content: '限时 8 折，立即抢购' },
  { scene: '限时折扣', content: 'Limited Time Only — Grab Yours' },
  { scene: '新品上市', content: 'Be the First to Try' },
  { scene: '新品上市', content: '新品首发，抢先体验' },
  { scene: '新品上市', content: 'New Arrival — Get Yours Now' },
  { scene: '会员专享', content: 'Members Only — Unlock Your Deal' },
  { scene: '会员专享', content: '会员专属价，立即查看' },
  { scene: '免费试用', content: 'Start Your Free Trial' },
  { scene: '免费试用', content: '免费试用 30 天' },
  { scene: '通用', content: 'Add to Cart' },
  { scene: '通用', content: 'Learn More' },
  { scene: '通用', content: '加入购物车' },
  { scene: '通用', content: '了解更多' },
];

let state = {
  fields: [],
  brands: [],
  products: [],
  selectedBrandId: null,
  expandedProductId: null,
  searchQuery: '',
  basket: [],
  buttonLibrary: [],   // [{ id, scene, content }]          按钮库（全局 CTA 池）
  copyLibrary: [],     // [{ id, brandId, category, content }] 通用文案库（分品牌 + 自建分类）
  layout: { sidebarW: 220, basketW: 360 },   // 三栏宽度，可拖拽调整并持久化
};

// 文案库的分类由用户自建，这里只给出建议（输入框 placeholder / datalist）
const SUGGESTED_CATEGORIES = ['banner', '标题', '副标题', '卖点短语', '促销语', '开场白'];

let editingBrandId = null;
let editingProductId = null;
let pendingConfirmAction = null;

// ===== Storage =====
function loadState() {
  let raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) for (const k of LEGACY_KEYS) { raw = localStorage.getItem(k); if (raw) break; }
  if (raw) {
    try {
      const data = JSON.parse(raw);
      state.brands = data.brands || [];
      state.products = data.products || [];
      state.basket = data.basket || [];
      state.fields = (data.fields && data.fields.length) ? data.fields : DEFAULT_FIELDS.map(f => ({ ...f }));
      // 升级前的数据没有 buttonLibrary -> 播种示例；用户主动清空(空数组)则尊重
      state.buttonLibrary = (data.buttonLibrary === undefined)
        ? DEFAULT_BUTTONS.map(b => ({ id: 'btn_' + uuid(), scene: b.scene, content: b.content }))
        : data.buttonLibrary;
      state.copyLibrary = data.copyLibrary || [];
      state.layout = data.layout || { sidebarW: 220, basketW: 360 };
    } catch (e) { console.error('Load error:', e); }
  }
  if (!state.fields.length) state.fields = DEFAULT_FIELDS.map(f => ({ ...f }));
  migrateValues();
}

function normVal(v) {
  if (typeof v === 'string') return { label: '', content: v };
  if (!v || typeof v !== 'object') return null;
  return { label: v.label || '', content: v.content || '' };
}

// Migrate legacy products (features/sellingPoints/...) into dynamic values map
function migrateValues() {
  const legacyMap = { features: 'f_features', sellingPoints: 'f_sp', descriptions: 'f_desc', ctas: 'f_cta' };
  for (const p of state.products) {
    if (!p.values || typeof p.values !== 'object') {
      p.values = {};
      for (const [legacyKey, fid] of Object.entries(legacyMap)) {
        if (Array.isArray(p[legacyKey])) p.values[fid] = p[legacyKey];
        delete p[legacyKey];
      }
    }
    for (const f of state.fields) {
      const arr = Array.isArray(p.values[f.id]) ? p.values[f.id] : [];
      p.values[f.id] = arr.map(normVal).filter(Boolean);
    }
  }
  // Normalize legacy basket items (used type string) to fieldId
  state.basket = (state.basket || []).map(it => {
    if (it.fieldId) return { fieldId: it.fieldId, label: it.label || '', content: it.content || '' };
    const f = state.fields.find(x => x.name === it.type);
    return { fieldId: f ? f.id : (state.fields[0] ? state.fields[0].id : ''), label: it.label || '', content: it.content || '' };
  }).filter(it => it.fieldId);
}

function stateSnapshot() {
  return JSON.stringify({
    fields: state.fields,
    brands: state.brands,
    products: state.products,
    basket: state.basket,
    buttonLibrary: state.buttonLibrary,
    copyLibrary: state.copyLibrary,
    layout: state.layout,
  });
}

let lastSnapshot = '';

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, stateSnapshot());
    lastSnapshot = stateSnapshot();
    flashSaved();
  } catch (e) { showToast('保存失败：存储空间可能已满'); }
}

// 兜底自动保存：即使某条编辑路径漏调 saveState，最多 3 秒后也一定落盘
function autoSave() {
  try {
    const s = stateSnapshot();
    if (s !== lastSnapshot) {
      localStorage.setItem(STORAGE_KEY, s);
      lastSnapshot = s;
      flashSaved();
      maybeAutoSync(); // 开了自动同步的话，改动后静默推一次
    }
  } catch (e) { /* 自动保存失败不打扰用户 */ }
}

function flashSaved() {
  const el = document.getElementById('save-indicator');
  if (!el) return;
  el.textContent = '已保存';
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 1500);
}

// ===== Utils =====
function uuid() { return Date.now().toString(36) + Math.random().toString(36).substring(2, 8); }
function escapeHtml(text) { if (!text) return ''; const d = document.createElement('div'); d.textContent = text; return d.innerHTML; }
function escapeAttr(text) { return escapeHtml(text).replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }

function fieldById(id) { return state.fields.find(f => f.id === id); }
function fieldName(id) { const f = fieldById(id); return f ? f.name : '已移除的列'; }
function totalCols() { return 2 + state.fields.length + 1; }
function valsOf(p, fid) { return (p && p.values && Array.isArray(p.values[fid])) ? p.values[fid] : []; }

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.style.display = 'block';
  clearTimeout(t._timer); t._timer = setTimeout(() => { t.style.display = 'none'; }, 2000);
}

async function copyToClipboard(text) {
  // 优先用 Clipboard API（需安全上下文，如 https / localhost）
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      showToast('已复制到剪贴板');
      return;
    }
  } catch (e) { /* 降级到 execCommand */ }
  // 降级方案
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta); ta.select();
    if (typeof document.execCommand === 'function') document.execCommand('copy');
    document.body.removeChild(ta);
    showToast('已复制到剪贴板');
  } catch (e) {
    showToast('复制失败，请手动选择文本复制');
  }
}

function downloadFile(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function closeDropdown() { const dd = document.querySelector('.dropdown'); if (dd) dd.classList.remove('open'); }

function valContent(v) { return typeof v === 'string' ? v : (v.content || ''); }
function valLabel(v) { return typeof v === 'string' ? '' : (v.label || ''); }
// 展示/复制时单条格式：[标签]内容（无标签则直接内容）
function valLine(v) {
  const l = valLabel(v); const c = valContent(v);
  return l ? `[${l}]${c}` : c;
}
function valText(v) { const l = valLabel(v); const c = valContent(v); return l ? l + ': ' + c : c; }

function formatForExport(v) {
  const c = valContent(v); const l = valLabel(v);
  return l ? l + '|' + c : c;
}
// ===== Render: Brand List =====
function renderBrandList() {
  const el = document.getElementById('brand-list');
  let html = `<li class="brand-item ${!state.selectedBrandId ? 'active' : ''}" onclick="selectBrand(null)">
    <span class="brand-name">全部品牌</span><span class="brand-count">${state.products.length}</span></li>`;
  for (const b of state.brands) {
    const c = state.products.filter(p => p.brandId === b.id).length;
    html += `<li class="brand-item ${state.selectedBrandId === b.id ? 'active' : ''}" onclick="selectBrand('${b.id}')">
      <span class="brand-name">${escapeHtml(b.name)}</span><span class="brand-count">${c}</span>
      <span class="brand-actions">
        <button class="icon-btn" onclick="event.stopPropagation();showBrandModal('${b.id}')">编辑</button>
        <button class="icon-btn" onclick="event.stopPropagation();confirmDeleteBrand('${b.id}')">删除</button>
      </span></li>`;
  }
  el.innerHTML = html;
}

// ===== Render: Dynamic Table Header =====
function renderTableHeader() {
  const row = document.getElementById('table-head-row');
  if (!row) return;
  let html = `<th style="min-width:170px">SKU/产品名</th><th style="min-width:100px">品牌</th>`;
  for (const f of state.fields) {
    html += `<th style="width:64px;text-align:center" title="${escapeAttr(f.name)}">${escapeHtml(f.name)}</th>`;
  }
  html += `<th style="width:80px;text-align:center">操作</th>`;
  row.innerHTML = html;
}

// ===== Render: Product Table (with expandable rows) =====
function renderProductTable() {
  const tbody = document.getElementById('product-tbody');
  const filtered = getFilteredProducts();
  const title = document.getElementById('main-title');
  title.textContent = state.selectedBrandId
    ? (state.brands.find(b => b.id === state.selectedBrandId)?.name || '全部') + ' 的产品 (' + filtered.length + ')'
    : '全部产品 (' + filtered.length + ')';

  renderTableHeader();

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${totalCols()}"><div class="empty-state"><div class="empty-icon">[ ]</div>
      <p>${state.searchQuery ? '没有找到匹配的产品' : '暂无产品，点击右上角添加'}</p></div></td></tr>`;
    return;
  }

  let html = '';
  for (const p of filtered) {
    const expanded = state.expandedProductId === p.id;
    const brand = state.brands.find(b => b.id === p.brandId);
    html += `<tr class="${expanded ? 'selected' : ''}" data-pid="${p.id}" onclick="toggleExpand('${p.id}')">
      <td>${escapeHtml(p.name)}</td><td>${escapeHtml(brand ? brand.name : '-')}</td>`;
    for (const f of state.fields) {
      const n = valsOf(p, f.id).length;
      html += `<td style="text-align:center"><span class="count-badge ${n === 0 ? 'zero' : ''}">${n}</span></td>`;
    }
    html += `<td><div class="action-cell">
        <button class="icon-btn" onclick="event.stopPropagation();showProductModal('${p.id}')">编辑</button>
        <button class="icon-btn danger" onclick="event.stopPropagation();confirmDeleteProduct('${p.id}')">删除</button>
      </div></td></tr>`;

    if (expanded) {
      html += `<tr class="expand-row"><td colspan="${totalCols()}">${renderExpandedProduct(p)}</td></tr>`;
    }
  }
  tbody.innerHTML = html;
}

// ===== Render: Expanded Product =====
function renderExpandedProduct(product) {
  let html = '<div class="expanded-content">';
  for (const field of state.fields) {
    const values = valsOf(product, field.id);
    const isDesc = field.name.includes('描述');
    // 「库选」只给按钮/CTA 列，其他列不需要
    const isBtnCol = /按钮|cta/i.test(field.name || '');
    html += `<div class="expanded-section">
      <div class="expanded-section-header">
        <div class="expanded-section-title">${escapeHtml(field.name)}<span class="expanded-section-count">${values.length}</span></div>
        <div class="expanded-section-actions">
          ${isBtnCol ? `<button class="btn-text" onclick="showButtonPicker('${product.id}','${field.id}')">库选</button>` : ''}
          ${values.some(canSplitValue) ? `<button class="btn-text" onclick="splitAllValues('${product.id}','${field.id}')" title="把这一列里挤在一起的长文本自动拆成多条">一键分点</button>` : ''}
          <button class="btn-text" onclick="addAllToBasket('${product.id}','${field.id}')">全部加入</button>
          <button class="btn-text" onclick="copyAllValues('${product.id}','${field.id}')">全部复制</button>
        </div>
      </div>`;
    // 价格列自动识别：同时有「现在价格」和「划线价」时，给出两种优惠文案供选择
    const disc = discountAmount(values);
    if (disc) {
      html += `<div class="discount-card">
        <div class="discount-line">划线价 <s>${fmtMoney(disc.orig)}</s> → 现在价格 <b>${fmtMoney(disc.cur)}</b> · 省 <b>${fmtMoney(disc.amount)}</b>${disc.pct > 0 ? ' (' + disc.pct + '% off)' : ''}</div>
        <div class="discount-actions">
          <button class="btn btn-sm btn-primary" onclick="addDiscountToBasket('${product.id}','${field.id}','save')">SAVE ${fmtMoney(disc.amount)}</button>
          <button class="btn btn-sm btn-primary" onclick="addDiscountToBasket('${product.id}','${field.id}','off')">${fmtMoney(disc.amount)} OFF</button>
          ${disc.pct > 0 ? `<button class="btn btn-sm btn-primary" onclick="addDiscountToBasket('${product.id}','${field.id}','percent')">${disc.pct}% OFF</button>` : ''}
        </div>
      </div>`;
    }
    for (let i = 0; i < values.length; i++) {
      const v = values[i]; const c = valContent(v); const l = valLabel(v);
      html += `<div class="expanded-value" data-pid="${product.id}" data-fk="${field.id}" data-idx="${i}">
        ${l ? `<span class="expanded-value-label">${escapeHtml(l)}</span>` : ''}
        <span class="expanded-value-text" ondblclick="startInlineEdit('${product.id}','${field.id}',${i})">${escapeHtml(c)}</span>
        <div class="expanded-value-actions">
          <button class="icon-btn add-btn" onclick="addToBasket('${product.id}','${field.id}',${i})">加入</button>
          <button class="icon-btn" onclick="copyValue('${product.id}','${field.id}',${i})">复制</button>
          ${canSplitValue(v) ? `<button class="icon-btn" onclick="splitValue('${product.id}','${field.id}',${i})" title="把这一条自动拆成多条">分点</button>` : ''}
          <button class="icon-btn" onclick="startInlineEdit('${product.id}','${field.id}',${i})">编辑</button>
          <button class="icon-btn danger" onclick="deleteValue('${product.id}','${field.id}',${i})">删除</button>
        </div></div>`;
    }
    html += `<div id="add-value-${field.id}">
      <button class="add-value-btn" onclick="showAddValueInput('${product.id}','${field.id}')">+ 添加${escapeHtml(field.name)}${isDesc ? '（可加重点标签）' : ''}</button>
    </div></div>`;
  }
  html += '</div>';
  return html;
}

// ===== Render: Basket Panel (grouped by field) =====
// 分组规则：产品内容按「列」分组；文案库内容按「文案库 · 分类」分组
function basketGroupOf(item) {
  if (item.groupKey) return { key: item.groupKey, label: item.groupLabel || '文案库' };
  return { key: 'f_' + (item.fieldId || 'misc'), label: fieldName(item.fieldId) };
}

function basketGroups() {
  const order = []; const map = {};
  state.basket.forEach((item, idx) => {
    const g = basketGroupOf(item);
    if (!map[g.key]) { map[g.key] = { label: g.label, items: [] }; order.push(g.key); }
    map[g.key].items.push({ ...item, idx });
  });
  return { order, map };
}

function renderBasket() {
  const panel = document.getElementById('basket-panel');
  if (state.basket.length === 0) {
    panel.innerHTML = `<div class="basket-header"><span class="basket-title">待复制内容</span><span class="basket-count">0</span></div>
      <div class="basket-empty"><div class="basket-empty-icon">[ ]</div><p>点击产品展开后，选择需要的内容加入</p></div>`;
    return;
  }
  const { order, map } = basketGroups();
  let html = `<div class="basket-header"><span class="basket-title">待复制内容</span><span class="basket-count">${state.basket.length}</span></div><div class="basket-list">`;
  for (const key of order) {
    const items = map[key].items;
    html += `<div class="basket-group">
      <div class="basket-group-title">${escapeHtml(map[key].label)}<span class="basket-group-count">${items.length}</span></div>`;
    for (const it of items) {
      html += `<div class="basket-item" draggable="true"
        ondragstart="basketDragStart(event, ${it.idx})"
        ondragover="basketDragOver(event)"
        ondragenter="basketDragEnter(event, this)"
        ondragleave="basketDragLeave(this)"
        ondrop="basketDrop(event, ${it.idx})"
        ondragend="basketDragEnd()">
        <span class="basket-drag" title="按住拖动可调整顺序">⋮⋮</span>
        <div class="basket-item-text">${it.label ? `<span class="basket-item-label">[${escapeHtml(it.label)}]</span>` : ''}${escapeHtml(it.content)}</div>
        <button class="basket-item-remove" onclick="removeFromBasket(${it.idx})" title="移除">x</button>
      </div>`;
    }
    html += `</div>`;
  }
  html += `</div><div class="basket-footer">
    <button class="btn btn-primary" style="flex:1" onclick="copyBasket()">全部复制 (${state.basket.length})</button>
    <button class="btn" onclick="clearBasket()">清空</button>
  </div>`;
  panel.innerHTML = html;
}

function renderAll() { renderBrandList(); renderProductTable(); renderBasket(); }

// ===== Field (Column) Management =====
function showFieldsModal() {
  let html = `<div class="modal-title">管理表格列</div>
    <p class="confirm-text">可重命名、排序、新增或删除列。删除列会同时删除所有产品在该列下的内容。</p>
    <div class="field-list">`;
  state.fields.forEach((f, i) => {
    html += `<div class="field-row">
      <span class="field-index">${i + 1}</span>
      <input class="form-input field-name-input" data-idx="${i}" value="${escapeAttr(f.name)}" placeholder="列名">
      <div class="field-actions">
        <button class="icon-btn" onclick="moveField(${i},-1)" ${i === 0 ? 'disabled' : ''} title="上移">↑</button>
        <button class="icon-btn" onclick="moveField(${i},1)" ${i === state.fields.length - 1 ? 'disabled' : ''} title="下移">↓</button>
        <button class="icon-btn danger" onclick="confirmDeleteField('${f.id}')" title="删除">删</button>
      </div></div>`;
  });
  html += `</div>
    <div class="add-field-row">
      <input class="form-input" id="new-field-name" placeholder="新列名，如：适用人群">
      <button class="btn btn-primary" onclick="addField()">+ 添加列</button>
    </div>
    <div class="modal-footer"><button class="btn" onclick="hideModal()">取消</button>
    <button class="btn btn-primary" onclick="saveFieldsFromModal()">保存</button></div>`;
  document.getElementById('modal-content').innerHTML = html;
  document.getElementById('modal-overlay').style.display = 'flex';
  const ni = document.getElementById('new-field-name');
  if (ni) ni.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addField(); } });
}

// 从弹窗输入框收集当前列名（移动/新增前先落盘，避免丢失未保存的改名）
function collectFieldNames() {
  const inputs = document.querySelectorAll('.field-name-input');
  inputs.forEach(inp => {
    const i = parseInt(inp.dataset.idx, 10);
    const name = inp.value.trim();
    if (state.fields[i] && name) state.fields[i].name = name;
  });
}

function saveFieldsFromModal() {
  collectFieldNames();
  for (const f of state.fields) if (!f.name || !f.name.trim()) f.name = '未命名列';
  saveState(); hideModal(); renderAll(); showToast('表格列已保存');
}

function addField() {
  collectFieldNames();
  const inp = document.getElementById('new-field-name');
  const name = (inp ? inp.value : '').trim();
  if (!name) { showToast('请输入列名'); return; }
  state.fields.push({ id: 'f_' + uuid(), name });
  saveState(); renderAll(); showFieldsModal(); showToast('已添加列：' + name);
}

function moveField(i, dir) {
  const j = i + dir;
  if (j < 0 || j >= state.fields.length) return;
  collectFieldNames();
  const tmp = state.fields[i]; state.fields[i] = state.fields[j]; state.fields[j] = tmp;
  saveState(); renderAll(); showFieldsModal();
}

function confirmDeleteField(fid) {
  const f = fieldById(fid); if (!f) return;
  let count = 0;
  for (const p of state.products) count += valsOf(p, fid).length;
  showConfirm(`确定删除列"${f.name}"？${count > 0 ? '将同时删除所有产品下的 ' + count + ' 条内容。' : ''}此操作不可撤销。`, () => deleteField(fid));
}

function deleteField(fid) {
  state.fields = state.fields.filter(f => f.id !== fid);
  for (const p of state.products) { if (p.values) delete p.values[fid]; }
  state.basket = state.basket.filter(it => it.fieldId !== fid);
  saveState(); hideModal(); renderAll(); showToast('列已删除');
}

// ===== Brand Ops =====
function selectBrand(id) { state.selectedBrandId = id; renderBrandList(); renderProductTable(); }

function showBrandModal(id) {
  editingBrandId = id || null;
  const b = id ? state.brands.find(x => x.id === id) : null;
  document.getElementById('modal-content').innerHTML = `
    <div class="modal-title">${b ? '编辑品牌' : '添加品牌'}</div>
    <div class="form-group"><label class="form-label">品牌名称 *</label>
    <input class="form-input" id="modal-brand-name" value="${b ? escapeAttr(b.name) : ''}" placeholder="输入品牌名称"></div>
    <div class="form-group"><label class="form-label">备注</label>
    <textarea class="form-textarea" id="modal-brand-note" placeholder="备注信息（可选）">${b ? escapeHtml(b.note || '') : ''}</textarea></div>
    <div class="modal-footer"><button class="btn" onclick="hideModal()">取消</button>
    <button class="btn btn-primary" onclick="saveBrandFromModal()">保存</button></div>`;
  document.getElementById('modal-overlay').style.display = 'flex';
  setTimeout(() => document.getElementById('modal-brand-name').focus(), 50);
}

function saveBrandFromModal() {
  const name = document.getElementById('modal-brand-name').value.trim();
  const note = document.getElementById('modal-brand-note').value.trim();
  if (!name) { showToast('请输入品牌名称'); return; }
  if (editingBrandId) { const b = state.brands.find(x => x.id === editingBrandId); if (b) { b.name = name; b.note = note; } }
  else { state.brands.push({ id: uuid(), name, note }); }
  saveState(); hideModal(); renderAll();
  showToast(editingBrandId ? '品牌已更新' : '品牌已添加');
}

function confirmDeleteBrand(id) {
  const b = state.brands.find(x => x.id === id); if (!b) return;
  const c = state.products.filter(p => p.brandId === id).length;
  showConfirm(`确定删除品牌"${b.name}"${c > 0 ? '及其 ' + c + ' 个产品' : ''}？此操作不可撤销。`, () => deleteBrand(id));
}

function deleteBrand(id) {
  state.brands = state.brands.filter(b => b.id !== id);
  state.products = state.products.filter(p => p.brandId !== id);
  if (state.selectedBrandId === id) state.selectedBrandId = null;
  if (state.expandedProductId) { const p = state.products.find(p => p.id === state.expandedProductId); if (!p) state.expandedProductId = null; }
  saveState(); hideModal(); renderAll(); showToast('品牌已删除');
}

// ===== Product Ops =====
function toggleExpand(id) {
  state.expandedProductId = state.expandedProductId === id ? null : id;
  renderProductTable();
  // 展开后把该产品行滚到列表顶部，让展开内容从第一行开始显示
  if (state.expandedProductId) {
    requestAnimationFrame(() => {
      const row = document.querySelector('#product-tbody tr[data-pid="' + id + '"]');
      if (row) row.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  }
}

function showProductModal(id) {
  if (state.brands.length === 0) { showToast('请先添加品牌'); showBrandModal(); return; }
  editingProductId = id || null;
  const p = id ? state.products.find(x => x.id === id) : null;
  const bid = p ? p.brandId : (state.selectedBrandId || state.brands[0].id);
  let opts = '';
  for (const b of state.brands) opts += `<option value="${b.id}" ${b.id === bid ? 'selected' : ''}>${escapeHtml(b.name)}</option>`;
  document.getElementById('modal-content').innerHTML = `
    <div class="modal-title">${p ? '编辑产品' : '添加产品'}</div>
    <div class="form-group"><label class="form-label">SKU/产品名 *</label>
    <input class="form-input" id="modal-product-name" value="${p ? escapeAttr(p.name) : ''}" placeholder="输入 SKU 或产品名"></div>
    <div class="form-group"><label class="form-label">所属品牌 *</label>
    <select class="form-select" id="modal-product-brand">${opts}</select></div>
    <div class="modal-footer"><button class="btn" onclick="hideModal()">取消</button>
    <button class="btn btn-primary" onclick="saveProductFromModal()">保存</button></div>`;
  document.getElementById('modal-overlay').style.display = 'flex';
  setTimeout(() => document.getElementById('modal-product-name').focus(), 50);
}

function saveProductFromModal() {
  const name = document.getElementById('modal-product-name').value.trim();
  const bid = document.getElementById('modal-product-brand').value;
  if (!name) { showToast('请输入 SKU 或产品名'); return; }
  if (!bid) { showToast('请选择品牌'); return; }
  if (editingProductId) { const p = state.products.find(x => x.id === editingProductId); if (p) { p.name = name; p.brandId = bid; } }
  else {
    const values = {}; for (const f of state.fields) values[f.id] = [];
    const np = { id: uuid(), brandId: bid, name, createdAt: new Date().toISOString(), values };
    state.products.push(np); state.expandedProductId = np.id;
  }
  saveState(); hideModal(); renderAll();
  showToast(editingProductId ? '产品已更新' : '产品已添加');
}

function confirmDeleteProduct(id) {
  const p = state.products.find(x => x.id === id); if (!p) return;
  showConfirm(`确定删除产品"${p.name}"？此操作不可撤销。`, () => deleteProduct(id));
}

function deleteProduct(id) {
  state.products = state.products.filter(p => p.id !== id);
  if (state.expandedProductId === id) state.expandedProductId = null;
  saveState(); hideModal(); renderAll(); showToast('产品已删除');
}

// ===== Content Ops =====
function showAddValueInput(productId, fieldId) {
  const container = document.getElementById('add-value-' + fieldId);
  if (!container) return;
  const fname = fieldName(fieldId);
  const isDesc = fname.includes('描述');
  const isPrice = /价格|price/i.test(fname);
  const labelPh = isDesc ? '重点，如短描述' : (isPrice ? '现在价格 / 划线价' : '标签(可选)');
  container.innerHTML = `<div class="add-value-row">
    <input class="label-input" id="add-label-${fieldId}" placeholder="${labelPh}">
    <input class="content-input" id="add-content-${fieldId}" placeholder="内容，Enter 添加">
  </div>`;
  const li = document.getElementById('add-label-' + fieldId);
  const ci = document.getElementById('add-content-' + fieldId);
  let done = false;
  ci.focus();
  function submit() { if (done) return; done = true; const c = ci.value.trim(); const l = li.value.trim(); if (c) addValueWithLabel(productId, fieldId, l, c); else renderProductTable(); }
  ci.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } if (e.key === 'Escape') { done = true; renderProductTable(); } });
  li.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ci.focus(); } if (e.key === 'Escape') { done = true; renderProductTable(); } });
  // 同理：在标签框与内容框之间切换焦点时不提交，避免一点标签框输入框就消失
  const addRow = container.querySelector('.add-value-row');
  addRow.addEventListener('focusout', e => {
    if (e.relatedTarget && addRow.contains(e.relatedTarget)) return;
    if (!done) submit();
  });
}

function addValueWithLabel(productId, fieldId, label, content) {
  const p = state.products.find(x => x.id === productId);
  if (p) {
    if (!p.values || typeof p.values !== 'object') p.values = {};
    if (!Array.isArray(p.values[fieldId])) p.values[fieldId] = [];
    p.values[fieldId].push({ label, content });
    saveState(); renderProductTable();
    if (state.expandedProductId === productId) setTimeout(() => showAddValueInput(productId, fieldId), 0);
  }
}

function startInlineEdit(productId, fieldId, index) {
  const p = state.products.find(x => x.id === productId);
  const values = valsOf(p, fieldId);
  if (!p || !values[index]) return;
  const v = values[index]; const c = valContent(v); const l = valLabel(v);
  const card = document.querySelector(`.expanded-value[data-pid="${productId}"][data-fk="${fieldId}"][data-idx="${index}"]`);
  if (!card) return;
  let cancelled = false; let saved = false;
  card.innerHTML = `<div class="inline-edit-row">
    <input class="label-edit" value="${escapeAttr(l)}" placeholder="标签(可选)">
    <textarea class="content-edit" title="Enter 保存，Shift+Enter 换行" rows="${Math.max(1, String(c).split('\n').length, Math.ceil(c.length / 40))}">${escapeHtml(c)}</textarea>
  </div>`;
  const li = card.querySelector('.label-edit');
  const ci = card.querySelector('.content-edit');
  ci.focus(); ci.select();
  function autoResize() { ci.style.height = 'auto'; ci.style.height = ci.scrollHeight + 'px'; }
  ci.addEventListener('input', autoResize); setTimeout(autoResize, 0);
  function doSave() {
    if (cancelled || saved) return; saved = true;
    const nl = li.value.trim(); const nc = ci.value.trim();
    if (nc && (nc !== c || nl !== l)) { p.values[fieldId][index] = { label: nl, content: nc }; saveState(); }
    renderProductTable();
  }
  // 用 focusout + relatedTarget：在「标签框」与「内容框」之间切换焦点时不保存，
  // 否则一点备注框，内容框失焦就立刻保存并重渲染，编辑框消失（"一点击就跳"）
  const editRow = card.querySelector('.inline-edit-row');
  editRow.addEventListener('focusout', e => {
    if (e.relatedTarget && editRow.contains(e.relatedTarget)) return;
    doSave();
  });
  ci.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSave(); } if (e.key === 'Escape') { e.preventDefault(); cancelled = true; renderProductTable(); } });
  li.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ci.focus(); } if (e.key === 'Escape') { e.preventDefault(); cancelled = true; renderProductTable(); } });
}

function deleteValue(productId, fieldId, index) {
  const p = state.products.find(x => x.id === productId);
  if (p && Array.isArray(p.values[fieldId])) { p.values[fieldId].splice(index, 1); saveState(); renderProductTable(); }
}

function copyValue(productId, fieldId, index) {
  const p = state.products.find(x => x.id === productId);
  const values = valsOf(p, fieldId);
  if (!values[index]) return;
  copyToClipboard(valLine(values[index]));
}

function copyAllValues(productId, fieldId) {
  const p = state.products.find(x => x.id === productId);
  const values = valsOf(p, fieldId);
  if (values.length === 0) return;
  copyToClipboard('[' + fieldName(fieldId) + ']\n' + values.map(valLine).join('\n'));
}

// ===== 分条规则（用户定稿）：一格内只有「短横线 -」是分条符 =====
//   · 分条：只认 `-`（行首，或前面有空格的 `-`）；`mid-century`、`5-10` 这类连字符不会误切
//   · 换行：是内容本身要分行，原样保留
//   · 标签：单条内可用 `标签|内容` / `标签：内容` / `标签:内容`（价格识别依赖它）
//   · 其他一律不做：分号、项目符号 •、序号 1. 2.、短标题配对、按句拆 全部关闭
const SEP_RE = /(?:^|\s)[-－]\s*/;

function splitByDash(s) {
  const parts = s.split(SEP_RE).map(x => x.trim()).filter(Boolean);
  return parts.length > 1 ? parts : null;
}

// 标签|内容 / 标签：内容 / 标签: 内容（不是分条，只是给单条打备注）
const stripEndPunct = s => String(s).replace(/[.!?。！？、,，;；:\s]+$/, '').trim();
function parseLabelContent(str) {
  str = String(str == null ? '' : str).replace(/[\r\n]+/g, '\n').trim();
  if (!str) return null;
  const tryCh = (ch, maxLeft) => {
    const i = str.indexOf(ch);
    if (i > 0 && i <= maxLeft) {
      const l = str.slice(0, i).trim(); const c = str.slice(i + 1).trim();
      if (!l || !c) return null;
      if (/^(https?|ftp|mailto)$/i.test(l) || /^\/\//.test(c)) return null;
      return { label: stripEndPunct(l), content: c };
    }
    return null;
  };
  return tryCh('|', 24) || tryCh('：', 24) || tryCh(':', 24) || { label: '', content: str };
}

// 单元格 → 若干 {label, content}（导入与「分点」按钮共用）
function cellToItems(cell) {
  const raw = String(cell == null ? '' : cell);
  if (!raw.trim()) return [];
  const s = raw.replace(/\r\n?/g, '\n').replace(/｜/g, '|');
  const chunks = splitByDash(s) || [s.trim()];
  return chunks.map(parseLabelContent).filter(x => x && x.content);
}

// ===== 分点操作（对已存在的内容再拆一次）=====
function canSplitValue(v) { return cellToItems(valContent(v)).length > 1; }

function splitValue(productId, fieldId, idx) {
  const p = state.products.find(x => x.id === productId); if (!p) return;
  const arr = p.values[fieldId] || (p.values[fieldId] = []);
  const v = arr[idx]; if (v == null) return;
  const parts = cellToItems(valContent(v));
  if (parts.length <= 1) { showToast('这条看不出可拆的分点'); return; }
  const lb = valLabel(v);
  const news = parts.map((it, k) => ({ label: it.label || (k === 0 ? lb : ''), content: it.content }));
  arr.splice(idx, 1, ...news);
  saveState(); renderAll();
  showToast('已拆成 ' + news.length + ' 条');
}

// 整列一键分点：把该列里所有「还能拆」的长文本一次性拆开
function splitAllValues(productId, fieldId) {
  const p = state.products.find(x => x.id === productId); if (!p) return;
  const arr = p.values[fieldId] || (p.values[fieldId] = []);
  let n = 0;
  for (let i = arr.length - 1; i >= 0; i--) {
    const parts = cellToItems(valContent(arr[i]));
    if (parts.length <= 1) continue;
    const lb = valLabel(arr[i]);
    const news = parts.map((it, k) => ({ label: it.label || (k === 0 ? lb : ''), content: it.content }));
    arr.splice(i, 1, ...news);
    n += news.length;
  }
  if (!n) { showToast('没有需要分点的内容'); return; }
  saveState(); renderAll();
  showToast('本列已拆出 ' + n + ' 条');
}

// ===== Price / Discount (价格识别与优惠计算) =====
// 从文本里抽出金额，支持 $49.99 / 1,299.00 / 49 等写法
function parsePrice(str) {
  const m = String(str == null ? '' : str).match(/-?\d[\d,]*(?:\.\d+)?/);
  if (!m) return null;
  const n = parseFloat(m[0].replace(/,/g, ''));
  return isNaN(n) ? null : n;
}

// 在一列的值中按标签识别「现在价格」与「划线价」
function findPrices(values) {
  let cur = null, orig = null;
  for (const v of values || []) {
    const n = parsePrice(valContent(v));
    if (n === null) continue;
    const l = valLabel(v) || '';
    if (/划线价|原价|original|list|was|reg|msrp/i.test(l)) orig = n;
    else if (/现在价格|现价|售价|current|now|sale/i.test(l)) cur = n;
  }
  return { cur, orig };
}

function fmtMoney(n) {
  const r = Math.round(n * 100) / 100;
  return '$' + (Number.isInteger(r) ? r : r.toFixed(2));
}

// 优惠信息：原价高于现价才算优惠
function discountAmount(values) {
  const { cur, orig } = findPrices(values);
  if (cur === null || orig === null) return null;
  const amount = Math.round((orig - cur) * 100) / 100;
  if (!(amount > 0)) return null;
  return { cur, orig, amount, pct: Math.round(amount / orig * 100) };
}

// 选择优惠形式并加入待复制内容：
// 'save' → SAVE $xx ；'off' → $xx OFF ；'percent' → xx% OFF
function addDiscountToBasket(productId, fieldId, form) {
  const p = state.products.find(x => x.id === productId);
  const d = discountAmount(valsOf(p, fieldId));
  if (!d) { showToast('未识别到价格，请检查标签'); return; }
  let text;
  if (form === 'save') text = 'SAVE ' + fmtMoney(d.amount);
  else if (form === 'percent') {
    if (!(d.pct > 0)) { showToast('折扣比例太小，无法用百分比表示'); return; }
    text = d.pct + '% OFF';
  } else text = fmtMoney(d.amount) + ' OFF';
  state.basket.push({ fieldId, label: '', content: text });
  saveState(); renderBasket(); showToast('已加入：' + text);
}

// ===== Button Library (CTA 文案库) =====
let pickingTarget = null;      // { productId, fieldId } 当前正在挑选的目标列
let pickWithScene = true;      // 挑选时是否带入场景标签

// 按场景分组（保持首次出现顺序）
function buttonScenes() {
  const order = []; const map = {};
  for (const b of state.buttonLibrary) {
    const s = b.scene || '未分类';
    if (!map[s]) { map[s] = []; order.push(s); }
    map[s].push(b);
  }
  return { order, map };
}

function setModalWide(wide) {
  document.getElementById('modal-content').className = wide ? 'modal modal-wide' : 'modal';
}

function showButtonLibraryModal() {
  const { order, map } = buttonScenes();
  let html = `<div class="modal-title">按钮库 (CTA 文案)</div>
    <p class="confirm-text">按场景维护常用按钮文案。在产品任意列点「库选」即可挑用，每个产品都能选。</p>
    <div class="btn-lib-add">
      <input class="form-input" id="btn-scene-input" placeholder="场景，如：限时折扣">
      <input class="form-input" id="btn-content-input" placeholder="按钮文案，如：Shop Now">
      <button class="btn btn-primary" onclick="addButton()">添加</button>
    </div>
    <div class="btn-lib-import">
      <button class="btn btn-sm" onclick="document.getElementById('import-buttons-file').click()">批量导入</button>
      <span class="hint">CSV/Excel 两列：场景、按钮文案</span>
    </div>
    <div class="btn-lib-list">`;
  if (state.buttonLibrary.length === 0) {
    html += `<div class="empty-state" style="padding:20px">暂无按钮文案，添加或批量导入</div>`;
  }
  for (const s of order) {
    html += `<div class="btn-lib-group">
      <div class="btn-lib-group-title">${escapeHtml(s)}<span class="btn-lib-count">${map[s].length}</span></div>`;
    for (const b of map[s]) {
      html += `<div class="btn-lib-item">
        <span class="btn-lib-text">${escapeHtml(b.content)}</span>
        <span class="btn-lib-actions">
          <button class="icon-btn" onclick="startEditButton('${b.id}')">编辑</button>
          <button class="icon-btn danger" onclick="deleteButton('${b.id}')">删除</button>
        </span></div>`;
    }
    html += `</div>`;
  }
  html += `</div>
    <div class="modal-footer"><button class="btn" onclick="hideModal()">关闭</button></div>`;
  setModalWide(true);
  document.getElementById('modal-content').innerHTML = html;
  document.getElementById('modal-overlay').style.display = 'flex';
  const si = document.getElementById('btn-scene-input');
  const ci = document.getElementById('btn-content-input');
  if (si) si.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ci.focus(); } });
  if (ci) ci.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addButton(); } });
}

function addButton() {
  const si = document.getElementById('btn-scene-input');
  const ci = document.getElementById('btn-content-input');
  const content = (ci ? ci.value : '').trim();
  const scene = (si ? si.value : '').trim();
  if (!content) { showToast('请输入按钮文案'); return; }
  state.buttonLibrary.push({ id: 'btn_' + uuid(), scene: scene || '未分类', content });
  saveState(); showButtonLibraryModal();
  setTimeout(() => { const c = document.getElementById('btn-content-input'); if (c) c.focus(); }, 30);
}

function startEditButton(id) {
  const b = state.buttonLibrary.find(x => x.id === id); if (!b) return;
  setModalWide(false);
  document.getElementById('modal-content').innerHTML = `
    <div class="modal-title">编辑按钮文案</div>
    <div class="form-group"><label class="form-label">场景</label>
      <input class="form-input" id="edit-btn-scene" value="${escapeAttr(b.scene)}" placeholder="如：限时折扣"></div>
    <div class="form-group"><label class="form-label">按钮文案</label>
      <input class="form-input" id="edit-btn-content" value="${escapeAttr(b.content)}"></div>
    <div class="modal-footer"><button class="btn" onclick="showButtonLibraryModal()">取消</button>
      <button class="btn btn-primary" onclick="saveEditButton('${id}')">保存</button></div>`;
}

function saveEditButton(id) {
  const b = state.buttonLibrary.find(x => x.id === id); if (!b) return;
  const sc = document.getElementById('edit-btn-scene').value.trim();
  const ct = document.getElementById('edit-btn-content').value.trim();
  b.scene = sc || '未分类';
  if (ct) b.content = ct;
  saveState(); renderAll(); showButtonLibraryModal(); showToast('已更新');
}

function deleteButton(id) {
  state.buttonLibrary = state.buttonLibrary.filter(b => b.id !== id);
  saveState(); renderAll(); showButtonLibraryModal(); showToast('已删除');
}

// 批量导入按钮文案：两列 [场景, 文案]（也可只有一列文案）
function handleImportButtonsFile(input) {
  const file = input.files[0]; if (!file) return;
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'csv') {
    const r = new FileReader(); r.onload = e => importButtons(parseCSV(e.target.result)); r.readAsText(file, 'UTF-8');
  } else if (ext === 'xlsx' || ext === 'xls') {
    if (!ensureXLSX()) { input.value = ''; return; }
    const r = new FileReader(); r.onload = e => {
      const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
      // 兼容两种情况：单独按钮库文件，或"产品库+按钮库"双 sheet 模板
      let name = wb.SheetNames[0];
      for (const sn of wb.SheetNames) {
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1 });
        const head = (rows[0] || []).join(' ');
        if (head.includes('场景') || head.includes('文案') || head.includes('按钮')) { name = sn; break; }
      }
      importButtons(XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1 }));
    }; r.readAsArrayBuffer(file);
  }
  input.value = '';
}

function importButtons(rows) {
  if (!rows || rows.length < 2) { showToast('文件为空或格式不正确'); return; }
  let n = 0;
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] || [];
    let scene = '', content = '';
    if (row.length >= 2) { scene = (row[0] || '').toString().trim(); content = (row[1] || '').toString().trim(); }
    else { content = (row[0] || '').toString().trim(); }
    if (!content) continue;
    const s = scene || '未分类';
    if (state.buttonLibrary.some(b => b.content === content && b.scene === s)) continue;
    state.buttonLibrary.push({ id: 'btn_' + uuid(), scene: s, content });
    n++;
  }
  saveState(); showButtonLibraryModal(); showToast('导入 ' + n + ' 条按钮文案');
}

// ===== Button Picker (从库里挑，加入产品某列) =====
function showButtonPicker(productId, fieldId) {
  pickingTarget = { productId, fieldId };
  const fname = fieldName(fieldId);
  setModalWide(true);
  document.getElementById('modal-content').innerHTML = `
    <div class="modal-title">从按钮库选择 · 加入「${escapeHtml(fname)}」</div>
    <div class="form-group">
      <input class="form-input" id="btn-picker-search" placeholder="搜索场景或文案" oninput="renderButtonPickerList(this.value)">
    </div>
    <div id="btn-picker-list"></div>
    <div class="picker-opt">
      <label><input type="checkbox" id="pick-with-scene" ${pickWithScene ? 'checked' : ''} onchange="pickWithScene=this.checked"> 带入场景标签（复制时显示为 [场景]文案）</label>
    </div>
    <div class="modal-footer">
      <button class="btn" onclick="hideModal()">关闭</button>
      <button class="btn" onclick="showButtonLibraryModal()">管理按钮库</button>
    </div>`;
  renderButtonPickerList('');
  document.getElementById('modal-overlay').style.display = 'flex';
  setTimeout(() => { const s = document.getElementById('btn-picker-search'); if (s) s.focus(); }, 30);
}

// 只重建列表，避免搜索框被重建导致中文输入中断
function renderButtonPickerList(query) {
  const el = document.getElementById('btn-picker-list');
  if (!el || !pickingTarget) return;
  const q = (query || '').toLowerCase().trim();
  const { order, map } = buttonScenes();
  let html = '<div class="btn-lib-list">';
  let shown = 0;
  for (const s of order) {
    const items = map[s].filter(b => !q || b.content.toLowerCase().includes(q) || (b.scene || '').toLowerCase().includes(q));
    if (items.length === 0) continue;
    html += `<div class="btn-lib-group">
      <div class="btn-lib-group-title">${escapeHtml(s)}<span class="btn-lib-count">${items.length}</span></div>`;
    for (const b of items) {
      shown++;
      html += `<div class="btn-lib-item picker-item">
        <span class="btn-lib-text">${escapeHtml(b.content)}</span>
        <span class="btn-lib-actions">
          <button class="btn btn-sm btn-primary" onclick="pickButton('${b.id}')">加入</button>
        </span></div>`;
    }
    html += `</div>`;
  }
  if (shown === 0) {
    html += `<div class="empty-state" style="padding:20px">${state.buttonLibrary.length === 0 ? '按钮库为空，点「管理按钮库」添加' : '没有匹配的按钮文案'}</div>`;
  }
  html += '</div>';
  el.innerHTML = html;
}

function pickButton(btnId) {
  const b = state.buttonLibrary.find(x => x.id === btnId);
  if (!b || !pickingTarget) return;
  const p = state.products.find(x => x.id === pickingTarget.productId);
  if (!p) return;
  const fid = pickingTarget.fieldId;
  if (!p.values || typeof p.values !== 'object') p.values = {};
  if (!Array.isArray(p.values[fid])) p.values[fid] = [];
  p.values[fid].push({ label: pickWithScene ? (b.scene || '未分类') : '', content: b.content });
  saveState(); renderAll();
  showToast('已加入「' + fieldName(fid) + '」');
  // 保持选择器打开，可继续挑
  const si = document.getElementById('btn-picker-search');
  renderButtonPickerList(si ? si.value : '');
}

// ===== Copy Library (通用文案库：分品牌 + 自建分类) =====
let copyFilter = { brandId: null, query: '' };   // null = 尚未选择；'' = 明确选了「全部品牌」

function copyBrandName(id) { const b = state.brands.find(x => x.id === id); return b ? b.name : '未指定'; }
function catOf(it) { return it.category || '未分类'; }

function copyFiltered() {
  const q = (copyFilter.query || '').toLowerCase().trim();
  return state.copyLibrary.filter(it => {
    if (copyFilter.brandId && it.brandId !== copyFilter.brandId) return false;
    if (q && !(it.content || '').toLowerCase().includes(q) && !catOf(it).toLowerCase().includes(q)) return false;
    return true;
  });
}

function copyGroups() {
  const order = []; const map = {};
  for (const it of copyFiltered()) {
    const c = catOf(it);
    if (!map[c]) { map[c] = []; order.push(c); }
    map[c].push(it);
  }
  return { order, map };
}

function showCopyLibraryModal() {
  // 首次打开默认落在第一个品牌，省得每次先选；用户切到「全部品牌」后保持
  if (copyFilter.brandId === null && state.brands.length) copyFilter.brandId = state.brands[0].id;
  const brandOpts = ['<option value="">全部品牌</option>'].concat(
    state.brands.map(b => `<option value="${b.id}" ${copyFilter.brandId === b.id ? 'selected' : ''}>${escapeHtml(b.name)}</option>`)
  ).join('');
  const cats = [...new Set(state.copyLibrary.map(catOf))];
  const dl = [...new Set([...SUGGESTED_CATEGORIES, ...cats])]
    .map(c => `<option value="${escapeAttr(c)}"></option>`).join('');
  setModalWide(true);
  document.getElementById('modal-content').innerHTML = `
    <div class="modal-title">文案库</div>
    <p class="confirm-text">按品牌 + 自建分类管理通用文案（banner、标题、促销语…）。挑中后直接加入待复制内容。</p>
    <div class="lib-filter-row">
      <select class="form-select" id="copy-brand-filter" onchange="switchCopyBrand(this.value)">${brandOpts}</select>
      <input class="form-input" id="copy-search" placeholder="搜索分类或文案" value="${escapeAttr(copyFilter.query)}" oninput="filterCopy(this.value)">
    </div>
    <div class="btn-lib-add">
      <input class="form-input" id="copy-cat-input" list="cat-options" placeholder="分类，如 banner">
      <input class="form-input" id="copy-content-input" placeholder="文案内容">
      <button class="btn btn-primary" onclick="addCopyItem()">添加</button>
    </div>
    <datalist id="cat-options">${dl}</datalist>
    <div class="btn-lib-import">
      <button class="btn btn-sm" onclick="document.getElementById('import-copy-file').click()">批量导入</button>
      <span class="hint">CSV/Excel 三列：品牌、分类、文案（两列则视为 分类、文案）</span>
    </div>
    <div id="copy-list"></div>
    <div class="modal-footer"><button class="btn" onclick="hideModal()">关闭</button></div>`;
  renderCopyList();
  document.getElementById('modal-overlay').style.display = 'flex';
  const cat = document.getElementById('copy-cat-input');
  const ci = document.getElementById('copy-content-input');
  if (cat) cat.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ci.focus(); } });
  if (ci) ci.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addCopyItem(); } });
}

// 只重建列表，避免搜索框被重建导致中文输入中断
function renderCopyList() {
  const el = document.getElementById('copy-list'); if (!el) return;
  const { order, map } = copyGroups();
  let html = '<div class="btn-lib-list">';
  if (order.length === 0) {
    html += `<div class="empty-state" style="padding:20px">${state.copyLibrary.length === 0
      ? '还没有文案：先选品牌，再在上方填分类（如 banner）和文案内容' : '没有匹配的文案'}</div>`;
  }
  for (const c of order) {
    const cArg = escapeAttr(JSON.stringify(c));   // 分类名可能含引号，用 JSON 字符串安全传参
    html += `<div class="btn-lib-group">
      <div class="btn-lib-group-title">${escapeHtml(c)}<span class="btn-lib-count">${map[c].length}</span>
        <span class="lib-cat-actions">
          <button class="icon-btn" onclick="renameCategory(${cArg})" title="重命名分类">改名</button>
          <button class="icon-btn danger" onclick="deleteCategory(${cArg})" title="删除该分类下所有文案">删</button>
        </span></div>`;
    for (const it of map[c]) {
      html += `<div class="btn-lib-item">
        <span class="btn-lib-text">${copyFilter.brandId ? '' : `<span class="lib-item-brand">${escapeHtml(copyBrandName(it.brandId))}</span> `}${escapeHtml(it.content)}</span>
        <span class="btn-lib-actions">
          <button class="icon-btn" onclick="addCopyToBasket('${it.id}')">加入</button>
          <button class="icon-btn" onclick="copyCopyItem('${it.id}')">复制</button>
          <button class="icon-btn" onclick="startEditCopyItem('${it.id}')">编辑</button>
          <button class="icon-btn danger" onclick="deleteCopyItem('${it.id}')">删除</button>
        </span></div>`;
    }
    html += `</div>`;
  }
  html += '</div>';
  el.innerHTML = html;
}

function switchCopyBrand(v) { copyFilter.brandId = v; showCopyLibraryModal(); }
function filterCopy(q) { copyFilter.query = q; renderCopyList(); }

function addCopyItem() {
  const catEl = document.getElementById('copy-cat-input');
  const conEl = document.getElementById('copy-content-input');
  const content = ((conEl || {}).value || '').trim();
  const cat = ((catEl || {}).value || '').trim();
  const brandId = copyFilter.brandId;
  if (!content) { showToast('请输入文案内容'); return; }
  if (!brandId) { showToast('请先在上方选择一个品牌'); return; }
  state.copyLibrary.push({ id: 'c_' + uuid(), brandId, category: cat || '未分类', content });
  saveState(); showCopyLibraryModal();
  setTimeout(() => { const c = document.getElementById('copy-content-input'); if (c) c.focus(); }, 30);
}

function startEditCopyItem(id) {
  const it = state.copyLibrary.find(x => x.id === id); if (!it) return;
  setModalWide(false);
  document.getElementById('modal-content').innerHTML = `
    <div class="modal-title">编辑文案</div>
    <div class="form-group"><label class="form-label">品牌</label>
      <select class="form-select" id="edit-copy-brand">${state.brands.map(b =>
        `<option value="${b.id}" ${b.id === it.brandId ? 'selected' : ''}>${escapeHtml(b.name)}</option>`).join('')}</select></div>
    <div class="form-group"><label class="form-label">分类</label>
      <input class="form-input" id="edit-copy-cat" value="${escapeAttr(catOf(it))}" placeholder="如 banner"></div>
    <div class="form-group"><label class="form-label">文案内容</label>
      <textarea class="form-textarea" id="edit-copy-content">${escapeHtml(it.content)}</textarea></div>
    <div class="modal-footer"><button class="btn" onclick="showCopyLibraryModal()">取消</button>
      <button class="btn btn-primary" onclick="saveEditCopyItem('${id}')">保存</button></div>`;
}

function saveEditCopyItem(id) {
  const it = state.copyLibrary.find(x => x.id === id); if (!it) return;
  it.brandId = document.getElementById('edit-copy-brand').value;
  it.category = document.getElementById('edit-copy-cat').value.trim() || '未分类';
  const c = document.getElementById('edit-copy-content').value.trim();
  if (c) it.content = c;
  saveState(); showCopyLibraryModal(); showToast('已更新');
}

function deleteCopyItem(id) {
  state.copyLibrary = state.copyLibrary.filter(x => x.id !== id);
  saveState(); showCopyLibraryModal(); showToast('已删除');
}

function addCopyToBasket(id) {
  const it = state.copyLibrary.find(x => x.id === id); if (!it) return;
  const c = catOf(it);
  state.basket.push({
    fieldId: null,
    groupKey: 'copy_' + c,
    groupLabel: '文案库 · ' + c,
    label: '', content: it.content,
  });
  saveState(); renderBasket(); showToast('已加入待复制：' + c);
}

function copyCopyItem(id) {
  const it = state.copyLibrary.find(x => x.id === id); if (!it) return;
  copyToClipboard(it.content);
}

function renameCategory(cat) {
  setModalWide(false);
  document.getElementById('modal-content').innerHTML = `
    <div class="modal-title">重命名分类</div>
    <div class="form-group"><label class="form-label">分类名称</label>
      <input class="form-input" id="ren-cat" value="${escapeAttr(cat)}"></div>
    <div class="modal-footer"><button class="btn" onclick="showCopyLibraryModal()">取消</button>
      <button class="btn btn-primary" onclick="saveRenameCategory(${escapeAttr(JSON.stringify(cat))})">保存</button></div>`;
}

function saveRenameCategory(cat) {
  const nn = (document.getElementById('ren-cat').value || '').trim();
  if (!nn) { showToast('请输入分类名'); return; }
  for (const it of state.copyLibrary) if (catOf(it) === cat) it.category = nn;
  saveState(); showCopyLibraryModal(); showToast('分类已重命名');
}

function deleteCategory(cat) {
  const n = state.copyLibrary.filter(i => catOf(i) === cat).length;
  showConfirm(`删除分类「${cat}」及其下 ${n} 条文案？此操作不可撤销。`, () => {
    state.copyLibrary = state.copyLibrary.filter(i => catOf(i) !== cat);
    saveState(); hideModal(); showCopyLibraryModal(); showToast('分类已删除');
  });
}

function handleImportCopyFile(input) {
  const file = input.files[0]; if (!file) return;
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'csv') {
    const r = new FileReader(); r.onload = e => importCopyItems(parseCSV(e.target.result)); r.readAsText(file, 'UTF-8');
  } else if (ext === 'xlsx' || ext === 'xls') {
    if (!ensureXLSX()) { input.value = ''; return; }
    const r = new FileReader(); r.onload = e => {
      const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
      importCopyItems(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 }));
    }; r.readAsArrayBuffer(file);
  }
  input.value = '';
}

function importCopyItems(rows) {
  if (!rows || rows.length < 2) { showToast('文件为空或格式不正确'); return; }
  let n = 0;
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] || [];
    let bn = '', cat = '', content = '';
    if (row.length >= 3) { bn = (row[0] || '').toString().trim(); cat = (row[1] || '').toString().trim(); content = (row[2] || '').toString().trim(); }
    else { cat = (row[0] || '').toString().trim(); content = (row[1] || '').toString().trim(); }
    if (!content) continue;
    let brandId = '';
    if (bn) {
      let b = state.brands.find(x => x.name === bn);
      if (!b) { b = { id: uuid(), name: bn, note: '' }; state.brands.push(b); }
      brandId = b.id;
    }
    state.copyLibrary.push({ id: 'c_' + uuid(), brandId, category: cat || '未分类', content });
    n++;
  }
  saveState(); renderAll(); showCopyLibraryModal(); showToast('导入 ' + n + ' 条文案');
}

// ===== Basket Ops =====
// 描述列的备注（短描述/长描述…）只是给自己看的标记，不进入待复制内容
function basketLabelFor(fieldId, v) {
  return fieldName(fieldId).includes('描述') ? '' : valLabel(v);
}

function addToBasket(productId, fieldId, index) {
  const p = state.products.find(x => x.id === productId);
  const values = valsOf(p, fieldId);
  if (!values[index]) return;
  const v = values[index];
  state.basket.push({ fieldId, label: basketLabelFor(fieldId, v), content: valContent(v) });
  saveState(); renderBasket(); showToast('已加入待复制');
}

function addAllToBasket(productId, fieldId) {
  const p = state.products.find(x => x.id === productId);
  if (!p) return;
  for (const v of valsOf(p, fieldId)) state.basket.push({ fieldId, label: basketLabelFor(fieldId, v), content: valContent(v) });
  saveState(); renderBasket(); showToast('已全部加入待复制');
}

function removeFromBasket(index) { state.basket.splice(index, 1); saveState(); renderBasket(); }

// ===== 待复制内容：拖动调整顺序 =====
let basketDragIdx = null;

function basketDragStart(e, i) {
  basketDragIdx = i;
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', String(i)); } catch (err) {}
  }
  // 延迟加 class，避免在 dragstart 阶段改变 DOM 导致拖拽中断
  setTimeout(() => {
    const el = document.querySelectorAll('.basket-item')[i];
    if (el) el.classList.add('dragging');
  }, 0);
}
function basketDragOver(e) {
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
}
function basketDragEnter(e, el) { e.preventDefault(); el.classList.add('drag-over'); }
function basketDragLeave(el) { el.classList.remove('drag-over'); }
function basketDrop(e, i) {
  e.preventDefault();
  let from = basketDragIdx;
  if (from === null && e.dataTransfer) {
    const d = e.dataTransfer.getData('text/plain');
    if (d !== '') from = parseInt(d, 10);
  }
  basketDragIdx = null;
  if (from === null || isNaN(from) || from === i || from >= state.basket.length) { renderBasket(); return; }
  const [moved] = state.basket.splice(from, 1);
  // 往下拖时目标索引要减 1（因为源元素已被移除）
  state.basket.splice(from < i ? i - 1 : i, 0, moved);
  saveState(); renderBasket();
}
function basketDragEnd() {
  basketDragIdx = null;
  document.querySelectorAll('.basket-item').forEach(el => el.classList.remove('dragging', 'drag-over'));
}

// 分组输出：同一列只保留一个 [列名] 标题，组内单换行，组间一个空行
function copyBasket() {
  if (state.basket.length === 0) { showToast('待复制内容为空'); return; }
  const { order, map } = basketGroups();
  const parts = order.map(key =>
    '[' + map[key].label + ']\n' + map[key].items.map(i => valLine(i)).join('\n')
  );
  copyToClipboard(parts.join('\n\n'));
}

function clearBasket() { state.basket = []; saveState(); renderBasket(); }

// ===== Search =====
function getFilteredProducts() {
  let f = state.products;
  if (state.selectedBrandId) f = f.filter(p => p.brandId === state.selectedBrandId);
  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase();
    f = f.filter(p => p.name.toLowerCase().includes(q) ||
      state.fields.some(fld => valsOf(p, fld.id).some(v => valContent(v).toLowerCase().includes(q))));
  }
  return f;
}

// ===== Modal =====
function hideModal() {
  document.getElementById('modal-overlay').style.display = 'none';
  setModalWide(false);
  editingBrandId = null; editingProductId = null; pendingConfirmAction = null; pickingTarget = null;
}
function showConfirm(text, cb) {
  pendingConfirmAction = cb;
  document.getElementById('modal-content').innerHTML = `
    <div class="modal-title">确认操作</div><p class="confirm-text">${escapeHtml(text)}</p>
    <div class="modal-footer"><button class="btn" onclick="hideModal()">取消</button>
    <button class="btn btn-danger" onclick="executeConfirm()">确认删除</button></div>`;
  document.getElementById('modal-overlay').style.display = 'flex';
}
function executeConfirm() { if (pendingConfirmAction) { const a = pendingConfirmAction; pendingConfirmAction = null; a(); } else hideModal(); }

// ===== Import =====
function handleImportFile(input) {
  const file = input.files[0]; if (!file) return;
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'json') {
    const r = new FileReader(); r.onload = e => {
      try { const d = JSON.parse(e.target.result);
        if (d.brands && d.products) {
          showConfirm('导入备份将替换当前所有数据，确定继续？', () => {
            state.brands = d.brands; state.products = d.products; state.basket = d.basket || [];
            state.fields = (d.fields && d.fields.length) ? d.fields : state.fields;
            state.buttonLibrary = d.buttonLibrary || [];
            state.copyLibrary = d.copyLibrary || [];
            if (d.layout) state.layout = d.layout;
            state.selectedBrandId = null; state.expandedProductId = null;
            migrateValues(); saveState(); renderAll(); showToast('备份已恢复');
          });
        } else showToast('文件格式不正确');
      } catch (err) { showToast('解析失败: ' + err.message); }
    }; r.readAsText(file);
  } else if (ext === 'csv') {
    const r = new FileReader(); r.onload = e => importTableData(parseCSV(e.target.result)); r.readAsText(file, 'UTF-8');
  } else if (ext === 'xlsx' || ext === 'xls') {
    if (!ensureXLSX()) { input.value = ''; return; }
    const r = new FileReader(); r.onload = e => {
      const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
      const sh = wb.Sheets[wb.SheetNames[0]];
      importTableData(XLSX.utils.sheet_to_json(sh, { header: 1 }));
    }; r.readAsArrayBuffer(file);
  }
  input.value = '';
}

function parseCSV(text) {
  const rows = []; let cur = '', row = [], inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') { if (inQ && text[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
    else if (ch === ',' && !inQ) { row.push(cur); cur = ''; }
    else if ((ch === '\n' || ch === '\r') && !inQ) { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); if (row.some(c => c.trim())) rows.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  if (cur || row.length) { row.push(cur); if (row.some(c => c.trim())) rows.push(row); }
  return rows;
}

function importTableData(rows) {
  if (rows.length < 2) { showToast('文件为空或格式不正确'); return; }
  let imported = 0, autoSplit = 0;
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]; const bn = (row[0] || '').toString().trim(); const pn = (row[1] || '').toString().trim();
    if (!bn || !pn) continue;
    let brand = state.brands.find(b => b.name === bn);
    if (!brand) { brand = { id: uuid(), name: bn, note: '' }; state.brands.push(brand); }
    let p = state.products.find(x => x.name === pn && x.brandId === brand.id);
    if (!p) {
      const values = {}; for (const f of state.fields) values[f.id] = [];
      p = { id: uuid(), brandId: brand.id, name: pn, createdAt: new Date().toISOString(), values };
      state.products.push(p);
    }
    // 一格里的多条内容会自动分点（换行 / 分号 / 符号 / 序号 / 标签 / 短标题配对 / 长句拆开）
    const pc = cell => {
      if (!cell) return [];
      const items = cellToItems(cell);
      if (items.length > 1) autoSplit += items.length;
      return items;
    };
    const merge = (ex, nv) => { const m = [...ex]; for (const v of nv) { if (!m.some(x => valContent(x) === valContent(v) && valLabel(x) === valLabel(v))) m.push(v); } return m; };
    for (let fi = 0; fi < state.fields.length; fi++) {
      const cell = row[2 + fi];
      if (cell) p.values[state.fields[fi].id] = merge(valsOf(p, state.fields[fi].id), pc(cell));
    }
    imported++;
  }
  saveState(); renderAll();
  showToast('成功导入 ' + imported + ' 个产品' + (autoSplit ? ' · 自动分点 ' + autoSplit + ' 条' : ''));
}

// ===== Export =====
// XLSX 由 CDN 提供；离线时给出明确提示而不是静默报错
function ensureXLSX() {
  if (typeof XLSX !== 'undefined' && XLSX && XLSX.utils) return true;
  showToast('Excel 组件未加载（需联网），请改用 CSV 或稍后重试');
  return false;
}

function exportRows() {
  const ps = getFilteredProducts();
  const headers = ['品牌名称', 'SKU/产品名', ...state.fields.map(f => f.name)];
  const rows = [headers];
  for (const p of ps) {
    const b = state.brands.find(x => x.id === p.brandId);
    rows.push([b ? b.name : '', p.name, ...state.fields.map(f => valsOf(p, f.id).map(formatForExport).join(' - '))]);
  }
  return rows;
}

function exportCSV() {
  closeDropdown();
  const rows = exportRows(); if (rows.length < 2) { showToast('没有可导出的产品'); return; }
  const e = t => '"' + String(t).replace(/"/g, '""') + '"';
  const out = rows.map(r => r.map(e).join(',')).join('\n');
  downloadFile('\uFEFF' + out, '产品库导出.csv', 'text/csv;charset=utf-8');
  showToast('CSV 已导出');
}

function exportExcel() {
  closeDropdown();
  if (!ensureXLSX()) return;
  const rows = exportRows(); if (rows.length < 2) { showToast('没有可导出的产品'); return; }
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 15 }, { wch: 20 }, ...state.fields.map(() => ({ wch: 40 }))];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '产品库');
  XLSX.writeFile(wb, '产品库导出.xlsx');
  showToast('Excel 已导出');
}

// ===== 导入模板（表头跟随当前列配置）=====
function sampleForField(f) {
  const n = f.name || '';
  if (n.includes('功能') || n.includes('参数')) return '蓝牙 5.3 连接 - 主动降噪 ANC - 续航 36 小时';
  if (n.includes('卖点')) return '沉浸式降噪体验 - 超长续航，告别电量焦虑';
  if (n.includes('描述')) return '短描述|采用新一代 13mm 动圈单元，音质细节丰富 - 长描述|搭载最新蓝牙 5.3 芯片，连接更稳定';
  if (n.includes('按钮') || n.includes('引导') || n.toLowerCase().includes('cta')) return '限时折扣|Shop Now — Save 20% Today - 通用|Add to Cart';
  return '示例内容1 - 示例内容2';
}

function exportTemplate() {
  closeDropdown();
  if (!ensureXLSX()) return;
  const headers = ['品牌名称', 'SKU/产品名', ...state.fields.map(f => f.name)];
  const prodRows = [headers];
  const mk = (brand, name) => [brand, name, ...state.fields.map(sampleForField)];
  prodRows.push(mk('TechPro', 'TP-EP-01 无线蓝牙耳机 Pro Max'));
  prodRows.push(mk('HomeStyle', 'HS-LAMP-A1 北欧风落地灯'));

  const btnRows = [['场景', '按钮文案']];
  const seed = state.buttonLibrary.length ? state.buttonLibrary.slice(0, 6) : DEFAULT_BUTTONS.slice(0, 6);
  for (const b of seed) btnRows.push([b.scene || '未分类', b.content]);
  if (btnRows.length === 1) { btnRows.push(['限时折扣', 'Shop Now — Save 20% Today']); btnRows.push(['通用', 'Add to Cart']); }

  const wb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.aoa_to_sheet(prodRows);
  ws1['!cols'] = [{ wch: 14 }, { wch: 22 }, ...state.fields.map(() => ({ wch: 46 }))];
  XLSX.utils.book_append_sheet(wb, ws1, '产品库模板');
  const ws2 = XLSX.utils.aoa_to_sheet(btnRows);
  ws2['!cols'] = [{ wch: 16 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, ws2, '按钮库模板');
  XLSX.writeFile(wb, '产品库导入模板.xlsx');
  showToast('导入模板已下载');
}

function generateEmailText(p) {
  const b = state.brands.find(x => x.id === p.brandId);
  let t = p.name + '\n'; if (b) t += '品牌: ' + b.name + '\n'; t += '\n';
  for (const f of state.fields) {
    const vs = valsOf(p, f.id); if (vs.length === 0) continue;
    t += '【' + f.name + '】\n';
    for (const v of vs) t += valLine(v) + '\n';
    t += '\n';
  }
  return t;
}

function exportEmailAll() {
  closeDropdown();
  const ps = getFilteredProducts(); if (ps.length === 0) { showToast('没有可导出的产品'); return; }
  let t = '';
  for (let i = 0; i < ps.length; i++) { t += generateEmailText(ps[i]); if (i < ps.length - 1) t += '---\n\n'; }
  downloadFile(t, '全部产品_邮件文案.txt', 'text/plain;charset=utf-8');
  showToast('邮件文案已导出');
}

// ===== 导出 HTML（单文件网页，可直接打开 / 打印 / 存档）=====
function buildProductHTML(products) {
  const esc = escapeHtml;
  const stamp = new Date().toLocaleString('zh-CN');
  const brandOf = p => state.brands.find(b => b.id === p.brandId);
  const brandIds = [];
  for (const p of products) { const b = brandOf(p); const k = b ? b.id : '__none'; if (!brandIds.includes(k)) brandIds.push(k); }

  let nav = '';
  for (const k of brandIds) {
    const b = k === '__none' ? null : state.brands.find(x => x.id === k);
    const n = products.filter(p => (brandOf(p) ? brandOf(p).id : '__none') === k).length;
    nav += `<a href="#b-${k}">${esc(b ? b.name : '未分类')} <span>${n}</span></a>`;
  }

  let body = '';
  for (const k of brandIds) {
    const b = k === '__none' ? null : state.brands.find(x => x.id === k);
    const list = products.filter(p => (brandOf(p) ? brandOf(p).id : '__none') === k);
    body += `<h2 id="b-${k}">${esc(b ? b.name : '未分类')}<span class="cnt">${list.length} 个产品</span></h2>`;
    for (const p of list) {
      body += `<div class="card"><h3>${esc(p.name)}</h3><table>`;
      for (const f of state.fields) {
        const vs = valsOf(p, f.id);
        if (!vs.length) continue;
        body += `<tr><th>${esc(f.name)}</th><td>`;
        for (const v of vs) {
          const l = valLabel(v), c = valContent(v);
          body += `<div class="val">${l ? `<span class="tag">${esc(l)}</span>` : ''}${esc(c)}</div>`;
        }
        const d = discountAmount(vs);
        if (d) {
          body += `<div class="disc">划线价 <s>${fmtMoney(d.orig)}</s> → 现价 <b>${fmtMoney(d.cur)}</b> ·
            <b>SAVE ${fmtMoney(d.amount)}</b> / <b>${fmtMoney(d.amount)} OFF</b>${d.pct > 0 ? ' / <b>' + d.pct + '% OFF</b>' : ''}</div>`;
        }
        body += `</td></tr>`;
      }
      body += `</table></div>`;
    }
  }

  // 附录：按钮库 + 文案库
  let extra = '';
  if (state.buttonLibrary.length) {
    extra += `<h2 id="lib-btn">按钮库<span class="cnt">${state.buttonLibrary.length} 条</span></h2><div class="card"><table>`;
    const byScene = {};
    for (const it of state.buttonLibrary) { const s = it.scene || '未分类'; (byScene[s] = byScene[s] || []).push(it); }
    for (const s of Object.keys(byScene)) {
      extra += `<tr><th>${esc(s)}</th><td>` + byScene[s].map(it => `<div class="val">${esc(it.content)}</div>`).join('') + `</td></tr>`;
    }
    extra += `</table></div>`;
  }
  if (state.copyLibrary.length) {
    extra += `<h2 id="lib-copy">文案库<span class="cnt">${state.copyLibrary.length} 条</span></h2><div class="card"><table>`;
    const byKey = {};
    for (const it of state.copyLibrary) {
      const bn = (state.brands.find(x => x.id === it.brandId) || {}).name || '全部品牌';
      const key = bn + ' · ' + (it.category || '未分类');
      (byKey[key] = byKey[key] || []).push(it);
    }
    for (const k of Object.keys(byKey)) {
      extra += `<tr><th>${esc(k)}</th><td>` + byKey[k].map(it => `<div class="val">${esc(it.content)}</div>`).join('') + `</td></tr>`;
    }
    extra += `</table></div>`;
  }

  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>产品库 · ${esc(new Date().toISOString().slice(0, 10))}</title>
<style>
*{box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;margin:0;padding:32px 28px 60px;color:#1f2328;background:#fff;line-height:1.65}
h1{font-size:22px;margin:0 0 6px;font-weight:600}
.meta{color:#6b7280;font-size:13px;margin:0 0 20px}
nav{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:28px;padding-bottom:18px;border-bottom:1px solid #e5e7eb}
nav a{display:inline-block;padding:5px 12px;border:1px solid #d0d7de;border-radius:16px;font-size:13px;color:#0969da;text-decoration:none;background:#f6f8fa}
nav a span{color:#6b7280;font-size:12px}
h2{font-size:17px;margin:32px 0 12px;padding-bottom:8px;border-bottom:2px solid #0969da;font-weight:600}
h2 .cnt{font-size:12px;color:#6b7280;font-weight:400;margin-left:8px}
.card{border:1px solid #e5e7eb;border-radius:8px;padding:14px 16px;margin-bottom:14px;background:#fff}
h3{font-size:15px;margin:0 0 10px;font-weight:600;color:#0969da}
table{width:100%;border-collapse:collapse}
th,td{border-top:1px solid #f0f2f4;padding:8px 6px;font-size:13px;vertical-align:top;text-align:left}
tr:first-child th,tr:first-child td{border-top:none}
th{width:110px;color:#57606a;font-weight:500;white-space:nowrap}
.val{white-space:pre-line;margin-bottom:4px}
.val:last-child{margin-bottom:0}
.tag{display:inline-block;background:#eef2ff;color:#4338ca;border-radius:4px;padding:0 6px;margin-right:6px;font-size:12px}
.disc{margin-top:6px;padding:6px 10px;background:#fff7e6;border-left:3px solid #d97706;border-radius:4px;font-size:12px}
@media print{nav{display:none}body{padding:0}.card{break-inside:avoid}h2{break-after:avoid}}
</style></head><body>
<h1>产品库</h1>
<p class="meta">导出时间 ${esc(stamp)} · ${products.length} 个产品 · ${state.brands.length} 个品牌${state.searchQuery ? ' · 已按当前筛选/搜索结果导出' : ''}</p>
<nav>${nav}${state.buttonLibrary.length ? '<a href="#lib-btn">按钮库</a>' : ''}${state.copyLibrary.length ? '<a href="#lib-copy">文案库</a>' : ''}</nav>
${body}${extra}
</body></html>`;
}

function exportHTML() {
  closeDropdown();
  const ps = getFilteredProducts();
  if (ps.length === 0) { showToast('没有可导出的产品'); return; }
  downloadFile(buildProductHTML(ps),
    '产品库_' + new Date().toISOString().slice(0, 10) + '.html', 'text/html;charset=utf-8');
  showToast('HTML 已导出');
}

function exportBackup() {
  closeDropdown();
  downloadFile(JSON.stringify({ fields: state.fields, brands: state.brands, products: state.products, basket: state.basket, buttonLibrary: state.buttonLibrary, exportDate: new Date().toISOString() }, null, 2),
    '产品库备份_' + new Date().toISOString().slice(0, 10) + '.json', 'application/json');
  showToast('备份已导出');
}

// ===== 云同步（GitHub）=====
// 数据本来只存在浏览器 localStorage 里：换电脑、清缓存、换浏览器就会丢。
// 这里用 GitHub API 把整份数据推到某个仓库的一个 JSON 文件里：
//   · 每次推送都是一次 git 提交 → 天然有版本历史，可回滚
//   · 换设备时「拉取」即可恢复
//   · 建议用私有仓库 + 只授权单个仓库的 fine-grained token
const GH_KEY = 'productLibrary_github';
const GH_API = 'https://api.github.com';

function ghConfig() { try { return JSON.parse(localStorage.getItem(GH_KEY) || '{}'); } catch (e) { return {}; } }
function ghSaveConfig(patch) { const c = Object.assign(ghConfig(), patch); localStorage.setItem(GH_KEY, JSON.stringify(c)); renderSyncStatus(); return c; }
function ghReady() { const c = ghConfig(); return !!(c.token && c.repo && c.repo.indexOf('/') > 0); }
// 支持直接粘贴仓库网址或 owner/repo，统一成 owner/repo
function normRepo(r) {
  return String(r || '').trim()
    .replace(/^https?:\/\/(www\.)?github\.com\//i, '')
    .replace(/\.git$/, '').replace(/\/+$/, '');
}
function ghRepo() { return normRepo(ghConfig().repo); }
function ghPath() { return (ghConfig().path || '产品库数据.json').trim(); }
function ghBranch() { return (ghConfig().branch || 'main').trim(); }

function b64encode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = ''; for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
function b64decode(b64) {
  const bin = atob(String(b64).replace(/\s/g, ''));
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function ghPayload() {
  return JSON.stringify({
    app: 'EDM产品助手', schema: 3, exportDate: new Date().toISOString(),
    fields: state.fields, brands: state.brands, products: state.products,
    basket: state.basket, buttonLibrary: state.buttonLibrary, copyLibrary: state.copyLibrary,
  }, null, 2);
}

async function ghRequest(path, opts) {
  const c = ghConfig();
  const res = await fetch(GH_API + path, Object.assign({
    headers: {
      Authorization: 'Bearer ' + c.token,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
  }, opts || {}));
  let data = {};
  try { data = await res.json(); } catch (e) { /* 空响应 */ }
  if (!res.ok) {
    const m = (data && data.message) || ('HTTP ' + res.status);
    throw new Error(res.status === 401 ? '令牌无效或已过期' :
      res.status === 403 ? '没权限，或触发了 GitHub 限流' :
      res.status === 404 ? '找不到仓库/文件，检查仓库名和令牌权限' : m);
  }
  return data;
}

// 只返回路径部分（ghRequest 会自己拼上 GH_API 基址）
function ghFileUrl() {
  return `/repos/${ghRepo()}/contents/${ghPath().split('/').map(encodeURIComponent).join('/')}`;
}

// 上传：把当前数据推到 GitHub（有 sha 就是更新，没有就是新建）
async function ghPush(silent) {
  if (!ghReady()) { if (!silent) showToast('先填写仓库和令牌'); return false; }
  ghSetStatus('正在上传…', '');
  try {
    let sha = '';
    try {
      const cur = await ghRequest(ghFileUrl() + '?ref=' + encodeURIComponent(ghBranch()));
      sha = cur.sha || '';
    } catch (e) { /* 文件还不存在，当作新建 */ }
    await ghRequest(ghFileUrl(), {
      method: 'PUT',
      body: JSON.stringify({
        message: '更新产品库数据 ' + new Date().toLocaleString('zh-CN'),
        content: b64encode(ghPayload()),
        branch: ghBranch(),
        ...(sha ? { sha } : {}),
      }),
    });
    ghSaveConfig({ lastSyncAt: Date.now(), lastSyncDir: 'push' });
    if (!silent) showToast('已上传到 GitHub');
    ghSetStatus('上传成功', 'ok');
    return true;
  } catch (e) {
    ghSetStatus('上传失败：' + e.message, 'err');
    if (!silent) showToast('上传失败：' + e.message);
    return false;
  }
}

// 读取远端信息（不改动本地）
async function ghRemoteInfo() {
  const f = await ghRequest(ghFileUrl() + '?ref=' + encodeURIComponent(ghBranch()));
  let updatedAt = '';
  try {
    const cs = await ghRequest(`/repos/${ghRepo()}/commits?path=${encodeURIComponent(ghPath())}&per_page=1`);
    if (cs && cs[0] && cs[0].commit) updatedAt = cs[0].commit.committer.date || '';
  } catch (e) { /* 拿不到提交时间就算了 */ }
  return { sha: f.sha, size: f.size, updatedAt };
}

// 拉取：确认后覆盖本地（覆盖前自动留一份本地快照，可一键还原）
async function ghPull() {
  if (!ghReady()) { showToast('先填写仓库和令牌'); return; }
  ghSetStatus('正在读取远端…', '');
  let info, text;
  try {
    info = await ghRemoteInfo();
    const f = await ghRequest(ghFileUrl() + '?ref=' + encodeURIComponent(ghBranch()));
    text = b64decode(f.content || '');
  } catch (e) { ghSetStatus('读取失败：' + e.message, 'err'); return; }
  let data;
  try { data = JSON.parse(text); } catch (e) { ghSetStatus('远端文件不是合法的 JSON', 'err'); return; }
  if (!data || !Array.isArray(data.products)) { ghSetStatus('远端文件不是产品库备份', 'err'); return; }

  const when = info.updatedAt ? new Date(info.updatedAt).toLocaleString('zh-CN') : '未知';
  const n = (data.products || []).length;
  pendingConfirmAction = () => {
    hideModal();
    try { localStorage.setItem(STORAGE_KEY + '_before_pull', stateSnapshot()); } catch (e) { /* 空间不足就算了 */ }
    state.fields = data.fields || state.fields;
    state.brands = data.brands || [];
    state.products = data.products || [];
    state.basket = data.basket || [];
    state.buttonLibrary = data.buttonLibrary || [];
    state.copyLibrary = data.copyLibrary || [];
    state.selectedBrandId = null; state.expandedProductId = null;
    saveState(); renderAll();
    ghSaveConfig({ lastSyncAt: Date.now(), lastSyncDir: 'pull' });
    showToast('已从 GitHub 恢复 ' + n + ' 个产品');
    showSyncModal();
  };
  document.getElementById('modal-content').innerHTML = `
    <div class="modal-title">从 GitHub 恢复</div>
    <p class="confirm-text">远端文件最后更新：${escapeHtml(when)}，包含 <b>${n}</b> 个产品、${(data.brands || []).length} 个品牌。<br>
    继续会用远端数据<b>覆盖</b>当前浏览器里的全部内容（覆盖前会自动留一份本地快照，可在同步面板里还原）。</p>
    <div class="modal-footer"><button class="btn" onclick="hideModal()">取消</button>
    <button class="btn btn-primary" onclick="executeConfirm()">覆盖并恢复</button></div>`;
  document.getElementById('modal-overlay').style.display = 'flex';
}

function ghRestoreLocal() {
  const raw = localStorage.getItem(STORAGE_KEY + '_before_pull');
  if (!raw) { showToast('没有可还原的快照'); return; }
  showConfirm2('用拉取前的本地快照覆盖当前数据？', () => {
    localStorage.setItem(STORAGE_KEY, raw);
    location.reload();
  });
}

function showConfirm2(text, cb) {
  pendingConfirmAction = cb;
  document.getElementById('modal-content').innerHTML = `
    <div class="modal-title">确认操作</div><p class="confirm-text">${escapeHtml(text)}</p>
    <div class="modal-footer"><button class="btn" onclick="hideModal()">取消</button>
    <button class="btn btn-danger" onclick="executeConfirm()">确认</button></div>`;
  document.getElementById('modal-overlay').style.display = 'flex';
}

// 自动同步：改动后 30 秒内最多推一次
function maybeAutoSync() {
  const c = ghConfig();
  if (!c.auto || !ghReady()) return;
  if (Date.now() - (c.lastSyncAt || 0) < 30000) return;
  ghPush(true);
}

function ghSetStatus(text, kind) {
  const el = document.getElementById('sync-status');
  if (el) { el.textContent = text; el.className = 'sync-status' + (kind ? ' ' + kind : ''); }
}

function renderSyncStatus() {
  const btn = document.getElementById('sync-btn');
  if (!btn) return;
  const c = ghConfig();
  btn.classList.toggle('sync-on', ghReady());
  if (!ghReady()) { btn.title = '云同步：未配置'; return; }
  const t = c.lastSyncAt ? new Date(c.lastSyncAt).toLocaleString('zh-CN') : '从未同步';
  btn.title = `云同步：${ghRepo()} · 上次${c.lastSyncDir === 'pull' ? '拉取' : '上传'} ${t}`;
}

function showSyncModal() {
  const c = ghConfig();
  const last = c.lastSyncAt ? new Date(c.lastSyncAt).toLocaleString('zh-CN') : '从未同步';
  const dir = c.lastSyncDir === 'pull' ? '拉取' : '上传';
  document.getElementById('modal-content').innerHTML = `
    <div class="modal-title">云同步（GitHub）</div>
    <p class="confirm-text">把整份数据存进你的 GitHub 仓库，换电脑/清缓存都能恢复；每次上传都是一次提交，有完整版本历史。</p>
    <div class="form-group"><label class="form-label">仓库（owner/repo 或仓库网址）</label>
      <input class="form-input" id="gh-repo" value="${escapeAttr(c.repo || '')}" placeholder="yourname/edm-data"></div>
    <div class="form-group"><label class="form-label">分支</label>
      <input class="form-input" id="gh-branch" value="${escapeAttr(c.branch || 'main')}" placeholder="main"></div>
    <div class="form-group"><label class="form-label">文件路径</label>
      <input class="form-input" id="gh-path" value="${escapeAttr(c.path || '产品库数据.json')}" placeholder="产品库数据.json"></div>
    <div class="form-group"><label class="form-label">个人访问令牌 (PAT)</label>
      <input class="form-input" id="gh-token" type="password" value="${escapeAttr(c.token || '')}" placeholder="github_pat_..."></div>
    <label class="gh-check"><input type="checkbox" id="gh-auto" ${c.auto ? 'checked' : ''}> 改动后自动上传（30 秒最多一次）</label>
    <p class="confirm-text">上次${dir}：${escapeHtml(last)}${ghReady() ? '' : ' · <b style="color:var(--danger)">还没配置</b>'}</p>
    <div class="sync-status" id="sync-status"></div>
    <div class="modal-footer">
      <button class="btn" onclick="hideModal()">关闭</button>
      ${localStorage.getItem(STORAGE_KEY + '_before_pull') ? '<button class="btn" onclick="ghRestoreLocal()">还原拉取前快照</button>' : ''}
      <button class="btn" onclick="ghPull()">从 GitHub 拉取</button>
      <button class="btn btn-primary" onclick="ghSaveSettings();ghPush(false)">保存并上传</button>
    </div>`;
  document.getElementById('modal-overlay').style.display = 'flex';
}

function ghSaveSettings() {
  ghSaveConfig({
    repo: normRepo(document.getElementById('gh-repo').value),
    branch: (document.getElementById('gh-branch').value || 'main').trim(),
    path: (document.getElementById('gh-path').value || '产品库数据.json').trim(),
    token: (document.getElementById('gh-token').value || '').trim(),
    auto: document.getElementById('gh-auto').checked,
  });
  showToast('同步设置已保存');
}

// ===== Sample Data =====
function loadSampleData() {
  const b1 = uuid(), b2 = uuid(), b3 = uuid();
  state.fields = DEFAULT_FIELDS.map(f => ({ ...f }));
  state.brands = [
    { id: b1, name: 'TechPro', note: '电子产品品牌' },
    { id: b2, name: 'HomeStyle', note: '家居生活品牌' },
    { id: b3, name: 'FitGear', note: '运动健身品牌' },
  ];
  state.products = [
    { id: uuid(), brandId: b1, name: '无线蓝牙耳机 Pro Max', createdAt: new Date().toISOString(),
      values: {
        f_features: [{label:'',content:'蓝牙 5.3 连接'},{label:'',content:'主动降噪 ANC'},{label:'',content:'续航 36 小时'},{label:'',content:'IPX5 防水'},{label:'',content:'低延迟游戏模式'},{label:'',content:'双设备连接'}],
        f_sp: [{label:'',content:'沉浸式降噪体验'},{label:'',content:'超长续航，告别电量焦虑'},{label:'',content:'轻至 4.2g，无感佩戴'}],
        f_desc: [{label:'短描述',content:'采用新一代 13mm 动圈单元，音质细节丰富，低频强劲有力，高频清亮通透'},{label:'长描述',content:'搭载最新蓝牙 5.3 芯片，连接更稳定、延迟更低。主动降噪技术有效过滤环境噪音，让你沉浸在纯净的音乐世界中。36 小时超长续航配合快充技术，10 分钟充电即可使用 3 小时。'}],
        f_cta: [{label:'',content:'限时 8 折，立即抢购'},{label:'',content:'加入购物车，享额外 9 折'}] } },
    { id: uuid(), brandId: b1, name: '智能手表 Series 5', createdAt: new Date().toISOString(),
      values: {
        f_features: [{label:'',content:'AMOLED 触摸屏'},{label:'',content:'心率血氧监测'},{label:'',content:'100+ 运动模式'},{label:'',content:'5ATM 防水'},{label:'',content:'NFC 支付'}],
        f_sp: [{label:'',content:'你的私人健康管家'},{label:'',content:'百种运动模式全覆盖'},{label:'',content:'一周一充，告别续航焦虑'}],
        f_desc: [{label:'短描述',content:'航空级铝合金表身，1.43 英寸高清大屏，支持全天候健康监测'}],
        f_cta: [{label:'',content:'首发优惠立减 200'},{label:'',content:'前 100 名赠额外表带'}] } },
    { id: uuid(), brandId: b2, name: '北欧风落地灯', createdAt: new Date().toISOString(),
      values: {
        f_features: [{label:'',content:'三档调光'},{label:'',content:'LED 节能灯珠'},{label:'',content:'金属哑光灯杆'},{label:'',content:'稳定底盘设计'}],
        f_sp: [{label:'',content:'点亮你的居家美学'},{label:'',content:'护眼无频闪，长时间阅读不疲劳'}],
        f_desc: [{label:'短描述',content:'极简北欧设计，哑光金属质感，适配多种家居风格'}],
        f_cta: [{label:'',content:'满 299 减 50'},{label:'',content:'限时包邮'}] } },
    { id: uuid(), brandId: b3, name: '专业瑜伽垫 6mm', createdAt: new Date().toISOString(),
      values: {
        f_features: [{label:'',content:'6mm 加厚'},{label:'',content:'TPE 环保材质'},{label:'',content:'双面防滑'},{label:'',content:'体位引导线'},{label:'',content:'可水洗'}],
        f_sp: [{label:'',content:'加厚缓冲，保护关节'},{label:'',content:'双面防滑，出汗不滑'},{label:'',content:'环保无味，开箱即用'}],
        f_desc: [{label:'短描述',content:'采用高密度 TPE 材质，回弹性好，防滑性能优异，适合瑜伽、普拉提等多种运动'},{label:'长描述',content:'6mm 加厚设计，有效缓冲保护关节。双面防滑纹理，即使出汗也能稳稳抓地。TPE 环保材质无毒无味，开箱即用无需晾晒。自带体位引导线，辅助正确练习。'}],
        f_cta: [{label:'',content:'新品上市 85 折'},{label:'',content:'两件 8 折'}] } },
  ];
  state.basket = [];
  state.buttonLibrary = DEFAULT_BUTTONS.map(b => ({ id: 'btn_' + uuid(), scene: b.scene, content: b.content }));
  saveState();
}

// ===== Layout: 三栏宽度可拖拽调整 =====
function applyLayoutWidths() {
  const layout = document.querySelector('.layout');
  if (!layout) return;
  layout.style.setProperty('--sidebar-w', state.layout.sidebarW + 'px');
  layout.style.setProperty('--basket-w', state.layout.basketW + 'px');
}

function initResizers() {
  applyLayoutWidths();
  const bind = (id, key, dir, min, max) => {
    const el = document.getElementById(id); if (!el) return;
    let dragging = false, startX = 0, startW = 0;
    el.addEventListener('mousedown', e => {
      dragging = true; startX = e.clientX; startW = state.layout[key];
      el.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    });
    document.addEventListener('mousemove', e => {
      if (!dragging) return;
      state.layout[key] = Math.max(min, Math.min(max, startW + (e.clientX - startX) * dir));
      applyLayoutWidths();
    });
    document.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false; el.classList.remove('dragging');
      document.body.style.cursor = ''; document.body.style.userSelect = '';
      saveState();
    });
  };
  bind('resizer-left', 'sidebarW', 1, 150, 480);     // 品牌栏
  bind('resizer-right', 'basketW', -1, 220, 720);    // 待复制内容（默认 360）
}

// ===== Init =====
function init() {
  loadState();
  if (state.brands.length === 0 && state.products.length === 0) loadSampleData();
  renderAll();
  renderSyncStatus();
  initResizers();
  // 自动保存兜底：定时 + 关页面 + 切到后台时都落盘
  lastSnapshot = stateSnapshot();
  setInterval(autoSave, 3000);
  window.addEventListener('beforeunload', autoSave);
  document.addEventListener('visibilitychange', () => { if (document.hidden) autoSave(); });
  document.getElementById('search-input').addEventListener('input', e => { state.searchQuery = e.target.value.trim(); renderProductTable(); });
  document.getElementById('modal-overlay').addEventListener('click', e => { if (e.target === e.currentTarget) hideModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.getElementById('modal-overlay').style.display !== 'none') hideModal(); });
  const ddBtn = document.querySelector('.dropdown > .btn');
  if (ddBtn) ddBtn.addEventListener('click', e => { e.stopPropagation(); document.querySelector('.dropdown').classList.toggle('open'); });
  document.addEventListener('click', () => { const dd = document.querySelector('.dropdown'); if (dd) dd.classList.remove('open'); });
}

init();
