const Sale = require('../models/Sale');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const Purchase = require('../models/Purchase');

exports.getDashboardData = async (req, res, next) => {
    try {
        const today = new Date();
        const startOfToday = new Date(today.setHours(0, 0, 0, 0));
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

        const [
            todaySales,
            monthlySales,
            lowStockProducts,
            totalCustomers,
            totalProducts,
            recentSales
        ] = await Promise.all([
            // Today's sales
            Sale.aggregate([
                { $match: { saleDate: { $gte: startOfToday } } },
                {
                    $group: {
                        _id: null,
                        revenue: { $sum: '$totalAmount' },
                        salesCount: { $sum: 1 }
                    }
                }
            ]),
            
            // Monthly sales
            Sale.aggregate([
                { $match: { saleDate: { $gte: startOfMonth } } },
                {
                    $group: {
                        _id: null,
                        revenue: { $sum: '$totalAmount' },
                        salesCount: { $sum: 1 }
                    }
                }
            ]),
            
            // Low stock products
            Product.countDocuments({
                $expr: { $lte: ['$stock', '$minStockLevel'] },
                isActive: true
            }),
            
            // Total customers
            Customer.countDocuments({ isActive: true }),
            
            // Total products
            Product.countDocuments({ isActive: true }),
            
            // Recent sales
            Sale.find()
                .populate('customer', 'name')
                .select('invoiceNumber totalAmount saleDate customer')
                .sort({ saleDate: -1 })
                .limit(5)
                .lean()
        ]);

        const dashboardData = {
            today: {
                revenue: todaySales[0]?.revenue || 0,
                salesCount: todaySales[0]?.salesCount || 0
            },
            monthly: {
                revenue: monthlySales[0]?.revenue || 0,
                salesCount: monthlySales[0]?.salesCount || 0
            },
            inventory: {
                lowStockCount: lowStockProducts
            },
            customers: {
                total: totalCustomers
            },
            products: {
                total: totalProducts
            },
            recentSales: recentSales
        };

        res.json({
            success: true,
            data: dashboardData
        });

    } catch (error) {
        next(error);
    }
};