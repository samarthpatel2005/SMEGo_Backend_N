const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/authMiddleware');
const { createOrganization, getCurrentOrganization } = require('../controllers/orgController');

// All routes here are protected
router.use(protect);

router.post('/', createOrganization);
router.get('/current', getCurrentOrganization);

module.exports = router;