// models/Sale.js - Updated with paymentStatus logic
const mongoose = require('mongoose');

const saleItemSchema = new mongoose.Schema({
    product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },
    quantity: {
        type: Number,
        required: true,
        min: 1
    },
    unitMrp: {
        type: Number,
        required: true,
        min: 0
    },
    unitSalePrice: {
        type: Number,
        required: true,
        min: 0
    },
    total: {
        type: Number,
        required: true,
        min: 0
    },
    returnedQuantity: {
        type: Number,
        default: 0,
        min: 0
    }
});

const saleSchema = new mongoose.Schema({
    invoiceNumber: {
        type: String,
        required: true,
        unique: true
    },
    saleNumber: {
        type: String,
        required: true,
        unique: true
    },
    customer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Customer'
    },
    items: [saleItemSchema],
    subtotal: {
        type: Number,
        required: true,
        min: 0
    },
    discount: {
        type: Number,
        default: 0,
        min: 0
    },
    taxAmount: {
        type: Number,
        default: 0
    },
    totalAmount: {
        type: Number,
        required: true,
        min: 0
    },
    paymentMethod: {
        type: String,
        enum: ['Cash', 'Card', 'Digital', 'Credit'],
        required: true
    },
    paymentStatus: {
        type: String,
        enum: ['Pending', 'Paid', 'Partially Paid', 'Refunded'],
        default: function() {
            // Set default based on payment method
            return this.paymentMethod === 'Credit' ? 'Pending' : 'Paid';
        }
    },
    saleDate: {
        type: Date,
        default: Date.now
    },
    salesPerson: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    status: {
        type: String,
        enum: ['Completed', 'Returned', 'Partially Returned', 'Cancelled'],
        default: 'Completed'
    },
    notes: String,
    returnReason: String
}, {
    timestamps: true
});

// Calculate totals before saving
saleSchema.pre('save', function(next) {
    // Calculate item totals if not already set
    this.items.forEach(item => {
        if (!item.total) {
            item.total = item.unitSalePrice * item.quantity;
        }
    });
    
    // Calculate subtotal from items
    this.subtotal = this.items.reduce((total, item) => total + item.total, 0);
    
    // Calculate final total
    this.totalAmount = this.subtotal - this.discount + this.taxAmount;
    
    next();
});

module.exports = mongoose.model('Sale', saleSchema);