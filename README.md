# Phantom Customer Followup

Mobile-first web/PWA for customer, order, and delivery management built on Node.js + SQLite. ฝั่งผู้ใช้หลักมีแบบฟอร์มสั่งซื้อสำหรับลูกค้า/แอดมิน และฝั่งแอดมินสำหรับจัดการสินค้า ออเดอร์ และคิวจัดส่ง

## โครงสร้างโดยย่อ
- **Backend**: Node.js (built-in HTTP) + SQLite (`node:sqlite`), REST API under `/api/*`
- **Frontend**: Static HTML/JS/CSS ใน `public/` (หน้า customer/admin/orders/delivery + landing)
- **PWA**: `public/manifest.json`, `public/service-worker.js`, และตัวช่วยลงทะเบียน `public/assets/js/pwa.js`

## ความต้องการระบบ
- Node.js 20+ (ต้องมีไดรเวอร์ `node:sqlite` ที่เป็น experimental)

## การติดตั้งและรัน
1) ติดตั้ง dependencies (ไม่มี external แต่เก็บสคริปต์ npm)
```bash
npm install
```

2) รันเซิร์ฟเวอร์ (พอร์ตดีฟอลต์ 3000)
```bash
npm start
# โหมด watch
npm run dev
```

3) เปิดเบราว์เซอร์ที่ `http://localhost:3000`

### Database
- ไฟล์ฐานข้อมูลอยู่ที่ `data/app.sqlite` (สร้างอัตโนมัติเมื่อรันครั้งแรก)
- foreign keys เปิดใช้งาน และ migration จะถูกรันให้ครบทุกครั้งที่เชื่อม DB
- รัน migration ด้วยตัวเองได้ผ่าน
```bash
npm run migrate
```

### สคริปต์อื่น
- ตรวจสอบโค้ด JS เร็ว ๆ: `npm run lint`
- ชุดทดสอบ (อิง lint): `npm test`

## หน้าหลักที่ให้บริการ
- `/` landing/health cards พร้อมลิงก์ไปทุกหน้า
- `/customer.html` ฟอร์มลูกค้า + การเลือกสินค้า + ยืนยันออเดอร์ + ฟอร์มเช็คสถานะ
- `/admin.html` จัดการสินค้า (สร้าง/แก้ไข/สลับสถานะ)
- `/orders.html` Monitor ออเดอร์ + ฟิลเตอร์ + ปรับสถานะ/ยกเลิก + admin note
- `/delivery.html` คิวจัดส่ง + filter วัน/สถานะ + ลำดับคิว + ปรับสถานะส่งของ

## REST API (สรุปเร็ว)
ฐาน URL: `http://localhost:3000`

- **Health**
  - `GET /api/health` — ตรวจสถานะเซิร์ฟเวอร์, ไฟล์ DB, migration

- **Customers & Addresses**
  - `GET /api/customers?limit=50&q=` — ค้นหาลูกค้า
  - `GET /api/customers/:id` — รายละเอียดลูกค้า
  - `POST /api/customers` — สร้างลูกค้า `{ name, main_contact_type, main_contact_value, other_contacts?, notes? }`
  - `PATCH /api/customers/:id` — แก้ลูกค้า ฟิลด์เดียว/หลายฟิลด์
  - `GET /api/customers/:id/addresses` — ที่อยู่ของลูกค้า
  - `POST /api/customers/:id/addresses` — เพิ่มที่อยู่ `{ label?, full_address, extra_info?, latitude?, longitude? }`
  - `PATCH /api/addresses/:id` — แก้ไขที่อยู่
  - `DELETE /api/addresses/:id` — ลบที่อยู่

- **Products**
  - `GET /api/products?status=active,promotion&q=` — โหลดสินค้า (ใช้แสดงในฟอร์มลูกค้า)
  - `POST /api/products` — สร้างสินค้า `{ name, description?, base_price, status, promo_price? }`
  - `PATCH /api/products/:id` — แก้ไขข้อมูล/สถานะสินค้า

- **Orders**
  - `GET /api/orders?q=&order_status=&payment_status=&payment_method=&created_from=&created_to=&delivery_from=&delivery_to=&include_address=1` — ค้นหา/ฟิลเตอร์ออเดอร์
  - `GET /api/orders/:id` — รายละเอียด + line items
  - `GET /api/order-status?order_code=...&phone=...` — เช็คสถานะสำหรับลูกค้า (match order_code + เบอร์โทรหลัก)
  - `POST /api/orders` — สร้างออเดอร์ใหม่ (สร้าง order_code อัตโนมัติและบันทึก line items ใน transaction เดียว)
    ```json
    {
      "customer": { "name": "", "main_contact_type": "phone|line|facebook", "main_contact_value": "", "other_contacts": "{}", "notes": "" },
      "address": { "full_address": "...", "extra_info": "...", "latitude": 0, "longitude": 0 },
      "delivery_date": "2024-12-01",
      "delivery_time_slot": "morning",
      "payment_method": "transfer|promptpay|cod",
      "payment_status": "unpaid|paid|cod|refunded",
      "order_status": "pending|confirmed|preparing|out_for_delivery|delivered|cancelled",
      "items": [
        { "product_id": 1, "quantity": 2, "unit_price": 100, "discount": 0 }
      ],
      "admin_note": "..."
    }
    ```
  - `PATCH /api/orders/:id` — อัปเดตสถานะ/การชำระ/เหตุผลยกเลิก/หมายเหตุ/ลำดับจัดส่ง เช่น `{ order_status, payment_status, delivery_date, delivery_time_slot, cancel_reason_code, cancel_reason_text, admin_note, delivery_order_index }`

## PWA
- `manifest.json` + ไอคอน 192/512 px (โฟลเดอร์ `public/`)
- Service worker จะ pre-cache หน้าและ asset หลักเมื่อโหลดครั้งแรก
- ทุกหน้าโหลด `assets/js/pwa.js` เพื่อ register service worker อัตโนมัติ (ปิดได้โดยลบ `<script src="/assets/js/pwa.js"></script>`)

## การสำรอง/ลบข้อมูล
- โฟลเดอร์ `data/` เก็บไฟล์ SQLite ทั้งหมด สำรองได้ด้วยการคัดลอกไฟล์ `app.sqlite`
- เพื่อล้างข้อมูล dev: ลบไฟล์ `data/app.sqlite` แล้วรันเซิร์ฟเวอร์อีกครั้งเพื่อให้ migration สร้างใหม่

