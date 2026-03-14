// controllers/dashboardController.js - Fixed profit calculation to use actual sale price
const Sale = require('../models/Sale');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const Purchase = require('../models/Purchase');

exports.getDashboardData = async (req, res, next) => {
    try {
        // Use let instead of const for variables that need to be reassigned
        let today = new Date();
        const startOfToday = new Date(today.setHours(0, 0, 0, 0));
        
        // Reset today variable - now works with let
        today = new Date();
        
        const startOfWeek = new Date(today);
        const day = startOfWeek.getDay();
        const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1); // Start from Monday
        startOfWeek.setDate(diff);
        startOfWeek.setHours(0, 0, 0, 0);
        
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const startOfYear = new Date(today.getFullYear(), 0, 1);

        // For the daily sales calculation at the end, we need to use a new variable
        const sevenDaysAgo = new Date(today);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const [
            todayStats,
            weekStats,
            monthStats,
            yearStats,
            lowStockProducts,
            topProducts,
            recentCustomers,
            pendingCreditSales,
            inventorySummary,
            customerStats
        ] = await Promise.all([
            // Today's detailed stats with profit - USING ACTUAL SALE PRICE
            Sale.aggregate([
                { 
                    $match: { 
                        saleDate: { $gte: startOfToday },
                        status: { $ne: 'Cancelled' },
                        paymentStatus: 'Paid'
                    } 
                },
                { $unwind: '$items' }, // Unwind items first
                {
                    $lookup: {
                        from: 'products',
                        localField: 'items.product',
                        foreignField: '_id',
                        as: 'productInfo'
                    }
                },
                { $unwind: '$productInfo' },
                {
                    $group: {
                        _id: null,
                        revenue: { $sum: '$items.total' }, // Sum item totals
                        salesCount: { $sum: 1 },
                        profit: {
                            $sum: {
                                $multiply: [
                                    { $subtract: ['$items.unitSalePrice', '$productInfo.costPrice'] },
                                    '$items.quantity'
                                ]
                            }
                        },
                        itemsSold: { $sum: '$items.quantity' }
                    }
                }
            ]),
            
            // This week's stats - USING ACTUAL SALE PRICE
            Sale.aggregate([
                { 
                    $match: { 
                        saleDate: { $gte: startOfWeek },
                        status: { $ne: 'Cancelled' },
                        paymentStatus: 'Paid'
                    } 
                },
                { $unwind: '$items' },
                {
                    $lookup: {
                        from: 'products',
                        localField: 'items.product',
                        foreignField: '_id',
                        as: 'productInfo'
                    }
                },
                { $unwind: '$productInfo' },
                {
                    $group: {
                        _id: null,
                        revenue: { $sum: '$items.total' },
                        salesCount: { $sum: 1 },
                        profit: {
                            $sum: {
                                $multiply: [
                                    { $subtract: ['$items.unitSalePrice', '$productInfo.costPrice'] },
                                    '$items.quantity'
                                ]
                            }
                        }
                    }
                }
            ]),
            
            // This month's stats - USING ACTUAL SALE PRICE
            Sale.aggregate([
                { 
                    $match: { 
                        saleDate: { $gte: startOfMonth },
                        status: { $ne: 'Cancelled' },
                        paymentStatus: 'Paid'
                    } 
                },
                { $unwind: '$items' },
                {
                    $lookup: {
                        from: 'products',
                        localField: 'items.product',
                        foreignField: '_id',
                        as: 'productInfo'
                    }
                },
                { $unwind: '$productInfo' },
                {
                    $group: {
                        _id: null,
                        revenue: { $sum: '$items.total' },
                        salesCount: { $sum: 1 },
                        profit: {
                            $sum: {
                                $multiply: [
                                    { $subtract: ['$items.unitSalePrice', '$productInfo.costPrice'] },
                                    '$items.quantity'
                                ]
                            }
                        }
                    }
                }
            ]),
            
            // This year's stats - USING ACTUAL SALE PRICE
            Sale.aggregate([
                { 
                    $match: { 
                        saleDate: { $gte: startOfYear },
                        status: { $ne: 'Cancelled' },
                        paymentStatus: 'Paid'
                    } 
                },
                { $unwind: '$items' },
                {
                    $lookup: {
                        from: 'products',
                        localField: 'items.product',
                        foreignField: '_id',
                        as: 'productInfo'
                    }
                },
                { $unwind: '$productInfo' },
                {
                    $group: {
                        _id: null,
                        revenue: { $sum: '$items.total' },
                        salesCount: { $sum: 1 },
                        profit: {
                            $sum: {
                                $multiply: [
                                    { $subtract: ['$items.unitSalePrice', '$productInfo.costPrice'] },
                                    '$items.quantity'
                                ]
                            }
                        }
                    }
                }
            ]),
            
            // Low stock products
            Product.find({
                $expr: { $lte: ['$stock', '$minStockLevel'] },
                isActive: true
            })
            .select('name sku stock minStockLevel images')
            .sort({ stock: 1 })
            .limit(10)
            .lean(),
            
            // Top selling products - USING ACTUAL SALE PRICE
            Sale.aggregate([
                { $match: { 
                    status: { $ne: 'Cancelled' },
                    paymentStatus: 'Paid'
                } },
                { $unwind: '$items' },
                {
                    $group: {
                        _id: '$items.product',
                        totalQuantity: { $sum: '$items.quantity' },
                        totalRevenue: { $sum: '$items.total' }
                    }
                },
                { $sort: { totalQuantity: -1 } },
                { $limit: 5 },
                {
                    $lookup: {
                        from: 'products',
                        localField: '_id',
                        foreignField: '_id',
                        as: 'product'
                    }
                },
                { $unwind: '$product' },
                {
                    $project: {
                        name: '$product.name',
                        sku: '$product.sku',
                        totalQuantity: 1,
                        totalRevenue: 1,
                        image: { $arrayElemAt: ['$product.images', 0] }
                    }
                }
            ]),
            
            // Recent customers
            Customer.find({ isActive: true })
                .select('name phone totalPurchases lastPurchaseDate')
                .sort({ createdAt: -1 })
                .limit(5)
                .lean(),
            
            // Pending credit sales (only completed, not cancelled)
            Sale.countDocuments({
                paymentMethod: 'Credit',
                paymentStatus: 'Pending',
                status: 'Completed'
            }),
            
            // Inventory summary
            Product.aggregate([
                { $match: { isActive: true } },
                {
                    $group: {
                        _id: null,
                        totalProducts: { $sum: 1 },
                        totalStock: { $sum: '$stock' },
                        totalInventoryValue: { $sum: { $multiply: ['$stock', '$costPrice'] } },
                        totalRetailValue: { $sum: { $multiply: ['$stock', '$mrp'] } }
                    }
                }
            ]),
            
            // Customer statistics
            Customer.aggregate([
                { $match: { isActive: true } },
                {
                    $group: {
                        _id: null,
                        totalCustomers: { $sum: 1 },
                        totalLifetimeValue: { $sum: '$totalPurchases' },
                        averagePurchase: { $avg: '$totalPurchases' }
                    }
                }
            ])
        ]);

        // Get recent sales with profit - USING ACTUAL SALE PRICE
        const recentSales = await Sale.find({ 
            status: { $ne: 'Cancelled' },
            paymentStatus: 'Paid'
        })
        .populate('customer', 'name')
        .populate({
            path: 'items.product',
            select: 'name costPrice'
        })
        .select('invoiceNumber totalAmount saleDate paymentMethod paymentStatus items')
        .sort({ saleDate: -1 })
        .limit(10)
        .lean();

        // Calculate profit for recent sales using actual sale price
        const recentSalesWithProfit = recentSales.map(sale => {
            const totalProfit = sale.items.reduce((profit, item) => {
                const product = item.product;
                // Use item.unitSalePrice (actual sale price) not product.mrp
                return profit + ((item.unitSalePrice - (product?.costPrice || 0)) * item.quantity);
            }, 0);
            
            return {
                _id: sale._id,
                invoiceNumber: sale.invoiceNumber,
                totalAmount: sale.totalAmount,
                saleDate: sale.saleDate,
                paymentMethod: sale.paymentMethod,
                paymentStatus: sale.paymentStatus,
                customer: sale.customer,
                totalProfit
            };
        });

        // Calculate pending credit amount separately
        const pendingCreditResult = await Sale.aggregate([
            {
                $match: {
                    paymentMethod: 'Credit',
                    paymentStatus: 'Pending',
                    status: 'Completed'
                }
            },
            {
                $group: {
                    _id: null,
                    total: { $sum: '$totalAmount' },
                    count: { $sum: 1 }
                }
            }
        ]);

        // Sales by payment method for current month
        const salesByPaymentMethod = await Sale.aggregate([
            { 
                $match: { 
                    saleDate: { $gte: startOfMonth },
                    status: { $ne: 'Cancelled' }
                } 
            },
            {
                $group: {
                    _id: '$paymentMethod',
                    total: { $sum: '$totalAmount' },
                    count: { $sum: 1 }
                }
            }
        ]);

        // Daily sales for chart (last 7 days) - USING ACTUAL SALE PRICE
        const dailySales = await Sale.aggregate([
            {
                $match: {
                    saleDate: {
                        $gte: sevenDaysAgo
                    },
                    status: { $ne: 'Cancelled' },
                    paymentStatus: 'Paid'
                }
            },
            {
                $group: {
                    _id: {
                        $dateToString: { format: '%Y-%m-%d', date: '$saleDate' }
                    },
                    revenue: { $sum: '$totalAmount' },
                    salesCount: { $sum: 1 }
                }
            },
            { $sort: { '_id': 1 } }
        ]);

        const dashboardData = {
            today: {
                revenue: todayStats[0]?.revenue || 0,
                salesCount: todayStats[0]?.salesCount || 0,
                profit: todayStats[0]?.profit || 0,
                itemsSold: todayStats[0]?.itemsSold || 0,
                averageOrderValue: todayStats[0]?.salesCount > 0 
                    ? todayStats[0].revenue / todayStats[0].salesCount 
                    : 0
            },
            week: {
                revenue: weekStats[0]?.revenue || 0,
                salesCount: weekStats[0]?.salesCount || 0,
                profit: weekStats[0]?.profit || 0
            },
            month: {
                revenue: monthStats[0]?.revenue || 0,
                salesCount: monthStats[0]?.salesCount || 0,
                profit: monthStats[0]?.profit || 0
            },
            year: {
                revenue: yearStats[0]?.revenue || 0,
                salesCount: yearStats[0]?.salesCount || 0,
                profit: yearStats[0]?.profit || 0
            },
            inventory: {
                lowStockCount: lowStockProducts.length,
                lowStockProducts: lowStockProducts,
                totalProducts: inventorySummary[0]?.totalProducts || 0,
                totalStock: inventorySummary[0]?.totalStock || 0,
                inventoryValue: inventorySummary[0]?.totalInventoryValue || 0,
                retailValue: inventorySummary[0]?.totalRetailValue || 0,
                potentialProfit: (inventorySummary[0]?.totalRetailValue || 0) - (inventorySummary[0]?.totalInventoryValue || 0)
            },
            customers: {
                total: customerStats[0]?.totalCustomers || 0,
                totalLifetimeValue: customerStats[0]?.totalLifetimeValue || 0,
                averagePurchase: customerStats[0]?.averagePurchase || 0,
                recentCustomers
            },
            topProducts,
            recentSales: recentSalesWithProfit,
            pendingCreditAmount: pendingCreditResult[0] || { total: 0, count: 0 },
            salesByPaymentMethod,
            dailySales
        };

        res.json({
            success: true,
            data: dashboardData
        });

    } catch (error) {
        console.error('Dashboard error:', error);
        next(error);
    }
};

// Get sales chart data
exports.getSalesChartData = async (req, res, next) => {
    try {
        const { period = 'week' } = req.query;
        let startDate = new Date();
        let groupFormat;

        switch (period) {
            case 'week':
                startDate.setDate(startDate.getDate() - 7);
                groupFormat = '%Y-%m-%d';
                break;
            case 'month':
                startDate.setMonth(startDate.getMonth() - 1);
                groupFormat = '%Y-%m-%d';
                break;
            case 'year':
                startDate.setFullYear(startDate.getFullYear() - 1);
                groupFormat = '%Y-%m';
                break;
            default:
                startDate.setDate(startDate.getDate() - 7);
                groupFormat = '%Y-%m-%d';
        }

        const sales = await Sale.aggregate([
            {
                $match: {
                    saleDate: { $gte: startDate },
                    status: { $ne: 'Cancelled' },
                    paymentStatus: 'Paid'
                }
            },
            {
                $group: {
                    _id: {
                        $dateToString: { format: groupFormat, date: '$saleDate' }
                    },
                    revenue: { $sum: '$totalAmount' },
                    salesCount: { $sum: 1 }
                }
            },
            { $sort: { '_id': 1 } }
        ]);

        res.json({
            success: true,
            data: sales
        });

    } catch (error) {
        next(error);
    }
};

// Get summary cards data
exports.getSummaryCards = async (req, res, next) => {
    try {
        const today = new Date();
        const startOfToday = new Date(today.setHours(0, 0, 0, 0));

        const [
            todaySales,
            totalCustomers,
            totalProducts,
            lowStockCount,
            pendingPayments
        ] = await Promise.all([
            Sale.aggregate([
                { 
                    $match: { 
                        saleDate: { $gte: startOfToday },
                        status: { $ne: 'Cancelled' },
                        paymentStatus: 'Paid'
                    } 
                },
                {
                    $group: {
                        _id: null,
                        revenue: { $sum: '$totalAmount' },
                        count: { $sum: 1 }
                    }
                }
            ]),
            Customer.countDocuments({ isActive: true }),
            Product.countDocuments({ isActive: true }),
            Product.countDocuments({
                $expr: { $lte: ['$stock', '$minStockLevel'] },
                isActive: true
            }),
            Sale.countDocuments({
                paymentMethod: 'Credit',
                paymentStatus: 'Pending',
                status: 'Completed'
            })
        ]);

        res.json({
            success: true,
            data: {
                todayRevenue: todaySales[0]?.revenue || 0,
                todaySalesCount: todaySales[0]?.count || 0,
                totalCustomers,
                totalProducts,
                lowStockCount,
                pendingPayments
            }
        });

    } catch (error) {
        next(error);
    }
};