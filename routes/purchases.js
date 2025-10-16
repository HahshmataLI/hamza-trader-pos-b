const express = require('express');
const {
    createPurchase,
    getPurchases,
    getPurchase,
    updatePurchaseStatus,
    updatePurchase,
    deletePurchase,
    debugStock
} = require('../controllers/purchaseController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

router.route('/')
    .post(authorize('admin', 'manager'), createPurchase)
    .get(getPurchases);

router.route('/:id')
    .get(getPurchase)
    .put(authorize('admin', 'manager'), updatePurchase)
    .delete(authorize('admin', 'manager'), deletePurchase);

router.patch('/:id/status', authorize('admin', 'manager'), updatePurchaseStatus);
router.get('/:id/debug-stock', debugStock);

module.exports = router;