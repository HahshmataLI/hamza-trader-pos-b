const Customer = require('../models/Customer');
const NumberGenerator = require('../utils/numberGenerator');

exports.createCustomer = async (req, res, next) => {
    try {
        const customer = await Customer.create(req.body);

        res.status(201).json({
            success: true,
            data: customer
        });

    } catch (error) {
        next(error);
    }
};

exports.getCustomers = async (req, res, next) => {
    try {
        const { page = 1, limit = 50, search } = req.query;

        let query = { isActive: true };

        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { phone: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ];
        }

        const customers = await Customer.find(query)
            .select('-__v')
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .sort({ createdAt: -1 })
            .lean();

        const total = await Customer.countDocuments(query);

        res.json({
            success: true,
            data: customers,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(total / limit),
                totalCustomers: total
            }
        });

    } catch (error) {
        next(error);
    }
};

exports.getCustomer = async (req, res, next) => {
    try {
        const customer = await Customer.findById(req.params.id).lean();

        if (!customer) {
            return res.status(404).json({
                success: false,
                error: 'Customer not found'
            });
        }

        res.json({
            success: true,
            data: customer
        });

    } catch (error) {
        next(error);
    }
};
exports.updateCustomer = async (req, res) => {
  try {
    const customer = await Customer.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }
    res.status(200).json(customer);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
