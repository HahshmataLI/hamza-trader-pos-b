const Supplier = require('../models/Supplier'); // Add this import

exports.createSupplier = async (req, res, next) => {
    try {
        const supplier = await Supplier.create(req.body);

        res.status(201).json({
            success: true,
            data: supplier
        });

    } catch (error) {
        next(error);
    }
};

exports.getSuppliers = async (req, res, next) => {
    try {
        const { page = 1, limit = 50, search } = req.query;

        let query = { isActive: true };

        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { phone: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ];
        }

        const suppliers = await Supplier.find(query)
            .select('-__v')
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .sort({ name: 1 })
            .lean();

        const total = await Supplier.countDocuments(query);

        res.json({
            success: true,
            data: suppliers,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(total / limit),
                totalSuppliers: total
            }
        });

    } catch (error) {
        next(error);
    }
};

exports.getSupplier = async (req, res, next) => {
    try {
        const supplier = await Supplier.findById(req.params.id).lean();

        if (!supplier) {
            return res.status(404).json({
                success: false,
                error: 'Supplier not found'
            });
        }

        res.json({
            success: true,
            data: supplier
        });

    } catch (error) {
        next(error);
    }
};

exports.updateSupplier = async (req, res, next) => {
    try {
        const supplier = await Supplier.findByIdAndUpdate(
            req.params.id,
            req.body,
            {
                new: true,
                runValidators: true
            }
        );

        if (!supplier) {
            return res.status(404).json({
                success: false,
                error: 'Supplier not found'
            });
        }

        res.json({
            success: true,
            data: supplier
        });

    } catch (error) {
        next(error);
    }
};

exports.deleteSupplier = async (req, res, next) => {
    try {
        const supplier = await Supplier.findByIdAndUpdate(
            req.params.id,
            { isActive: false },
            { new: true }
        );

        if (!supplier) {
            return res.status(404).json({
                success: false,
                error: 'Supplier not found'
            });
        }

        res.json({
            success: true,
            message: 'Supplier deactivated successfully'
        });

    } catch (error) {
        next(error);
    }
};