const Sale = require('../models/Sale');

exports.generateInvoice = async (req, res, next) => {
    try {
        const { saleId } = req.params;

        const sale = await Sale.findById(saleId)
            .populate('customer', 'name phone address')
            .populate('items.product', 'name sku')
            .populate('salesPerson', 'name')
            .lean();

        if (!sale) {
            return res.status(404).json({
                success: false,
                error: 'Sale not found'
            });
        }

        // Generate invoice data
        const invoiceData = {
            invoiceNumber: sale.invoiceNumber,
            saleNumber: sale.saleNumber,
            date: sale.saleDate,
            customer: sale.customer,
            items: sale.items.map(item => ({
                product: item.product.name,
                quantity: item.quantity,
                unitPrice: item.unitSalePrice,
                total: item.total
            })),
            subtotal: sale.subtotal,
            discount: sale.discount,
            tax: sale.taxAmount,
            total: sale.totalAmount,
            paymentMethod: sale.paymentMethod,
            salesPerson: sale.salesPerson
        };

        res.json({
            success: true,
            data: invoiceData
        });

    } catch (error) {
        next(error);
    }
};

exports.getInvoiceByNumber = async (req, res, next) => {
    try {
        const { invoiceNumber } = req.params;

        const sale = await Sale.findOne({ invoiceNumber })
            .populate('customer', 'name phone address')
            .populate('items.product', 'name sku')
            .populate('salesPerson', 'name')
            .lean();

        if (!sale) {
            return res.status(404).json({
                success: false,
                error: 'Invoice not found'
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