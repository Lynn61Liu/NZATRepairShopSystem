import { useState } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
// import { CarDetails } from '@/types';
import type { CarDetails } from "@/types";


interface AddCardModalProps {
  onClose: () => void;
  onAdd: (carInfo: string, parts: string[], details: CarDetails) => void;
}

export function AddCardModal({ onClose, onAdd }: AddCardModalProps) {
  const [carInfo, setCarInfo] = useState('');
  const [parts, setParts] = useState<string[]>(['']);
  const [details, setDetails] = useState<CarDetails>({
    owner: '',
    phone: '',
    vin: '',
    mileage: '',
    issue: ''
  });

  const handleAddPart = () => {
    setParts([...parts, '']);
  };

  const handleRemovePart = (index: number) => {
    setParts(parts.filter((_, i) => i !== index));
  };

  const handlePartChange = (index: number, value: string) => {
    const newParts = [...parts];
    newParts[index] = value;
    setParts(newParts);
  };

  const handleDetailChange = (field: keyof CarDetails, value: string) => {
    setDetails(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = () => {
    const validParts = parts.filter(p => p.trim() !== '');
    if (carInfo.trim() && validParts.length > 0 && details.owner && details.phone) {
      onAdd(carInfo.trim(), validParts, details);
      onClose();
    } else {
      alert('请填写车辆信息、车主姓名、联系电话和至少一个配件');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-900">新建维修工单</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* 车辆信息 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              车辆信息 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={carInfo}
              onChange={(e) => setCarInfo(e.target.value)}
              placeholder="例如：奥迪A6 粤B·12345"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* 车主信息 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                车主姓名 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={details.owner}
                onChange={(e) => handleDetailChange('owner', e.target.value)}
                placeholder="例如：张先生"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                联系电话 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={details.phone}
                onChange={(e) => handleDetailChange('phone', e.target.value)}
                placeholder="例如：138-1234-5678"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* 车辆详细信息 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                车架号(VIN)
              </label>
              <input
                type="text"
                value={details.vin}
                onChange={(e) => handleDetailChange('vin', e.target.value)}
                placeholder="例如：LFVBA24B8E3123456"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                里程数
              </label>
              <input
                type="text"
                value={details.mileage}
                onChange={(e) => handleDetailChange('mileage', e.target.value)}
                placeholder="例如：45000公里"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* 维修说明 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              维修说明
            </label>
            <textarea
              value={details.issue}
              onChange={(e) => handleDetailChange('issue', e.target.value)}
              placeholder="请描述车辆问题..."
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* 配件列表 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              需要配件 <span className="text-red-500">*</span>
            </label>
            <div className="space-y-2">
              {parts.map((part, index) => (
                <div key={index} className="flex gap-2">
                  <input
                    type="text"
                    value={part}
                    onChange={(e) => handlePartChange(index, e.target.value)}
                    placeholder={`配件 ${index + 1}`}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {parts.length > 1 && (
                    <button
                      onClick={() => handleRemovePart(index)}
                      className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={handleAddPart}
              className="mt-2 flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              添加配件
            </button>
          </div>
        </div>

        <div className="sticky bottom-0 bg-white flex gap-3 p-6 border-t">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            创建工单
          </button>
        </div>
      </div>
    </div>
  );
}
