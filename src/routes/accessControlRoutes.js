const express = require("express");
const router = express.Router();
const { validateAccess } = require("../controllers/accessControlController");

router.post("/validate", validateAccess);

module.exports = router;
