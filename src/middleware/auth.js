/**
 * Middleware de sécurité pour protéger les routes sensibles de l'API
 * 
 * Fonctionnement :
 * - Vérifie la présence d'une clé API dans les headers
 * - Compare avec la clé définie dans les variables d'environnement
 * - Refuse l'accès si la clé est absente ou incorrecte
 * 
 * Utilisation :
 * - À appliquer sur toutes les routes critiques (accès, admin)
 * - Permet d'empêcher tout accès externe non autorisé
 */

const API_KEY = process.env.API_KEY;

module.exports = (req, res, next) => {
  // Récupération de la clé envoyée dans les headers
  const key = req.headers['x-api-key'];

  console.log("API KEY ENV:", API_KEY);
  console.log("API KEY HEADER:", req.headers['x-api-key']);

  // Vérification de la clé
  if (!key || key !== API_KEY) {
    return res.status(403).json({
      success: false,
      error: 'Unauthorized access'
    });
  }

  // Si la clé est valide → continuer
  next();
};