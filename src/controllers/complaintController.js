const Complaint = require('../models/Complaint')
const Invoice = require('../models/Invoice')
const Organization = require('../models/Organization')

// Create a new complaint (Public endpoint - for clients)
exports.createComplaint = async (req, res) => {
  try {
    const {
      clientName,
      clientEmail,
      clientPhone,
      subject,
      description,
      priority = 'medium',
      category = 'other',
      invoiceNumber,
      organizationId
    } = req.body

    // Validation
    if (!clientName || !clientEmail || !subject || !description || !organizationId) {
      return res.status(400).json({
        success: false,
        message: 'Client name, email, subject, description, and organization are required'
      })
    }

    // Verify organization exists
    const organization = await Organization.findById(organizationId)
    if (!organization) {
      return res.status(400).json({
        success: false,
        message: 'Invalid organization'
      })
    }

    // If invoice number is provided, try to find the related invoice
    let invoiceId = null
    if (invoiceNumber) {
      const invoice = await Invoice.findOne({
        invoiceNumber: invoiceNumber.trim(),
        organization: organizationId
      })
      if (invoice) {
        invoiceId = invoice._id
      }
    }

    // Create complaint
    const complaint = new Complaint({
      clientName: clientName.trim(),
      clientEmail: clientEmail.toLowerCase().trim(),
      clientPhone: clientPhone?.trim(),
      subject: subject.trim(),
      description: description.trim(),
      priority,
      category,
      invoiceId,
      invoiceNumber: invoiceNumber?.trim(),
      organization: organizationId,
      status: 'open'
    })

    await complaint.save()

    // Populate for response
    await complaint.populate([
      { path: 'organization', select: 'name' },
      { path: 'invoiceId', select: 'invoiceNumber totalAmount currency' }
    ])

    res.status(201).json({
      success: true,
      message: 'Complaint submitted successfully',
      data: complaint
    })

  } catch (error) {
    console.error('Create complaint error:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to submit complaint'
    })
  }
}

// Get all complaints for an organization (Protected endpoint - for admin/staff)
exports.getComplaints = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, priority, category, search } = req.query
    const organizationId = req.user.organization

    // Build query
    const query = { organization: organizationId }

    if (status) query.status = status
    if (priority) query.priority = priority
    if (category) query.category = category

    if (search) {
      query.$or = [
        { clientName: { $regex: search, $options: 'i' } },
        { clientEmail: { $regex: search, $options: 'i' } },
        { subject: { $regex: search, $options: 'i' } },
        { invoiceNumber: { $regex: search, $options: 'i' } }
      ]
    }

    const skip = (parseInt(page) - 1) * parseInt(limit)

    const [complaints, totalCount] = await Promise.all([
      Complaint.find(query)
        .populate([
          { path: 'invoiceId', select: 'invoiceNumber totalAmount currency' },
          { path: 'resolvedBy', select: 'fullName email' }
        ])
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Complaint.countDocuments(query)
    ])

    const totalPages = Math.ceil(totalCount / parseInt(limit))

    res.json({
      success: true,
      data: {
        complaints,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalCount,
          hasNext: parseInt(page) < totalPages,
          hasPrev: parseInt(page) > 1
        }
      }
    })

  } catch (error) {
    console.error('Get complaints error:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to fetch complaints'
    })
  }
}

// Get complaint statistics for dashboard
exports.getComplaintStats = async (req, res) => {
  try {
    const organizationId = req.user.organization
    console.log('Getting stats for organization:', organizationId)
    console.log('Organization type:', typeof organizationId)

    // Extract the organization ID properly
    const mongoose = require('mongoose')
    let orgObjectId
    
    if (typeof organizationId === 'object' && organizationId._id) {
      // If it's a populated object, extract the _id
      orgObjectId = new mongoose.Types.ObjectId(organizationId._id)
      console.log('Using _id from object:', orgObjectId)
    } else if (typeof organizationId === 'string') {
      // If it's a string, convert to ObjectId
      orgObjectId = new mongoose.Types.ObjectId(organizationId)
      console.log('Using string ID:', orgObjectId)
    } else {
      // If it's already an ObjectId
      orgObjectId = organizationId
      console.log('Using existing ObjectId:', orgObjectId)
    }

    // First, let's see how many complaints exist for this organization
    const totalCount = await Complaint.countDocuments({ organization: orgObjectId })
    console.log('Total complaints found:', totalCount)

    const stats = await Complaint.aggregate([
      { $match: { organization: orgObjectId } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          open: { $sum: { $cond: [{ $eq: ['$status', 'open'] }, 1, 0] } },
          inProgress: { $sum: { $cond: [{ $eq: ['$status', 'in-progress'] }, 1, 0] } },
          resolved: { $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] } },
          closed: { $sum: { $cond: [{ $eq: ['$status', 'closed'] }, 1, 0] } },
          urgent: { $sum: { $cond: [{ $eq: ['$priority', 'urgent'] }, 1, 0] } },
          high: { $sum: { $cond: [{ $eq: ['$priority', 'high'] }, 1, 0] } }
        }
      }
    ])

    console.log('Aggregation result:', stats)

    const result = stats[0] || {
      total: 0,
      open: 0,
      inProgress: 0,
      resolved: 0,
      closed: 0,
      urgent: 0,
      high: 0
    }

    console.log('Final stats result:', result)

    res.json({
      success: true,
      data: result
    })

  } catch (error) {
    console.error('Get complaint stats error:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to fetch complaint statistics'
    })
  }
}

// Get single complaint by ID
exports.getComplaintById = async (req, res) => {
  try {
    const { id } = req.params
    const organizationId = req.user.organization

    const complaint = await Complaint.findOne({
      _id: id,
      organization: organizationId
    })
      .populate([
        { path: 'invoiceId', select: 'invoiceNumber totalAmount currency client' },
        { path: 'resolvedBy', select: 'fullName email' },
        { path: 'internalNotes.addedBy', select: 'fullName email' }
      ])

    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: 'Complaint not found'
      })
    }

    res.json({
      success: true,
      data: complaint
    })

  } catch (error) {
    console.error('Get complaint by ID error:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to fetch complaint'
    })
  }
}

// Update complaint status and add internal notes
exports.updateComplaint = async (req, res) => {
  try {
    const { id } = req.params
    const {
      status,
      resolution,
      internalNote
    } = req.body
    const organizationId = req.user.organization
    const userId = req.user._id

    const complaint = await Complaint.findOne({
      _id: id,
      organization: organizationId
    })

    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: 'Complaint not found'
      })
    }

    // Update status if provided
    if (status) {
      complaint.status = status
      if (status === 'resolved' || status === 'closed') {
        complaint.resolvedAt = new Date()
        complaint.resolvedBy = userId
      }
    }

    // Update resolution if provided
    if (resolution) {
      complaint.resolution = resolution
    }

    // Add internal note if provided
    if (internalNote) {
      complaint.internalNotes.push({
        note: internalNote,
        addedBy: userId,
        addedAt: new Date()
      })
    }

    await complaint.save()

    // Populate for response
    await complaint.populate([
      { path: 'invoiceId', select: 'invoiceNumber totalAmount currency' },
      { path: 'resolvedBy', select: 'fullName email' },
      { path: 'internalNotes.addedBy', select: 'fullName email' }
    ])

    res.json({
      success: true,
      message: 'Complaint updated successfully',
      data: complaint
    })

  } catch (error) {
    console.error('Update complaint error:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to update complaint'
    })
  }
}

// Delete complaint (Admin only)
exports.deleteComplaint = async (req, res) => {
  try {
    const { id } = req.params
    const organizationId = req.user.organization

    const complaint = await Complaint.findOneAndDelete({
      _id: id,
      organization: organizationId
    })

    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: 'Complaint not found'
      })
    }

    res.json({
      success: true,
      message: 'Complaint deleted successfully'
    })

  } catch (error) {
    console.error('Delete complaint error:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to delete complaint'
    })
  }
}
