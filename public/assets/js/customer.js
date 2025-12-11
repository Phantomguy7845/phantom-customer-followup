const qs = (selector) => document.querySelector(selector);
const qsa = (selector) => Array.from(document.querySelectorAll(selector));

const state = {
  products: [],
  quantities: new Map(),
};

const formatCurrency = (value) => `฿${Number(value || 0).toLocaleString('th-TH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`;

const statusText = {
  pending: 'รอการยืนยัน',
  confirmed: 'ยืนยันแล้ว',
  preparing: 'กำลังเตรียมสินค้า',
  out_for_delivery: 'กำลังจัดส่ง',
  delivered: 'จัดส่งสำเร็จ',
  cancelled: 'ยกเลิกแล้ว',
};

const paymentText = {
  unpaid: 'ยังไม่ชำระ',
  paid: 'ชำระแล้ว',
  cod: 'จ่ายปลายทาง',
  refunded: 'คืนเงินแล้ว',
};

const paymentMethodText = {
  transfer: 'โอน',
  promptpay: 'PromptPay',
  cod: 'เก็บเงินปลายทาง',
};

const setLoading = (button, loadingText = 'กำลังบันทึก...') => {
  if (!button) return () => {};
  const original = button.textContent;
  button.textContent = loadingText;
  button.disabled = true;
  return () => {
    button.textContent = original;
    button.disabled = false;
  };
};

const renderProducts = () => {
  const container = qs('#product-list');
  const empty = qs('#products-empty');
  container.innerHTML = '';

  if (!state.products.length) {
    empty.textContent = 'ยังไม่มีสินค้าเปิดขาย/โปรโมชัน';
    return;
  }

  empty.textContent = '';
  state.products.forEach((product) => {
    const card = document.createElement('article');
    card.className = 'product-card';
    card.innerHTML = `
      <header>
        <div class="name">${product.name}</div>
        ${product.status === 'promotion' ? '<span class="badge">โปรโมชัน</span>' : ''}
      </header>
      <p class="muted">${product.description || 'ไม่มีรายละเอียดสินค้า'}</p>
      <div class="price-row">
        ${
          product.status === 'promotion' && product.promo_price
            ? `<span class="strike">${formatCurrency(product.base_price)}</span>`
            : ''
        }
        <strong>${formatCurrency(
          product.status === 'promotion' && product.promo_price
            ? product.promo_price
            : product.base_price,
        )}</strong>
      </div>
      <div class="quantity">
        <label class="field">
          <span>จำนวน</span>
          <input type="number" min="0" value="0" data-product="${product.id}" />
        </label>
      </div>
    `;

    const input = card.querySelector('input');
    input.addEventListener('input', () => {
      const qty = Math.max(0, Number.parseInt(input.value, 10) || 0);
      input.value = qty;
      state.quantities.set(product.id, qty);
      updateSummary();
    });

    container.appendChild(card);
  });
};

const updateSummary = () => {
  let count = 0;
  let total = 0;

  state.products.forEach((product) => {
    const qty = state.quantities.get(product.id) || 0;
    if (!qty) return;

    const unit =
      product.status === 'promotion' && product.promo_price
        ? Number(product.promo_price)
        : Number(product.base_price);
    count += qty;
    total += unit * qty;
  });

  qs('#summary-count').textContent = `${count} รายการ`;
  qs('#summary-total').textContent = formatCurrency(total);
};

const loadProducts = async () => {
  const empty = qs('#products-empty');
  empty.textContent = 'กำลังโหลดสินค้า...';
  try {
    const res = await fetch('/api/products?status=active,promotion');
    if (!res.ok) throw new Error('โหลดสินค้าไม่สำเร็จ');
    const data = await res.json();
    state.products = data.products || [];
    state.quantities.clear();
    renderProducts();
    updateSummary();
  } catch (err) {
    console.error(err);
    empty.textContent = 'โหลดสินค้าไม่สำเร็จ โปรดลองใหม่';
  }
};

const collectItems = () => {
  const items = [];
  state.products.forEach((product) => {
    const qty = state.quantities.get(product.id) || 0;
    if (!qty) return;
    items.push({ product_id: product.id, quantity: qty });
  });
  return items;
};

const createCustomer = async (payload) => {
  const res = await fetch('/api/customers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error((await res.json()).error || 'สร้างลูกค้าไม่สำเร็จ');
  return (await res.json()).customer;
};

const createAddress = async (customerId, payload) => {
  const res = await fetch(`/api/customers/${customerId}/addresses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error((await res.json()).error || 'บันทึกที่อยู่ไม่สำเร็จ');
  return (await res.json()).address;
};

const createOrder = async (payload) => {
  const res = await fetch('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error((await res.json()).error || 'สร้างออเดอร์ไม่สำเร็จ');
  return (await res.json()).order;
};

const handleSubmit = async (event) => {
  event.preventDefault();
  const button = qs('#submit-order');
  const resetLoading = setLoading(button, 'กำลังบันทึก...');
  const result = qs('#order-result');
  result.textContent = '';
  result.className = 'result';

  try {
    const form = event.target;
    const formData = new FormData(form);
    const items = collectItems();

    if (!items.length) {
      throw new Error('กรุณาเลือกสินค้าอย่างน้อย 1 รายการ');
    }

    const customer = await createCustomer({
      name: formData.get('name'),
      main_contact_type: formData.get('main_contact_type'),
      main_contact_value: formData.get('main_contact_value'),
      other_contacts: formData.get('other_contacts') || null,
      notes: formData.get('notes') || null,
    });

    const address = await createAddress(customer.id, {
      label: formData.get('label') || null,
      full_address: formData.get('full_address'),
      extra_info: formData.get('extra_info') || null,
    });

    const order = await createOrder({
      customer_id: customer.id,
      address_id: address.id,
      delivery_date: formData.get('delivery_date') || null,
      delivery_time_slot: formData.get('delivery_time_slot') || null,
      payment_method: formData.get('payment_method') || 'transfer',
      payment_status: formData.get('payment_status') || 'unpaid',
      order_status: 'pending',
      items,
    });

    result.classList.add('success');
    result.innerHTML = `
      <div class="order-code">
        <strong>สร้างออเดอร์สำเร็จ:</strong> <code>${order.order_code}</code>
        <button type="button" class="ghost" id="copy-order">คัดลอกเลขออเดอร์</button>
      </div>
      <p class="small muted">ระบบจะรีเซ็ตเลขออเดอร์ทุกต้นเดือน</p>
    `;

    const copyBtn = qs('#copy-order');
    copyBtn?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(order.order_code);
        copyBtn.textContent = 'คัดลอกแล้ว';
      } catch (err) {
        copyBtn.textContent = 'คัดลอกไม่สำเร็จ';
      }
    });

    form.reset();
    state.quantities.clear();
    updateSummary();
    qsa('#product-list input[type="number"]').forEach((input) => {
      input.value = '0';
    });
  } catch (err) {
    console.error(err);
    result.classList.add('error');
    result.textContent = err.message || 'บันทึกออเดอร์ไม่สำเร็จ';
  } finally {
    resetLoading();
  }
};

const handleStatusCheck = async (event) => {
  event.preventDefault();
  const button = qs('#check-status');
  const reset = setLoading(button, 'กำลังตรวจสอบ...');
  const result = qs('#status-result');
  result.textContent = '';
  result.className = 'result';

  try {
    const form = event.target;
    const formData = new FormData(form);
    const orderCode = formData.get('order_code')?.trim();
    const phone = formData.get('phone')?.trim();

    if (!orderCode || !phone) {
      throw new Error('โปรดกรอกเลขออเดอร์และเบอร์โทร');
    }

    const res = await fetch(`/api/order-status?order_code=${encodeURIComponent(orderCode)}&phone=${encodeURIComponent(phone)}`);
    if (res.status === 404) {
      throw new Error('ไม่พบบันทึกออเดอร์สำหรับเบอร์นี้');
    }
    if (!res.ok) throw new Error('ตรวจสอบสถานะไม่สำเร็จ');

    const data = await res.json();
    const order = data.order;
    const items = data.items || [];

    result.classList.add('success');
    result.innerHTML = `
      <div class="mini-grid">
        <div>
          <p class="muted">สถานะออเดอร์</p>
          <p class="status-chip">${statusText[order.order_status] || order.order_status}</p>
        </div>
        <div>
          <p class="muted">สถานะชำระ</p>
          <p class="status-chip">${paymentText[order.payment_status] || order.payment_status}</p>
        </div>
        <div>
          <p class="muted">จัดส่ง</p>
          <p class="status-chip">${order.delivery_date || '-'} ${order.delivery_time_slot || ''}</p>
        </div>
      </div>
      <div class="hint">ที่อยู่: ${order.full_address}</div>
      <div class="hint">วิธีชำระ: ${paymentMethodText[order.payment_method] || order.payment_method}</div>
      <div class="hint">รายการสินค้า: ${items
        .map((item) => `${item.product_name} x${item.quantity}`)
        .join(', ') || '-'}</div>
    `;
  } catch (err) {
    console.error(err);
    result.classList.add('error');
    result.textContent = err.message || 'ตรวจสอบสถานะไม่สำเร็จ';
  } finally {
    reset();
  }
};

const init = () => {
  loadProducts();
  qs('#order-form')?.addEventListener('submit', handleSubmit);
  qs('#order-form')?.addEventListener('reset', () => {
    state.quantities.clear();
    updateSummary();
    qsa('#product-list input[type="number"]').forEach((input) => {
      input.value = '0';
    });
    qs('#order-result').textContent = '';
  });
  qs('#status-form')?.addEventListener('submit', handleStatusCheck);
  qs('#refresh-products')?.addEventListener('click', loadProducts);
};

window.addEventListener('DOMContentLoaded', init);
