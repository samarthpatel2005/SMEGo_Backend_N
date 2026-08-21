// routes/userRoutes.js
const express = require('express');
const { body, param } = require('express-validator');
const { protect } = require('../middlewares/authMiddleware');
const { validateRequest } = require('../middlewares/validateRequest');
const { getUserProfile, updateUserProfile } = require('../controllers/userController');

const router = express.Router();

// GET /api/users/:id - get own profile
router.get(
	'/:id',
	protect,
	[param('id').isMongoId().withMessage('Invalid user id')],
	validateRequest,
	getUserProfile
);

// PUT /api/users/:id - update own profile
router.put(
	'/:id',
	protect,
	[
		param('id').isMongoId().withMessage('Invalid user id'),
		body('fullName').optional().isString().isLength({ min: 2, max: 80 }).withMessage('Full name must be 2-80 chars'),
		body('phone').optional().matches(/^\+[1-9]\d{1,14}$/).withMessage('Phone must be E.164 format like +15551234567'),
		body('password').optional().isString().isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
	],
	validateRequest,
	updateUserProfile
);

module.exports = router;

