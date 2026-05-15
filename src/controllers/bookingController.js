const { saveBooking } = require("../services/bookingService");

exports.createBooking = async (req, res) => {
  console.log("[DIAG] createBooking called", {
    email: req.body?.email,
    phone: req.body?.phone,
    bookingId: req.body?.bookingId,
    paymentIntentId: req.body?.paymentIntentId,
    stack: new Error().stack?.split("\n").slice(1, 4).join(" | ")
  });

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

    const arrival = arrivalDate ? new Date(arrivalDate) : new Date();

    const expiresAt = new Date(
      arrival.getTime() + 24 * 60 * 60 * 1000
    );

    const arrivalWindowEnd = expiresAt;

    const bookingData = await saveBooking({
      email,
      locker_number: null,
      phone,
      first_name: firstName,
      last_name: lastName,
      arrival_date: arrivalDate,
      arrival_time: arrivalTime,
      arrivalWindowEnd,
      expiresAt,
      status: "pending"
    });

    return res.status(201).json({
    success: true,
    booking: {
    id: bookingData.id,
    status: bookingData.status,
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