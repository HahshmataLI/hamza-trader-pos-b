const Product = require('../models/Product');
const Category = require('../models/Category');

exports.createProduct = async (req, res, next) => {
    try {
        const productData = req.body;

        // Validate category exists and get its attributes
        const category = await Category.findById(productData.category);
        if (!category) {
            return res.status(400).json({
                success: false,
                error: 'Category not found'
            });
        }

        // Get all attributes (including parent categories)
        let allAttributes = [...category.attributes];
        if (category.parent) {
            const parentCategory = await Category.findById(category.parent);
            if (parentCategory && parentCategory.attributes) {
                allAttributes = [...parentCategory.attributes, ...allAttributes];
            }
        }

        // Handle uploaded images
        if (req.files && req.files.length > 0) {
            productData.images = req.files.map(file => `/uploads/products/${file.filename}`);
        }

        // Parse attributes if sent as string
        if (typeof productData.attributes === 'string') {
            productData.attributes = JSON.parse(productData.attributes);
        }

        // Validate required attributes
        const missingAttributes = allAttributes
            .filter(attr => attr.required && !productData.attributes[attr.name])
            .map(attr => attr.label || attr.name);

        if (missingAttributes.length > 0) {
            return res.status(400).json({
                success: false,
                error: `Missing required attributes: ${missingAttributes.join(', ')}`
            });
        }

        const product = await Product.create(productData);

        const populatedProduct = await Product.findById(product._id)
            .populate('category', 'name level')
            .lean();

        res.status(201).json({
            success: true,
            data: populatedProduct
        });

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

        // Faster search
        if (search) {
            const searchRegex = new RegExp(search, 'i');

            query.$or = [
                { name: searchRegex },
                { sku: searchRegex },
                { barcode: searchRegex }
            ];
        }

        // Low stock filter
        if (lowStock === 'true') {
            query.$expr = { $lte: ['$stock', '$minStockLevel'] };
        }

        // Run queries in parallel (faster)
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
                totalProducts: total
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

exports.updateProduct = async (req, res, next) => {
    try {
        let product = await Product.findById(req.params.id);

        if (!product) {
            return res.status(404).json({
                success: false,
                error: 'Product not found'
            });
        }

        // Handle image updates
        if (req.files && req.files.length > 0) {
            req.body.images = req.files.map(file => `/uploads/products/${file.filename}`);
        }

        // Parse attributes if sent as string
        if (typeof req.body.attributes === 'string') {
            req.body.attributes = JSON.parse(req.body.attributes);
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
            data: product
        });

    } catch (error) {
        next(error);
    }
};

exports.deleteProduct = async (req, res, next) => {
    try {
        const product = await Product.findByIdAndUpdate(
            req.params.id,
            { isActive: false },
            { new: true }
        );

        if (!product) {
            return res.status(404).json({
                success: false,
                error: 'Product not found'
            });
        }

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
        .select('name sku stock minStockLevel costPrice mrp images')
        .sort({ stock: 1 })
        .lean();

        res.json({
            success: true,
            data: lowStockProducts
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
        .limit(limit * 1)
        .skip((page - 1) * limit)
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
                totalPages: Math.ceil(total / limit),
                totalProducts: total
            }
        });

    } catch (error) {
        next(error);
    }
};

exports.updateStock = async (req, res, next) => {
    try {
        const { quantity, operation = 'set', reason } = req.body;

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
                newStock = product.stock + quantity;
                break;
            case 'decrement':
                newStock = product.stock - quantity;
                if (newStock < 0) {
                    return res.status(400).json({
                        success: false,
                        error: 'Insufficient stock'
                    });
                }
                break;
            default: // set
                newStock = quantity;
        }

        const updatedProduct = await Product.findByIdAndUpdate(
            req.params.id,
            { stock: newStock },
            { new: true }
        ).populate('category', 'name');

        res.json({
            success: true,
            data: updatedProduct,
            message: `Stock updated successfully. New stock: ${newStock}`
        });

    } catch (error) {
        next(error);
    }
};