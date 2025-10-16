const Sale = require('../models/Sale');
const Purchase = require('../models/Purchase');
const Customer = require('../models/Customer');

class NumberGenerator {
    static async generateInvoiceNumber() {
        try {
            const today = new Date();
            const year = today.getFullYear();
            const month = String(today.getMonth() + 1).padStart(2, '0');
            const day = String(today.getDate()).padStart(2, '0');
            
            const count = await Sale.countDocuments({
                createdAt: {
                    $gte: new Date(today.setHours(0, 0, 0, 0)),
                    $lte: new Date(today.setHours(23, 59, 59, 999))
                }
            });
            
            return `INV-${year}${month}${day}-${String(count + 1).padStart(3, '0')}`;
        } catch (error) {
            // Fallback if counting fails
            const timestamp = Date.now();
            return `INV-${timestamp}`;
        }
    }

    static async generateSaleNumber() {
        try {
            const count = await Sale.countDocuments();
            return `SALE-${String(count + 1).padStart(5, '0')}`;
        } catch (error) {
            const timestamp = Date.now();
            return `SALE-${timestamp}`;
        }
    }

    static async generatePurchaseNumber() {
        try {
            const count = await Purchase.countDocuments();
            return `PO-${String(count + 1).padStart(5, '0')}`;
        } catch (error) {
            const timestamp = Date.now();
            return `PO-${timestamp}`;
        }
    }

    static async generateCustomerId() {
        try {
            const count = await Customer.countDocuments();
            return `CUST-${String(count + 1).padStart(5, '0')}`;
        } catch (error) {
            const timestamp = Date.now();
            return `CUST-${timestamp}`;
        }
    }
}

module.exports = NumberGenerator;