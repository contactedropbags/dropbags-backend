function generatePin(length = 4) {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

module.exports = { generatePin };