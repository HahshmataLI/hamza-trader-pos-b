const express = require('express');
const {
    createProduct,
    getProducts,
    getProduct,
    getProductByBarcode, // Add this
    updateProduct,
    getLowStockProducts,
    getProductsByCategory,
    deleteProduct,
    updateStock
} = require('../controllers/productController');
const { protect, authorize } = require('../middleware/auth');
const { uploadProductImages, handleUploadError } = require('../middleware/upload');

const router = express.Router();

router.use(protect);

router.route('/')
    .post(authorize('admin', 'manager'), uploadProductImages, handleUploadError, createProduct)
    .get(getProducts);

// Add barcode lookup route - place BEFORE /:id to avoid conflicts
router.get('/barcode/:barcode', getProductByBarcode);

router.get('/low-stock', getLowStockProducts);
router.get('/category/:categoryId', getProductsByCategory);

router.route('/:id')
    .get(getProduct)
    .put(authorize('admin', 'manager'), uploadProductImages, handleUploadError, updateProduct)
    .delete(authorize('admin', 'manager'), deleteProduct);

router.patch('/:id/stock', authorize('admin', 'manager'), updateStock);

module.exports = router;