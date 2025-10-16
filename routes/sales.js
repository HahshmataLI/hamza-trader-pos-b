const express = require('express');
const {
    createSale,
    getSales,
    getSale,
    getSalesAnalytics,
    returnSale,
    cancelSale
} = require('../controllers/saleController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

router.route('/')
    .post(createSale)
    .get(getSales);

router.get('/analytics', getSalesAnalytics);
router.post('/:saleId/return', returnSale);
router.post('/:saleId/cancel', cancelSale);
router.get('/:id', getSale);

module.exports = router;