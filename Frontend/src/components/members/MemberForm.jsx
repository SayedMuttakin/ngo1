import React, { useState, useEffect } from 'react';
import { X, User, Phone, Calendar, CreditCard, MapPin, Camera, Building2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { membersAPI, branchesAPI } from '../../utils/api';

const MemberForm = ({ member, onSave, onCancel, branches }) => {
  // Auto-fill branch information if branches prop is provided (from installment collection)
  const isFromInstallmentCollection = branches && branches.length === 1;
  const presetBranch = isFromInstallmentCollection ? branches[0] : null;

  // Format join date for input[type="date"]
  const formatDateForInput = (dateString) => {
    if (!dateString) return new Date().toISOString().split('T')[0];
    try {
      const date = new Date(dateString);
      return date.toISOString().split('T')[0];
    } catch (e) {
      return new Date().toISOString().split('T')[0];
    }
  };

  // Debug member data
  if (member) {
    console.log('📝 Editing member:', member);
    console.log('📍 Branch info:', {
      branch: member.branch,
      branchName: member.branchName,
      branchCode: member.branchCode
    });
    console.log('📅 Join Date:', {
      original: member.joinDate,
      formatted: formatDateForInput(member.joinDate)
    });
    console.log('🖼️ Profile Image:', {
      hasImage: !!member.profileImage,
      imageType: typeof member.profileImage,
      imageLength: member.profileImage?.length,
      imagePreview: member.profileImage?.substring(0, 50) + '...'
    });
  }

  const [formData, setFormData] = useState({
    name: member?.name || '',
    memberCode: member?.memberCode || '', // 3 digit member code
    sponsorName: member?.sponsorName || '', // Sponsor name
    age: member?.age || '',
    phone: member?.phone || '',
    joinDate: formatDateForInput(member?.joinDate), // Format date properly
    nidNumber: member?.nidNumber || '',
    address: member?.address || '', // Add address field
    branch: member?.branch || presetBranch?.name || '',
    branchCode: member?.branchCode || presetBranch?.code || '',
    branchName: member?.branchName || member?.branch || presetBranch?.name || '', // Use branch if branchName not available
    status: member?.status || 'Active',
    totalSavings: member?.totalSavings || 0,
    profileImage: member?.profileImage || null,
    assignedCollector: member?.assignedCollector?._id || member?.assignedCollector || null
  });

  const [errors, setErrors] = useState({});
  const [existingMembers, setExistingMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [availableBranches, setAvailableBranches] = useState([]);
  const [loadingBranches, setLoadingBranches] = useState(false);

  // Fetch all branches on component mount
  useEffect(() => {
    const fetchBranches = async () => {
      try {
        setLoadingBranches(true);
        console.log('🔄 Fetching branches...');
        // Fetch ALL branches (active + inactive) with large limit
        const response = await branchesAPI.getAll({ limit: 1000, isActive: 'all' });
        console.log('📦 Branches response:', response);
        if (response.success && response.data) {
          console.log('✅ Branches loaded:', response.data.length, 'branches');
          setAvailableBranches(response.data);
        } else {
          console.error('❌ Failed to load branches:', response);
          toast.error('Failed to load branches');
        }
      } catch (error) {
        console.error('❌ Error fetching branches:', error);
        toast.error('Failed to load branches: ' + error.message);
      } finally {
        setLoadingBranches(false);
      }
    };

    fetchBranches();
  }, []);

  // Fetch existing members when branch code changes
  useEffect(() => {
    const fetchExistingMembers = async () => {
      if (formData.branchCode && formData.branchCode.length === 4) {
        try {
          setLoadingMembers(true);
          const response = await membersAPI.getByBranch(formData.branchCode);
          if (response.success && response.data) {
            setExistingMembers(response.data);
          } else {
            setExistingMembers([]);
          }
        } catch (error) {
          console.error('Error fetching existing members:', error);
          setExistingMembers([]);
        } finally {
          setLoadingMembers(false);
        }
      } else {
        setExistingMembers([]);
      }
    };

    fetchExistingMembers();
  }, [formData.branchCode]);

  // Handle branch selection from dropdown
  const handleBranchSelect = (e) => {
    const selectedBranchId = e.target.value;
    if (!selectedBranchId) {
      setFormData({ ...formData, branchCode: '', branchName: '', assignedCollector: null });
      return;
    }

    const selectedBranch = availableBranches.find(b => b._id === selectedBranchId);
    if (selectedBranch) {
      // Auto-assign collector if branch has one
      const collectorId = selectedBranch.assignedCollector?._id || selectedBranch.assignedCollector || null;

      setFormData({
        ...formData,
        branchCode: selectedBranch.branchCode || selectedBranch.code,
        branchName: selectedBranch.name,
        assignedCollector: collectorId
      });

      if (collectorId) {
        const collectorName = selectedBranch.assignedCollector?.name || 'Assigned collector';
        console.log(`✅ Auto-assigned collector: ${collectorName} to branch ${selectedBranch.name}`);
      }
    }
  };

  const validateForm = () => {
    const newErrors = {};

    // Name validation - 2-100 characters, letters and spaces only
    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    } else if (formData.name.trim().length < 2 || formData.name.trim().length > 100) {
      newErrors.name = 'Name must be between 2 and 100 characters';
    } else if (!/^[a-zA-Z\s\u0980-\u09FF]+$/.test(formData.name.trim())) {
      newErrors.name = 'Name can only contain letters and spaces';
    }

    // Member Code validation - 3 digits and unique within branch
    // Skip validation if editing existing member
    if (!member) {
      // Only validate for new members
      if (!formData.memberCode.trim()) {
        newErrors.memberCode = 'Member code is required';
      } else if (!/^\d{3}$/.test(formData.memberCode.trim())) {
        newErrors.memberCode = 'Member code must be exactly 3 digits';
      } else {
        // Check for uniqueness within the same branch
        const memberCodeExists = existingMembers.some(existingMember =>
          existingMember.memberCode === formData.memberCode.trim()
        );

        if (memberCodeExists) {
          newErrors.memberCode = `Member code ${formData.memberCode} already exists in this branch. Please use a different code.`;
        }
      }
    }

    // Age validation - 18-100
    if (!formData.age) {
      newErrors.age = 'Age is required';
    } else if (formData.age < 18 || formData.age > 100) {
      newErrors.age = 'Age must be between 18 and 100';
    }

    // Phone validation - Bangladeshi format
    if (!formData.phone.trim()) {
      newErrors.phone = 'Phone number is required';
    } else if (!/^01[3-9]\d{8}$/.test(formData.phone.trim())) {
      newErrors.phone = 'Please enter a valid Bangladeshi phone number (01XXXXXXXXX)';
    }

    // Join date is optional in backend
    if (formData.joinDate && !/^\d{4}-\d{2}-\d{2}$/.test(formData.joinDate)) {
      newErrors.joinDate = 'Please enter a valid date';
    }

    // NID validation - 10-17 digits only
    if (!formData.nidNumber.trim()) {
      newErrors.nidNumber = 'NID number is required';
    } else if (formData.nidNumber.trim().length < 5 || formData.nidNumber.trim().length > 20) {
      newErrors.nidNumber = 'NID number must be between 5 and 20 digits';
    } else if (!/^\d+$/.test(formData.nidNumber.trim())) {
      newErrors.nidNumber = 'NID number can only contain digits';
    }

    // Branch name validation - 2-100 characters
    if (!formData.branchName?.trim()) {
      newErrors.branch = 'Branch name is required';
    } else if (formData.branchName.trim().length < 2 || formData.branchName.trim().length > 100) {
      newErrors.branch = 'Branch name must be between 2 and 100 characters';
    }

    // Branch code validation - exactly 4 digits
    if (!formData.branchCode) {
      newErrors.branchCode = 'Branch code is required';
    } else if (!/^\d{4}$/.test(String(formData.branchCode))) {
      newErrors.branchCode = 'Branch code must be exactly 4 digits';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };
  const handleSubmit = (e) => {
    e.preventDefault();
    if (validateForm()) {
      // If there's a new image file, use FormData
      if (formData.profileImageFile) {
        const formDataToSend = new FormData();
        formDataToSend.append('name', formData.name.trim());
        formDataToSend.append('memberCode', formData.memberCode.trim().padStart(3, '0'));
        formDataToSend.append('sponsorName', formData.sponsorName.trim() || '');
        formDataToSend.append('age', parseInt(formData.age));
        formDataToSend.append('phone', formData.phone.trim());
        formDataToSend.append('joinDate', formData.joinDate);
        formDataToSend.append('nidNumber', formData.nidNumber.trim());
        formDataToSend.append('address', formData.address.trim() || '');
        formDataToSend.append('branch', formData.branchName.trim());
        formDataToSend.append('branchCode', formData.branchCode.toString());
        formDataToSend.append('status', formData.status || 'Active');
        formDataToSend.append('totalSavings', parseFloat(formData.totalSavings) || 0);
        formDataToSend.append('assignedCollector', formData.assignedCollector || '');
        formDataToSend.append('role', 'member');
        formDataToSend.append('profileImage', formData.profileImageFile); // Actual file

        console.log('📤 Sending FormData with image file');
        onSave(formDataToSend);
      } else {
        // No new image, send JSON
        const payload = {
          name: formData.name.trim(),
          memberCode: formData.memberCode.trim().padStart(3, '0'),
          sponsorName: formData.sponsorName.trim() || null,
          age: parseInt(formData.age),
          phone: formData.phone.trim(),
          joinDate: formData.joinDate,
          nidNumber: formData.nidNumber.trim(),
          address: formData.address.trim() || null,
          branch: formData.branchName.trim(),
          branchCode: formData.branchCode.toString(),
          status: formData.status || 'Active',
          totalSavings: parseFloat(formData.totalSavings) || 0,
          profileImage: formData.profileImage || null,
          assignedCollector: formData.assignedCollector || null,
          role: 'member'
        };

        console.log('📤 Sending JSON payload');
        onSave(payload);
      }
    } else {
      toast.error('Please fill all required fields correctly.');
    }
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    console.log('📸 File selected:', file);

    if (file) {
      console.log('File details:', {
        name: file.name,
        size: file.size,
        type: file.type
      });

      // No size limit on image, backend compresses it using sharp
      console.log('Image size:', file.size);

      // Reset image error state
      setImageError(false);

      // Store the actual file object AND create preview
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64String = event.target.result;
        console.log('✅ Image preview created');
        // Store both file and preview
        setFormData({
          ...formData,
          profileImage: base64String, // For preview
          profileImageFile: file // For upload
        });
        toast.success('Image uploaded successfully!');
      };
      reader.onerror = (error) => {
        console.error('❌ FileReader error:', error);
        toast.error('Failed to read image file');
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-xl border max-w-2xl w-full mx-auto">
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">
            {member ? 'Edit Member' : 'Add New Member'}
          </h2>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600 p-2"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Branch Information Notice */}
        {isFromInstallmentCollection && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center">
              <MapPin className="h-5 w-5 text-green-600 mr-2" />
              <div>
                <p className="text-green-800 font-medium">Branch Information Auto-filled</p>
                <p className="text-green-600 text-sm">
                  This member will be added to <strong>{presetBranch?.name}</strong> (Code: <strong>{presetBranch?.code}</strong>)
                </p>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Profile Image - Passport Size */}
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-6 rounded-lg border-2 border-blue-100">
            <label className="block text-sm font-medium text-gray-900 mb-3">
              📸 Profile Image (Passport Size)
            </label>
            <div className="flex items-center space-x-6">
              {/* Debug info */}
              {console.log('🔍 Render - Profile Image State:', {
                hasImage: !!formData.profileImage,
                imageError: imageError,
                imageLength: formData.profileImage?.length,
                imagePreview: formData.profileImage?.substring(0, 50)
              })}

              <div className="relative">
                {formData.profileImage && !imageError ? (
                  <div className="relative">
                    <img
                      src={formData.profileImage}
                      alt="Profile preview"
                      className="w-32 h-40 object-cover border-4 border-white shadow-lg rounded-lg bg-gray-200"
                      style={{ objectPosition: 'center top' }}
                      onError={(e) => {
                        console.error('❌ Image failed to load');
                        console.error('Image source:', formData.profileImage?.substring(0, 100));
                        setImageError(true);
                      }}
                      onLoad={() => {
                        console.log('✅ Image loaded successfully');
                        setImageError(false);
                      }}
                    />
                  </div>
                ) : formData.profileImage && imageError ? (
                  <div className="w-32 h-40 bg-gradient-to-br from-yellow-100 to-orange-100 border-4 border-white shadow-lg rounded-lg flex flex-col items-center justify-center">
                    <User className="h-16 w-16 text-yellow-600 mb-2" />
                    <span className="text-xs text-yellow-700 font-medium px-2 text-center">Image Error</span>
                    <span className="text-xs text-yellow-600 mt-1">Upload new</span>
                  </div>
                ) : (
                  <div className="w-32 h-40 bg-gradient-to-br from-gray-100 to-gray-200 border-4 border-white shadow-lg rounded-lg flex flex-col items-center justify-center">
                    <User className="h-16 w-16 text-gray-400 mb-2" />
                    <span className="text-xs text-gray-500 font-medium">No Image</span>
                  </div>
                )}
              </div>
              <div className="flex-1">
                <div className="space-y-3">
                  <div>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageChange}
                      id="profile-image-input"
                      className="hidden"
                    />
                    <label
                      htmlFor="profile-image-input"
                      className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors cursor-pointer font-medium text-sm"
                    >
                      <Camera className="h-4 w-4" />
                      {formData.profileImage ? 'Change Image' : 'Upload Image'}
                    </label>
                  </div>
                  <div className="text-xs text-gray-600 space-y-1">
                    <p className="flex items-center gap-1">
                      <span className="text-blue-600">✓</span> JPG, PNG, GIF
                    </p>
                    <p className="flex items-center gap-1">
                      <span className="text-blue-600">✓</span> Passport size recommended
                    </p>
                    <p className="flex items-center gap-1">
                      <span className="text-blue-600">✓</span> Clear face photo
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Basic Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <User className="h-4 w-4 inline mr-1" />
                Full Name *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${errors.name ? 'border-red-300' : 'border-gray-300'
                  }`}
                placeholder="Enter full name"
              />
              {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <CreditCard className="h-4 w-4 inline mr-1" />
                Member Code *
              </label>
              <input
                type="text"
                value={formData.memberCode}
                onChange={(e) => {
                  const code = e.target.value;
                  setFormData({ ...formData, memberCode: code });

                  // ✅ Real-time validation
                  if (!member) { // Only for new members
                    if (!code.trim()) {
                      setErrors({ ...errors, memberCode: 'Member code is required' });
                    } else if (!/^\d{3}$/.test(code.trim())) {
                      setErrors({ ...errors, memberCode: 'Member code must be exactly 3 digits' });
                    } else {
                      // Check uniqueness
                      const exists = existingMembers.some(m => m.memberCode === code.trim());
                      if (exists) {
                        setErrors({ ...errors, memberCode: `Member code ${code} already exists in this branch` });
                      } else {
                        // Clear error if valid
                        const { memberCode, ...rest } = errors;
                        setErrors(rest);
                      }
                    }
                  }
                }}
                className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${errors.memberCode ? 'border-red-300' : 'border-gray-300'
                  }`}
                placeholder="Enter 3 digit code (e.g. 001)"
                maxLength="3"
                disabled={!!member}
              />
              {loadingMembers && formData.branchCode && (
                <p className="text-blue-500 text-xs mt-1">
                  🔄 Checking member code availability in branch {formData.branchCode}...
                </p>
              )}
              {errors.memberCode && <p className="text-red-500 text-xs mt-1">{errors.memberCode}</p>}
              {!errors.memberCode && !loadingMembers && formData.memberCode && formData.branchCode && existingMembers.length >= 0 && (
                <p className="text-green-500 text-xs mt-1">
                  ✅ Member code {formData.memberCode} is available in branch {formData.branchCode}
                </p>
              )}
              {!formData.branchCode && (
                <p className="text-gray-500 text-xs mt-1">
                  💡 Member codes must be unique within the same branch only
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <User className="h-4 w-4 inline mr-1" />
                Sponsor Name
              </label>
              <input
                type="text"
                value={formData.sponsorName}
                onChange={(e) => setFormData({ ...formData, sponsorName: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter sponsor name (optional)"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Age *
              </label>
              <input
                type="number"
                value={formData.age}
                onChange={(e) => setFormData({ ...formData, age: e.target.value })}
                className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${errors.age ? 'border-red-300' : 'border-gray-300'
                  }`}
                placeholder="Enter age"
                min="18"
              />
              {errors.age && <p className="text-red-500 text-xs mt-1">{errors.age}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Phone className="h-4 w-4 inline mr-1" />
                Phone Number *
              </label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${errors.phone ? 'border-red-300' : 'border-gray-300'
                  }`}
                placeholder="01xxxxxxxxx"
              />
              {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Calendar className="h-4 w-4 inline mr-1" />
                Join Date * {member && <span className="text-xs text-gray-500">(Cannot be changed)</span>}
              </label>
              <input
                type="date"
                value={formData.joinDate}
                onChange={(e) => setFormData({ ...formData, joinDate: e.target.value })}
                disabled={!!member}
                className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${errors.joinDate ? 'border-red-300' : 'border-gray-300'
                  } ${member ? 'bg-gray-100 cursor-not-allowed' : ''}`}
              />
              {errors.joinDate && <p className="text-red-500 text-xs mt-1">{errors.joinDate}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <CreditCard className="h-4 w-4 inline mr-1" />
                NID Number *
              </label>
              <input
                type="text"
                value={formData.nidNumber}
                onChange={(e) => setFormData({ ...formData, nidNumber: e.target.value })}
                className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${errors.nidNumber ? 'border-red-300' : 'border-gray-300'
                  }`}
                placeholder="National ID number"
              />
              {errors.nidNumber && <p className="text-red-500 text-xs mt-1">{errors.nidNumber}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <MapPin className="h-4 w-4 inline mr-1" />
                Address
              </label>
              <input
                type="text"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter full address"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Building2 className="h-4 w-4 inline mr-1" />
                Select Branch *
                {isFromInstallmentCollection && (
                  <span className="text-green-600 text-xs ml-2">(Auto-filled from selected branch)</span>
                )}
                {member && (
                  <span className="text-gray-500 text-xs ml-2">(Cannot be changed)</span>
                )}
              </label>
              <select
                value={availableBranches.find(b => (b.branchCode || b.code) === formData.branchCode)?._id || ''}
                onChange={handleBranchSelect}
                disabled={isFromInstallmentCollection || !!member || loadingBranches}
                className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${errors.branchCode || errors.branch ? 'border-red-300' : 'border-gray-300'
                  } ${(isFromInstallmentCollection || member || loadingBranches) ? 'bg-gray-100 cursor-not-allowed' : ''}`}
              >
                <option value="">-- Select a Branch --</option>
                {loadingBranches ? (
                  <option disabled>Loading branches...</option>
                ) : (
                  availableBranches.map(branch => (
                    <option key={branch._id} value={branch._id}>
                      ({branch.branchCode || branch.code}) {branch.name}
                    </option>
                  ))
                )}
              </select>
              {(errors.branchCode || errors.branch) && (
                <p className="text-red-500 text-xs mt-1">{errors.branchCode || errors.branch}</p>
              )}
              {formData.branchCode && formData.branchName && !errors.branchCode && !errors.branch && (
                <div className="text-xs mt-1 space-y-1">
                  <p className="text-green-500">
                    ✅ Selected: ({formData.branchCode}) {formData.branchName}
                  </p>
                  {formData.assignedCollector && (
                    <p className="text-blue-500">
                      👤 Collector will be auto-assigned from this branch
                    </p>
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Status
              </label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
                <option value="Pending">Pending</option>
              </select>
            </div>

            {/* Only show Initial Savings when creating a new member */}
            {!member && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Initial Savings (৳)
                </label>
                <input
                  type="number"
                  value={formData.totalSavings}
                  onChange={(e) => setFormData({ ...formData, totalSavings: parseFloat(e.target.value) || 0 })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="0"
                  min="0"
                />
              </div>
            )}
          </div>

          {/* Form Actions */}
          <div className="flex space-x-4 pt-6">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-all"
            >
              {member ? 'Update Member' : 'Add Member'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default MemberForm;
