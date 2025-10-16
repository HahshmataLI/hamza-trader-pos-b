const Category = require('../models/Category');

// Get complete attribute set for a category (including inherited)
exports.getCategoryAttributes = async (categoryId) => {
    const category = await Category.findById(categoryId);
    if (!category) return [];

    let attributes = [...category.attributes];

    // Get attributes from parent categories
    let currentCategory = category;
    while (currentCategory.parent) {
        currentCategory = await Category.findById(currentCategory.parent);
        if (currentCategory && currentCategory.attributes) {
            attributes = [...currentCategory.attributes, ...attributes];
        }
    }

    return attributes;
};

// Validate product attributes against category requirements
exports.validateProductAttributes = async (categoryId, productAttributes) => {
    const categoryAttributes = await this.getCategoryAttributes(categoryId);
    
    const errors = [];

    for (const attr of categoryAttributes) {
        if (attr.required && !productAttributes[attr.name]) {
            errors.push(`${attr.label || attr.name} is required`);
        }

        // Validate select options
        if (attr.type === 'select' && productAttributes[attr.name]) {
            if (!attr.options.includes(productAttributes[attr.name])) {
                errors.push(`Invalid value for ${attr.label || attr.name}. Allowed: ${attr.options.join(', ')}`);
            }
        }
    }

    return errors;
};