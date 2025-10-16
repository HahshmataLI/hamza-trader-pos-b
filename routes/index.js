const express = require('express');
const authRoutes = require('./auth');
const categoryRoutes = require('./categories');
const productRoutes = require('./products');
const saleRoutes = require('./sales');
const customerRoutes = require('./customers');
const purchaseRoutes = require('./purchases');
const supplierRoutes = require('./suppliers');
const dashboardRoutes = require('./dashboard');
const invoiceRoutes = require('./invoices');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/categories', categoryRoutes);
router.use('/products', productRoutes);
router.use('/sales', saleRoutes);
router.use('/customers', customerRoutes);
router.use('/purchases', purchaseRoutes);
router.use('/suppliers', supplierRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/invoices', invoiceRoutes);

module.exports = router;
