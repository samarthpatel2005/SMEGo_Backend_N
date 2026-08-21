// Debug endpoint to check user and organization status
const User = require('../models/User');
const Organization = require('../models/Organization');

const debugUserOrganization = async (req, res) => {
  try {
    const userId = req.user.id;
    console.log('🔍 Debug: User ID from token:', userId);
    
    // Find user with organization populated
    const user = await User.findById(userId).populate('organization');
    console.log('🔍 Debug: User found:', {
      id: user?._id,
      email: user?.email,
      role: user?.role,
      organizationId: user?.organization?._id,
      organizationName: user?.organization?.name
    });

    // Also find organization directly
    const organization = await Organization.findOne({ owner: userId });
    console.log('🔍 Debug: Organization found by owner:', {
      id: organization?._id,
      name: organization?.name,
      owner: organization?.owner
    });

    // Find all organizations
    const allOrgs = await Organization.find({});
    console.log('🔍 Debug: All organizations count:', allOrgs.length);

    res.json({
      success: true,
      debug: {
        user: {
          id: user?._id,
          email: user?.email,
          role: user?.role,
          hasOrganization: !!user?.organization,
          organizationId: user?.organization?._id,
          organizationName: user?.organization?.name
        },
        organizationByOwner: {
          found: !!organization,
          id: organization?._id,
          name: organization?.name
        },
        totalOrganizations: allOrgs.length
      }
    });

  } catch (error) {
    console.error('Debug error:', error);
    res.status(500).json({
      success: false,
      message: 'Debug endpoint error',
      error: error.message
    });
  }
};

// Debug endpoint to list all organizations
const debugListOrganizations = async (req, res) => {
  try {
    const organizations = await Organization.find({}).populate('owner', 'fullName email');
    
    console.log('🔍 Debug: All Organizations in DB:', organizations.length);
    
    res.json({
      success: true,
      totalOrganizations: organizations.length,
      organizations: organizations.map(org => ({
        id: org._id.toString(),
        name: org.name,
        legalName: org.legalName,
        industry: org.industry,
        country: org.country,
        owner: {
          id: org.owner?._id?.toString(),
          fullName: org.owner?.fullName,
          email: org.owner?.email
        },
        createdAt: org.createdAt
      }))
    });

  } catch (error) {
    console.error('Debug list organizations error:', error);
    res.status(500).json({
      success: false,
      message: 'Debug list organizations error',
      error: error.message
    });
  }
};

module.exports = {
  debugUserOrganization,
  debugListOrganizations
};
