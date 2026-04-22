const { generateQrToken } = require("../services/qrService");
const { saveBooking } = require("../services/bookingService");

exports.createBooking = async (req, res) => {
  try {

    console.log("REQ BODY:", req.body);

    console.log("EMAIL:", email);
    console.log("PHONE:", phone);  

    const { email, phone, durationHours = 3, arrivalDate } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email required" });
    }

    const qrToken = generateQrToken();

    const arrival = arrivalDate ? new Date(arrivalDate) : new Date();

    const expiresAt = new Date(
      arrival.getTime() + durationHours * 60 * 60 * 1000
    );

    const arrivalWindowEnd = expiresAt;

    const booking = await saveBooking({
      qrToken,
      email,
      locker_number: null,
      phone,
      arrivalTime: arrivalDate,
      arrivalWindowEnd,
      expiresAt,
      status: "reserved"
    });

    return res.status(201).json({
      qrToken
    });

  } catch (error) {

    console.error(error);

    return res.status(500).json({
      error: "Failed to create booking"
    });

  }
};