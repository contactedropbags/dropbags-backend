const accessControlService = require("../services/accessControl/accessControlService");

async function validateAccess(req, res) {
  try {
    const { qrToken, pin, token } = req.body;
    const resolvedToken = qrToken || token;

    console.log("[AccessControl] POST /access/validate", {
      hasQrToken: Boolean(resolvedToken),
      hasPin: Boolean(pin)
    });

    const result = await accessControlService.validateAndOpenDoor({
      qrToken: resolvedToken,
      pin
    });

    if (!result.allowed) {
      const statusCode =
        result.reason === "BOOKING_NOT_FOUND" ? 404 :
        result.reason === "BOOKING_EXPIRED" || result.reason === "BOOKING_NOT_AUTHORIZED" ? 403 :
        400;

      return res.status(statusCode).json({
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
    console.error("[AccessControl] validate error:", error);
    return res.status(500).json({
      access: "denied",
      reason: "SERVER_ERROR"
    });
  }
}

module.exports = { validateAccess };
