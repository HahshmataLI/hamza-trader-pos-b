const Category = require('../models/Category');

// @desc    Get all categories with subcategories
// @route   GET /api/categories
exports.getCategories = async (req, res, next) => {
    try {
        const { level, parent } = req.query;

        let query = { isActive: true };

        // Filter by level (1=main, 2=sub, 3=sub-sub)
        if (level) {
            query.level = parseInt(level);
        }

        // Filter by parent for subcategories
        if (parent === 'null' || parent === '') {
            query.parent = null;
        } else if (parent) {
            query.parent = parent;
        }

        const categories = await Category.find(query)
            .populate('parent', 'name')
            .select('-__v')
            .sort({ name: 1 })
            .lean();

        res.json({
            success: true,
            data: categories
        });

    } catch (error) {
        next(error);
    }
};

// @desc    Get category tree (hierarchical structure)
// @route   GET /api/categories/tree
exports.getCategoryTree = async (req, res, next) => {
    try {
        // Get all categories with lean for performance
        const allCategories = await Category.find({ isActive: true })
            .select('name parent level attributes')
            .lean();

        // Build tree structure recursively
        const buildTree = (parentId = null) => {
            return allCategories
                .filter(cat => 
                    (parentId === null && cat.parent === null) || 
                    (cat.parent && cat.parent.toString() === parentId)
                )
                .map(cat => ({
                    _id: cat._id,
                    name: cat.name,
                    level: cat.level,
                    attributes: cat.attributes,
                    subcategories: buildTree(cat._id.toString())
                }));
        };

        const categoryTree = buildTree();

        res.json({
            success: true,
            data: categoryTree
        });

    } catch (error) {
        next(error);
    }
};

// @desc    Get single category with subcategories
// @route   GET /api/categories/:id
exports.getCategory = async (req, res, next) => {
    try {
        const category = await Category.findById(req.params.id)
            .populate('parent', 'name')
            .lean();

        if (!category) {
            return res.status(404).json({
                success: false,
                error: 'Category not found'
            });
        }

        // Get subcategories if it's a parent category
        if (category.level < 3) {
            const subcategories = await Category.find({ 
                parent: req.params.id,
                isActive: true 
            })
            .select('name level attributes')
            .lean();

            category.subcategories = subcategories;
        }

        res.json({
            success: true,
            data: category
        });

    } catch (error) {
        next(error);
    }
};

// @desc    Get category attributes
// @route   GET /api/categories/:id/attributes
exports.getCategoryAttributes = async (req, res, next) => {
    try {
        const category = await Category.findById(req.params.id);

        if (!category) {
            return res.status(404).json({
                success: false,
                error: 'Category not found'
            });
        }

        // If this category has parent, include parent attributes too
        let allAttributes = [...category.attributes];

        if (category.parent) {
            const parentCategory = await Category.findById(category.parent);
            if (parentCategory && parentCategory.attributes) {
                allAttributes = [...parentCategory.attributes, ...allAttributes];
            }
        }

        res.json({
            success: true,
            data: allAttributes
        });

    } catch (error) {
        next(error);
    }
};

// @desc    Create category
// @route   POST /api/categories
exports.createCategory = async (req, res, next) => {
    try {
        const { name, parent, level = 1, attributes = [] } = req.body;

        // Validate parent category exists if provided
        if (parent) {
            const parentCategory = await Category.findById(parent);
            if (!parentCategory) {
                return res.status(400).json({
                    success: false,
                    error: 'Parent category not found'
                });
            }

            // Set level based on parent
            req.body.level = parentCategory.level + 1;
            
            // Validate level doesn't exceed maximum
            if (req.body.level > 3) {
                return res.status(400).json({
                    success: false,
                    error: 'Maximum category depth exceeded (max 3 levels)'
                });
            }
        }

        // Handle image upload
        if (req.file) {
            req.body.image = `/uploads/categories/${req.file.filename}`;
        }

        const category = await Category.create(req.body);

        res.status(201).json({
            success: true,
            data: category
        });

    } catch (error) {
        next(error);
    }
};

// @desc    Update category
// @route   PUT /api/categories/:id
exports.updateCategory = async (req, res, next) => {
    try {
        let category = await Category.findById(req.params.id);

        if (!category) {
            return res.status(404).json({
                success: false,
                error: 'Category not found'
            });
        }

        // Handle image upload
        if (req.file) {
            req.body.image = `/uploads/categories/${req.file.filename}`;
        }

        category = await Category.findByIdAndUpdate(
            req.params.id,
            req.body,
            {
                new: true,
                runValidators: true
            }
        ).populate('parent', 'name');

        res.json({
            success: true,
            data: category
        });

    } catch (error) {
        next(error);
    }
};

// @desc    Get categories by type (for dropdowns)
// @route   GET /api/categories/type/:type
exports.getCategoriesByType = async (req, res, next) => {
    try {
        const { type } = req.params; // main, sub, all

        let query = { isActive: true };

        switch (type) {
            case 'main':
                query.parent = null;
                query.level = 1;
                break;
            case 'sub':
                query.level = 2;
                break;
            case 'sub-sub':
                query.level = 3;
                break;
            // 'all' returns everything
        }

        const categories = await Category.find(query)
            .select('name level parent')
            .populate('parent', 'name')
            .sort({ level: 1, name: 1 })
            .lean();

        res.json({
            success: true,
            data: categories
        });

    } catch (error) {
        next(error);
    }
};