const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('../config/cloudinary'); // make sure you created config/cloudinary.js

// Configure Cloudinary storage
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'products', // folder in Cloudinary
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
        transformation: [{ width: 800, height: 800, crop: 'limit' }], // optional resizing
    },
});

// Multer setup
const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
});

// Export for product images (multiple)
exports.uploadProductImages = upload.array('images', 5);

// Export for category image (single)
exports.uploadCategoryImage = upload.single('image');

// Error handling middleware
exports.handleUploadError = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                error: 'File too large. Maximum size is 10MB',
            });
        }
        return res.status(400).json({
            success: false,
            error: err.message,
        });
    } else if (err) {
        // Other errors (e.g., wrong file type)
        return res.status(400).json({
            success: false,
            error: err.message,
        });
    }
    next();
};