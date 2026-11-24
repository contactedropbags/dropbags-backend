const apiProvider = require("./keynius/providers/keyniusApiProvider");
const mockProvider = require("./keynius/providers/mockKeyniusProvider");

function getProviderName() {
  return (process.env.KEYNIUS_PROVIDER || "api").toLowerCase();
}

function getProvider() {
  return getProviderName() === "mock" ? mockProvider : apiProvider;
}

async function openLocker(lockerNumber) {
  return getProvider().openLocker(lockerNumber);
}

function getMockProvider() {
  if (getProviderName() !== "mock") {
    return null;
  }
  return mockProvider;
}

module.exports = {
  openLocker,
  getProviderName,
  getMockProvider
};
