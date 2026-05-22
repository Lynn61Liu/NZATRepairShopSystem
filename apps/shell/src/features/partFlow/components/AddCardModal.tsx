import { useState } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
// import { CarDetails } from '@/types';
import type { CarDetails } from "@/types"; interface AddCardModalProps { onClose: () => void; onAdd: (carInfo: string, parts: string[], details: CarDetails) => void; } export function AddCardModal({ onClose, onAdd }: AddCardModalProps) { const [carInfo, setCarInfo] = useState(''); const [parts, setParts] = useState<string[]>(['']); const [details, setDetails] = useState<CarDetails>({ owner: '', phone: '', email: '', vin: '', mileage: '', issue: '', plate: '', make: '', model: '', year: '' }); const handleAddPart = () => { setParts([...parts, '']); }; const handleRemovePart = (index: number) => { setParts(parts.filter((_, i) => i !== index)); }; const handlePartChange = (index: number, value: string) => { const newParts = [...parts]; newParts[index] = value; setParts(newParts); }; const handleDetailChange = (field: keyof CarDetails, value: string) => { setDetails(prev => ({ ...prev, [field]: value })); }; const handleSubmit = () => { const validParts = parts.filter(p => p.trim() !== ''); if (carInfo.trim() && validParts.length > 0 && details.owner && details.phone) { onAdd(carInfo.trim(), validParts, details); onClose(); } else { alert('Please fill in vehicle info, owner name, contact number, and at least one part'); } }; return ( <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-900">Create a new maintenance work order</h2> <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/*vehicle information*/}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2"> Vehicle Information <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={carInfo}
              onChange={(e) => setCarInfo(e.target.value)}
              placeholder="For example: Audi A6 Guangdong B·12345"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/*Car owner information*/}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2"> Owner name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={details.owner}
                onChange={(e) => handleDetailChange('owner', e.target.value)} placeholder="For example: Mr. Zhang" className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" /> </div> <div> <label className="block text-sm font-medium text-gray-700 mb-2"> Contact number <span className="text-red-500">*</span> </label> <input type="text" value={details.phone} onChange={(e) => handleDetailChange('phone', e.target.value)} placeholder="For example: 138-1234-5678" className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" /> </div> </div> {/*Vehicle details*/} <div className="grid grid-cols-2 gap-4"> <div> <label className="block text-sm font-medium text-gray-700 mb-2"> Vehicle frame number (VIN) </label> <input type="text" value={details.vin} onChange={(e) => handleDetailChange('vin', e.target.value)} placeholder="For example: LFVBA24B8E3123456" className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" /> </div> <div> <label className="block text-sm font-medium text-gray-700 mb-2"> mileage </label> <input type="text" value={details.mileage} onChange={(e) => handleDetailChange('mileage', e.target.value)} placeholder="Example: 45000 kilometers" className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" /> </div> </div> {/*Repair instructions*/} <div> <label className="block text-sm font-medium text-gray-700 mb-2"> Repair instructions </label> <textarea value={details.issue} onChange={(e) => handleDetailChange('issue', e.target.value)}
              placeholder="Please describe the vehicle problem..."
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/*Accessories list*/}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2"> Accessories needed <span className="text-red-500">*</span>
            </label>
            <div className="space-y-2">
              {parts.map((part, index) => (
                <div key={index} className="flex gap-2">
                  <input
                    type="text"value={part} onChange={(e) => handlePartChange(index, e.target.value)} placeholder={`Part __VAR_0__`} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              <Plus className="w-4 h-4"/> Add accessories </button> </div> </div> <div className="sticky bottom-0 bg-white flex gap-3 p-6 border-t">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"> Cancel </button> <button onClick={handleSubmit} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >Create a work order</button>
        </div>
      </div>
    </div>
  );
}
