const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Customer name is required'],
        trim: true
    },
    phone: {
        type: String,
        required: [true, 'Phone number is required'],
        trim: true
    },
    email: {
        type: String,
        trim: true,
        lowercase: true
    },
    address: String,
    customerType: {
        type: String,
        enum: ['Regular', 'VIP', 'Wholesale'],
        default: 'Regular'
    },
    totalPurchases: {
        type: Number,
        default: 0
    },
    lastPurchaseDate: Date,
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

customerSchema.index({ name: 'text', phone: 'text' });
customerSchema.index({ phone: 1 });

module.exports = mongoose.model('Customer', customerSchema);