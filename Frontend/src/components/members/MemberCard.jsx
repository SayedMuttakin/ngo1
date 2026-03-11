import React, { useState, memo } from 'react';
import { User, Phone, Calendar, CreditCard, MapPin, UserCheck, History } from 'lucide-react';
import { formatBDDateShort } from '../../utils/dateUtils';
import { useNavigate } from 'react-router-dom';
import { getImageUrl } from '../../utils/imageUtils';

const MemberCard = memo(({ member, onEdit, onDelete, onViewProfile }) => {
  const navigate = useNavigate();
  const [imgError, setImgError] = useState(false);

  const handleLoanHistory = () => {
    navigate(`/members/${member._id || member.id}`);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Active': return 'bg-green-100 text-green-800';
      case 'Inactive': return 'bg-red-100 text-red-800';
      case 'Pending': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const imageUrl = member.profileImage ? getImageUrl(member.profileImage) : null;
  const showImage = imageUrl && !imgError;

  return (
    <div className="bg-white rounded-xl shadow-md border-2 border-gray-100 hover:shadow-xl hover:border-blue-200 transition-all duration-300 overflow-hidden">
      {/* Card Header with Photo */}
      <div className="relative bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 p-4">
        <div className="flex items-start gap-4">
          {/* Passport Size Photo */}
          <div className="relative flex-shrink-0">
            {showImage ? (
              <img
                src={imageUrl}
                alt={member.name}
                loading="lazy"
                decoding="async"
                className="w-20 h-24 rounded-lg object-cover border-3 border-white shadow-lg"
                style={{ objectPosition: 'center top' }}
                onError={() => setImgError(true)}
              />
            ) : (
              <div
                className="bg-white rounded-lg flex items-center justify-center shadow-lg"
                style={{ width: '80px', height: '96px' }}
              >
                <User className="h-10 w-10 text-gray-400" />
              </div>
            )}
          </div>

          {/* Member Info */}
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-bold text-white mb-1 truncate">{member.name}</h3>
            <div className="flex items-center text-white/90 text-sm mb-2">
              <Phone className="h-3.5 w-3.5 mr-1.5" />
              <span>{member.phone}</span>
            </div>
            <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(member.status)} shadow-sm`}>
              {member.status}
            </span>
          </div>
        </div>
      </div>

      {/* Card Body */}
      <div className="p-4">
        <div className="space-y-2.5 text-sm">
          <div className="flex items-center text-gray-700">
            <Calendar className="h-4 w-4 mr-2 text-blue-500 flex-shrink-0" />
            <span className="text-xs font-medium">Joined: {formatBDDateShort(member.joinDate)}</span>
          </div>
          <div className="flex items-center text-gray-700">
            <MapPin className="h-4 w-4 mr-2 text-green-500 flex-shrink-0" />
            <span className="text-xs font-medium truncate">
              {member.branchCode ? `${member.branchCode} - ` : ''}{member.branch}
            </span>
          </div>
          <div className="flex items-center text-gray-700">
            <UserCheck className="h-4 w-4 mr-2 text-purple-500 flex-shrink-0" />
            <span className="text-xs font-medium truncate">
              Collector: {member.assignedCollector ?
                (typeof member.assignedCollector === 'object' ?
                  member.assignedCollector.name :
                  'Assigned') :
                <span className="text-gray-400 italic">Not Assigned</span>
              }
            </span>
          </div>
          <div className="flex items-center text-gray-700">
            <CreditCard className="h-4 w-4 mr-2 text-orange-500 flex-shrink-0" />
            <span className="text-xs font-medium">NID: {member.nidNumber}</span>
          </div>
        </div>

        <div className="mt-4 pt-3 border-t-2 border-gray-100">
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg p-3 border border-green-200">
            <p className="text-xs text-gray-600 mb-1">Total Savings</p>
            <p className="text-2xl font-bold text-green-600">৳{member.totalSavings?.toLocaleString() || 0}</p>
          </div>
        </div>
      </div>

      {/* Card Footer */}
      <div className="px-4 py-3 bg-gradient-to-r from-gray-50 to-gray-100 border-t-2 border-gray-200">
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={handleLoanHistory}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-all text-xs font-semibold shadow-sm hover:shadow-md w-full justify-center"
            title="View Loan History"
          >
            <History className="h-4 w-4" />
            <span>Loan History</span>
          </button>
        </div>
      </div>
    </div>
  );
});

MemberCard.displayName = 'MemberCard';

export default MemberCard;
