/**
 * Mock access control provider — no HTTP calls, for local development.
 */
const DOOR_AUTO_CLOSE_MS = Number(process.env.MOCK_DOOR_AUTO_CLOSE_MS || 5000);

let doorState = "LOCKED";
let lastResult = "SUCCESS";
let failureMode = null;
let autoCloseTimer = null;
let lastOpenedAt = null;

function clearAutoCloseTimer() {
  if (autoCloseTimer) {
    clearTimeout(autoCloseTimer);
    autoCloseTimer = null;
  }
}

function scheduleAutoClose() {
  clearAutoCloseTimer();
  autoCloseTimer = setTimeout(() => {
    doorState = "LOCKED";
    console.log("[AccessControl][MOCK] Door auto-closed");
  }, DOOR_AUTO_CLOSE_MS);
}

function getDoorStatus() {
  return {
    state: doorState,
    lastResult,
    failureMode,
    lastOpenedAt,
    autoCloseMs: DOOR_AUTO_CLOSE_MS
  };
}

function setFailureMode(mode) {
  failureMode = mode || null;
}

function getFailureMode() {
  return failureMode;
}

function resetDoor() {
  clearAutoCloseTimer();
  doorState = "LOCKED";
  lastResult = "SUCCESS";
  failureMode = null;
  lastOpenedAt = null;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function openRelay(options = {}) {
  const mode = Number(options.mode ?? process.env.AKUVOX_RELAY_MODE ?? 1);
  const num = Number(options.num ?? process.env.AKUVOX_RELAY_NUM ?? 1);
  const level = Number(options.level ?? process.env.AKUVOX_RELAY_LEVEL ?? 1);
  const delaySec = Number(options.delay ?? process.env.AKUVOX_RELAY_DELAY ?? 5);

  if (failureMode === "timeout") {
    doorState = "UNKNOWN";
    lastResult = "TIMEOUT";
    await delay(8000);
    const error = new Error("MOCK_AKUVOX_TIMEOUT");
    error.mockStatus = "TIMEOUT";
    throw error;
  }

  if (failureMode === "error") {
    doorState = "ERROR";
    lastResult = "FAILED";
    const error = new Error("MOCK_AKUVOX_ERROR");
    error.mockStatus = "FAILED";
    throw error;
  }

  doorState = "OPEN";
  lastResult = "SUCCESS";
  lastOpenedAt = new Date().toISOString();
  scheduleAutoClose();

  console.log("[AccessControl][MOCK] Door opened", {
    mode,
    num,
    level,
    delay: delaySec,
    state: doorState
  });

  return {
    retcode: 0,
    action: "trig",
    message: "OK",
    status: "SUCCESS",
    mock: true
  };
}

module.exports = {
  openRelay,
  getDoorStatus,
  setFailureMode,
  getFailureMode,
  resetDoor
};
