const Product = require('../models/Product');
const Category = require('../models/Category');
const imageService = require('../services/imageService');
const barcodeService = require('../services/barcodeService');

// Helper function to generate unique barcode
const generateUniqueBarcode = async () => {
    let barcode;
    let isUnique = false;
    let attempts = 0;
    const maxAttempts = 10;

    while (!isUnique && attempts < maxAttempts) {
        barcode = barcodeService.generateBarcode();
        const existingProduct = await Product.findOne({ barcode });
        if (!existingProduct) {
            isUnique = true;
        }
        attempts++;
    }

    if (!isUnique) {
        throw new Error('Unable to generate unique barcode');
    }

    return barcode;
};

exports.createProduct = async (req, res) => {
    try {
        // Uploads from Cloudinary via multer
        const images = req.files ? req.files.map(file => file.path) : [];

        const product = await Product.create({
            name: req.body.name,
            sku: req.body.sku,
            barcode: req.body.barcode || null,
            category: req.body.category,
            costPrice: req.body.costPrice,
            mrp: req.body.mrp,
            minSalePrice: req.body.minSalePrice,
            stock: req.body.stock || 0,
            minStockLevel: req.body.minStockLevel || 5,
            description: req.body.description || '',
            attributes: req.body.attributes || {},
            images,
            isActive: req.body.isActive !== undefined ? req.body.isActive : true
        });

        res.status(201).json({
            success: true,
            product
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: error.message });
    }
};

exports.getProducts = async (req, res, next) => {
    try {
        const { category, search, page = 1, limit = 50, lowStock } = req.query;

        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);

        let query = { isActive: true };

        // Filter by category
        if (category && category !== 'all') {
            query.category = category;
        }

        // Optimized search - prioritize barcode for faster lookups
        if (search && search.trim()) {
            const searchRegex = new RegExp(search.trim(), 'i');
            
            // Check if search looks like a barcode (alphanumeric, specific format)
            const isBarcodeSearch = /^[A-Z0-9-]{8,}$/i.test(search.trim());
            
            if (isBarcodeSearch) {
                // Prioritize barcode search for faster results
                query.$or = [
                    { barcode: searchRegex },
                    { sku: searchRegex },
                    { name: searchRegex }
                ];
            } else {
                query.$or = [
                    { name: searchRegex },
                    { sku: searchRegex },
                    { barcode: searchRegex }
                ];
            }
        }

        // Low stock filter
        if (lowStock === 'true') {
            query.$expr = { $lte: ['$stock', '$minStockLevel'] };
        }

        // Run queries in parallel for better performance
        const [products, total, inventorySummary] = await Promise.all([
            Product.find(query)
                .populate('category', 'name')
                .select('-__v')
                .sort({ createdAt: -1 })
                .skip((pageNum - 1) * limitNum)
                .limit(limitNum)
                .lean(),

            Product.countDocuments(query),

            Product.aggregate([
                { $match: query },
                {
                    $group: {
                        _id: null,
                        totalProducts: { $sum: 1 },
                        totalStockValue: { $sum: { $multiply: ['$stock', '$costPrice'] } },
                        lowStockCount: {
                            $sum: {
                                $cond: [{ $lte: ['$stock', '$minStockLevel'] }, 1, 0]
                            }
                        },
                        outOfStockCount: {
                            $sum: {
                                $cond: [{ $eq: ['$stock', 0] }, 1, 0]
                            }
                        }
                    }
                }
            ])
        ]);

        res.json({
            success: true,
            data: products,
            summary: inventorySummary[0] || {
                totalProducts: 0,
                totalStockValue: 0,
                lowStockCount: 0,
                outOfStockCount: 0
            },
            pagination: {
                currentPage: pageNum,
                totalPages: Math.ceil(total / limitNum),
                totalProducts: total,
                hasNextPage: pageNum < Math.ceil(total / limitNum),
                hasPrevPage: pageNum > 1
            }
        });

    } catch (error) {
        next(error);
    }
};

exports.getProduct = async (req, res, next) => {
    try {
        const product = await Product.findById(req.params.id)
            .populate('category', 'name level attributes')
            .lean();

        if (!product) {
            return res.status(404).json({
                success: false,
                error: 'Product not found'
            });
        }

        res.json({
            success: true,
            data: product
        });

    } catch (error) {
        next(error);
    }
};

exports.getProductByBarcode = async (req, res, next) => {
    try {
        const { barcode } = req.params;
        
        // Format barcode for consistent lookup
        const formattedBarcode = barcodeService.formatBarcode(barcode);

        const product = await Product.findOne({ 
            barcode: formattedBarcode,
            isActive: true 
        })
        .populate('category', 'name')
        .lean();

        if (!product) {
            return res.status(404).json({
                success: false,
                error: 'Product not found with this barcode'
            });
        }

        // Log for audit (optional)
        console.log(`Product found by barcode: ${formattedBarcode}`);

        res.json({
            success: true,
            data: product
        });

    } catch (error) {
        next(error);
    }
};

exports.updateProduct = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) {
            return res.status(404).json({ success: false, error: 'Product not found' });
        }

        // Update fields if present
        product.name = req.body.name || product.name;
        product.sku = req.body.sku || product.sku;
        product.barcode = req.body.barcode !== undefined ? req.body.barcode : product.barcode;
        product.category = req.body.category || product.category;
        product.costPrice = req.body.costPrice || product.costPrice;
        product.mrp = req.body.mrp || product.mrp;
        product.minSalePrice = req.body.minSalePrice || product.minSalePrice;
        product.stock = req.body.stock !== undefined ? req.body.stock : product.stock;
        product.minStockLevel = req.body.minStockLevel || product.minStockLevel;
        product.description = req.body.description || product.description;
        product.attributes = req.body.attributes || product.attributes;
        product.isActive = req.body.isActive !== undefined ? req.body.isActive : product.isActive;

        // If new images uploaded, replace the array
        if (req.files && req.files.length > 0) {
            product.images = req.files.map(file => file.path);
        }

        await product.save();

        res.status(200).json({
            success: true,
            product
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: error.message });
    }
};

exports.deleteProduct = async (req, res, next) => {
    try {
        const product = await Product.findById(req.params.id);

        if (!product) {
            return res.status(404).json({
                success: false,
                error: 'Product not found'
            });
        }

        // Soft delete - deactivate product
        product.isActive = false;
        await product.save();

        // Optional: Delete images (uncomment if you want to free up space)
        // if (product.images && product.images.length > 0) {
        //     await imageService.deleteMultipleImages(product.images);
        // }

        res.json({
            success: true,
            message: 'Product deactivated successfully'
        });

    } catch (error) {
        next(error);
    }
};

exports.getLowStockProducts = async (req, res, next) => {
    try {
        const lowStockProducts = await Product.find({
            $expr: { $lte: ['$stock', '$minStockLevel'] },
            isActive: true
        })
        .populate('category', 'name')
        .select('name sku barcode stock minStockLevel costPrice mrp images')
        .sort({ stock: 1 })
        .lean();

        res.json({
            success: true,
            data: lowStockProducts,
            count: lowStockProducts.length
        });

    } catch (error) {
        next(error);
    }
};

exports.getProductsByCategory = async (req, res, next) => {
    try {
        const { categoryId } = req.params;
        const { page = 1, limit = 50 } = req.query;

        // Get all subcategories of this category
        const subcategories = await Category.find({
            $or: [
                { _id: categoryId },
                { parent: categoryId }
            ],
            isActive: true
        }).select('_id');

        const categoryIds = subcategories.map(cat => cat._id);

        const products = await Product.find({
            category: { $in: categoryIds },
            isActive: true
        })
        .populate('category', 'name level')
        .select('-__v')
        .limit(parseInt(limit))
        .skip((parseInt(page) - 1) * parseInt(limit))
        .sort({ createdAt: -1 })
        .lean();

        const total = await Product.countDocuments({
            category: { $in: categoryIds },
            isActive: true
        });

        res.json({
            success: true,
            data: products,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(total / parseInt(limit)),
                totalProducts: total,
                hasNextPage: parseInt(page) < Math.ceil(total / parseInt(limit)),
                hasPrevPage: parseInt(page) > 1
            }
        });

    } catch (error) {
        next(error);
    }
};

exports.updateStock = async (req, res, next) => {
    try {
        const { quantity, operation = 'set' } = req.body;

        // Validate quantity
        if (quantity === undefined || quantity === null) {
            return res.status(400).json({
                success: false,
                error: 'Quantity is required'
            });
        }

        const numQuantity = Number(quantity);
        if (isNaN(numQuantity) || numQuantity < 0) {
            return res.status(400).json({
                success: false,
                error: 'Quantity must be a positive number'
            });
        }

        const product = await Product.findById(req.params.id);
        if (!product) {
            return res.status(404).json({
                success: false,
                error: 'Product not found'
            });
        }

        let newStock;
        switch (operation) {
            case 'increment':
                newStock = product.stock + numQuantity;
                break;
            case 'decrement':
                newStock = product.stock - numQuantity;
                if (newStock < 0) {
                    return res.status(400).json({
                        success: false,
                        error: 'Insufficient stock'
                    });
                }
                break;
            default: // set
                newStock = numQuantity;
        }

        const updatedProduct = await Product.findByIdAndUpdate(
            req.params.id,
            { stock: newStock },
            { new: true, runValidators: true }
        ).populate('category', 'name');

        // Check if stock is now below minimum level
        const isLowStock = newStock <= updatedProduct.minStockLevel;
        
        res.json({
            success: true,
            data: updatedProduct,
            message: `Stock updated successfully. New stock: ${newStock}`,
            lowStock: isLowStock
        });

    } catch (error) {
        next(error);
    }
};

// Bulk operations for efficiency
exports.bulkUpdateStock = async (req, res, next) => {
    try {
        const { updates } = req.body; // Array of { productId, quantity, operation }

        if (!Array.isArray(updates) || updates.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Invalid updates format'
            });
        }

        const bulkOps = updates.map(update => ({
            updateOne: {
                filter: { _id: update.productId, isActive: true },
                update: { $inc: { stock: update.quantity } }
            }
        }));

        const result = await Product.bulkWrite(bulkOps);

        res.json({
            success: true,
            message: 'Bulk stock update completed',
            modifiedCount: result.modifiedCount
        });

    } catch (error) {
        next(error);
    }
};
