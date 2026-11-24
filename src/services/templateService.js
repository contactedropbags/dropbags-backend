const fs = require('fs');
const path = require('path');

async function buildBookingTemplate(data) {

  const templatePath = path.join(
    __dirname,
    '../templates/dropbags-premium-email.html'
  );

  let html = fs.readFileSync(templatePath, 'utf8');

  html = html.replace(
    /{{qrCodeUrl}}/g,
    data.qrCodeUrl
  );

  html = html.replace(
    /{{pinCode}}/g,
    data.pinCode
  );

  return html;
}

module.exports = {
  buildBookingTemplate
};