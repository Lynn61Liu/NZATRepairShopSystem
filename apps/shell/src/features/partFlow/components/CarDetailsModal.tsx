import { X, User, Phone, Hash, Gauge, FileText, Calendar, Clock } from 'lucide-react';
import type { Status, WorkCard } from '@/types';

interface CarDetailsModalProps {
  card: WorkCard;
  onClose: () => void;
}

export function CarDetailsModal({ card, onClose }: CarDetailsModalProps) {
  const statusLabels: Record<Status, string> = {
    pending_order: "待下单",
    needs_pt: "需要发PT",
    parts_trader: "PartsTrader",
    pickup_or_transit: "待取/在途",
  };

  const formatDateTime = (value: string | Date) => {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const calculateDuration = () => {
    const now = new Date();
    const created = new Date(card.createdAt);
    const diffMs = now.getTime() - created.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    if (diffDays > 0) {
      return `${diffDays}天${diffHours}小时`;
    } else {
      return `${diffHours}小时`;
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-2xl font-semibold text-gray-900">工单详情</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* 车辆基本信息 */}
          <div className="bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
            <h3 className="text-lg font-semibold text-blue-900 mb-3">车辆信息</h3>
            <div className="text-2xl font-bold text-blue-900">{card.carInfo}</div>
          </div>

          {/* 在店时长 */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-5 h-5 text-orange-600" />
                <span className="text-sm font-medium text-orange-900">在店时长</span>
              </div>
              <div className="text-xl font-semibold text-orange-700">{calculateDuration()}</div>
            </div>
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Calendar className="w-5 h-5 text-green-600" />
                <span className="text-sm font-medium text-green-900">进店时间</span>
              </div>
              <div className="text-sm font-semibold text-green-700">{formatDateTime(card.createdAt)}</div>
            </div>
          </div>

          {/* 车主信息 */}
          <div className="border border-gray-200 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">车主信息</h3>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <User className="w-5 h-5 text-gray-500" />
                <div>
                  <div className="text-xs text-gray-500">车主姓名</div>
                  <div className="font-medium text-gray-900">{card.details.owner}</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Phone className="w-5 h-5 text-gray-500" />
                <div>
                  <div className="text-xs text-gray-500">联系电话</div>
                  <div className="font-medium text-gray-900">{card.details.phone}</div>
                </div>
              </div>
            </div>
          </div>

          {/* 车辆详细信息 */}
          <div className="border border-gray-200 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">车辆详细信息</h3>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Hash className="w-5 h-5 text-gray-500" />
                <div>
                  <div className="text-xs text-gray-500">车架号(VIN)</div>
                  <div className="font-medium text-gray-900 font-mono">{card.details.vin}</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Gauge className="w-5 h-5 text-gray-500" />
                <div>
                  <div className="text-xs text-gray-500">里程数</div>
                  <div className="font-medium text-gray-900">{card.details.mileage}</div>
                </div>
              </div>
            </div>
          </div>

          {/* 维修说明 */}
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <FileText className="w-5 h-5 text-gray-700" />
              <h3 className="text-lg font-semibold text-gray-900">维修说明</h3>
            </div>
            <div className="text-gray-700 leading-relaxed">{card.details.issue}</div>
          </div>

          {/* 配件清单 */}
          <div className="border border-gray-200 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">所需配件清单</h3>
            <div className="flex flex-wrap gap-2">
              {card.parts.map((part, index) => (
                <span
                  key={index}
                  className="bg-blue-100 text-blue-800 px-3 py-2 rounded-lg font-medium"
                >
                  {part}
                </span>
              ))}
            </div>
          </div>

          {/* 当前状态 */}
          <div className="border border-gray-200 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">当前状态</h3>
            <div className="inline-block bg-gradient-to-r from-purple-500 to-purple-600 text-white px-4 py-2 rounded-lg font-semibold text-lg">
              {statusLabels[card.status] ?? card.status}
            </div>
          </div>

          {/* 备注历史 */}
          {card.notes.length > 0 && (
            <div className="border border-gray-200 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">备注历史</h3>
              <div className="space-y-2">
                {card.notes.map(note => (
                  <div key={note.id} className="bg-yellow-50 border border-yellow-200 rounded p-3">
                    <div className="text-xs text-yellow-700 mb-1">
                      {formatDateTime(note.timestamp)}
                    </div>
                    <div className="text-sm text-gray-800">{note.text}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
