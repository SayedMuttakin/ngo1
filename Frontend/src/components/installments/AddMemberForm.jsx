import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { membersAPI } from '../../utils/api';
import { getCurrentBDDate } from '../../utils/dateUtils';
import { compressImage } from '../../utils/imageUtils';

const AddMemberForm = ({ selectedBranch, selectedCollector, onClose, onMemberAdded, editingMember = null }) => {
  const [formData, setFormData] = useState({
    name: '',
    memberCode: '',
    nidNumber: '',
    sponsorName: '',
    age: '',
    phone: '',
    address: '',
    joinDate: getCurrentBDDate(), // Use Bangladesh date
    initialSavings: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [isCheckingCode, setIsCheckingCode] = useState(false);
  const [codeError, setCodeError] = useState('');
  const [codeSuccess, setCodeSuccess] = useState('');

  // Populate form when editing
  useEffect(() => {
    if (editingMember) {
      setFormData({
        name: editingMember.name || '',
        memberCode: editingMember.memberCode || editingMember.memberNumber || '',
        nidNumber: editingMember.nidNumber || '',
        sponsorName: editingMember.sponsorName || '',
        age: editingMember.age || '',
        phone: editingMember.phone || '',
        address: editingMember.address || '',
        joinDate: editingMember.joinDate ? editingMember.joinDate.split('T')[0] : getCurrentBDDate(),
        initialSavings: editingMember.initialSavings || ''
      });

      // Set existing image preview if available
      if (editingMember.profileImage) {
        if (import.meta.env.MODE === 'production') {
          setImagePreview(editingMember.profileImage);
        } else {
          const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
          setImagePreview(`${API_BASE_URL}${editingMember.profileImage}`);
        }
      }
    }
  }, [editingMember]);

  // Debounced check for member code uniqueness
  useEffect(() => {
    if (editingMember) return; // Don't check on edit mode

    const code = formData.memberCode;
    if (code.length < 3) {
      setCodeError('');
      setCodeSuccess('');
      return;
    }

    const handler = setTimeout(() => {
      setIsCheckingCode(true);
      setCodeError('');
      setCodeSuccess('');
      membersAPI.checkCode(code)
        .then(res => {
          if (res.exists) {
            setCodeError(`Code ${code} is already taken by ${res.member.name} in branch ${res.member.branchCode}.`);
          } else {
            setCodeSuccess(`Code ${code} is available.`);
          }
        })
        .catch(err => {
          console.error('Error checking member code:', err);
          setCodeError('Could not verify code. Please try again.');
        })
        .finally(() => {
          setIsCheckingCode(false);
        });
    }, 300); // 300ms debounce delay

    return () => {
      clearTimeout(handler);
    };
  }, [formData.memberCode, editingMember]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;

    // Clear error for this field when user starts typing
    if (fieldErrors[name]) {
      setFieldErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }

    // ✅ Special validation for memberCode
    if (name === 'memberCode') {
      const digitsOnly = value.replace(/\D/g, '').slice(0, 3);
      setFormData(prev => ({ ...prev, memberCode: digitsOnly }));
      // Reset validation state on change
      setCodeError('');
      setCodeSuccess('');
      return;
    }

    // Special validation for phone number
    if (name === 'phone') {
      // Only allow digits
      const digitsOnly = value.replace(/\D/g, '');

      // Validate length
      if (digitsOnly.length > 0 && digitsOnly.length !== 11) {
        setFieldErrors(prev => ({
          ...prev,
          phone: 'length'
        }));
      } else if (digitsOnly.length === 11) {
        // Clear error when exactly 11 digits
        setFieldErrors(prev => {
          const newErrors = { ...prev };
          delete newErrors.phone;
          return newErrors;
        });
      }

      setFormData(prev => ({
        ...prev,
        [name]: digitsOnly
      }));
      return;
    }

    // Allow any input without restrictions for other fields
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleImageChange = async (e) => {
    const file = e.target.files[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        toast.error('Please select an image file');
        return;
      }

      const loadingToast = toast.loading('Processing and optimizing image...');
      try {
        const compressedFile = await compressImage(file);
        toast.dismiss(loadingToast);

        setSelectedImage(compressedFile);

        // Create preview
        const reader = new FileReader();
        reader.onload = (e) => {
          setImagePreview(e.target.result);
        };
        reader.readAsDataURL(compressedFile);
        toast.success('Image optimized successfully!');
      } catch (error) {
        toast.dismiss(loadingToast);
        console.error('❌ Compression error:', error);
        toast.error('Failed to process image');
      }
    }
  };

  const removeImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
    // Reset file input
    const fileInput = document.getElementById('profileImage');
    if (fileInput) {
      fileInput.value = '';
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Comprehensive validation for all required fields
    const errors = {};
    let hasError = false;

    // Validate member code (only for new members)
    if (!editingMember) {
      if (!formData.memberCode || formData.memberCode.length !== 3) {
        errors.memberCode = 'Member code must be exactly 3 digits';
        hasError = true;
      }
      if (codeError) {
        errors.memberCode = codeError;
        hasError = true;
      }
    }

    // Validate full name
    if (!formData.name || formData.name.trim() === '') {
      errors.name = 'required';
      hasError = true;
    }

    // Validate NID number
    if (!formData.nidNumber || formData.nidNumber.trim() === '') {
      errors.nidNumber = 'required';
      hasError = true;
    }

    // Validate age
    if (!formData.age || formData.age.trim() === '') {
      errors.age = 'required';
      hasError = true;
    }

    // Validate phone number
    if (!formData.phone || formData.phone.trim() === '') {
      errors.phone = 'required';
      hasError = true;
    } else if (formData.phone.length !== 11) {
      errors.phone = 'length';
      hasError = true;
    }

    // Validate address
    if (!formData.address || formData.address.trim() === '') {
      errors.address = 'required';
      hasError = true;
    }

    // Validate profile image (only for new members)
    if (!editingMember && !selectedImage && !imagePreview) {
      errors.profileImage = 'required';
      hasError = true;
    }

    // If there are any errors, show them and stop submission
    if (hasError) {
      setFieldErrors(errors);
      toast.error('সকল প্রয়োজনীয় তথ্য পূরণ করুন (Please fill all required fields)');
      return;
    }

    setIsSubmitting(true);
    const loadingToast = toast.loading(editingMember ? 'Updating member...' : 'Adding member...');

    try {
      // Create FormData for file upload
      const formDataToSend = new FormData();

      // Add all form fields with safe handling of empty values
      formDataToSend.append('name', formData.name || '');
      formDataToSend.append('memberCode', formData.memberCode || '');
      formDataToSend.append('nidNumber', formData.nidNumber || '');
      formDataToSend.append('sponsorName', formData.sponsorName || '');
      formDataToSend.append('age', formData.age ? parseInt(formData.age) : '');
      formDataToSend.append('phone', formData.phone || '');
      formDataToSend.append('address', formData.address || '');
      formDataToSend.append('joinDate', formData.joinDate || getCurrentBDDate());
      const savingsValue = formData.initialSavings ? parseFloat(formData.initialSavings) : 0;
      console.log('💰 Initial Savings from form:', formData.initialSavings);
      console.log('💰 Parsed totalSavings value:', savingsValue);
      formDataToSend.append('totalSavings', savingsValue);
      formDataToSend.append('branch', selectedBranch?.name || '');
      formDataToSend.append('branchCode', selectedBranch?.code || '');
      formDataToSend.append('role', 'member');
      // Add assigned collector if available
      if (selectedCollector?.id) {
        formDataToSend.append('assignedCollector', selectedCollector.id);
      }

      // Add image if selected
      if (selectedImage) {
        formDataToSend.append('profileImage', selectedImage);
      }

      let response;
      if (editingMember) {
        // Update existing member
        if (selectedImage) {
          response = await membersAPI.updateWithImage(editingMember._id, formDataToSend);
        } else {
          // Use regular update without image
          const regularData = {
            name: formData.name || '',
            memberCode: formData.memberCode || '',
            nidNumber: formData.nidNumber || '',
            sponsorName: formData.sponsorName || '',
            age: formData.age && !isNaN(parseInt(formData.age)) ? parseInt(formData.age) : '',
            phone: formData.phone || '',
            address: formData.address || '',
            joinDate: formData.joinDate || getCurrentBDDate(),
            totalSavings: formData.initialSavings && !isNaN(parseFloat(formData.initialSavings)) ? parseFloat(formData.initialSavings) : 0,
            branch: selectedBranch?.name || '',
            branchCode: selectedBranch?.code || '',
            role: 'member',
            // Add assigned collector if available
            ...(selectedCollector?.id && { assignedCollector: selectedCollector.id })
          };
          response = await membersAPI.update(editingMember._id, regularData);
        }
      } else {
        // Create new member
        if (selectedImage) {
          response = await membersAPI.createWithImage(formDataToSend);
        } else {
          // Use regular create without image
          const regularData = {
            name: formData.name || '',
            memberCode: formData.memberCode || '',
            nidNumber: formData.nidNumber || '',
            sponsorName: formData.sponsorName || '',
            age: formData.age && !isNaN(parseInt(formData.age)) ? parseInt(formData.age) : '',
            phone: formData.phone || '',
            address: formData.address || '',
            joinDate: formData.joinDate || getCurrentBDDate(),
            totalSavings: formData.initialSavings && !isNaN(parseFloat(formData.initialSavings)) ? parseFloat(formData.initialSavings) : 0,
            branch: selectedBranch?.name || '',
            branchCode: selectedBranch?.code || '',
            role: 'member',
            // Add assigned collector if available
            ...(selectedCollector?.id && { assignedCollector: selectedCollector.id })
          };
          response = await membersAPI.create(regularData);
        }
      }

      toast.dismiss(loadingToast);

      if (response.success) {
        toast.success(editingMember ? 'Member updated successfully!' : 'Member added successfully!');
        setFieldErrors({}); // Clear any errors
        onMemberAdded(); // Refresh members list
        onClose(); // Close form
      } else {
        // Parse error message to detect duplicate fields
        const errorMsg = response.message || `Failed to ${editingMember ? 'update' : 'add'} member`;
        const errors = {};

        const lower = errorMsg.toLowerCase();
        // Check for duplicate Member Code
        if (lower.includes('member code') && lower.includes('already')) {
          errors.memberCode = 'This member code is already in use. Please choose another.';
          toast.error('❌ Member Code already exists!');
        }
        // Check for duplicate NID
        else if (lower.includes('nid') && lower.includes('already')) {
          errors.nidNumber = true;
          toast.error('❌ NID Number already exists! Please use a different NID.');
        }
        // Check for duplicate Phone
        else if (lower.includes('phone') && lower.includes('already')) {
          errors.phone = true;
          toast.error('❌ Phone Number already exists! Please use a different phone number.');
        }
        // Generic error
        else {
          toast.error(errorMsg);
        }

        setFieldErrors(errors);
      }
    } catch (error) {
      toast.dismiss(loadingToast);
      console.error('Error adding member:', error);

      // Try to extract error message from response
      const errorMsg = error.response?.data?.message || error.message || 'Failed to add member';
      const errors = {};

      // Check for duplicate fields in error message
      const lower = errorMsg.toLowerCase();
      if (lower.includes('member code') && lower.includes('already')) {
        errors.memberCode = 'This member code is already in use. Please choose another.';
        toast.error('❌ Member Code already exists!');
      } else if (lower.includes('nid') && lower.includes('already')) {
        errors.nidNumber = true;
        toast.error('❌ NID Number already exists! Please use a different NID.');
      } else if (lower.includes('phone') && lower.includes('already')) {
        errors.phone = true;
        toast.error('❌ Phone Number already exists! Please use a different phone number.');
      } else {
        toast.error(errorMsg);
      }

      setFieldErrors(errors);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-transparent backdrop-blur-md flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-2xl mx-4 max-h-[95vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold text-gray-800">
            {editingMember ? 'Edit Member' : 'Add New Member'}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl"
          >
            ×
          </button>
        </div>

        {/* Branch Info */}
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-6">
          <div className="flex items-center">
            <div className="bg-green-500 text-white rounded-full w-8 h-8 flex items-center justify-center mr-3">
              🏢
            </div>
            <div>
              <p className="text-sm text-green-600 font-medium">Adding to Branch</p>
              <p className="text-green-800 font-semibold">{selectedBranch.code} - {selectedBranch.name}</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Profile Image Upload */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Profile Image (Passport Size) <span className="text-red-500">*</span>
            </label>
            {fieldErrors.profileImage && (
              <p className="text-xs text-red-500 mb-2 font-medium">❌ Profile image is required</p>
            )}
            <div className="flex items-center space-x-4">
              {/* Image Preview */}
              <div className="flex-shrink-0">
                {imagePreview ? (
                  <div className="relative">
                    <img
                      src={imagePreview}
                      alt="Profile Preview"
                      className="w-24 h-32 object-cover border-2 border-gray-300 rounded-lg"
                    />
                    <button
                      type="button"
                      onClick={removeImage}
                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-600"
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <div className="w-24 h-32 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center bg-gray-50">
                    <div className="text-center">
                      <svg className="w-8 h-8 text-gray-400 mx-auto mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      <p className="text-xs text-gray-500">No Image</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Camera and Upload Buttons */}
              <div className="flex-1 space-y-3">
                {/* Camera Button - Opens camera on mobile */}
                <div>
                  <input
                    type="file"
                    id="profileImageCamera"
                    accept="image/*"
                    capture="environment"
                    onChange={handleImageChange}
                    className="hidden"
                  />
                  <label
                    htmlFor="profileImageCamera"
                    className="cursor-pointer w-full inline-flex items-center justify-center px-4 py-2 border border-purple-300 rounded-lg shadow-sm text-sm font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-colors"
                  >
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    📷 Take Photo
                  </label>
                </div>

                {/* Upload Button - Opens file picker/gallery */}
                <div>
                  <input
                    type="file"
                    id="profileImageUpload"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="hidden"
                  />
                  <label
                    htmlFor="profileImageUpload"
                    className="cursor-pointer w-full inline-flex items-center justify-center px-4 py-2 border border-indigo-300 rounded-lg shadow-sm text-sm font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
                  >
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    📁 Upload from Gallery
                  </label>
                </div>

                <p className="text-xs text-gray-500">
                  JPG, PNG, GIF
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Member Code {fieldErrors.memberCode && <span className="text-red-500">*</span>}
              </label>
              <input
                type="text"
                name="memberCode"
                value={formData.memberCode}
                onChange={handleInputChange}
                disabled={!!editingMember}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:border-transparent ${codeError
                    ? 'border-red-500 focus:ring-red-500 bg-red-50'
                    : codeSuccess
                      ? 'border-green-500 focus:ring-green-500 bg-green-50'
                      : 'border-gray-300 focus:ring-green-500'
                  } ${editingMember ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                placeholder="001"
                maxLength="3"
              />
              {isCheckingCode && (
                <p className="text-xs text-blue-500 mt-1">🔄 Checking...</p>
              )}
              {codeError && (
                <p className="text-xs text-red-500 mt-1 font-medium">❌ {codeError}</p>
              )}
              {codeSuccess && (
                <p className="text-xs text-green-600 mt-1 font-medium">✔ {codeSuccess}</p>
              )}
              {!formData.memberCode && !editingMember && (
                <p className="text-xs text-gray-500 mt-1">3-digit code (e.g., 001, 002)</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Full Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:border-transparent ${fieldErrors.name
                    ? 'border-red-500 focus:ring-red-500 bg-red-50'
                    : 'border-gray-300 focus:ring-green-500'
                  }`}
                placeholder="Enter full name"
              />
              {fieldErrors.name && (
                <p className="text-xs text-red-500 mt-1 font-medium">❌ Full name is required</p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              NID Number <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="nidNumber"
              value={formData.nidNumber || ''}
              onChange={handleInputChange}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:border-transparent ${fieldErrors.nidNumber
                  ? 'border-red-500 focus:ring-red-500 bg-red-50'
                  : 'border-gray-300 focus:ring-green-500'
                }`}
              placeholder="Enter NID number"
            />
            {fieldErrors.nidNumber === 'required' && (
              <p className="text-xs text-red-500 mt-1 font-medium">❌ NID number is required</p>
            )}
            {fieldErrors.nidNumber === true && (
              <p className="text-xs text-red-500 mt-1 font-medium">❌ This NID number is already registered</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Sponsor Name
            </label>
            <input
              type="text"
              name="sponsorName"
              value={formData.sponsorName || ''}
              onChange={handleInputChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              placeholder="Enter sponsor name (optional)"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Age <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                name="age"
                value={formData.age}
                onChange={handleInputChange}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:border-transparent ${fieldErrors.age
                    ? 'border-red-500 focus:ring-red-500 bg-red-50'
                    : 'border-gray-300 focus:ring-green-500'
                  }`}
                placeholder="Age"
              />
              {fieldErrors.age && (
                <p className="text-xs text-red-500 mt-1 font-medium">❌ Age is required</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Phone <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleInputChange}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:border-transparent ${fieldErrors.phone
                    ? 'border-red-500 focus:ring-red-500 bg-red-50'
                    : formData.phone && formData.phone.length === 11
                      ? 'border-green-500 focus:ring-green-500 bg-green-50'
                      : 'border-gray-300 focus:ring-green-500'
                  }`}
                placeholder="01XXXXXXXXX"
                maxLength="11"
              />
              {fieldErrors.phone === 'required' && (
                <p className="text-xs text-red-500 mt-1 font-medium">❌ Phone number is required</p>
              )}
              {fieldErrors.phone === 'length' && (
                <p className="text-xs text-red-500 mt-1 font-medium">❌ Phone number must be exactly 11 digits</p>
              )}
              {fieldErrors.phone === true && (
                <p className="text-xs text-red-500 mt-1 font-medium">❌ This phone number is already registered</p>
              )}
              {formData.phone && formData.phone.length === 11 && !fieldErrors.phone && (
                <p className="text-xs text-green-600 mt-1 font-medium">✓ Valid phone number</p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Address <span className="text-red-500">*</span>
            </label>
            <textarea
              name="address"
              value={formData.address}
              onChange={handleInputChange}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:border-transparent ${fieldErrors.address
                  ? 'border-red-500 focus:ring-red-500 bg-red-50'
                  : 'border-gray-300 focus:ring-green-500'
                }`}
              placeholder="Enter address"
              rows="2"
            />
            {fieldErrors.address && (
              <p className="text-xs text-red-500 mt-1 font-medium">❌ Address is required</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Join Date
              </label>
              <input
                type="date"
                name="joinDate"
                value={formData.joinDate}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Initial Savings (৳)
              </label>
              <input
                type="number"
                name="initialSavings"
                value={formData.initialSavings}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="0"
                min="0"
                step="0.01"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
              disabled={isSubmitting}
            >
              {isSubmitting
                ? (editingMember ? 'Updating...' : 'Adding...')
                : (editingMember ? 'Update Member' : 'Add Member')
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddMemberForm;
