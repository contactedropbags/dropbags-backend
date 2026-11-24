const TOTAL_LOCKERS = 28;

let failureMode = null;

const lockers = new Map(
  Array.from({ length: TOTAL_LOCKERS }, (_, i) => [
    i + 1,
    { number: i + 1, status: "AVAILABLE", lastAction: null, updatedAt: null }
  ])
);

function nowIso() {
  return new Date().toISOString();
}

function setFailureMode(mode) {
  failureMode = mode || null;
}

function getFailureMode() {
  return failureMode;
}

function getLockerStatus(lockerNumber) {
  const locker = lockers.get(Number(lockerNumber));
  if (!locker) {
    return { number: lockerNumber, status: "UNKNOWN" };
  }
  return { ...locker };
}

function getAllLockerStatuses() {
  return Array.from(lockers.values());
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function openLocker(lockerNumber) {
  const num = Number(lockerNumber);
  const locker = lockers.get(num);

  if (!locker) {
    return { success: false, status: "UNKNOWN", error: "LOCKER_NOT_FOUND" };
  }

  if (failureMode === "timeout") {
    await delay(8000);
    locker.status = "UNKNOWN";
    locker.lastAction = "TIMEOUT";
    locker.updatedAt = nowIso();
    return { success: false, status: "TIMEOUT", error: "MOCK_KEYNIUS_TIMEOUT" };
  }

  if (failureMode === "error") {
    locker.status = "ERROR";
    locker.lastAction = "ERROR";
    locker.updatedAt = nowIso();
    return { success: false, status: "FAILED", error: "MOCK_KEYNIUS_ERROR" };
  }

  locker.status = "OPEN";
  locker.lastAction = "OPEN";
  locker.updatedAt = nowIso();

  console.log("[Keynius][MOCK] Locker opened", { lockerNumber: num });

  return {
    success: true,
    status: "SUCCESS",
    data: { lockerNumber: num, mock: true }
  };
}

async function closeLocker(lockerNumber) {
  const num = Number(lockerNumber);
  const locker = lockers.get(num);

  if (!locker) {
    return { success: false, status: "UNKNOWN", error: "LOCKER_NOT_FOUND" };
  }

  locker.status = locker.status === "OCCUPIED" ? "CLOSED" : "CLOSED";
  locker.lastAction = "CLOSE";
  locker.updatedAt = nowIso();

  console.log("[Keynius][MOCK] Locker closed", { lockerNumber: num });

  return { success: true, status: "SUCCESS", data: { lockerNumber: num, mock: true } };
}

function simulateDeposit(lockerNumber) {
  const num = Number(lockerNumber);
  const locker = lockers.get(num);

  if (!locker) {
    return { success: false, status: "UNKNOWN" };
  }

  locker.status = "OCCUPIED";
  locker.lastAction = "DEPOSIT";
  locker.updatedAt = nowIso();

  console.log("[Keynius][MOCK] Bag deposited", { lockerNumber: num });

  return { success: true, status: "SUCCESS", locker: getLockerStatus(num) };
}

function releaseLocker(lockerNumber) {
  const num = Number(lockerNumber);
  const locker = lockers.get(num);

  if (!locker) {
    return { success: false, status: "UNKNOWN" };
  }

  locker.status = "AVAILABLE";
  locker.lastAction = "RELEASE";
  locker.updatedAt = nowIso();

  return { success: true, status: "SUCCESS", locker: getLockerStatus(num) };
}

function resetAll() {
  failureMode = null;
  for (const locker of lockers.values()) {
    locker.status = "AVAILABLE";
    locker.lastAction = "RESET";
    locker.updatedAt = nowIso();
  }
}

module.exports = {
  openLocker,
  closeLocker,
  simulateDeposit,
  releaseLocker,
  getLockerStatus,
  getAllLockerStatuses,
  setFailureMode,
  getFailureMode,
  resetAll
};
