const ordersList = document.getElementById('orders-list');
const listMessage = document.getElementById('list-message');
const filterForm = document.getElementById('filter-form');
const orderStatusesBox = document.getElementById('order-statuses');
const paymentStatusSelect = document.getElementById('payment-status');
const paymentMethodSelect = document.getElementById('payment-method');
const searchInput = document.getElementById('search');
const createdFrom = document.getElementById('created-from');
const createdTo = document.getElementById('created-to');
const deliveryFrom = document.getElementById('delivery-from');
const deliveryTo = document.getElementById('delivery-to');
const resetFilterBtn = document.getElementById('reset-filter');
const reloadBtn = document.getElementById('reload-orders');

const drawer = document.getElementById('detail-drawer');
const drawerBackdrop = document.getElementById('drawer-backdrop');
const closeDrawerBtn = document.getElementById('close-drawer');
const detailTitle = document.getElementById('detail-title');
const detailTags = document.getElementById('detail-tags');
const detailCustomer = document.getElementById('detail-customer');
const detailContact = document.getElementById('detail-contact');
const detailAddress = document.getElementById('detail-address');
const detailMap = document.getElementById('detail-map');
const detailDelivery = document.getElementById('detail-delivery');
const detailPayment = document.getElementById('detail-payment');
const detailItems = document.getElementById('detail-items');
const detailOrderStatus = document.getElementById('detail-order-status');
const detailPaymentStatus = document.getElementById('detail-payment-status');
const detailPaymentMethod = document.getElementById('detail-payment-method');
const detailDeliveryDate = document.getElementById('detail-delivery-date');
const detailTimeSlot = document.getElementById('detail-time-slot');
const detailDeliveryOrder = document.getElementById('detail-delivery-order');
const detailAdminNote = document.getElementById('detail-admin-note');
const statusMessage = document.getElementById('status-message');
const noteMessage = document.getElementById('note-message');
const saveStatusBtn = document.getElementById('save-status');
const saveNoteBtn = document.getElementById('save-note');
const cancelOrderBtn = document.getElementById('cancel-order');
const cancelReason = document.getElementById('cancel-reason');
const cancelText = document.getElementById('cancel-text');

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

let currentOrders = [];
let currentDetailId = null;

const setListMessage = (text, isError = false) => {
  listMessage.textContent = text || '';
  listMessage.className = isError ? 'error' : 'muted';
};

const pill = (text, className = 'pill pill--status') => {
  const span = document.createElement('span');
  span.className = `pill ${className}`;
  span.textContent = text;
  return span;
};

const renderStatusChip = (status) => pill(status, statusColors[status] || 'pill--status');
const renderPaymentChip = (status) => pill(status, paymentColors[status] || 'pill--status');

const formatDate = (value) => {
  if (!value) return '-';
  return new Date(value).toLocaleString('th-TH');
};

const buildQuery = () => {
  const params = new URLSearchParams();
  if (searchInput.value.trim()) params.set('q', searchInput.value.trim());

  const checkedStatuses = Array.from(orderStatusesBox.querySelectorAll('input:checked')).map(
    (i) => i.value,
  );
  if (checkedStatuses.length) params.set('order_status', checkedStatuses.join(','));

  if (paymentStatusSelect.value) params.set('payment_status', paymentStatusSelect.value);
  if (paymentMethodSelect.value) params.set('payment_method', paymentMethodSelect.value);
  if (createdFrom.value) params.set('created_from', createdFrom.value);
  if (createdTo.value) params.set('created_to', `${createdTo.value}T23:59:59`);
  if (deliveryFrom.value) params.set('delivery_from', deliveryFrom.value);
  if (deliveryTo.value) params.set('delivery_to', deliveryTo.value);
  return params.toString();
};

const fetchOrders = async () => {
  setListMessage('กำลังโหลดออเดอร์...');
  ordersList.innerHTML = '';
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
    ordersList.innerHTML = '';
    return;
  }
  setListMessage(`พบ ${currentOrders.length} รายการ`);
  renderOrders();
};

const renderOrders = () => {
  ordersList.innerHTML = '';
  currentOrders.forEach((order) => {
    const card = document.createElement('article');
    card.className = 'order-card';

    const header = document.createElement('div');
    header.className = 'order-card__header';

    const code = document.createElement('div');
    code.className = 'order-code';
    code.textContent = order.order_code;
    header.appendChild(code);

    const tagRow = document.createElement('div');
    tagRow.className = 'pill-row';
    tagRow.appendChild(renderStatusChip(order.order_status));
    tagRow.appendChild(renderPaymentChip(order.payment_status));
    header.appendChild(tagRow);

    card.appendChild(header);

    const meta = document.createElement('div');
    meta.className = 'order-card__meta';
    meta.innerHTML = `
      <div><p class="muted small">ลูกค้า</p><strong>${order.customer_name}</strong></div>
      <div><p class="muted small">ติดต่อ</p><span>${order.main_contact_type}: ${order.main_contact_value}</span></div>
      <div><p class="muted small">สร้างเมื่อ</p><span>${formatDate(order.created_at)}</span></div>
      <div><p class="muted small">จัดส่ง</p><span>${order.delivery_date || '-'} ${
        order.delivery_time_slot || ''
      }</span></div>
      <div><p class="muted small">จ่ายเงิน</p><span>${order.payment_method}</span></div>
    `;
    card.appendChild(meta);

    const actionRow = document.createElement('div');
    actionRow.className = 'actions';
    const viewBtn = document.createElement('button');
    viewBtn.className = 'button ghost';
    viewBtn.textContent = 'ดูรายละเอียด';
    viewBtn.addEventListener('click', () => openDetail(order.id));
    actionRow.appendChild(viewBtn);
    card.appendChild(actionRow);

    ordersList.appendChild(card);
  });
};

const openDrawer = () => drawer.classList.remove('hidden');
const closeDrawer = () => drawer.classList.add('hidden');

const setDetailTags = (order) => {
  detailTags.innerHTML = '';
  detailTags.appendChild(renderStatusChip(order.order_status));
  detailTags.appendChild(renderPaymentChip(order.payment_status));
  const updated = document.createElement('span');
  updated.className = 'pill pill--status muted';
  updated.textContent = `อัปเดต ${formatDate(order.last_updated_at)}`;
  detailTags.appendChild(updated);
};

const renderItems = (items) => {
  detailItems.innerHTML = '';
  if (!items || !items.length) {
    detailItems.textContent = 'ไม่มีรายการสินค้า';
    return;
  }

  const header = document.createElement('div');
  header.className = 'table-row head';
  header.innerHTML = '<span>สินค้า</span><span>จำนวน</span><span>ราคา/หน่วย</span><span>ยอด</span>';
  detailItems.appendChild(header);

  items.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'table-row';
    row.innerHTML = `
      <span>${item.product_name}</span>
      <span>${item.quantity}</span>
      <span>${Number(item.unit_price).toLocaleString('th-TH', {
        style: 'currency',
        currency: 'THB',
        maximumFractionDigits: 2,
      })}</span>
      <span>${Number(item.line_total).toLocaleString('th-TH', {
        style: 'currency',
        currency: 'THB',
        maximumFractionDigits: 2,
      })}</span>
    `;
    detailItems.appendChild(row);
  });
};

const openDetail = async (id) => {
  statusMessage.textContent = '';
  noteMessage.textContent = '';
  detailItems.innerHTML = 'กำลังโหลด...';
  currentDetailId = id;
  const res = await fetch(`/api/orders/${id}`);
  if (!res.ok) {
    detailItems.textContent = 'โหลดรายละเอียดไม่สำเร็จ';
    openDrawer();
    return;
  }
  const data = await res.json();
  const { order, items } = data;
  detailTitle.textContent = `${order.order_code} · ${order.customer_name}`;
  setDetailTags(order);
  detailCustomer.textContent = order.customer_name;
  detailContact.textContent = `${order.main_contact_type}: ${order.main_contact_value}`;
  detailAddress.textContent = `${order.full_address}${order.extra_info ? ` (${order.extra_info})` : ''}`;
  const mapUrl = order.latitude && order.longitude
    ? `https://maps.google.com/?q=${order.latitude},${order.longitude}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.full_address)}`;
  detailMap.href = mapUrl;
  detailDelivery.textContent = `${order.delivery_date || '-'} ${order.delivery_time_slot || ''}`;
  detailPayment.textContent = `${order.payment_method} · ${order.payment_status}`;
  renderItems(items);

  detailOrderStatus.value = order.order_status;
  detailPaymentStatus.value = order.payment_status;
  detailPaymentMethod.value = order.payment_method || 'transfer';
  detailDeliveryDate.value = order.delivery_date || '';
  detailTimeSlot.value = order.delivery_time_slot || '';
  detailDeliveryOrder.value = order.delivery_order_index ?? '';
  detailAdminNote.value = order.admin_note || '';
  cancelReason.value = order.cancel_reason_code || '';
  cancelText.value = order.cancel_reason_text || '';
  openDrawer();
};

const patchOrder = async (id, payload) => {
  const res = await fetch(`/api/orders/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ message: 'อัปเดตไม่สำเร็จ' }));
    throw new Error(data.message || 'อัปเดตไม่สำเร็จ');
  }
  return res.json();
};

const handleSaveStatus = async () => {
  if (!currentDetailId) return;
  statusMessage.textContent = 'กำลังอัปเดต...';
  try {
    const payload = {
      order_status: detailOrderStatus.value,
      payment_status: detailPaymentStatus.value,
      payment_method: detailPaymentMethod.value,
      delivery_date: detailDeliveryDate.value || null,
      delivery_time_slot: detailTimeSlot.value || null,
      delivery_order_index: detailDeliveryOrder.value === '' ? null : Number(detailDeliveryOrder.value),
    };
    if (payload.order_status === 'cancelled') {
      const code = cancelReason.value;
      if (!code) throw new Error('โปรดเลือกเหตุผลการยกเลิก');
      payload.cancel_reason_code = Number(code);
      payload.cancel_reason_text = cancelText.value || null;
    }
    const { order } = await patchOrder(currentDetailId, payload);
    statusMessage.textContent = 'บันทึกสำเร็จ';
    setDetailTags(order);
    if (payload.order_status !== 'cancelled') {
      cancelReason.value = order.cancel_reason_code || '';
      cancelText.value = order.cancel_reason_text || '';
    }
    await fetchOrders();
  } catch (err) {
    statusMessage.textContent = err.message;
  }
};

const handleSaveNote = async () => {
  if (!currentDetailId) return;
  noteMessage.textContent = 'กำลังบันทึก...';
  try {
    const payload = { admin_note: detailAdminNote.value };
    await patchOrder(currentDetailId, payload);
    noteMessage.textContent = 'บันทึกแล้ว';
    await fetchOrders();
  } catch (err) {
    noteMessage.textContent = err.message;
  }
};

const handleCancelOrder = async () => {
  if (!currentDetailId) return;
  if (!cancelReason.value) {
    statusMessage.textContent = 'โปรดเลือกเหตุผลก่อนยกเลิกออเดอร์';
    return;
  }
  statusMessage.textContent = 'กำลังยกเลิก...';
  try {
    const payload = {
      order_status: 'cancelled',
      cancel_reason_code: Number(cancelReason.value),
      cancel_reason_text: cancelText.value || null,
    };
    await patchOrder(currentDetailId, payload);
    statusMessage.textContent = 'ตั้งค่ายกเลิกสำเร็จ';
    await fetchOrders();
    await openDetail(currentDetailId);
  } catch (err) {
    statusMessage.textContent = err.message;
  }
};

const clearFilters = () => {
  searchInput.value = '';
  orderStatusesBox.querySelectorAll('input:checked').forEach((i) => {
    i.checked = false;
  });
  paymentStatusSelect.value = '';
  paymentMethodSelect.value = '';
  createdFrom.value = '';
  createdTo.value = '';
  deliveryFrom.value = '';
  deliveryTo.value = '';
};

filterForm.addEventListener('submit', (e) => {
  e.preventDefault();
  fetchOrders();
});

resetFilterBtn.addEventListener('click', () => {
  clearFilters();
  fetchOrders();
});

reloadBtn.addEventListener('click', fetchOrders);
closeDrawerBtn.addEventListener('click', closeDrawer);
drawerBackdrop.addEventListener('click', closeDrawer);
saveStatusBtn.addEventListener('click', handleSaveStatus);
saveNoteBtn.addEventListener('click', handleSaveNote);
cancelOrderBtn.addEventListener('click', handleCancelOrder);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeDrawer();
});

fetchOrders();
