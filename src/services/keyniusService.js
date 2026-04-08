const axios = require("axios")

const KEYNIUS_API = process.env.KEYNIUS_API
const KEYNIUS_TOKEN = process.env.KEYNIUS_TOKEN

async function openLocker(lockerNumber) {

  try {

    const response = await axios.post(
      `${KEYNIUS_API}/lockers/${lockerNumber}/open`,
      {},
      {
        headers: {
          Authorization: `Bearer ${KEYNIUS_TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    )

    return {
      success: true,
      data: response.data
    }

  } catch (error) {

    console.error("Keynius error:", error.message)

    return {
      success: false,
      error: "LOCKER_OPEN_FAILED",
      details: error.message
    }

  }

}

module.exports = {
  openLocker
}