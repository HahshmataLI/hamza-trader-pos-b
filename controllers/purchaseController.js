const Purchase = require('../models/Purchase');
const Product = require('../models/Product');
const NumberGenerator = require('../utils/numberGenerator');

exports.createPurchase = async (req, res, next) => {
    try {
        const purchaseData = req.body;
        
        // Generate purchase number
        purchaseData.purchaseNumber = await NumberGenerator.generatePurchaseNumber();
        purchaseData.receivedBy = req.user._id;

        // Calculate item totals and total amount
        purchaseData.items = purchaseData.items.map(item => ({
            ...item,
            total: item.unitCost * item.quantity
        }));

        purchaseData.totalAmount = purchaseData.items.reduce((total, item) => total + item.total, 0);

        const purchase = await Purchase.create(purchaseData);

        // If purchase is created as Completed, update stock immediately
        if (purchase.status === 'Completed') {
            for (let item of purchase.items) {
                await Product.findByIdAndUpdate(
                    item.product,
                    { $inc: { stock: item.quantity } }
                );
            }
        }

        const populatedPurchase = await Purchase.findById(purchase._id)
            .populate('supplier', 'name phone')
            .populate('items.product', 'name sku stock')
            .populate('receivedBy', 'name')
            .lean();

        let message = 'Purchase created successfully';
        if (purchase.status === 'Completed') {
            message = 'Purchase created and stock updated successfully';
        }

        res.status(201).json({
            success: true,
            data: populatedPurchase,
            message
        });

    } catch (error) {
        next(error);
    }
};

exports.getPurchases = async (req, res, next) => {
    try {
        const { page = 1, limit = 50, status, supplier } = req.query;

        let query = {};
        if (status) query.status = status;
        if (supplier) query.supplier = supplier;

        const purchases = await Purchase.find(query)
            .populate('supplier', 'name phone')
            .populate('items.product', 'name sku')
            .populate('receivedBy', 'name')
            .select('-__v')
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .sort({ purchaseDate: -1 })
            .lean();

        const total = await Purchase.countDocuments(query);

        // Get purchase statistics
        const stats = await Purchase.aggregate([
            { $match: query },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 },
                    totalAmount: { $sum: '$totalAmount' }
                }
            }
        ]);

        res.json({
            success: true,
            data: purchases,
            stats,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(total / limit),
                totalPurchases: total
            }
        });

    } catch (error) {
        next(error);
    }
};

exports.getPurchase = async (req, res, next) => {
    try {
        const purchase = await Purchase.findById(req.params.id)
            .populate('supplier')
            .populate('items.product', 'name sku costPrice mrp stock')
            .populate('receivedBy', 'name email')
            .lean();

        if (!purchase) {
            return res.status(404).json({
                success: false,
                error: 'Purchase not found'
            });
        }

        res.json({
            success: true,
            data: purchase
        });

    } catch (error) {
        next(error);
    }
};

exports.updatePurchaseStatus = async (req, res, next) => {
    try {
        const { status } = req.body;

        const purchase = await Purchase.findById(req.params.id);
        if (!purchase) {
            return res.status(404).json({
                success: false,
                error: 'Purchase not found'
            });
        }

        // Store previous status for stock management
        const previousStatus = purchase.status;

        // Update stock based on status change
        if (previousStatus !== status) {
            // If changing from Pending to Completed → Add stock
            if (previousStatus === 'Pending' && status === 'Completed') {
                for (let item of purchase.items) {
                    await Product.findByIdAndUpdate(
                        item.product,
                        { $inc: { stock: item.quantity } }
                    );
                }
            }
            // If changing from Completed to Cancelled → Remove stock
            else if (previousStatus === 'Completed' && status === 'Cancelled') {
                for (let item of purchase.items) {
                    await Product.findByIdAndUpdate(
                        item.product,
                        { $inc: { stock: -item.quantity } }
                    );
                }
            }
            // If changing from Cancelled to Completed → Add stock back
            else if (previousStatus === 'Cancelled' && status === 'Completed') {
                for (let item of purchase.items) {
                    await Product.findByIdAndUpdate(
                        item.product,
                        { $inc: { stock: item.quantity } }
                    );
                }
            }
        }

        // Update purchase status
        purchase.status = status;
        await purchase.save();

        const updatedPurchase = await Purchase.findById(purchase._id)
            .populate('supplier', 'name')
            .populate('items.product', 'name sku stock')
            .populate('receivedBy', 'name');

        let message = 'Purchase status updated successfully';
        if (previousStatus === 'Pending' && status === 'Completed') {
            message = 'Purchase completed and stock updated successfully';
        } else if (previousStatus === 'Completed' && status === 'Cancelled') {
            message = 'Purchase cancelled and stock reversed successfully';
        } else if (previousStatus === 'Cancelled' && status === 'Completed') {
            message = 'Purchase re-completed and stock updated successfully';
        }

        res.json({
            success: true,
            data: updatedPurchase,
            message
        });

    } catch (error) {
        next(error);
    }
};

exports.updatePurchase = async (req, res, next) => {
    try {
        const updateData = req.body;

        const purchase = await Purchase.findById(req.params.id);
        if (!purchase) {
            return res.status(404).json({
                success: false,
                error: 'Purchase not found'
            });
        }

        // If items are being updated and purchase was completed, we need to adjust stock
        if (updateData.items && purchase.status === 'Completed') {
            // First, remove the old stock quantities
            for (let item of purchase.items) {
                await Product.findByIdAndUpdate(
                    item.product,
                    { $inc: { stock: -item.quantity } }
                );
            }

            // Then add the new stock quantities
            updateData.items = updateData.items.map(item => ({
                ...item,
                total: item.unitCost * item.quantity
            }));
            
            for (let item of updateData.items) {
                await Product.findByIdAndUpdate(
                    item.product,
                    { $inc: { stock: item.quantity } }
                );
            }

            updateData.totalAmount = updateData.items.reduce((total, item) => total + item.total, 0);
        } else if (updateData.items) {
            // Just recalculate totals for pending purchases
            updateData.items = updateData.items.map(item => ({
                ...item,
                total: item.unitCost * item.quantity
            }));
            updateData.totalAmount = updateData.items.reduce((total, item) => total + item.total, 0);
        }

        const updatedPurchase = await Purchase.findByIdAndUpdate(
            req.params.id,
            updateData,
            {
                new: true,
                runValidators: true
            }
        )
        .populate('supplier', 'name phone')
        .populate('items.product', 'name sku stock')
        .populate('receivedBy', 'name');

        res.json({
            success: true,
            data: updatedPurchase,
            message: 'Purchase updated successfully' + 
                (purchase.status === 'Completed' && updateData.items ? ' and stock adjusted' : '')
        });

    } catch (error) {
        next(error);
    }
};

exports.deletePurchase = async (req, res, next) => {
    try {
        const purchase = await Purchase.findById(req.params.id);
        
        if (!purchase) {
            return res.status(404).json({
                success: false,
                error: 'Purchase not found'
            });
        }

        // If purchase was completed, reverse the stock
        if (purchase.status === 'Completed') {
            for (let item of purchase.items) {
                await Product.findByIdAndUpdate(
                    item.product,
                    { $inc: { stock: -item.quantity } }
                );
            }
        }

        await Purchase.findByIdAndDelete(req.params.id);

        res.json({
            success: true,
            message: 'Purchase deleted successfully' + 
                (purchase.status === 'Completed' ? ' and stock reversed' : '')
        });

    } catch (error) {
        next(error);
    }
};

// Debug method to check stock
exports.debugStock = async (req, res, next) => {
    try {
        const purchase = await Purchase.findById(req.params.id)
            .populate('items.product', 'name sku stock');
            
        if (!purchase) {
            return res.status(404).json({
                success: false,
                error: 'Purchase not found'
            });
        }

        const stockInfo = purchase.items.map(item => ({
            product: item.product.name,
            sku: item.product.sku,
            currentStock: item.product.stock,
            purchaseQuantity: item.quantity,
            productId: item.product._id
        }));

        res.json({
            success: true,
            data: {
                purchase: {
                    _id: purchase._id,
                    status: purchase.status,
                    purchaseNumber: purchase.purchaseNumber
                },
                stockInfo,
                message: 'Stock debug information'
            }
        });

    } catch (error) {
        next(error);
    }
};