const Sale = require('../models/Sale');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const NumberGenerator = require('../utils/numberGenerator');
const mongoose = require('mongoose');

// Add to saleController.js - Updated createSale function
exports.createSale = async (req, res, next) => {
    try {
        const { customer, items, paymentMethod, notes, discount = 0, taxAmount = 0 } = req.body;

        // Generate unique numbers
        const invoiceNumber = await NumberGenerator.generateInvoiceNumber();
        const saleNumber = await NumberGenerator.generateSaleNumber();

        // Validate items and prepare sale data
        let saleItems = [];
        let totalAmount = 0;
        const stockUpdates = []; // Track for rollback if needed

        for (const item of items) {
            let product;
            
            // Check if item has barcode instead of product ID
            if (item.barcode) {
                // Find by barcode (case-insensitive, trimmed)
                product = await Product.findOne({ 
                    barcode: item.barcode.trim(),
                    isActive: true 
                });
            } else if (item.product) {
                // Find by product ID
                product = await Product.findById(item.product);
            } else {
                return res.status(400).json({
                    success: false,
                    error: 'Each item must have either product ID or barcode'
                });
            }
            
            if (!product) {
                return res.status(404).json({
                    success: false,
                    error: `Product not found: ${item.barcode || item.product}`
                });
            }

            if (product.stock < item.quantity) {
                return res.status(400).json({
                    success: false,
                    error: `Insufficient stock for ${product.name}. Available: ${product.stock}`
                });
            }

            // Use provided sale price or default to MRP
            const unitSalePrice = item.unitSalePrice || product.mrp;
            
            if (unitSalePrice < product.minSalePrice) {
                return res.status(400).json({
                    success: false,
                    error: `Sale price for ${product.name} (${unitSalePrice}) is below minimum allowed: ${product.minSalePrice}`
                });
            }

            const itemTotal = unitSalePrice * item.quantity;
            totalAmount += itemTotal;

            saleItems.push({
                product: product._id,
                quantity: item.quantity,
                unitMrp: product.mrp,
                unitSalePrice: unitSalePrice,
                total: itemTotal
            });

            // Track stock update for potential rollback
            stockUpdates.push({
                productId: product._id,
                quantity: item.quantity
            });

            // Update product stock immediately
            await Product.findByIdAndUpdate(
                product._id,
                { $inc: { stock: -item.quantity } }
            );
        }

        // Calculate final amounts
        const subtotal = totalAmount;
        const finalAmount = subtotal - discount + taxAmount;

        // Create sale
        const saleData = {
            invoiceNumber,
            saleNumber,
            customer: customer || null,
            items: saleItems,
            subtotal,
            discount,
            taxAmount,
            totalAmount: finalAmount,
            paymentMethod,
            notes,
            salesPerson: req.user._id
        };

        const sale = await Sale.create(saleData);

        // Update customer stats if exists
        if (customer) {
            await Customer.findByIdAndUpdate(
                customer,
                { 
                    $inc: { totalPurchases: finalAmount },
                    lastPurchaseDate: new Date()
                }
            );
        }

        // Get populated sale for response
        const populatedSale = await Sale.findById(sale._id)
            .populate('customer', 'name phone')
            .populate('items.product', 'name sku barcode mrp minSalePrice stock')
            .populate('salesPerson', 'name')
            .lean();

        res.status(201).json({
            success: true,
            data: populatedSale,
            message: 'Sale completed successfully'
        });

    } catch (error) {
        // Attempt to rollback stock changes if sale creation fails
        if (error.name !== 'ValidationError') {
            for (const update of stockUpdates) {
                await Product.findByIdAndUpdate(
                    update.productId,
                    { $inc: { stock: update.quantity } }
                ).catch(err => console.error('Stock rollback failed:', err));
            }
        }
        next(error);
    }
};
// Add to saleController.js
exports.lookupProductByBarcode = async (req, res, next) => {
    try {
        const { barcode } = req.params;
        
        const product = await Product.findOne({ 
            barcode: barcode.trim(),
            isActive: true 
        })
        .select('name sku barcode mrp minSalePrice stock images')
        .lean();

        if (!product) {
            return res.status(404).json({
                success: false,
                error: 'Product not found'
            });
        }

        // Add calculated fields for POS
        product.maxQuantity = product.stock; // For quantity validation
        product.defaultPrice = product.mrp;   // Default selling price

        res.json({
            success: true,
            data: product
        });

    } catch (error) {
        next(error);
    }
};
// Add to saleController.js
exports.getTodaySales = async (req, res, next) => {
    try {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        
        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);

        const [sales, summary] = await Promise.all([
            Sale.find({
                saleDate: { $gte: startOfDay, $lte: endOfDay }
            })
            .populate('items.product', 'name')
            .sort({ saleDate: -1 })
            .lean(),

            Sale.aggregate([
                {
                    $match: {
                        saleDate: { $gte: startOfDay, $lte: endOfDay }
                    }
                },
                {
                    $group: {
                        _id: null,
                        totalSales: { $sum: 1 },
                        totalRevenue: { $sum: '$totalAmount' },
                        totalItems: { $sum: { $sum: '$items.quantity' } },
                        averageSale: { $avg: '$totalAmount' }
                    }
                }
            ])
        ]);

        res.json({
            success: true,
            data: {
                sales,
                summary: summary[0] || {
                    totalSales: 0,
                    totalRevenue: 0,
                    totalItems: 0,
                    averageSale: 0
                }
            }
        });

    } catch (error) {
        next(error);
    }
};

exports.getSales = async (req, res, next) => {
    try {
        const { page = 1, limit = 50, startDate, endDate } = req.query;

        let query = {};

        if (startDate && endDate) {
            query.saleDate = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        }

        const sales = await Sale.find(query)
            .populate('customer', 'name phone')
            .populate('salesPerson', 'name')
            .select('-__v')
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .sort({ saleDate: -1 })
            .lean();

        const total = await Sale.countDocuments(query);

        res.json({
            success: true,
            data: sales,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(total / limit),
                totalSales: total
            }
        });

    } catch (error) {
        next(error);
    }
};

exports.getSale = async (req, res, next) => {
    try {
        const sale = await Sale.findById(req.params.id)
            .populate('customer', 'name phone email')
            .populate('items.product', 'name sku mrp')
            .populate('salesPerson', 'name')
            .lean();

        if (!sale) {
            return res.status(404).json({
                success: false,
                error: 'Sale not found'
            });
        }

        res.json({
            success: true,
            data: sale
        });

    } catch (error) {
        next(error);
    }
};

exports.getSalesAnalytics = async (req, res, next) => {
    try {
        const { days = 30 } = req.query;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - parseInt(days));

        const analytics = await Sale.aggregate([
            { $match: { saleDate: { $gte: startDate } } },
            {
                $group: {
                    _id: null,
                    totalSales: { $sum: 1 },
                    totalRevenue: { $sum: '$totalAmount' },
                    totalDiscount: { $sum: '$discount' },
                    averageSale: { $avg: '$totalAmount' }
                }
            }
        ]);

        res.json({
            success: true,
            data: analytics[0] || {
                totalSales: 0,
                totalRevenue: 0,
                totalDiscount: 0,
                averageSale: 0
            }
        });

    } catch (error) {
        next(error);
    }
};
// Add to existing saleController.js

exports.returnSale = async (req, res, next) => {
    try {
        const { saleId } = req.params;
        const { returnItems, reason } = req.body;

        const sale = await Sale.findById(saleId);
        if (!sale) {
            return res.status(404).json({
                success: false,
                error: 'Sale not found'
            });
        }

        let totalRefundAmount = 0;
        let hasReturns = false;

        // Process each return item
        for (const returnItem of returnItems) {
            const saleItem = sale.items.id(returnItem.itemId);
            if (!saleItem) {
                return res.status(404).json({
                    success: false,
                    error: `Sale item not found: ${returnItem.itemId}`
                });
            }

            // Validate return quantity
            const maxReturnable = saleItem.quantity - saleItem.returnedQuantity;
            if (returnItem.quantity > maxReturnable) {
                return res.status(400).json({
                    success: false,
                    error: `Cannot return more than ${maxReturnable} items for ${saleItem.product}`
                });
            }

            // Update returned quantity
            saleItem.returnedQuantity += returnItem.quantity;
            
            // Calculate refund amount
            const refundAmount = saleItem.unitSalePrice * returnItem.quantity;
            totalRefundAmount += refundAmount;

            // Update product stock (add back returned items)
            await Product.findByIdAndUpdate(
                saleItem.product,
                { $inc: { stock: returnItem.quantity } }
            );

            hasReturns = true;
        }

        // Update sale status
        if (hasReturns) {
            const totalItems = sale.items.reduce((sum, item) => sum + item.quantity, 0);
            const totalReturned = sale.items.reduce((sum, item) => sum + item.returnedQuantity, 0);
            
            if (totalReturned === totalItems) {
                sale.status = 'Returned';
                sale.paymentStatus = 'Refunded';
            } else if (totalReturned > 0) {
                sale.status = 'Partially Returned';
            }

            sale.returnReason = reason;
            await sale.save();
        }

        // Get updated sale
        const updatedSale = await Sale.findById(saleId)
            .populate('customer', 'name phone')
            .populate('items.product', 'name sku')
            .populate('salesPerson', 'name')
            .lean();

        res.json({
            success: true,
            data: updatedSale,
            refundAmount: totalRefundAmount,
            message: 'Return processed successfully'
        });

    } catch (error) {
        next(error);
    }
};

exports.cancelSale = async (req, res, next) => {
    try {
        const { saleId } = req.params;
        const { reason } = req.body;

        const sale = await Sale.findById(saleId);
        if (!sale) {
            return res.status(404).json({
                success: false,
                error: 'Sale not found'
            });
        }

        // Return all items to stock
        for (const item of sale.items) {
            await Product.findByIdAndUpdate(
                item.product,
                { $inc: { stock: item.quantity } }
            );
        }

        // Update sale status
        sale.status = 'Cancelled';
        sale.paymentStatus = 'Refunded';
        sale.returnReason = reason;
        await sale.save();

        res.json({
            success: true,
            message: 'Sale cancelled successfully. All items returned to stock.'
        });

    } catch (error) {
        next(error);
    }
};