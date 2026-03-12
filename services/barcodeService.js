const { v4: uuidv4 } = require('uuid');

class BarcodeService {
    constructor() {
        this.prefix = 'POS'; // You can change this based on your business
    }

    generateBarcode() {
        // Generate a unique barcode using timestamp + random numbers
        const timestamp = Date.now().toString(36).toUpperCase();
        const random = Math.random().toString(36).substring(2, 8).toUpperCase();
        const unique = uuidv4().split('-')[0].toUpperCase();
        
        // Format: POS-{timestamp}-{random}-{unique}
        // Example: POS-1A2B3C-4D5E6F-7G8H
        return `${this.prefix}-${timestamp}-${random}-${unique}`;
    }

    validateBarcode(barcode) {
        // Basic barcode validation
        if (!barcode) return false;
        
        // Check if it's a valid string with reasonable length
        return typeof barcode === 'string' && barcode.length >= 8 && barcode.length <= 50;
    }

    formatBarcode(barcode) {
        if (!barcode) return '';
        
        // Remove any special characters and convert to uppercase
        return barcode.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    }
}

module.exports = new BarcodeService();