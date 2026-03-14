// routes/dashboardRoutes.js
const express = require('express');
const {
    getDashboardData,
    getSalesChartData,
    getSummaryCards
} = require('../controllers/dashboardController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

router.get('/', getDashboardData);
router.get('/chart', getSalesChartData);
router.get('/summary', getSummaryCards);

module.exports = router;