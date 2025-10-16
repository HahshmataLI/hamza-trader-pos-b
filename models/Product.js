const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Product name is required'],
        trim: true
    },
    sku: {
        type: String,
        required: true,
        unique: true
    },
    barcode: String,
    category: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category',
        required: true
    },
    costPrice: { 
        type: Number, 
        required: [true, 'Cost price is required'],
        min: 0 
    },
    mrp: { 
        type: Number, 
        required: [true, 'MRP is required'],
        min: 0 
    },
    minSalePrice: { 
        type: Number, 
        required: [true, 'Minimum sale price is required'],
        min: 0 
    },
    stock: { 
        type: Number, 
        required: true, 
        min: 0, 
        default: 0 
    },
    minStockLevel: { 
        type: Number, 
        default: 5 
    },
    description: String,
    images: [String],
    isActive: {
        type: Boolean,
        default: true
    },
    attributes: {
        type: mongoose.Schema.Types.Mixed,
        required: true
    }
}, {
    timestamps: true
});

productSchema.index({ name: 'text', sku: 'text' });
productSchema.index({ category: 1 });
productSchema.index({ stock: 1 });

module.exports = mongoose.model('Product', productSchema);