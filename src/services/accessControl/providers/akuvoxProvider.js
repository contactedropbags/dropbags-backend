const axios = require("axios");

/**
 * Akuvox HTTP API — relay trigger
 * POST http://{device-ip}/api/relay/trig
 * Body: { target: "relay", action: "trig", data: { mode, num, level, delay } }
 * Auth: Basic (per device HTTP API settings)
 */
async function openRelay(options = {}) {
  const baseUrl = process.env.AKUVOX_BASE_URL;
  const username = process.env.AKUVOX_USERNAME;
  const password = process.env.AKUVOX_PASSWORD;

  if (!baseUrl) {
    throw new Error("AKUVOX_BASE_URL is not configured");
  }

  const mode = Number(options.mode ?? process.env.AKUVOX_RELAY_MODE ?? 1);
  const num = Number(options.num ?? process.env.AKUVOX_RELAY_NUM ?? 1);
  const level = Number(options.level ?? process.env.AKUVOX_RELAY_LEVEL ?? 1);
  const delay = Number(options.delay ?? process.env.AKUVOX_RELAY_DELAY ?? 5);

  const url = `${baseUrl.replace(/\/$/, "")}/api/relay/trig`;
  const payload = {
    target: "relay",
    action: "trig",
    data: { mode, num, level, delay }
  };

  console.log("[AccessControl] Akuvox relay trig", { url, mode, num, level, delay });

  const requestConfig = {
    headers: { "Content-Type": "application/json" },
    timeout: 10000
  };

  if (username && password) {
    requestConfig.auth = { username, password };
  }

  const response = await axios.post(url, payload, requestConfig);
  const body = response.data;

  if (body?.retcode !== 0) {
    const error = new Error(body?.message || "Akuvox relay trigger failed");
    error.akuvox = body;
    throw error;
  }

  console.log("[AccessControl] Akuvox relay opened", { retcode: body.retcode, action: body.action });

  return body;
}

module.exports = { openRelay };
