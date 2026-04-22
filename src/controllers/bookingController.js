const { generateQrToken } = require("../services/qrService");
const { saveBooking } = require("../services/bookingService");

exports.createBooking = async (req, res) => {
  try {

    const { 
      email, 
      phone, 
      arrivalDate,
      arrivalTime,
      firstName,
      lastName
   } = req.body;

    console.log("REQ BODY:", req.body);

    console.log("EMAIL:", email);
    console.log("PHONE:", phone);  

  if (!email) {
      return res.status(400).json({ error: "Email required" });
    }

    const qrToken = generateQrToken();

    const arrival = arrivalDate ? new Date(arrivalDate) : new Date();

    const expiresAt = new Date(
      arrival.getTime() + 24 * 60 * 60 * 1000
    );

    const arrivalWindowEnd = expiresAt;

    const bookingData = await saveBooking({
      qrToken,
      email,
      locker_number: null,
      phone,
      first_name: firstName,
      last_name: lastName,
      arrival_date: arrivalDate,
      arrival_time: arrivalTime,
      arrivalWindowEnd,
      expiresAt,
      status: "reserved"
    });

    return res.status(201).json({
    success: true,
    booking: {
    id: bookingData.id,
    pin: bookingData.pin,
    qrCode: bookingData.qr_url, // ou qrCode selon ton service
    locker: bookingData.locker_number,
    email: bookingData.email
    }
   });

  } catch (error) {

    console.error(error);

    return res.status(500).json({
      error: "Failed to create booking"
    });

  }
};