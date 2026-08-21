// controllers/clientController.js
const Client = require('../models/Client');
const Organization = require('../models/Organization');
const { validationResult } = require('express-validator');
const mongoose = require('mongoose');

// IMPORTANT: Registering these models with Mongoose is crucial.
// This prevents the "Schema hasn't been registered" error during populate calls.
require('../models/User');
require('../models/Admin');
require('../models/Employee');

class ClientController {
  // Get all clients for an organization
  async getClients(req, res) {
    try {
      const { page = 1, limit = 10, status, clientType, search, sort = 'createdAt' } = req.query;
      const organizationId = req.user.organization || req.user.organizationId;

      if (!organizationId || !mongoose.Types.ObjectId.isValid(organizationId)) {
        return res.status(400).json({
          success: false,
          message: 'A valid Organization ID is required'
        });
      }

      // FIX: Ensure the query strictly uses the Mongoose ObjectId for matching.
      let query = {
        organization: new mongoose.Types.ObjectId(organizationId),
        isDeleted: false
      };

      // Apply filters
      if (status) query.status = status;
      if (clientType) query.clientType = clientType;

      // Apply search
      if (search) {
        const regex = new RegExp(search, 'i');
        query.$or = [
          { name: regex },
          { email: regex },
          { phone: regex },
          { companyName: regex },
          { tags: { $in: [regex] } }
        ];
      }

      const options = {
        page: parseInt(page),
        limit: parseInt(limit),
        sort: { [sort]: -1 },
        populate: {
          path: 'createdBy',
          select: 'name fullName email'
        }
      };

      const clients = await Client.paginate(query, options);

      res.json({
        success: true,
        data: clients.docs,
        pagination: {
          total: clients.totalDocs,
          pages: clients.totalPages,
          page: clients.page,
          limit: clients.limit,
          hasNext: clients.hasNextPage,
          hasPrev: clients.hasPrevPage
        }
      });

    } catch (error) {
      console.error('Get clients error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch clients',
        error: error.message
      });
    }
  }

  // Get client by ID
  async getClientById(req, res) {
    try {
      const { id } = req.params;
      const organizationId = req.user.organization || req.user.organizationId;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid client ID'
        });
      }

      const client = await Client.findOne({
        _id: id,
        organization: new mongoose.Types.ObjectId(organizationId), // FIX: Ensure organization filter
        isDeleted: false
      }).populate([
        {
          path: 'createdBy',
          select: 'name fullName email',
          model: function(doc) {
            return doc.createdByModel;
          }
        },
        {
          path: 'updatedBy',
          select: 'name fullName email',
          model: function(doc) {
            return doc.updatedByModel;
          }
        }
      ]);

      if (!client) {
        return res.status(404).json({
          success: false,
          message: 'Client not found'
        });
      }

      res.json({
        success: true,
        data: client
      });

    } catch (error) {
      console.error('Get client by ID error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch client',
        error: error.message
      });
    }
  }

  // Create new client
  async createClient(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: errors.array()
        });
      }

      const organizationId = req.user.organization || req.user.organizationId;
      const userData = req.user;

      if (!organizationId) {
        return res.status(400).json({
          success: false,
          message: 'Organization ID is required'
        });
      }

      // Check if client with same email exists in organization
      const existingClient = await Client.findOne({
        email: req.body.email.toLowerCase(),
        organization: organizationId,
        isDeleted: false
      });

      if (existingClient) {
        return res.status(400).json({
          success: false,
          message: 'Client with this email already exists'
        });
      }

      // Determine the creator model type
      let createdByModel = 'User';
      if (userData.employeeId) createdByModel = 'Employee';
      if (userData.adminId) createdByModel = 'Admin';

      const clientData = {
        ...req.body,
        organization: organizationId,
        createdBy: userData._id,
        createdByModel
      };

      const client = new Client(clientData);
      await client.save();

      // Populate the created client
      await client.populate([
        {
          path: 'createdBy',
          select: 'name fullName email',
          model: createdByModel
        }
      ]);

      res.status(201).json({
        success: true,
        message: 'Client created successfully',
        data: client
      });

    } catch (error) {
      console.error('Create client error:', error);
      
      if (error.name === 'ValidationError') {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: Object.values(error.errors).map(err => ({
            field: err.path,
            message: err.message
          }))
        });
      }

      res.status(500).json({
        success: false,
        message: 'Failed to create client',
        error: error.message
      });
    }
  }

  // Update client
  async updateClient(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: errors.array()
        });
      }

      const { id } = req.params;
      const organizationId = req.user.organization || req.user.organizationId;
      const userData = req.user;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid client ID'
        });
      }

      // Check if client exists
      const client = await Client.findOne({
        _id: id,
        organization: new mongoose.Types.ObjectId(organizationId), // FIX: Ensure organization filter
        isDeleted: false
      });

      if (!client) {
        return res.status(404).json({
          success: false,
          message: 'Client not found'
        });
      }

      // Check if email is being changed and if it conflicts
      if (req.body.email && req.body.email !== client.email) {
        const existingClient = await Client.findOne({
          email: req.body.email.toLowerCase(),
          organization: organizationId,
          _id: { $ne: id },
          isDeleted: false
        });

        if (existingClient) {
          return res.status(400).json({
            success: false,
            message: 'Client with this email already exists'
          });
        }
      }

      // Determine the updater model type
      let updatedByModel = 'User';
      if (userData.employeeId) updatedByModel = 'Employee';
      if (userData.adminId) updatedByModel = 'Admin';

      // Set update tracking
      client.updatedBy = userData._id;
      client.updatedByModel = updatedByModel;

      // Update fields
      Object.keys(req.body).forEach(key => {
        if (key !== 'organization' && key !== 'createdBy' && key !== 'createdByModel') {
          client[key] = req.body[key];
        }
      });

      await client.save();

      // Populate the updated client
      await client.populate([
        {
          path: 'updatedBy',
          select: 'name fullName email',
          model: updatedByModel
        }
      ]);

      res.json({
        success: true,
        message: 'Client updated successfully',
        data: client
      });

    } catch (error) {
      console.error('Update client error:', error);
      
      if (error.name === 'ValidationError') {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: Object.values(error.errors).map(err => ({
            field: err.path,
            message: err.message
          }))
        });
      }

      res.status(500).json({
        success: false,
        message: 'Failed to update client',
        error: error.message
      });
    }
  }

  // Soft delete client
  async deleteClient(req, res) {
    try {
      const { id } = req.params;
      const organizationId = req.user.organization || req.user.organizationId;
      const userData = req.user;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid client ID'
        });
      }

      const client = await Client.findOne({
        _id: id,
        organization: new mongoose.Types.ObjectId(organizationId), // FIX: Ensure organization filter
        isDeleted: false
      });

      if (!client) {
        return res.status(404).json({
          success: false,
          message: 'Client not found'
        });
      }

      // Determine the deleter model type
      let deletedByModel = 'User';
      if (userData.employeeId) deletedByModel = 'Employee';
      if (userData.adminId) deletedByModel = 'Admin';

      // softDelete is a custom method, assuming it's defined on the model
      await client.softDelete(userData._id, deletedByModel);

      res.json({
        success: true,
        message: 'Client deleted successfully'
      });

    } catch (error) {
      console.error('Delete client error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete client',
        error: error.message
      });
    }
  }

  // Restore deleted client
  async restoreClient(req, res) {
    try {
      const { id } = req.params;
      const organizationId = req.user.organization || req.user.organizationId;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid client ID'
        });
      }

      const client = await Client.findOne({
        _id: id,
        organization: new mongoose.Types.ObjectId(organizationId), // FIX: Ensure organization filter
        isDeleted: true
      });

      if (!client) {
        return res.status(404).json({
          success: false,
          message: 'Deleted client not found'
        });
      }

      // restore is a custom method, assuming it's defined on the model
      await client.restore();

      res.json({
        success: true,
        message: 'Client restored successfully',
        data: client
      });

    } catch (error) {
      console.error('Restore client error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to restore client',
        error: error.message
      });
    }
  }

  // Get active clients for dropdown/selection
  async getActiveClients(req, res) {
    try {
      const organizationId = req.user.organization || req.user.organizationId;

      if (!organizationId) {
        return res.status(400).json({
          success: false,
          message: 'Organization ID is required'
        });
      }

      // findActiveByOrganization is a custom method, assuming it's defined on the model
      const clients = await Client.findActiveByOrganization(organizationId)
        .select('clientId name email phone companyName displayName');

      res.json({
        success: true,
        data: clients
      });

    } catch (error) {
      console.error('Get active clients error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch active clients',
        error: error.message
      });
    }
  }

  // Search clients
  async searchClients(req, res) {
    try {
      const { q: searchTerm } = req.query;
      const organizationId = req.user.organization || req.user.organizationId;

      if (!organizationId) {
        return res.status(400).json({
          success: false,
          message: 'Organization ID is required'
        });
      }

      if (!searchTerm || searchTerm.trim().length < 2) {
        return res.status(400).json({
          success: false,
          message: 'Search term must be at least 2 characters long'
        });
      }
      
      // searchClients is a custom method, assuming it's defined on the model
      const clients = await Client.searchClients(organizationId, searchTerm.trim())
        .select('clientId name email phone companyName displayName status clientType');

      res.json({
        success: true,
        data: clients
      });

    } catch (error) {
      console.error('Search clients error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to search clients',
        error: error.message
      });
    }
  }

  // Update client statistics
  async updateClientStats(req, res) {
    try {
      const { id } = req.params;
      const organizationId = req.user.organization || req.user.organizationId;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid client ID'
        });
      }

      const client = await Client.findOne({
        _id: id,
        organization: new mongoose.Types.ObjectId(organizationId), // FIX: Ensure organization filter
        isDeleted: false
      });

      if (!client) {
        return res.status(404).json({
          success: false,
          message: 'Client not found'
        });
      }

      // updateStats is a custom method, assuming it's defined on the model
      await client.updateStats();

      res.json({
        success: true,
        message: 'Client statistics updated successfully',
        data: {
          totalInvoices: client.totalInvoices,
          totalRevenue: client.totalRevenue,
          lastInvoiceDate: client.lastInvoiceDate,
          lastPaymentDate: client.lastPaymentDate
        }
      });

    } catch (error) {
      console.error('Update client stats error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update client statistics',
        error: error.message
      });
    }
  }

  // Get client statistics
  async getClientStats(req, res) {
    try {
      const organizationId = req.user.organization || req.user.organizationId;

      if (!organizationId) {
        return res.status(400).json({
          success: false,
          message: 'Organization ID is required'
        });
      }

      const stats = await Client.aggregate([
        {
          $match: {
            organization: new mongoose.Types.ObjectId(organizationId),
            isDeleted: false
          }
        },
        {
          $group: {
            _id: null,
            totalClients: { $sum: 1 },
            activeClients: {
              $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
            },
            inactiveClients: {
              $sum: { $cond: [{ $eq: ['$status', 'inactive'] }, 1, 0] }
            },
            businessClients: {
              $sum: { $cond: [{ $eq: ['$clientType', 'business'] }, 1, 0] }
            },
            individualClients: {
              $sum: { $cond: [{ $eq: ['$clientType', 'individual'] }, 1, 0] }
            },
            totalRevenue: { $sum: '$totalRevenue' }
          }
        }
      ]);

      const result = stats[0] || {
        totalClients: 0,
        activeClients: 0,
        inactiveClients: 0,
        businessClients: 0,
        individualClients: 0,
        totalRevenue: 0
      };

      res.json({
        success: true,
        data: result
      });

    } catch (error) {
      console.error('Get client stats error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch client statistics',
        error: error.message
      });
    }
  }
}

module.exports = new ClientController();
