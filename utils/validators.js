exports.validateProductAttributes = (categoryName, attributes) => {
    const validators = {
        'Shoes': (attr) => {
            if (!attr.size) return 'Size is required for shoes';
            return null;
        },
        'Garments': (attr) => {
            if (!attr.size || !attr.color) return 'Size and color are required for garments';
            return null;
        },
        'Cosmetics': (attr) => {
            if (!attr.brand) return 'Brand is required for cosmetics';
            return null;
        }
    };

    const validator = validators[categoryName];
    return validator ? validator(attributes) : null;
};