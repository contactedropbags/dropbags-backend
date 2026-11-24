const fs = require("fs");
const path = require("path");

const BASE_URL = process.env.DEV_BASE_URL || "http://localhost:3000";
const STATE_FILE = path.join(__dirname, "../../.dev-state.json");

function ensureLocalDev() {
  if (process.env.NODE_ENV !== "development") {
    console.error("❌ Dev scripts require NODE_ENV=development");
    process.exit(1);
  }
}

function logOk(message) {
  console.log(`✅ ${message}`);
}

function logFail(message) {
  console.log(`❌ ${message}`);
}

function fail(message) {
  logFail(message);
  process.exit(1);
}

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveState(partial) {
  const next = { ...loadState(), ...partial, updatedAt: new Date().toISOString() };
  fs.writeFileSync(STATE_FILE, JSON.stringify(next, null, 2));
  return next;
}

function getBookingId() {
  const fromArg = process.argv[2];
  if (fromArg) {
    return fromArg;
  }

  const { bookingId } = loadState();
  if (!bookingId) {
    fail("No bookingId found. Run: npm run booking");
  }

  return bookingId;
}

async function devPost(routePath) {
  const url = `${BASE_URL}${routePath}`;

  let response;

  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    fail(`Cannot reach ${BASE_URL}. Start the server with: npm run dev (${error.message})`);
  }

  let data = {};

  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    fail(data.error || data.message || `${routePath} failed (${response.status})`);
  }

  return data;
}

module.exports = {
  BASE_URL,
  ensureLocalDev,
  logOk,
  logFail,
  fail,
  loadState,
  saveState,
  getBookingId,
  devPost
};
