const express = require('express');
const {
    createCustomer,
    getCustomers,
    getCustomer,
    updateCustomer
} = require('../controllers/customerController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

router.route('/')
    .post(createCustomer)
    .get(getCustomers);

router.route('/:id')
    .get(getCustomer)
    .put(updateCustomer);

module.exports = router;