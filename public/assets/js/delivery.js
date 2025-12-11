const deliveryList = document.getElementById('delivery-list');
const listMessage = document.getElementById('list-message');
const filterForm = document.getElementById('filter-form');
const deliveryDateInput = document.getElementById('delivery-date');
const paymentStatusSelect = document.getElementById('payment-status');
const searchInput = document.getElementById('search');
const statusesBox = document.getElementById('order-statuses');
const reloadBtn = document.getElementById('reload-delivery');
const resetBtn = document.getElementById('reset-filter');

const drawer = document.getElementById('detail-drawer');
const drawerBackdrop = document.getElementById('drawer-backdrop');
const closeDrawerBtn = document.getElementById('close-drawer');
const detailTitle = document.getElementById('detail-title');
const detailTags = document.getElementById('detail-tags');
const detailCustomer = document.getElementById('detail-customer');
const detailContact = document.getElementById('detail-contact');
const detailAddress = document.getElementById('detail-address');
const detailExtra = document.getElementById('detail-extra');
const detailDate = document.getElementById('detail-date');
const detailSlot = document.getElementById('detail-slot');
const detailPayment = document.getElementById('detail-payment');
const detailItems = document.getElementById('detail-items');
const detailOrderStatus = document.getElementById('detail-order-status');
const detailPaymentStatus = document.getElementById('detail-payment-status');
const cancelReason = document.getElementById('cancel-reason');
const cancelText = document.getElementById('cancel-text');
const openMapBtn = document.getElementById('open-map');
const detailMessage = document.getElementById('detail-message');
const setOutBtn = document.getElementById('set-out');
const setDeliveredBtn = document.getElementById('set-delivered');
const saveStatusBtn = document.getElementById('save-status');

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

const statusColors = {
  pending: 'pill--status',
  confirmed: 'pill--status info',
  preparing: 'pill--status info',
  out_for_delivery: 'pill--status warning',
  delivered: 'pill--status success',
  cancelled: 'pill--status danger',
};

const paymentColors = {
  unpaid: 'pill--status danger',
  paid: 'pill--status success',
  cod: 'pill--status info',
  refunded: 'pill--status muted',
};

const contactText = {
  phone: 'โทรศัพท์',
  line: 'LINE',
  facebook: 'Facebook',
};

let currentOrders = [];
let currentDetailId = null;
let currentMapData = null;
let isPersistingOrder = false;

const pill = (text, className = 'pill pill--status') => {
  const span = document.createElement('span');
  span.className = `pill ${className}`;
  span.textContent = text;
  return span;
};

const renderStatusChip = (status) =>
  pill(statusText[status] || status, statusColors[status] || 'pill--status');
const renderPaymentChip = (status) =>
  pill(paymentText[status] || status, paymentColors[status] || 'pill--status');

const setListMessage = (text, isError = false) => {
  listMessage.textContent = text || '';
  listMessage.className = isError ? 'error' : 'muted';
};

const setDetailMessage = (text, isError = false) => {
  detailMessage.textContent = text || '';
  detailMessage.className = isError ? 'error small' : 'muted small';
};

const todayString = () => {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const formatAddress = (order) => {
  if (order.full_address) return order.full_address;
  return '-';
};

const resetFilters = () => {
  deliveryDateInput.value = todayString();
  paymentStatusSelect.value = '';
  searchInput.value = '';
  statusesBox.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
    checkbox.checked = ['confirmed', 'preparing', 'out_for_delivery'].includes(checkbox.value);
  });
};

const buildQuery = () => {
  const params = new URLSearchParams();
  const date = deliveryDateInput.value;
  if (date) {
    params.set('delivery_from', date);
    params.set('delivery_to', `${date}T23:59:59`);
  }

  const statuses = Array.from(statusesBox.querySelectorAll('input:checked')).map((c) => c.value);
  if (statuses.length) params.set('order_status', statuses.join(','));
  if (paymentStatusSelect.value) params.set('payment_status', paymentStatusSelect.value);
  if (searchInput.value.trim()) params.set('q', searchInput.value.trim());

  params.set('sort', 'delivery');
  params.set('include_address', '1');
  params.set('limit', '200');
  return params.toString();
};

const fetchOrders = async () => {
  setListMessage('กำลังโหลดรายการ...');
  deliveryList.innerHTML = '';
  const qs = buildQuery();
  const res = await fetch(`/api/orders${qs ? `?${qs}` : ''}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({ message: 'โหลดรายการไม่สำเร็จ' }));
    setListMessage(data.message || 'โหลดรายการไม่สำเร็จ', true);
    return;
  }
  const data = await res.json();
  currentOrders = data.orders || [];
  if (!currentOrders.length) {
    setListMessage('ไม่พบออเดอร์ตามเงื่อนไข');
    return;
  }
  setListMessage(`พบ ${currentOrders.length} รายการ`);
  renderOrders();
};

const renderOrders = () => {
  deliveryList.innerHTML = '';
  currentOrders.forEach((order, index) => {
    const card = document.createElement('article');
    card.className = 'order-card delivery-card';

    const header = document.createElement('div');
    header.className = 'order-card__header';

    const code = document.createElement('div');
    code.className = 'order-code';
    code.textContent = order.order_code;
    header.appendChild(code);

    const tags = document.createElement('div');
    tags.className = 'pill-row';
    tags.appendChild(renderStatusChip(order.order_status));
    tags.appendChild(renderPaymentChip(order.payment_status));
    header.appendChild(tags);
    card.appendChild(header);

    const meta = document.createElement('div');
    meta.className = 'order-card__meta';
    meta.innerHTML = `
      <div><p class="muted small">คิว</p><strong>${order.delivery_order_index ?? '-'}</strong></div>
      <div><p class="muted small">ลูกค้า</p><strong>${order.customer_name}</strong></div>
      <div><p class="muted small">ติดต่อ</p><span>${
        contactText[order.main_contact_type] || order.main_contact_type
      }: ${order.main_contact_value}</span></div>
      <div><p class="muted small">จัดส่ง</p><span>${order.delivery_date || '-'} ${order.delivery_time_slot || ''}</span></div>
      <div><p class="muted small">ที่อยู่</p><span class="truncate">${formatAddress(order)}</span></div>
    `;
    card.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'actions actions--spread';

    const moveUp = document.createElement('button');
    moveUp.className = 'button ghost small';
    moveUp.textContent = 'ขยับขึ้น';
    moveUp.disabled = index === 0 || isPersistingOrder;
    moveUp.addEventListener('click', () => moveOrder(order.id, -1));

    const moveDown = document.createElement('button');
    moveDown.className = 'button ghost small';
    moveDown.textContent = 'ขยับลง';
    moveDown.disabled = index === currentOrders.length - 1 || isPersistingOrder;
    moveDown.addEventListener('click', () => moveOrder(order.id, 1));

    const detailBtn = document.createElement('button');
    detailBtn.className = 'button';
    detailBtn.textContent = 'รายละเอียด';
    detailBtn.addEventListener('click', () => openDetail(order.id));

    actions.appendChild(moveUp);
    actions.appendChild(moveDown);
    actions.appendChild(detailBtn);
    card.appendChild(actions);

    deliveryList.appendChild(card);
  });
};

const moveOrder = async (orderId, direction) => {
  if (isPersistingOrder) return;
  const index = currentOrders.findIndex((o) => o.id === orderId);
  if (index === -1) return;
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= currentOrders.length) return;

  const [removed] = currentOrders.splice(index, 1);
  currentOrders.splice(targetIndex, 0, removed);
  renderOrders();
  await persistOrderIndexes();
};

const persistOrderIndexes = async () => {
  isPersistingOrder = true;
  setListMessage('กำลังบันทึกลำดับคิว...');
  try {
    for (let i = 0; i < currentOrders.length; i += 1) {
      const order = currentOrders[i];
      const newIndex = i + 1;
      order.delivery_order_index = newIndex;
      await patchOrder(order.id, { delivery_order_index: newIndex });
    }
    setListMessage(`บันทึกลำดับคิวใหม่ ${currentOrders.length} รายการแล้ว`);
    renderOrders();
  } catch (err) {
    console.error(err);
    setListMessage('บันทึกลำดับไม่สำเร็จ กรุณาลองอีกครั้ง', true);
    await fetchOrders();
  } finally {
    isPersistingOrder = false;
  }
};

const patchOrder = async (id, body) => {
  const res = await fetch(`/api/orders/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ message: 'บันทึกไม่สำเร็จ' }));
    throw new Error(data.message || 'บันทึกไม่สำเร็จ');
  }
  return res.json();
};

const openDrawer = () => {
  drawer.classList.remove('hidden');
  drawerBackdrop.classList.remove('hidden');
};

const closeDrawer = () => {
  drawer.classList.add('hidden');
  drawerBackdrop.classList.add('hidden');
  currentDetailId = null;
  currentMapData = null;
  detailItems.innerHTML = '';
};

const openDetail = async (orderId) => {
  const res = await fetch(`/api/orders/${orderId}`);
  if (!res.ok) {
    setListMessage('โหลดรายละเอียดไม่สำเร็จ', true);
    return;
  }
  const data = await res.json();
  const { order, items } = data;
  currentDetailId = orderId;
  currentMapData = {
    fullAddress: order.full_address,
    lat: order.latitude,
    lng: order.longitude,
  };

  detailTitle.textContent = order.order_code;
  detailTags.innerHTML = '';
  detailTags.appendChild(renderStatusChip(order.order_status));
  detailTags.appendChild(renderPaymentChip(order.payment_status));

  detailCustomer.textContent = order.customer_name;
  detailContact.textContent = `${
    contactText[order.main_contact_type] || order.main_contact_type
  }: ${order.main_contact_value}`;
  detailAddress.textContent = order.full_address || '-';
  detailExtra.textContent = order.extra_info || '-';
  detailDate.textContent = order.delivery_date || '-';
  detailSlot.textContent = order.delivery_time_slot || '-';
  detailPayment.textContent = `${
    paymentMethodText[order.payment_method] || order.payment_method
  } / ${paymentText[order.payment_status] || order.payment_status}`;

  detailOrderStatus.value = order.order_status;
  detailPaymentStatus.value = order.payment_status;
  cancelReason.value = order.cancel_reason_code || '';
  cancelText.value = order.cancel_reason_text || '';

  detailItems.innerHTML = '';
  if (items && items.length) {
    const head = document.createElement('tr');
    head.innerHTML = '<th>สินค้า</th><th>จำนวน</th><th>ราคาต่อหน่วย</th><th>รวม</th>';
    detailItems.appendChild(head);
    items.forEach((item) => {
      const row = document.createElement('tr');
      row.innerHTML = `<td>${item.product_name}</td><td>${item.quantity}</td><td>${item.unit_price}</td><td>${item.line_total}</td>`;
      detailItems.appendChild(row);
    });
  } else {
    const row = document.createElement('tr');
    row.innerHTML = '<td colspan="4" class="muted">ไม่มีสินค้า</td>';
    detailItems.appendChild(row);
  }

  setDetailMessage('');
  openDrawer();
};

const applyStatusUpdate = async (body) => {
  if (!currentDetailId) return;
  setDetailMessage('กำลังบันทึก...');
  try {
    const data = await patchOrder(currentDetailId, body);
    setDetailMessage('บันทึกแล้ว');
    const updated = data.order;
    const idx = currentOrders.findIndex((o) => o.id === currentDetailId);
    if (idx !== -1) {
      currentOrders[idx] = { ...currentOrders[idx], ...updated };
      renderOrders();
    }
    await openDetail(currentDetailId);
  } catch (err) {
    setDetailMessage(err.message || 'บันทึกไม่สำเร็จ', true);
  }
};

const ensureCancelReason = () => {
  if (detailOrderStatus.value !== 'cancelled') return true;
  if (!cancelReason.value) {
    setDetailMessage('กรุณาเลือกเหตุผลยกเลิก', true);
    return false;
  }
  return true;
};

const openMap = () => {
  if (!currentMapData) return;
  const { lat, lng, fullAddress } = currentMapData;
  if (lat && lng) {
    window.open(`https://www.google.com/maps?q=${lat},${lng}`);
    return;
  }
  if (fullAddress) {
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`);
  }
};

const init = () => {
  resetFilters();
  fetchOrders();
};

filterForm.addEventListener('submit', (e) => {
  e.preventDefault();
  fetchOrders();
});

reloadBtn.addEventListener('click', () => fetchOrders());
resetBtn.addEventListener('click', () => {
  resetFilters();
  fetchOrders();
});

closeDrawerBtn.addEventListener('click', closeDrawer);
drawerBackdrop.addEventListener('click', closeDrawer);
openMapBtn.addEventListener('click', openMap);

setOutBtn.addEventListener('click', () => {
  applyStatusUpdate({ order_status: 'out_for_delivery' });
});

setDeliveredBtn.addEventListener('click', () => {
  applyStatusUpdate({ order_status: 'delivered' });
});

saveStatusBtn.addEventListener('click', () => {
  if (!ensureCancelReason()) return;
  const body = {
    order_status: detailOrderStatus.value,
    payment_status: detailPaymentStatus.value,
    cancel_reason_code: cancelReason.value ? Number(cancelReason.value) : null,
    cancel_reason_text: cancelText.value || null,
  };
  applyStatusUpdate(body);
});

init();
