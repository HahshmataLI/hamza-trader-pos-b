// routes/saleRoutes.js - Updated with new endpoints
const express = require('express');
const {
    createSale,
    getSales,
    getSale,
    getSalesAnalytics,
    getPeriodAnalytics,
    returnSale,
    cancelSale,
    lookupProductByBarcode,
    getTodaySales,
    markAsPaid
} = require('../controllers/saleController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

router.route('/')
    .post(createSale)
    .get(getSales);

router.get('/analytics', getSalesAnalytics);
router.get('/period-analytics', getPeriodAnalytics);
router.post('/:saleId/return', returnSale);
router.post('/:saleId/cancel', cancelSale);
router.patch('/:saleId/mark-paid', markAsPaid);
router.get('/:id', getSale);
router.get('/lookup/barcode/:barcode', lookupProductByBarcode);
router.get('/today', getTodaySales);

module.exports = router;