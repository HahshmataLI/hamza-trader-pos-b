// Create new file: middleware/stockValidation.js
const Product = require('../models/Product');

exports.validateStock = async (req, res, next) => {
    try {
        const { items } = req.body;
        const insufficientStock = [];

        for (const item of items) {
            let product;
            
            if (item.barcode) {
                product = await Product.findOne({ barcode: item.barcode.trim() });
            } else if (item.product) {
                product = await Product.findById(item.product);
            }

            if (product && product.stock < item.quantity) {
                insufficientStock.push({
                    product: product.name,
                    requested: item.quantity,
                    available: product.stock
                });
            }
        }

        if (insufficientStock.length > 0) {
            return res.status(400).json({
                success: false,
                error: 'Insufficient stock for some items',
                details: insufficientStock
            });
        }

        next();
    } catch (error) {
        next(error);
    }
};