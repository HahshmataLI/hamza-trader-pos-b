const express = require('express');
const {
    createSupplier,
    getSuppliers,
    getSupplier,
    updateSupplier,
    deleteSupplier
} = require('../controllers/supplierController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

router.route('/')
    .post(authorize('admin', 'manager'), createSupplier)
    .get(getSuppliers);

router.route('/:id')
    .get(getSupplier)
    .put(authorize('admin', 'manager'), updateSupplier)
    .delete(authorize('admin', 'manager'), deleteSupplier);

module.exports = router;