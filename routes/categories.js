const express = require('express');
const {
    getCategories,
    getCategory,
    createCategory,
    updateCategory,
    getCategoryAttributes,
    getCategoryTree,
    getCategoriesByType
} = require('../controllers/categoryController');
const { protect, authorize } = require('../middleware/auth');
const { uploadCategoryImage, handleUploadError } = require('../middleware/upload');

const router = express.Router();

router.use(protect);

router.route('/')
    .get(getCategories)
    .post(authorize('admin', 'manager'), uploadCategoryImage, handleUploadError, createCategory);

router.get('/tree', getCategoryTree);
router.get('/type/:type', getCategoriesByType);
router.get('/:id/attributes', getCategoryAttributes);

router.route('/:id')
    .get(getCategory)
    .put(authorize('admin', 'manager'), uploadCategoryImage, handleUploadError, updateCategory);

module.exports = router;