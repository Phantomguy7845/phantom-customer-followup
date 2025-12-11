const productList = document.getElementById('product-list');
const listMessage = document.getElementById('list-message');
const createForm = document.getElementById('create-form');
const createMessage = document.getElementById('create-message');
const createStatus = document.getElementById('create-status');
const filterStatus = document.getElementById('filter-status');
const searchInput = document.getElementById('search');
const applyFilterBtn = document.getElementById('apply-filter');
const reloadBtn = document.getElementById('reload-products');

const statusText = {
  active: 'เปิดขาย',
  inactive: 'ปิดขาย',
  promotion: 'โปรโมชัน',
};

const formatCurrency = (value) => {
  const num = Number(value || 0);
  return num.toLocaleString('th-TH', { style: 'currency', currency: 'THB', maximumFractionDigits: 2 });
};

const setListMessage = (text, isError = false) => {
  listMessage.textContent = text || '';
  listMessage.className = isError ? 'error' : 'muted';
};

const setCreateStatus = (text) => {
  createStatus.textContent = text;
};

const renderStatusChip = (status) => {
  const chip = document.createElement('span');
  chip.className = 'pill';
  chip.textContent = statusText[status] || status;
  if (status === 'inactive') {
    chip.style.background = 'rgba(248, 113, 113, 0.12)';
    chip.style.borderColor = 'rgba(248, 113, 113, 0.45)';
    chip.style.color = '#f87171';
  }
  if (status === 'promotion') {
    chip.style.background = 'rgba(250, 204, 21, 0.12)';
    chip.style.borderColor = 'rgba(250, 204, 21, 0.45)';
    chip.style.color = '#facc15';
  }
  return chip;
};

const patchProduct = async (id, payload) => {
  const res = await fetch(`/api/products/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ message: 'อัปเดตสินค้าไม่สำเร็จ' }));
    throw new Error(data.message || 'อัปเดตสินค้าไม่สำเร็จ');
  }
  return res.json();
};

const createProduct = async (payload) => {
  const res = await fetch('/api/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ message: 'บันทึกสินค้าไม่สำเร็จ' }));
    throw new Error(data.message || 'บันทึกสินค้าไม่สำเร็จ');
  }
  return res.json();
};

const buildCard = (product) => {
  const card = document.createElement('article');
  card.className = 'product-card';

  const header = document.createElement('header');
  const name = document.createElement('div');
  name.className = 'name';
  name.textContent = product.name;

  const statusChip = renderStatusChip(product.status);

  header.appendChild(name);
  header.appendChild(statusChip);
  card.appendChild(header);

  if (product.description) {
    const desc = document.createElement('p');
    desc.className = 'muted';
    desc.textContent = product.description;
    card.appendChild(desc);
  }

  const priceRow = document.createElement('div');
  priceRow.className = 'price-row';
  const base = document.createElement('strong');
  base.textContent = formatCurrency(product.base_price);
  priceRow.appendChild(base);
  if (product.status === 'promotion' && product.promo_price) {
    const strike = document.createElement('span');
    strike.className = 'strike';
    strike.textContent = formatCurrency(product.base_price);
    const promo = document.createElement('span');
    promo.className = 'pill';
    promo.textContent = `โปร ${formatCurrency(product.promo_price)}`;
    priceRow.appendChild(strike);
    priceRow.appendChild(promo);
  }
  card.appendChild(priceRow);

  const meta = document.createElement('p');
  meta.className = 'muted small';
  meta.textContent = `อัปเดตล่าสุด ${new Date(product.updated_at).toLocaleString('th-TH')}`;
  card.appendChild(meta);

  const actionRow = document.createElement('div');
  actionRow.className = 'actions';

  const editBtn = document.createElement('button');
  editBtn.className = 'ghost';
  editBtn.textContent = 'แก้ไข';
  actionRow.appendChild(editBtn);

  const setActive = document.createElement('button');
  setActive.className = 'ghost';
  setActive.textContent = 'ตั้งเป็น active';
  setActive.addEventListener('click', async () => {
    setListMessage('กำลังอัปเดตสถานะ...');
    try {
      await patchProduct(product.id, { status: 'active' });
      await loadProducts();
      setListMessage('อัปเดตสำเร็จ');
    } catch (err) {
      setListMessage(err.message, true);
    }
  });
  actionRow.appendChild(setActive);

  const setPromo = document.createElement('button');
  setPromo.className = 'ghost';
  setPromo.textContent = 'ตั้งเป็น promotion';
  setPromo.addEventListener('click', async () => {
    const promoPrice = prompt('ระบุ promo price (เช่น 79)', product.promo_price || '');
    if (promoPrice === null) return;
    setListMessage('กำลังตั้งค่า promotion...');
    try {
      await patchProduct(product.id, { status: 'promotion', promo_price: promoPrice });
      await loadProducts();
      setListMessage('อัปเดตสำเร็จ');
    } catch (err) {
      setListMessage(err.message, true);
    }
  });
  actionRow.appendChild(setPromo);

  const setInactive = document.createElement('button');
  setInactive.className = 'ghost';
  setInactive.textContent = 'ปิดการแสดง (inactive)';
  setInactive.addEventListener('click', async () => {
    if (!confirm('ปิดการแสดงสินค้านี้?')) return;
    setListMessage('กำลังอัปเดตสถานะ...');
    try {
      await patchProduct(product.id, { status: 'inactive' });
      await loadProducts();
      setListMessage('อัปเดตสำเร็จ');
    } catch (err) {
      setListMessage(err.message, true);
    }
  });
  actionRow.appendChild(setInactive);

  card.appendChild(actionRow);

  const editForm = document.createElement('form');
  editForm.className = 'stack card card--sub';
  editForm.innerHTML = `
    <div class="two-col">
      <label class="field">
        <span>ชื่อสินค้า</span>
        <input name="name" value="${product.name}" />
      </label>
      <label class="field">
        <span>สถานะ</span>
        <select name="status">
          <option value="active" ${product.status === 'active' ? 'selected' : ''}>active</option>
          <option value="promotion" ${product.status === 'promotion' ? 'selected' : ''}>promotion</option>
          <option value="inactive" ${product.status === 'inactive' ? 'selected' : ''}>inactive</option>
        </select>
      </label>
    </div>
    <div class="two-col">
      <label class="field">
        <span>Base price</span>
        <input name="base_price" type="number" step="0.01" value="${product.base_price}" />
      </label>
      <label class="field">
        <span>Promo price</span>
        <input name="promo_price" type="number" step="0.01" value="${product.promo_price || ''}" />
      </label>
    </div>
    <label class="field">
      <span>รายละเอียด</span>
      <textarea name="description" rows="2">${product.description || ''}</textarea>
    </label>
    <div class="actions">
      <button class="button" type="submit">Save</button>
      <button type="button" class="ghost" data-hide>Edit panel</button>
    </div>
    <p class="muted small" data-msg></p>
  `;
  editForm.style.display = 'none';

  const toggleEdit = () => {
    editForm.style.display = editForm.style.display === 'none' ? 'block' : 'none';
  };

  editBtn.addEventListener('click', () => toggleEdit());
  editForm.querySelector('[data-hide]').addEventListener('click', toggleEdit);

  editForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(editForm);
    const payload = {
      name: formData.get('name'),
      status: formData.get('status'),
      base_price: formData.get('base_price'),
      promo_price: formData.get('promo_price'),
      description: formData.get('description'),
    };
    const msgEl = editForm.querySelector('[data-msg]');
    msgEl.textContent = 'กำลังบันทึก...';
    try {
      await patchProduct(product.id, payload);
      msgEl.textContent = 'บันทึกสำเร็จ';
      await loadProducts();
    } catch (err) {
      msgEl.textContent = err.message;
      msgEl.className = 'error small';
    }
  });

  card.appendChild(editForm);

  return card;
};

const loadProducts = async () => {
  setListMessage('กำลังโหลดรายการสินค้า...');
  productList.innerHTML = '';
  const params = new URLSearchParams();
  if (filterStatus.value) params.append('status', filterStatus.value);
  if (searchInput.value) params.append('q', searchInput.value.trim());

  try {
    const res = await fetch(`/api/products?${params.toString()}`);
    if (!res.ok) {
      throw new Error('โหลดสินค้าไม่สำเร็จ');
    }
    const data = await res.json();
    if (!data.products.length) {
      setListMessage('ยังไม่มีสินค้า');
      return;
    }
    data.products.forEach((product) => {
      productList.appendChild(buildCard(product));
    });
    setListMessage('โหลดสำเร็จ');
  } catch (err) {
    console.error(err);
    setListMessage(err.message || 'เกิดข้อผิดพลาด', true);
  }
};

createForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(createForm);
  const payload = {
    name: formData.get('name'),
    base_price: formData.get('base_price'),
    description: formData.get('description'),
    status: formData.get('status'),
    promo_price: formData.get('promo_price'),
  };

  createMessage.textContent = '';
  setCreateStatus('กำลังบันทึก...');

  try {
    await createProduct(payload);
    createMessage.textContent = 'บันทึกสำเร็จ';
    createMessage.className = 'success';
    createForm.reset();
    setCreateStatus('พร้อมบันทึก');
    await loadProducts();
  } catch (err) {
    createMessage.textContent = err.message;
    createMessage.className = 'error';
    setCreateStatus('บันทึกไม่สำเร็จ');
  }
});

applyFilterBtn.addEventListener('click', () => loadProducts());
reloadBtn.addEventListener('click', () => loadProducts());

loadProducts();
