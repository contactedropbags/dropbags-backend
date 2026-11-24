const path = require("path");
const express = require("express");
const router = express.Router();

const mockAkuvox = require("../services/accessControl/providers/mockProvider");
const keyniusService = require("../services/keyniusService");
const { getProviderName: getAccessProviderName } = require("../services/accessControl/accessControlService");
const { resetDevEnvironment } = require("../services/devResetService");

function ensureDevSimulator(req, res, next) {
  if (process.env.NODE_ENV !== "development") {
    return res.status(404).json({ error: "Not found" });
  }

  if (process.env.SIMULATOR_ENABLED === "false") {
    return res.status(403).json({ error: "Simulator disabled" });
  }

  next();
}

router.use(ensureDevSimulator);

router.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../simulator/index.html"));
});

router.get("/api/config", (req, res) => {
  const accessProvider = getAccessProviderName();
  const keyniusProvider = keyniusService.getProviderName();

  if (accessProvider !== "mock" || keyniusProvider !== "mock") {
    return res.status(403).json({
      error: "Simulator requires ACCESS_CONTROL_PROVIDER=mock and KEYNIUS_PROVIDER=mock",
      accessProvider,
      keyniusProvider
    });
  }

  res.json({
    environment: "TEST",
    baseUrl: `${req.protocol}://${req.get("host")}`,
    apiKey: process.env.API_KEY || "",
    accessProvider,
    keyniusProvider,
    doorAutoCloseMs: Number(process.env.MOCK_DOOR_AUTO_CLOSE_MS || 5000)
  });
});

router.get("/api/hardware-state", (req, res) => {
  const mockKeynius = keyniusService.getMockProvider();
  const lockerNumber = Number(req.query.lockerNumber || 0);

  res.json({
    door: mockAkuvox.getDoorStatus(),
    locker: lockerNumber
      ? mockKeynius?.getLockerStatus(lockerNumber) || { status: "UNKNOWN" }
      : null,
    lockers: mockKeynius?.getAllLockerStatuses() || []
  });
});

router.post("/api/mock/akuvox-mode", (req, res) => {
  const { mode } = req.body;
  mockAkuvox.setFailureMode(mode === "normal" ? null : mode);
  res.json({ success: true, failureMode: mockAkuvox.getFailureMode(), door: mockAkuvox.getDoorStatus() });
});

router.post("/api/mock/keynius-mode", (req, res) => {
  const mockKeynius = keyniusService.getMockProvider();
  if (!mockKeynius) {
    return res.status(400).json({ error: "KEYNIUS_PROVIDER is not mock" });
  }

  const { mode } = req.body;
  mockKeynius.setFailureMode(mode === "normal" ? null : mode);
  res.json({ success: true, failureMode: mockKeynius.getFailureMode() });
});

router.post("/api/locker/close", (req, res) => {
  const mockKeynius = keyniusService.getMockProvider();
  if (!mockKeynius) {
    return res.status(400).json({ error: "KEYNIUS_PROVIDER is not mock" });
  }

  const lockerNumber = req.body.lockerNumber;
  if (!lockerNumber) {
    return res.status(400).json({ error: "lockerNumber is required" });
  }

  const result = mockKeynius.closeLocker(lockerNumber);
  res.json(result);
});

router.post("/api/locker/deposit", (req, res) => {
  const mockKeynius = keyniusService.getMockProvider();
  if (!mockKeynius) {
    return res.status(400).json({ error: "KEYNIUS_PROVIDER is not mock" });
  }

  const lockerNumber = req.body.lockerNumber;
  if (!lockerNumber) {
    return res.status(400).json({ error: "lockerNumber is required" });
  }

  const result = mockKeynius.simulateDeposit(lockerNumber);
  res.json(result);
});

router.post("/api/locker/release", (req, res) => {
  const mockKeynius = keyniusService.getMockProvider();
  if (!mockKeynius) {
    return res.status(400).json({ error: "KEYNIUS_PROVIDER is not mock" });
  }

  const lockerNumber = req.body.lockerNumber;
  if (!lockerNumber) {
    return res.status(400).json({ error: "lockerNumber is required" });
  }

  const result = mockKeynius.releaseLocker(lockerNumber);
  res.json(result);
});

router.post("/api/reset", async (req, res) => {
  try {
    mockAkuvox.resetDoor();
    keyniusService.getMockProvider()?.resetAll();
    const result = await resetDevEnvironment();
    res.json({ ...result, hardwareReset: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
