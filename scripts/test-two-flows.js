/**
 * Independent API tests: Open & Stay vs Open & Leave / Checkout
 * Usage: NODE_ENV=development node scripts/test-two-flows.js
 */
require("dotenv").config();

const BASE = process.env.DEV_BASE_URL || "http://localhost:3000";
const API_KEY = process.env.API_KEY;

async function req(method, path, body) {
  const headers = { "Content-Type": "application/json" };
  if (path.startsWith("/api/")) headers["x-api-key"] = API_KEY;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function setupBooking(label) {
  const created = await req("POST", "/dev/create-booking");
  if (!created.ok) throw new Error(`[${label}] create-booking: ${created.data.error}`);

  const id = created.data.bookingId;
  const pi = await req("POST", `/dev/payment-intent/${id}`);
  if (!pi.ok) throw new Error(`[${label}] payment-intent: ${pi.data.error}`);

  const auth = await req("POST", `/dev/authorize/${id}`);
  if (!auth.ok) throw new Error(`[${label}] authorize: ${auth.data.error}`);

  return {
    id,
    qrToken: auth.data.booking?.qrToken,
    pin: auth.data.booking?.pin
  };
}

async function fetchBookingRow(id) {
  const supabase = require("../src/config/supabase");
  const { data, error } = await supabase.from("bookings").select("*").eq("id", id).single();
  if (error) throw new Error(`Supabase read failed: ${error.message}`);
  return data;
}

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERT FAIL: ${message}`);
}

async function testOpenAndStay() {
  console.log("\n=== TEST 1 — Open & Stay / Continue reservation ===\n");

  const { id, qrToken } = await setupBooking("STAY");
  console.log("bookingId:", id);

  const identify = await req("POST", "/api/access/locker", { qrToken });
  if (!identify.ok) throw new Error(`identify failed: ${JSON.stringify(identify.data)}`);

  assert(identify.data.identified === true, "scan must identify only");
  assert(identify.data.lockerOpened === false, "scan must not open locker");
  assert(identify.data.access === "granted", "identify must grant access");
  console.log("identify OK:", {
    lockerOpened: identify.data.lockerOpened,
    locker: identify.data.locker,
    checkInTime: identify.data.checkInTime
  });

  let row = await fetchBookingRow(id);
  assert(row.checkInTime == null, "checkInTime must be null before Open & Stay");
  assert(row.checkout_started_at == null, "checkout must not start on identify");

  const stay = await req("POST", "/api/access/stay", { bookingId: id });
  if (!stay.ok || stay.data.access === "denied") {
    throw new Error(`stay open failed: ${JSON.stringify(stay.data)}`);
  }

  assert(stay.data.lockerOpened === true, "stay must open locker");
  assert(stay.data.checkInTime, "checkInTime must be set after stay open");
  console.log("stay open OK:", {
    locker: stay.data.locker,
    checkInTime: stay.data.checkInTime,
    checkInRecorded: stay.data.checkInRecorded
  });

  row = await fetchBookingRow(id);
  const checkInAfterOpen = row.checkInTime;

  const close = await req("POST", "/simulator/api/locker/close", {
    lockerNumber: row.locker_number
  });
  if (!close.ok) throw new Error(`mock close: ${JSON.stringify(close.data)}`);

  row = await fetchBookingRow(id);
  assert(row.status === "active", `status must stay active, got ${row.status}`);
  assert(row.checkInTime === checkInAfterOpen, "checkInTime must be preserved after close");
  assert(row.checkout_started_at == null, "checkout_started_at must be null");
  assert(row.checkOutTime == null, "checkOutTime must be null");
  assert(row.paymentCapturedAt == null, "paymentCapturedAt must be null");

  console.log("✅ Open & Stay OK");
  return id;
}

async function testOpenAndLeave() {
  console.log("\n=== TEST 2 — Open & Leave / Checkout ===\n");

  const { id, qrToken } = await setupBooking("CHECKOUT");
  console.log("bookingId:", id);

  const identify = await req("POST", "/api/access/locker", { qrToken });
  if (!identify.ok) throw new Error(`identify failed: ${JSON.stringify(identify.data)}`);
  assert(identify.data.lockerOpened === false, "scan must not open locker");

  const stay = await req("POST", "/api/access/stay", { bookingId: id });
  if (!stay.ok) throw new Error(`stay (deposit setup) failed: ${JSON.stringify(stay.data)}`);

  let row = await fetchBookingRow(id);
  await req("POST", "/simulator/api/locker/close", { lockerNumber: row.locker_number });

  const pickup = await req("POST", "/api/access/pickup", { bookingId: id });
  if (!pickup.ok) throw new Error(`pickup failed (${pickup.status}): ${JSON.stringify(pickup.data)}`);
  console.log("pickup OK:", {
    locker: pickup.data.locker,
    checkoutDeadlineAt: pickup.data.checkoutDeadlineAt
  });

  row = await fetchBookingRow(id);
  assert(row.checkout_started_at, "checkout_started_at must be set after pickup");

  await req("POST", "/simulator/api/locker/close", { lockerNumber: row.locker_number });

  const finalize = await req("POST", "/api/access/finalize", { bookingId: id });
  if (!finalize.ok) {
    throw new Error(`finalize failed (${finalize.status}): ${JSON.stringify(finalize.data)}`);
  }

  row = await fetchBookingRow(id);
  assert(row.status === "closed", `status must be closed, got ${row.status}`);
  assert(row.checkOutTime, "checkOutTime must be set");
  assert(row.duration != null, "duration must be set");
  assert(row.price != null, "price must be set");
  assert(row.paymentCapturedAt, "paymentCapturedAt must be set");

  console.log("✅ Open & Leave / Checkout OK");
  console.log({
    checkOutTime: row.checkOutTime,
    duration: row.duration,
    price: row.price,
    paymentCapturedAt: row.paymentCapturedAt
  });

  return id;
}

async function main() {
  if (process.env.NODE_ENV !== "development") {
    console.error("Requires NODE_ENV=development");
    process.exit(1);
  }

  console.log("Base URL:", BASE);

  const reset = await req("POST", "/dev/reset");
  if (!reset.ok) throw new Error(`reset failed: ${reset.data.error}`);
  console.log("reset OK, deleted:", reset.data.deletedBookings);

  await testOpenAndStay();
  await testOpenAndLeave();

  console.log("\n=== BOTH FLOWS PASSED ===\n");
}

main().catch((err) => {
  console.error("\n❌", err.message);
  process.exit(1);
});
