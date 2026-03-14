// controllers/saleController.js - Fixed duplicate functions and added status filters
const Sale = require('../models/Sale');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const NumberGenerator = require('../utils/numberGenerator');
const mongoose = require('mongoose');

// Create a new sale
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
            paymentStatus: paymentMethod === 'Credit' ? 'Pending' : 'Paid', // Set payment status
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
            .populate('items.product', 'name sku barcode mrp minSalePrice stock costPrice')
            .populate('salesPerson', 'name')
            .lean();

        // Calculate profit for the sale
        populatedSale.totalProfit = populatedSale.items.reduce((total, item) => {
            const product = item.product;
            return total + ((item.unitSalePrice - (product.costPrice || 0)) * item.quantity);
        }, 0);

        const message = paymentMethod === 'Credit' 
            ? 'Sale created successfully. Payment pending.' 
            : 'Sale completed successfully';

        res.status(201).json({
            success: true,
            data: populatedSale,
            message
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

// Lookup product by barcode
exports.lookupProductByBarcode = async (req, res, next) => {
    try {
        const { barcode } = req.params;
        
        const product = await Product.findOne({ 
            barcode: barcode.trim(),
            isActive: true 
        })
        .select('name sku barcode mrp minSalePrice costPrice stock images')
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

// Get today's sales - EXCLUDE CANCELLED
exports.getTodaySales = async (req, res, next) => {
    try {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        
        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);

        const [sales, summary] = await Promise.all([
            Sale.find({
                saleDate: { $gte: startOfDay, $lte: endOfDay },
                status: { $ne: 'Cancelled' } // Exclude cancelled
            })
            .populate('items.product', 'name costPrice')
            .populate('customer', 'name')
            .sort({ saleDate: -1 })
            .lean(),

            Sale.aggregate([
                {
                    $match: {
                        saleDate: { $gte: startOfDay, $lte: endOfDay },
                        status: { $ne: 'Cancelled' } // Exclude cancelled
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

        // Calculate profit for each sale
        const salesWithProfit = sales.map(sale => {
            const totalProfit = sale.items.reduce((profit, item) => {
                const product = item.product;
                return profit + ((item.unitSalePrice - (product?.costPrice || 0)) * item.quantity);
            }, 0);
            
            return {
                ...sale,
                totalProfit
            };
        });

        // Calculate total profit
        const totalProfit = salesWithProfit.reduce((sum, sale) => sum + (sale.totalProfit || 0), 0);

        res.json({
            success: true,
            data: {
                sales: salesWithProfit,
                summary: {
                    ...(summary[0] || {
                        totalSales: 0,
                        totalRevenue: 0,
                        totalItems: 0,
                        averageSale: 0
                    }),
                    totalProfit
                }
            }
        });

    } catch (error) {
        next(error);
    }
};

// Get all sales with pagination
exports.getSales = async (req, res, next) => {
    try {
        const { page = 1, limit = 50, startDate, endDate, paymentStatus, includeCancelled } = req.query;

        let query = {};

        // Date range filter
        if (startDate && endDate) {
            query.saleDate = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        }

        // Payment status filter
        if (paymentStatus) {
            query.paymentStatus = paymentStatus;
        }

        // By default, exclude cancelled sales unless specifically requested
        if (includeCancelled !== 'true') {
            query.status = { $ne: 'Cancelled' };
        }

        const sales = await Sale.find(query)
            .populate('customer', 'name phone')
            .populate('salesPerson', 'name')
            .populate('items.product', 'name costPrice')
            .select('-__v')
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .sort({ saleDate: -1 })
            .lean();

        // Calculate profit for each sale
        const salesWithProfit = sales.map(sale => {
            const totalProfit = sale.items.reduce((profit, item) => {
                const product = item.product;
                return profit + ((item.unitSalePrice - (product?.costPrice || 0)) * item.quantity);
            }, 0);
            
            return {
                ...sale,
                totalProfit
            };
        });

        const total = await Sale.countDocuments(query);

        res.json({
            success: true,
            data: salesWithProfit,
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

// Get single sale by ID
exports.getSale = async (req, res, next) => {
    try {
        const sale = await Sale.findById(req.params.id)
            .populate('customer', 'name phone email')
            .populate('items.product', 'name sku mrp costPrice')
            .populate('salesPerson', 'name')
            .lean();

        if (!sale) {
            return res.status(404).json({
                success: false,
                error: 'Sale not found'
            });
        }

        // Calculate profit
        const totalProfit = sale.items.reduce((profit, item) => {
            const product = item.product;
            return profit + ((item.unitSalePrice - (product?.costPrice || 0)) * item.quantity);
        }, 0);

        sale.totalProfit = totalProfit;

        res.json({
            success: true,
            data: sale
        });

    } catch (error) {
        next(error);
    }
};

// Get sales analytics with profit - EXCLUDE CANCELLED
exports.getSalesAnalytics = async (req, res, next) => {
    try {
        const { days = 30 } = req.query;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - parseInt(days));

        const sales = await Sale.find({ 
            saleDate: { $gte: startDate },
            status: { $ne: 'Cancelled' } // Exclude cancelled sales
        })
        .populate('items.product', 'costPrice')
        .lean();

        let totalProfit = 0;
        let totalRevenue = 0;
        let totalSales = sales.length;
        let totalDiscount = 0;

        sales.forEach(sale => {
            totalRevenue += sale.totalAmount;
            totalDiscount += sale.discount;
            
            const saleProfit = sale.items.reduce((profit, item) => {
                const product = item.product;
                return profit + ((item.unitSalePrice - (product?.costPrice || 0)) * item.quantity);
            }, 0);
            
            totalProfit += saleProfit;
        });

        res.json({
            success: true,
            data: {
                totalSales,
                totalRevenue,
                totalDiscount,
                totalProfit,
                averageSale: totalSales > 0 ? totalRevenue / totalSales : 0,
                averageProfit: totalSales > 0 ? totalProfit / totalSales : 0
            }
        });

    } catch (error) {
        next(error);
    }
};

// Get period-based analytics (today, this week, this month) - EXCLUDE CANCELLED
exports.getPeriodAnalytics = async (req, res, next) => {
    try {
        const now = new Date();
        
        // Today
        const todayStart = new Date(now);
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date(now);
        todayEnd.setHours(23, 59, 59, 999);
        
        // This week (starting Monday)
        const weekStart = new Date(now);
        const day = weekStart.getDay();
        const diff = weekStart.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
        weekStart.setDate(diff);
        weekStart.setHours(0, 0, 0, 0);
        
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        weekEnd.setHours(23, 59, 59, 999);
        
        // This month
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        monthStart.setHours(0, 0, 0, 0);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        monthEnd.setHours(23, 59, 59, 999);

        const [todaySales, weekSales, monthSales] = await Promise.all([
            Sale.find({ 
                saleDate: { $gte: todayStart, $lte: todayEnd },
                status: { $ne: 'Cancelled' } // Exclude cancelled
            }).populate('items.product', 'costPrice').lean(),
            
            Sale.find({ 
                saleDate: { $gte: weekStart, $lte: weekEnd },
                status: { $ne: 'Cancelled' } // Exclude cancelled
            }).populate('items.product', 'costPrice').lean(),
            
            Sale.find({ 
                saleDate: { $gte: monthStart, $lte: monthEnd },
                status: { $ne: 'Cancelled' } // Exclude cancelled
            }).populate('items.product', 'costPrice').lean()
        ]);

        const calculateMetrics = (sales) => {
            let revenue = 0;
            let profit = 0;
            let count = sales.length;
            
            sales.forEach(sale => {
                revenue += sale.totalAmount;
                const saleProfit = sale.items.reduce((p, item) => {
                    const product = item.product;
                    return p + ((item.unitSalePrice - (product?.costPrice || 0)) * item.quantity);
                }, 0);
                profit += saleProfit;
            });
            
            return { revenue, profit, count };
        };

        res.json({
            success: true,
            data: {
                today: calculateMetrics(todaySales),
                week: calculateMetrics(weekSales),
                month: calculateMetrics(monthSales)
            }
        });

    } catch (error) {
        next(error);
    }
};

// Process return
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
                    error: `Cannot return more than ${maxReturnable} items for this product`
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

// Cancel sale
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

        // Check if sale can be cancelled
        if (sale.status === 'Cancelled') {
            return res.status(400).json({
                success: false,
                error: 'Sale is already cancelled'
            });
        }

        if (sale.status === 'Returned' || sale.status === 'Partially Returned') {
            return res.status(400).json({
                success: false,
                error: 'Cannot cancel a sale that has returns'
            });
        }

        // Return all items to stock
        for (const item of sale.items) {
            const nonReturnedQuantity = item.quantity - item.returnedQuantity;
            if (nonReturnedQuantity > 0) {
                await Product.findByIdAndUpdate(
                    item.product,
                    { $inc: { stock: nonReturnedQuantity } }
                );
            }
        }

        // Update sale status
        sale.status = 'Cancelled';
        sale.paymentStatus = 'Refunded';
        sale.returnReason = reason || 'Sale cancelled';
        await sale.save();

        res.json({
            success: true,
            message: 'Sale cancelled successfully. All items returned to stock.'
        });

    } catch (error) {
        next(error);
    }
};

// Mark credit sale as paid
exports.markAsPaid = async (req, res, next) => {
    try {
        const { saleId } = req.params;

        const sale = await Sale.findById(saleId);
        if (!sale) {
            return res.status(404).json({
                success: false,
                error: 'Sale not found'
            });
        }

        if (sale.paymentMethod !== 'Credit') {
            return res.status(400).json({
                success: false,
                error: 'Only credit sales can be marked as paid'
            });
        }

        if (sale.paymentStatus === 'Paid') {
            return res.status(400).json({
                success: false,
                error: 'Sale is already marked as paid'
            });
        }

        sale.paymentStatus = 'Paid';
        await sale.save();

        res.json({
            success: true,
            message: 'Sale marked as paid successfully'
        });

    } catch (error) {
        next(error);
    }
};