const accessControlService = require("../services/accessControl/accessControlService");
const accessLogService = require("../services/accessLogService");

function resolveCredentials(body) {
  const { qrToken, pin, token } = body;
  return {
    qrToken: qrToken || token || null,
    pin: pin || null
  };
}

function mapReasonToStatusCode(reason) {
  if (reason === "BOOKING_NOT_FOUND") return 404;

  if (
    reason === "BOOKING_EXPIRED" ||
    reason === "BOOKING_CLOSED" ||
    reason === "BOOKING_NOT_AUTHORIZED" ||
    reason === "BOOKING_NOT_PAID" ||
    reason === "INVALID_PIN"
  ) {
    return 403;
  }

  return 400;
}

async function logAndRespond(req, res, source) {
  const credentials = resolveCredentials(req.body);
  const method = accessLogService.resolveMethod(credentials);

  console.log(`[AccessControl] POST ${source}`, {
    hasQrToken: Boolean(credentials.qrToken),
    hasPin: Boolean(credentials.pin)
  });

  try {
    const result = await accessControlService.validateAndOpenDoor(credentials);

    await accessLogService.logAccessAttempt({
      bookingId: result.bookingId || result.booking?.id || null,
      method,
      allowed: result.allowed,
      reason: result.reason || null,
      doorOpened: Boolean(result.doorOpened),
      source
    });

    if (!result.allowed) {
      return res.status(mapReasonToStatusCode(result.reason)).json({
        access: "denied",
        reason: result.reason,
        bookingId: result.bookingId || null
      });
    }

    return res.json({
      access: "granted",
      doorOpened: true,
      bookingId: result.bookingId,
      provider: result.provider
    });
  } catch (error) {
    console.error("[AccessControl] door access error:", error);

    await accessLogService.logAccessAttempt({
      bookingId: null,
      method,
      allowed: false,
      reason: "SERVER_ERROR",
      doorOpened: false,
      source
    });

    return res.status(500).json({
      access: "denied",
      reason: "SERVER_ERROR"
    });
  }
}

async function validateAccess(req, res) {
  return logAndRespond(req, res, "access/validate");
}

async function openDoor(req, res) {
  return logAndRespond(req, res, "api/access/open");
}

module.exports = { validateAccess, openDoor };
