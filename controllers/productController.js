const Product = require('../models/Product');
const Category = require('../models/Category');
const imageService = require('../services/imageService');
const barcodeService = require('../services/barcodeService');


// Helper: generate unique barcode
// Helper: generate unique barcode
const generateUniqueBarcode = async () => {
    let barcode;
    let attempts = 0;
    const maxAttempts = 10;
    let isUnique = false;

    while (!isUnique && attempts < maxAttempts) {
        barcode = barcodeService.generateBarcode();
        const existing = await Product.findOne({ barcode });
        if (!existing) isUnique = true;
        attempts++;
    }

    if (!isUnique) throw new Error('Unable to generate unique barcode');
    return barcode;
};

exports.createProduct = async (req, res, next) => {
    try {
        const data = req.body;

        // Validate category
        const category = await Category.findById(data.category);
        if (!category) return res.status(400).json({ success: false, error: 'Category not found' });

        // Handle attributes from parent categories
        let allAttributes = [...(category.attributes || [])];
        if (category.parent) {
            const parentCategory = await Category.findById(category.parent);
            if (parentCategory && parentCategory.attributes) {
                allAttributes = [...parentCategory.attributes, ...allAttributes];
            }
        }

        // Handle barcode
        if (data.barcode) {
            data.barcode = barcodeService.formatBarcode(data.barcode);
            const exists = await Product.findOne({ barcode: data.barcode });
            if (exists) return res.status(400).json({ success: false, error: 'Barcode already exists' });
        } else {
            data.barcode = await generateUniqueBarcode();
        }

        // Handle images from Cloudinary
        if (req.files && req.files.length > 0) {
            data.images = req.files.map(file => file.path); // Cloudinary URLs
        }

        // Parse attributes if string
        if (typeof data.attributes === 'string') {
            try { data.attributes = JSON.parse(data.attributes); } 
            catch { return res.status(400).json({ success: false, error: 'Invalid attributes format' }); }
        }

        // Validate required attributes
        const missing = allAttributes.filter(attr => attr.required && !data.attributes?.[attr.name])
            .map(attr => attr.label || attr.name);

        if (missing.length > 0) return res.status(400).json({ success: false, error: `Missing attributes: ${missing.join(', ')}` });

        const product = await Product.create(data);
        const populated = await Product.findById(product._id).populate('category', 'name level');

        res.status(201).json({ success: true, data: populated, message: 'Product created successfully' });
    } catch (error) {
        next(error);
    }
};

// UPDATE PRODUCT
exports.updateProduct = async (req, res, next) => {
    try {
        let product = await Product.findById(req.params.id);
        if (!product) return res.status(404).json({ success: false, error: 'Product not found' });

        // Barcode handling
        if (req.body.barcode && req.body.barcode !== product.barcode) {
            req.body.barcode = barcodeService.formatBarcode(req.body.barcode);
            const exists = await Product.findOne({ barcode: req.body.barcode, _id: { $ne: req.params.id } });
            if (exists) return res.status(400).json({ success: false, error: 'Barcode already exists' });
        }

        // Handle Cloudinary images
        if (req.files && req.files.length > 0) {
            const newImages = req.files.map(f => f.path);
            if (req.body.replaceImages === 'true') {
                // Replace old images
                req.body.images = newImages;
            } else {
                // Append new images
                req.body.images = [...(product.images || []), ...newImages];
            }
        }

        // Parse attributes if string
        if (req.body.attributes && typeof req.body.attributes === 'string') {
            try { req.body.attributes = JSON.parse(req.body.attributes); }
            catch { return res.status(400).json({ success: false, error: 'Invalid attributes format' }); }
        }

        product = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true })
            .populate('category', 'name');

        res.json({ success: true, data: product, message: 'Product updated successfully' });
    } catch (error) {
        next(error);
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

exports.updateProduct = async (req, res, next) => {
    try {
        let product = await Product.findById(req.params.id);

        if (!product) {
            return res.status(404).json({
                success: false,
                error: 'Product not found'
            });
        }

        // Store old images for cleanup if new ones are uploaded
        const oldImages = [...(product.images || [])];

        // Handle barcode update
        if (req.body.barcode && req.body.barcode !== product.barcode) {
            // Format barcode
            req.body.barcode = barcodeService.formatBarcode(req.body.barcode);
            
            // Check if new barcode already exists
            const existingProduct = await Product.findOne({ 
                barcode: req.body.barcode,
                _id: { $ne: req.params.id }
            });
            
            if (existingProduct) {
                return res.status(400).json({
                    success: false,
                    error: 'Barcode already exists'
                });
            }
        }

        // Handle image updates
        if (req.files && req.files.length > 0) {
            // Optimize and save new images
            const optimizedImages = await imageService.optimizeMultipleImages(req.files, {
                width: 800,
                height: 800,
                quality: 80
            });
            
            // Combine with existing images if not replacing
            if (req.body.replaceImages === 'true') {
                req.body.images = optimizedImages;
                // Delete old images
                if (oldImages.length > 0) {
                    await imageService.deleteMultipleImages(oldImages);
                }
            } else {
                req.body.images = [...oldImages, ...optimizedImages];
            }
        }

        // Parse attributes if sent as string
        if (req.body.attributes && typeof req.body.attributes === 'string') {
            try {
                req.body.attributes = JSON.parse(req.body.attributes);
            } catch (e) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid attributes format'
                });
            }
        }

        // Update product
        product = await Product.findByIdAndUpdate(
            req.params.id,
            req.body,
            {
                new: true,
                runValidators: true
            }
        ).populate('category', 'name');

        res.json({
            success: true,
            data: product,
            message: 'Product updated successfully'
        });

    } catch (error) {
        // Clean up any newly uploaded images if there's an error
        if (req.files && req.files.length > 0) {
            await imageService.deleteMultipleImages(
                req.files.map(f => `/uploads/products/${f.filename}`)
            ).catch(err => console.error('Error cleaning up images:', err));
        }
        next(error);
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
