// controllers/userController.js
const User = require('../models/User');
const Admin = require('../models/Admin');

// GET /api/users/:id - Get own profile by user id
const getUserProfile = async (req, res) => {
	try {
		const { id } = req.params;

		// Check if authenticated user (admin or user) is trying to access their own profile
		const authenticatedUserId = req.admin?.id || req.user?.id;
		if (!authenticatedUserId || authenticatedUserId.toString() !== id) {
			return res.status(403).json({ success: false, message: 'Forbidden' });
		}

		let userProfile;
		
		// Try to find admin first, then user
		if (req.admin) {
			userProfile = await Admin.findById(id)
				.select('-password -emailVerificationOtp -emailVerificationOtpExpires')
				.populate('organization');
		} else {
			userProfile = await User.findById(id)
				.select('-password -emailVerificationToken -emailVerificationOtp -emailVerificationOtpExpires')
				.populate('organization');
		}

		if (!userProfile) {
			return res.status(404).json({ success: false, message: 'User not found' });
		}

		res.json({ success: true, data: userProfile });
	} catch (err) {
		console.error('getUserProfile error:', err);
		res.status(500).json({ success: false, message: 'Internal server error' });
	}
};

// PUT /api/users/:id - Update own profile
const updateUserProfile = async (req, res) => {
	try {
		const { id } = req.params;

		// Check if authenticated user (admin or user) is trying to update their own profile
		const authenticatedUserId = req.admin?.id || req.user?.id;
		if (!authenticatedUserId || authenticatedUserId.toString() !== id) {
			return res.status(403).json({ success: false, message: 'Forbidden' });
		}

		const { fullName, phone, password } = req.body;

		let userProfile;
		
		// Try to find and update admin first, then user
		if (req.admin) {
			userProfile = await Admin.findById(id);
		} else {
			userProfile = await User.findById(id);
		}
		
		if (!userProfile) {
			return res.status(404).json({ success: false, message: 'User not found' });
		}

		// Apply allowed updates only
		if (typeof fullName === 'string') userProfile.fullName = fullName;
		if (typeof phone === 'string') userProfile.phone = phone;
		if (typeof password === 'string' && password.length > 0) userProfile.password = password; // will be hashed by pre-save

		await userProfile.save();

		const sanitized = userProfile.toObject();
		delete sanitized.password;
		delete sanitized.emailVerificationToken;
		delete sanitized.emailVerificationOtp;
		delete sanitized.emailVerificationOtpExpires;

		res.json({ success: true, message: 'Profile updated', data: sanitized });
	} catch (err) {
		console.error('updateUserProfile error:', err);
		// Let centralized error handler map validation/duplicate errors when possible
		res.status(500).json({ success: false, message: 'Internal server error' });
	}
};

module.exports = { getUserProfile, updateUserProfile };

