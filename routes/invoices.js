const express = require('express');
const { generateInvoice, getInvoiceByNumber } = require('../controllers/invoiceController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

router.get('/:saleId', generateInvoice);
router.get('/number/:invoiceNumber', getInvoiceByNumber);

module.exports = router;