const express = require('express');
const {
    createSale,
    getSales,
    getSale,
    getSalesAnalytics,
    returnSale,
    cancelSale,
    lookupProductByBarcode,
    getTodaySales 
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
router.get('/lookup/barcode/:barcode', lookupProductByBarcode);
router.get('/today', getTodaySales);
module.exports = router;