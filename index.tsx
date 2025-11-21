import React, { useState, useMemo, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { 
  Calculator, 
  User, 
  Wallet, 
  Users, 
  LayoutDashboard, 
  FileSpreadsheet, 
  Download, 
  Plus, 
  Trash2, 
  Edit2, 
  Search,
  TrendingUp,
  Building2,
  Save,
  Cloud,
  RefreshCw,
  Check,
  Copy,
  ExternalLink,
  AlertCircle,
  Link,
  ArrowDownToLine,
  ArrowUpFromLine,
  X,
  Settings,
  LogOut,
  Lock,
  Shield,
  UserCircle,
  Eye,
  EyeOff,
  ChevronRight
} from "lucide-react";

// --- Types & Constants ---

// Constants per Vietnam Law (effective July 2024)
const BASE_SALARY = 2340000; // Lương cơ sở

const REGIONAL_MIN_WAGE = {
  1: 4960000,
  2: 4410000,
  3: 3860000,
  4: 3450000,
};

const INSURANCE_RATES = {
  BHXH: 0.08, // 8%
  BHYT: 0.015, // 1.5%
  BHTN: 0.01, // 1%
};

const COMPANY_INSURANCE_RATES = {
  BHXH: 0.175, // 17.5%
  BHYT: 0.03, // 3%
  BHTN: 0.01, // 1%
  KPCD: 0.02, // 2% (Union fee - optional often but kept for full picture)
};

const DEDUCTIONS = {
  SELF: 11000000,
  DEPENDENT: 4400000,
};

const TAX_TIERS = [
  { max: 5000000, rate: 0.05 },
  { max: 10000000, rate: 0.10 },
  { max: 18000000, rate: 0.15 },
  { max: 32000000, rate: 0.20 },
  { max: 52000000, rate: 0.25 },
  { max: 80000000, rate: 0.30 },
  { max: Infinity, rate: 0.35 },
];

const APPS_SCRIPT_TEMPLATE = `
/* 
  HƯỚNG DẪN CÀI ĐẶT (SETUP INSTRUCTIONS):
  1. Truy cập: https://script.google.com/home/start
  2. Tạo dự án mới (New Project).
  3. Xóa code cũ, dán code này vào.
  4. Nhấn "Triển khai" (Deploy) -> "Tùy chọn triển khai mới" (New deployment).
  5. Chọn loại: "Ứng dụng web" (Web app).
  6. Cấu hình:
     - Mô tả: App Lương
     - Thực thi dưới dạng (Execute as): "Tôi" (Me - your email).
     - Ai có quyền truy cập (Who has access): "Bất kỳ ai" (Anyone).
  7. Nhấn "Triển khai" (Deploy) và copy "URL ứng dụng web" (Web App URL).
*/

function doGet() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = sheet.getDataRange().getValues();
  if (data.length === 0) return ContentService.createTextOutput(JSON.stringify([])).setMimeType(ContentService.MimeType.JSON);
  var headers = data[0];
  var rows = data.slice(1);
  var result = rows.map(function(row) {
    var obj = {};
    headers.forEach(function(header, i) {
      obj[header] = row[i];
    });
    return obj;
  });
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.tryLock(10000);
  
  try {
    var body = JSON.parse(e.postData.contents);
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    
    sheet.clear(); // Xóa dữ liệu cũ để đồng bộ mới
    
    if (body.length > 0) {
      var headers = Object.keys(body[0]);
      var values = [headers];
      body.forEach(function(item) {
        var row = headers.map(function(h) { return item[h]; });
        values.push(row);
      });
      sheet.getRange(1, 1, values.length, values[0].length).setValues(values);
    }
    
    return ContentService.createTextOutput(JSON.stringify({status: 'success', count: body.length}))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(e) {
    return ContentService.createTextOutput(JSON.stringify({status: 'error', message: e.toString()}))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}
`.trim();

type Employee = {
  id: string;
  name: string;
  role: string;
  grossSalary: number;
  insuranceType: "gross" | "custom";
  customInsuranceSalary: number;
  dependents: number;
  region: 1 | 2 | 3 | 4;
  department: string;
};

type SalaryResult = {
  gross: number;
  bhxh: number;
  bhyt: number;
  bhtn: number;
  totalInsurance: number;
  companyCost: number;
  incomeBeforeTax: number;
  deductionSelf: number;
  deductionDependents: number;
  totalDeductions: number;
  taxableIncome: number;
  tax: number;
  net: number;
};

type UserRole = 'admin' | 'employee';

interface CurrentUser {
  id: string;
  name: string;
  role: UserRole;
}

// --- Utility Functions ---

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(amount);
};

const generateId = () => "NV" + Math.floor(1000 + Math.random() * 9000);

const calculateSalary = (emp: Employee): SalaryResult => {
  const insuranceSalary = emp.insuranceType === "gross" ? emp.grossSalary : emp.customInsuranceSalary;
  
  // Caps
  const bhxhBase = Math.min(insuranceSalary, 20 * BASE_SALARY);
  const bhtnBase = Math.min(insuranceSalary, 20 * REGIONAL_MIN_WAGE[emp.region]);

  // Employee Insurance Deductions
  const bhxh = bhxhBase * INSURANCE_RATES.BHXH;
  const bhyt = bhxhBase * INSURANCE_RATES.BHYT;
  const bhtn = bhtnBase * INSURANCE_RATES.BHTN;
  const totalInsurance = bhxh + bhyt + bhtn;

  // Company Cost Calculation
  const companyBhxh = bhxhBase * COMPANY_INSURANCE_RATES.BHXH;
  const companyBhyt = bhxhBase * COMPANY_INSURANCE_RATES.BHYT;
  const companyBhtn = bhtnBase * COMPANY_INSURANCE_RATES.BHTN;
  const companyKpcd = insuranceSalary * COMPANY_INSURANCE_RATES.KPCD;
  const companyCost = emp.grossSalary + companyBhxh + companyBhyt + companyBhtn + companyKpcd;

  // Income Before Tax
  const incomeBeforeTax = emp.grossSalary - totalInsurance;

  // Personal Deductions
  const deductionSelf = DEDUCTIONS.SELF;
  const deductionDependents = emp.dependents * DEDUCTIONS.DEPENDENT;
  const totalDeductions = deductionSelf + deductionDependents;

  // Taxable Income
  const taxableIncome = Math.max(0, incomeBeforeTax - totalDeductions);

  // Calculate Tax
  let tax = 0;
  let remainingTaxable = taxableIncome;
  let previousTierMax = 0;

  for (const tier of TAX_TIERS) {
    const range = tier.max - previousTierMax;
    const taxableAmountInTier = Math.min(Math.max(0, remainingTaxable), range);
    
    if (taxableAmountInTier > 0) {
        tax += taxableAmountInTier * tier.rate;
        remainingTaxable -= taxableAmountInTier;
    }
    previousTierMax = tier.max;
  }

  // Net Salary
  const net = emp.grossSalary - totalInsurance - tax;

  return {
    gross: emp.grossSalary,
    bhxh,
    bhyt,
    bhtn,
    totalInsurance,
    companyCost,
    incomeBeforeTax,
    deductionSelf,
    deductionDependents,
    totalDeductions,
    taxableIncome,
    tax,
    net
  };
};

// --- Components ---

const LoginScreen = ({ 
  onLogin, 
  employees 
}: { 
  onLogin: (user: CurrentUser) => void, 
  employees: Employee[] 
}) => {
  const [mode, setMode] = useState<'admin' | 'employee'>('admin');
  const [adminUser, setAdminUser] = useState('');
  const [adminPass, setAdminPass] = useState('');
  const [empId, setEmpId] = useState('');
  const [error, setError] = useState('');
  const [showEmployeeList, setShowEmployeeList] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (mode === 'admin') {
      // Hardcoded demo admin credentials
      if (adminUser === 'admin' && adminPass === '123456') {
        onLogin({ id: 'admin', name: 'Quản trị viên', role: 'admin' });
      } else {
        setError('Sai tên đăng nhập hoặc mật khẩu (Gợi ý: admin / 123456)');
      }
    } else {
      const emp = employees.find(e => e.id === empId);
      if (emp) {
        onLogin({ id: emp.id, name: emp.name, role: 'employee' });
      } else {
        setError('Không tìm thấy Mã nhân viên này.');
      }
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center p-4">
       <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
          <div className="bg-gray-50 p-8 text-center border-b border-gray-100">
             <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <Calculator className="w-8 h-8 text-blue-600" />
             </div>
             <h1 className="text-2xl font-bold text-gray-900">Payroll Pro</h1>
             <p className="text-gray-500 text-sm">Hệ thống quản lý lương chuyên nghiệp</p>
          </div>

          <div className="p-8">
             <div className="flex bg-gray-100 p-1 rounded-lg mb-6">
                <button 
                  onClick={() => { setMode('admin'); setError(''); setShowEmployeeList(false); }}
                  className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${mode === 'admin' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  Quản trị viên
                </button>
                <button 
                  onClick={() => { setMode('employee'); setError(''); }}
                  className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${mode === 'employee' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  Nhân viên
                </button>
             </div>

             <form onSubmit={handleLogin} className="space-y-4">
                {mode === 'admin' ? (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Tên đăng nhập</label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <input 
                          type="text" 
                          value={adminUser}
                          onChange={e => setAdminUser(e.target.value)}
                          className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                          placeholder="admin"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Mật khẩu</label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <input 
                          type="password" 
                          value={adminPass}
                          onChange={e => setAdminPass(e.target.value)}
                          className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                          placeholder="123456"
                        />
                      </div>
                    </div>
                  </>
                ) : (
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block text-sm font-medium text-gray-700">Mã nhân viên (ID)</label>
                      <button 
                        type="button"
                        onClick={() => setShowEmployeeList(!showEmployeeList)}
                        className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                      >
                        {showEmployeeList ? "Ẩn danh sách" : "Tra cứu ID"}
                      </button>
                    </div>
                    <div className="relative">
                      <UserCircle className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input 
                        type="text" 
                        value={empId}
                        onChange={e => setEmpId(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                        placeholder="Nhập mã ID của bạn"
                      />
                    </div>

                    {/* Employee Lookup List */}
                    {showEmployeeList && (
                      <div className="mt-3 bg-gray-50 border border-gray-200 rounded-lg max-h-40 overflow-y-auto">
                        {employees.length === 0 ? (
                          <p className="text-xs text-gray-500 p-3 text-center">Chưa có dữ liệu nhân viên.</p>
                        ) : (
                          <ul className="divide-y divide-gray-200">
                            {employees.map(emp => (
                              <li 
                                key={emp.id} 
                                onClick={() => { setEmpId(emp.id); setShowEmployeeList(false); }}
                                className="px-3 py-2 hover:bg-blue-50 cursor-pointer flex justify-between items-center text-xs"
                              >
                                <div>
                                  <span className="font-medium text-gray-900">{emp.name}</span>
                                  <span className="text-gray-500 ml-1">({emp.department})</span>
                                </div>
                                <span className="font-mono text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded">{emp.id}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {error && (
                  <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 p-3 rounded-lg">
                    <AlertCircle className="w-4 h-4" />
                    {error}
                  </div>
                )}

                <button 
                  type="submit"
                  className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors shadow-lg shadow-blue-600/30"
                >
                  Đăng nhập
                </button>
             </form>
          </div>
       </div>
    </div>
  );
};

const StatCard = ({ title, value, icon: Icon, colorClass }: any) => (
  <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-sm font-medium text-gray-500">{title}</h3>
      <div className={`p-2 rounded-lg ${colorClass} bg-opacity-10`}>
        <Icon className={`w-5 h-5 ${colorClass.replace('bg-', 'text-')}`} />
      </div>
    </div>
    <div className="text-2xl font-bold text-gray-900">{value}</div>
  </div>
);

const EmployeeModal = ({ 
  isOpen, 
  onClose, 
  onSave, 
  initialData 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  onSave: (emp: Employee) => void; 
  initialData?: Employee | null 
}) => {
  const [formData, setFormData] = useState<Employee>({
    id: "",
    name: "",
    role: "Nhân viên",
    department: "Kinh doanh",
    grossSalary: 10000000,
    insuranceType: "gross",
    customInsuranceSalary: 5000000,
    dependents: 0,
    region: 1,
  });

  useEffect(() => {
    if (initialData) {
      setFormData(initialData);
    } else {
      setFormData({
        id: generateId(),
        name: "",
        role: "Nhân viên",
        department: "Kinh doanh",
        grossSalary: 10000000,
        insuranceType: "gross",
        customInsuranceSalary: 5000000,
        dependents: 0,
        region: 1,
      });
    }
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
          <h3 className="text-lg font-semibold text-gray-900">
            {initialData ? "Chỉnh sửa nhân viên" : "Thêm nhân viên mới"}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h4 className="font-medium text-gray-900 border-b pb-2">Thông tin cơ bản</h4>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mã nhân viên (ID)</label>
                <input 
                  required
                  type="text" 
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50 font-mono text-blue-600"
                  value={formData.id}
                  onChange={e => setFormData({...formData, id: e.target.value})}
                  placeholder="Ví dụ: NV001"
                />
                <p className="text-xs text-gray-500 mt-1">Dùng để đăng nhập hệ thống</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Họ và tên</label>
                <input 
                  required
                  type="text" 
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Vị trí / Chức danh</label>
                <input 
                  type="text" 
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  value={formData.role}
                  onChange={e => setFormData({...formData, role: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phòng ban</label>
                <select 
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                  value={formData.department}
                  onChange={e => setFormData({...formData, department: e.target.value})}
                >
                  <option value="Kinh doanh">Kinh doanh</option>
                  <option value="Kỹ thuật">Kỹ thuật</option>
                  <option value="Nhân sự">Nhân sự</option>
                  <option value="Kế toán">Kế toán</option>
                  <option value="Marketing">Marketing</option>
                </select>
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="font-medium text-gray-900 border-b pb-2">Lương & Bảo hiểm</h4>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Lương Gross (VND)</label>
                <input 
                  type="number" 
                  min="0"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  value={formData.grossSalary}
                  onChange={e => setFormData({...formData, grossSalary: Number(e.target.value)})}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Vùng lương</label>
                  <select 
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                    value={formData.region}
                    onChange={e => setFormData({...formData, region: Number(e.target.value) as 1|2|3|4})}
                  >
                    <option value={1}>Vùng 1 (HN, HCM...)</option>
                    <option value={2}>Vùng 2 (Đà Nẵng...)</option>
                    <option value={3}>Vùng 3</option>
                    <option value={4}>Vùng 4</option>
                  </select>
                </div>
                <div>
                   <label className="block text-sm font-medium text-gray-700 mb-1">Người phụ thuộc</label>
                    <input 
                      type="number" 
                      min="0"
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                      value={formData.dependents}
                      onChange={e => setFormData({...formData, dependents: Number(e.target.value)})}
                    />
                </div>
              </div>

              <div>
                 <label className="block text-sm font-medium text-gray-700 mb-1">Mức đóng bảo hiểm</label>
                 <div className="flex gap-4 mt-1">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="radio" 
                        name="insurance" 
                        checked={formData.insuranceType === "gross"}
                        onChange={() => setFormData({...formData, insuranceType: "gross"})}
                      />
                      <span className="text-sm text-gray-700">Full Gross</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="radio" 
                        name="insurance" 
                        checked={formData.insuranceType === "custom"}
                        onChange={() => setFormData({...formData, insuranceType: "custom"})}
                      />
                      <span className="text-sm text-gray-700">Tùy chọn</span>
                    </label>
                 </div>
                 {formData.insuranceType === "custom" && (
                   <input 
                    type="number"
                    className="mt-2 w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    value={formData.customInsuranceSalary}
                    onChange={e => setFormData({...formData, customInsuranceSalary: Number(e.target.value)})}
                    placeholder="Nhập mức lương đóng BH"
                   />
                 )}
              </div>
            </div>
          </div>

          <div className="pt-4 flex justify-end gap-3">
            <button 
              type="button" 
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Hủy bỏ
            </button>
            <button 
              type="submit" 
              className="px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
            >
              {initialData ? "Cập nhật" : "Thêm nhân viên"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const PayslipModal = ({ 
  employee, 
  isOpen, 
  onClose 
}: { 
  employee: Employee | null, 
  isOpen: boolean, 
  onClose: () => void 
}) => {
  if (!isOpen || !employee) return null;
  const s = calculateSalary(employee);

  const Row = ({ label, value, isTotal = false, isSub = false }: any) => (
    <div className={`flex justify-between py-2 ${isTotal ? 'font-bold border-t border-gray-200 mt-2 pt-2 text-gray-900' : 'text-gray-600'} ${isSub ? 'pl-4 text-sm' : ''}`}>
      <span>{label}</span>
      <span className={isTotal ? 'text-blue-600' : ''}>{formatCurrency(value)}</span>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
        <div className="bg-blue-600 px-6 py-4 flex justify-between items-center">
          <div className="text-white">
             <h3 className="text-lg font-bold">Phiếu Lương Chi Tiết</h3>
             <p className="text-blue-100 text-sm">{employee.name} - {employee.role}</p>
          </div>
          <button onClick={onClose} className="text-white hover:bg-blue-700 p-1 rounded-full">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto flex-1">
           <Row label="Lương Gross" value={s.gross} isTotal />
           
           <div className="my-4">
             <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Bảo hiểm (NV đóng)</h4>
             <Row label={`BHXH (${(INSURANCE_RATES.BHXH * 100)}%)`} value={s.bhxh} isSub />
             <Row label={`BHYT (${(INSURANCE_RATES.BHYT * 100)}%)`} value={s.bhyt} isSub />
             <Row label={`BHTN (${(INSURANCE_RATES.BHTN * 100)}%)`} value={s.bhtn} isSub />
             <Row label="Tổng trừ bảo hiểm" value={s.totalInsurance} />
           </div>

           <div className="my-4">
             <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Thuế TNCN</h4>
             <Row label="Thu nhập trước thuế" value={s.incomeBeforeTax} />
             <Row label="Giảm trừ bản thân" value={s.deductionSelf} isSub />
             <Row label={`Giảm trừ phụ thuộc (${employee.dependents})`} value={s.deductionDependents} isSub />
             <Row label="Thu nhập tính thuế" value={s.taxableIncome} />
             <Row label="Thuế TNCN phải nộp" value={s.tax} />
           </div>

           <Row label="Lương NET (Thực nhận)" value={s.net} isTotal />
           
           <div className="mt-6 pt-4 border-t border-dashed border-gray-300">
             <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Chi phí công ty</h4>
             <Row label="Tổng phí công ty" value={s.companyCost} />
           </div>
        </div>
      </div>
    </div>
  );
};

const AppsScriptModal = ({ 
  isOpen, 
  onClose, 
  currentUrl, 
  onSave 
}: { 
  isOpen: boolean, 
  onClose: () => void, 
  currentUrl: string, 
  onSave: (url: string) => void 
}) => {
  const [url, setUrl] = useState(currentUrl);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(APPS_SCRIPT_TEMPLATE);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
     <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-green-600" />
            <h3 className="text-lg font-semibold text-gray-900">Kết nối Google Sheet</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto space-y-6">
          
          {/* Step 1 */}
          <div className="space-y-2">
            <h4 className="font-medium text-gray-900 flex items-center gap-2">
              <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-1 rounded-full">Bước 1</span>
              Copy Script Cầu Nối
            </h4>
            <div className="relative">
              <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg text-xs overflow-x-auto font-mono h-32">
                {APPS_SCRIPT_TEMPLATE}
              </pre>
              <button 
                onClick={handleCopy}
                className="absolute top-2 right-2 bg-white text-gray-900 px-3 py-1 rounded text-xs font-medium hover:bg-gray-100 flex items-center gap-1"
              >
                {copied ? <Check className="w-3 h-3"/> : <Copy className="w-3 h-3"/>}
                {copied ? "Đã copy" : "Copy Code"}
              </button>
            </div>
            <p className="text-sm text-gray-500">
              Dán code này vào <strong>Tiện ích mở rộng &gt; Apps Script</strong> trong Google Sheet của bạn.
            </p>
          </div>

          {/* Step 2 */}
           <div className="space-y-2">
            <h4 className="font-medium text-gray-900 flex items-center gap-2">
              <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-1 rounded-full">Bước 2</span>
              Nhập Web App URL
            </h4>
            <p className="text-sm text-gray-500">
              Sau khi Deploy (Triển khai) dạng Web App với quyền truy cập "Anyone" (Bất kỳ ai), dán URL vào đây.
            </p>
            <input 
              type="text" 
              placeholder="https://script.google.com/macros/s/..."
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm text-gray-600"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>

          <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 text-sm text-blue-800 flex gap-3">
             <AlertCircle className="w-5 h-5 flex-shrink-0" />
             <p>
               Lưu ý: Dữ liệu sẽ được đồng bộ 2 chiều. App sẽ ghi đè lên Sheet khi bạn nhấn "Lưu lên Cloud", và ngược lại.
             </p>
          </div>
        </div>
        <div className="p-4 border-t bg-gray-50 flex justify-end gap-3">
           <button onClick={onClose} className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg">Đóng</button>
           <button 
            disabled={!url}
            onClick={() => { onSave(url); onClose(); }}
            className="px-4 py-2 bg-green-600 text-white hover:bg-green-700 rounded-lg flex items-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
           >
             <Check className="w-4 h-4" /> Lưu cấu hình
           </button>
        </div>
      </div>
     </div>
  );
}

// --- Main Application ---

const App = () => {
  // Auth State
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);

  // Data State
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEmp, setEditingEmp] = useState<Employee | null>(null);
  const [view, setView] = useState<'dashboard' | 'employees'>('dashboard');
  const [selectedPayslipEmp, setSelectedPayslipEmp] = useState<Employee | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  // Sync State
  const [scriptUrl, setScriptUrl] = useState("");
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  // Helper for Copying
  const handleCopyId = (id: string) => {
    navigator.clipboard.writeText(id);
    // Simple toast could go here, using alert for simplicity in this architecture
    // or just rely on UI feedback
  };

  // Load initial data
  useEffect(() => {
    const storedEmp = localStorage.getItem("employees");
    const storedUrl = localStorage.getItem("scriptUrl");
    const storedUser = localStorage.getItem("currentUser");

    if (storedEmp) setEmployees(JSON.parse(storedEmp));
    if (storedUrl) setScriptUrl(storedUrl);
    if (storedUser) setCurrentUser(JSON.parse(storedUser));
  }, []);

  // Auto-save local
  useEffect(() => {
    localStorage.setItem("employees", JSON.stringify(employees));
  }, [employees]);

  // Auth Helpers
  const handleLogin = (user: CurrentUser) => {
    setCurrentUser(user);
    localStorage.setItem("currentUser", JSON.stringify(user));
    setView(user.role === 'admin' ? 'dashboard' : 'employees');
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem("currentUser");
  };

  const isAdmin = currentUser?.role === 'admin';

  // Stats Calculation (Only relevant for Admins or global view)
  const stats = useMemo(() => {
    return employees.reduce((acc, emp) => {
      const s = calculateSalary(emp);
      acc.totalGross += s.gross;
      acc.totalNet += s.net;
      acc.totalTax += s.tax;
      acc.totalCompanyCost += s.companyCost;
      return acc;
    }, { totalGross: 0, totalNet: 0, totalTax: 0, totalCompanyCost: 0 });
  }, [employees]);

  // CRUD
  const handleSaveEmployee = (emp: Employee) => {
    // Basic check to prevent duplicate IDs when adding new
    if (!editingEmp && employees.some(e => e.id === emp.id)) {
       alert("Lỗi: Mã nhân viên (ID) này đã tồn tại. Vui lòng chọn mã khác.");
       return;
    }

    if (editingEmp) {
      setEmployees(prev => prev.map(e => e.id === editingEmp.id ? emp : e)); // Use original ID for matching
    } else {
      setEmployees(prev => [...prev, emp]);
    }
    setEditingEmp(null);
  };

  const handleDelete = (id: string) => {
    if (window.confirm("Bạn có chắc chắn muốn xóa nhân viên này?")) {
      setEmployees(prev => prev.filter(e => e.id !== id));
    }
  };

  // --- Sync Logic ---

  const handleSaveScriptUrl = (url: string) => {
    setScriptUrl(url);
    localStorage.setItem("scriptUrl", url);
    if (employees.length === 0) {
      pullFromCloud(url);
    }
  };

  const pullFromCloud = async (urlToUse = scriptUrl) => {
    if (!urlToUse) return setIsSyncModalOpen(true);
    setIsSyncing(true);
    try {
      const res = await fetch(urlToUse);
      const data = await res.json();
      if (Array.isArray(data)) {
        const cleanData = data.map((d: any) => ({
           ...d,
           grossSalary: Number(d.grossSalary) || 0,
           customInsuranceSalary: Number(d.customInsuranceSalary) || 0,
           dependents: Number(d.dependents) || 0,
           region: Number(d.region) || 1
        }));
        setEmployees(cleanData);
        setLastSync(new Date());
        alert("Đã tải dữ liệu thành công từ Google Sheet!");
      }
    } catch (e) {
      console.error(e);
      alert("Lỗi khi tải dữ liệu. Vui lòng kiểm tra URL Apps Script.");
    } finally {
      setIsSyncing(false);
    }
  };

  const pushToCloud = async () => {
    if (!scriptUrl) return setIsSyncModalOpen(true);
    setIsSyncing(true);
    try {
      const res = await fetch(scriptUrl, {
        method: "POST",
        body: JSON.stringify(employees)
      });
      const result = await res.json();
      if (result.status === 'success') {
        setLastSync(new Date());
        alert("Đã lưu thành công lên Google Sheet!");
      } else {
        throw new Error(result.message);
      }
    } catch (e) {
      console.error(e);
      alert("Đã gửi yêu cầu lưu. Nếu không báo lỗi, dữ liệu đã được cập nhật.");
    } finally {
      setIsSyncing(false);
    }
  };

  // Filter logic based on Role
  const filteredEmployees = employees
    .filter(e => {
      // Admin sees all, Employee sees only themselves
      if (isAdmin) return true;
      return e.id === currentUser?.id;
    })
    .filter(e => 
      e.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.department.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.id.toLowerCase().includes(searchTerm.toLowerCase())
    );

  // RENDER: Login Screen if not authenticated
  if (!currentUser) {
    return <LoginScreen onLogin={handleLogin} employees={employees} />;
  }

  // RENDER: Main App
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col fixed h-full z-10">
        <div className="p-6 flex items-center gap-2 border-b border-gray-100">
          <div className="bg-blue-600 p-2 rounded-lg">
            <Calculator className="text-white w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-800">Payroll Pro</h1>
            <span className={`text-[10px] px-2 py-0.5 rounded-full uppercase font-bold ${isAdmin ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>
              {isAdmin ? 'Admin' : 'Nhân viên'}
            </span>
          </div>
        </div>
        
        <div className="px-6 py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold">
             {currentUser.name.charAt(0)}
          </div>
          <div className="overflow-hidden">
             <p className="text-sm font-medium text-gray-900 truncate">{currentUser.name}</p>
             <p className="text-xs text-gray-500 truncate">ID: {currentUser.id}</p>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          {isAdmin && (
            <button 
              onClick={() => setView('dashboard')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors font-medium ${view === 'dashboard' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              <LayoutDashboard className="w-5 h-5" />
              Tổng quan
            </button>
          )}
          <button 
             onClick={() => setView('employees')}
             className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors font-medium ${view === 'employees' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            <Users className="w-5 h-5" />
            {isAdmin ? 'Nhân sự & Lương' : 'Phiếu lương của tôi'}
          </button>
        </nav>

        <div className="p-4 border-t border-gray-100 space-y-3">
           {isAdmin && (
             <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-xs text-gray-500 mb-2 font-semibold uppercase">Trạng thái Sync</p>
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-2 h-2 rounded-full ${scriptUrl ? 'bg-green-500' : 'bg-red-500'}`}></div>
                  <span className="text-sm text-gray-700">{scriptUrl ? "Đã kết nối Sheet" : "Chưa kết nối"}</span>
                </div>
                <button 
                  onClick={() => setIsSyncModalOpen(true)}
                  className="mt-2 w-full text-xs bg-white border border-gray-200 py-1.5 rounded text-gray-600 hover:text-blue-600 flex items-center justify-center gap-1"
                >
                  <Settings className="w-3 h-3" /> Cấu hình
                </button>
             </div>
           )}
           <button 
             onClick={handleLogout}
             className="w-full flex items-center justify-center gap-2 text-sm text-red-600 hover:bg-red-50 py-2 rounded-lg transition-colors"
           >
             <LogOut className="w-4 h-4" /> Đăng xuất
           </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 ml-64 p-8">
        
        {/* Header */}
        <header className="flex justify-between items-center mb-8">
           <div>
             <h2 className="text-2xl font-bold text-gray-900">
               {view === 'dashboard' ? 'Bảng tin' : (isAdmin ? 'Quản lý Nhân sự' : 'Thông tin Lương')}
             </h2>
             <p className="text-gray-500 text-sm mt-1">Hệ thống tính lương chuyên nghiệp Vietnam 2024</p>
           </div>

           <div className="flex gap-3">
             {isAdmin && scriptUrl && (
               <>
                 <button 
                    onClick={() => pullFromCloud()}
                    disabled={isSyncing}
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 shadow-sm disabled:opacity-50"
                  >
                    <ArrowDownToLine className={`w-4 h-4 ${isSyncing ? 'animate-bounce' : ''}`} />
                    Lấy dữ liệu
                 </button>
                 <button 
                    onClick={pushToCloud}
                    disabled={isSyncing}
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 shadow-sm disabled:opacity-50"
                  >
                    <ArrowUpFromLine className={`w-4 h-4 ${isSyncing ? 'animate-bounce' : ''}`} />
                    Lưu lên Cloud
                 </button>
               </>
             )}
             {isAdmin && (
               <button 
                 onClick={() => { setEditingEmp(null); setIsModalOpen(true); }}
                 className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-sm transition-all"
               >
                 <Plus className="w-4 h-4" /> Thêm nhân viên
               </button>
             )}
           </div>
        </header>

        {/* Dashboard Stats - Only for Admin */}
        {view === 'dashboard' && isAdmin && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <StatCard 
              title="Tổng chi phí nhân sự" 
              value={formatCurrency(stats.totalCompanyCost)} 
              icon={Building2} 
              colorClass="bg-purple-500" 
            />
            <StatCard 
              title="Thực lĩnh (NET)" 
              value={formatCurrency(stats.totalNet)} 
              icon={Wallet} 
              colorClass="bg-green-500" 
            />
            <StatCard 
              title="Đóng thuế TNCN" 
              value={formatCurrency(stats.totalTax)} 
              icon={TrendingUp} 
              colorClass="bg-red-500" 
            />
             <StatCard 
              title="Tổng nhân sự" 
              value={employees.length} 
              icon={Users} 
              colorClass="bg-blue-500" 
            />
          </div>
        )}

        {/* Employee Table Area */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
            <div className="relative w-72">
               <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
               <input 
                 type="text" 
                 placeholder="Tìm kiếm (Tên, ID, Phòng ban)..."
                 className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                 value={searchTerm}
                 onChange={(e) => setSearchTerm(e.target.value)}
               />
            </div>
            <div className="text-sm text-gray-500 italic">
              {filteredEmployees.length} bản ghi
            </div>
          </div>

          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-200">
              <tr>
                <th className="px-6 py-4">Nhân viên</th>
                <th className="px-6 py-4">Vị trí</th>
                <th className="px-6 py-4">Lương Gross</th>
                <th className="px-6 py-4">Lương Net</th>
                <th className="px-6 py-4 text-right">Chi tiết</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-400">
                    {isAdmin 
                      ? "Chưa có dữ liệu nhân viên. Thêm mới hoặc Đồng bộ từ Sheet." 
                      : "Không tìm thấy dữ liệu của bạn."}
                  </td>
                </tr>
              ) : (
                filteredEmployees.map(emp => {
                  const salary = calculateSalary(emp);
                  return (
                    <tr key={emp.id} className="hover:bg-blue-50/50 transition-colors group">
                      <td className="px-6 py-4">
                         <div className="font-medium text-gray-900">{emp.name}</div>
                         <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs font-mono bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded border border-gray-200">
                              {emp.id}
                            </span>
                            {isAdmin && (
                              <button 
                                onClick={() => handleCopyId(emp.id)}
                                className="text-gray-400 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Copy ID"
                              >
                                <Copy className="w-3 h-3" />
                              </button>
                            )}
                         </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-gray-700">{emp.role}</div>
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                          {emp.department}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-medium text-gray-600">
                        {formatCurrency(emp.grossSalary)}
                      </td>
                      <td className="px-6 py-4 font-bold text-green-600">
                        {formatCurrency(salary.net)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={() => setSelectedPayslipEmp(emp)}
                            className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                            title="Xem phiếu lương"
                          >
                            <FileSpreadsheet className="w-4 h-4" />
                          </button>
                          {isAdmin && (
                            <>
                              <button 
                                onClick={() => { setEditingEmp(emp); setIsModalOpen(true); }}
                                className="p-2 text-gray-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg"
                                title="Sửa"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={() => handleDelete(emp.id)}
                                className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg"
                                title="Xóa"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </main>

      {/* Modals */}
      {isAdmin && (
        <EmployeeModal 
          isOpen={isModalOpen} 
          onClose={() => { setIsModalOpen(false); setEditingEmp(null); }} 
          onSave={handleSaveEmployee}
          initialData={editingEmp}
        />
      )}
      
      <PayslipModal 
        isOpen={!!selectedPayslipEmp}
        onClose={() => setSelectedPayslipEmp(null)}
        employee={selectedPayslipEmp}
      />

      {isAdmin && (
        <AppsScriptModal 
          isOpen={isSyncModalOpen}
          onClose={() => setIsSyncModalOpen(false)}
          currentUrl={scriptUrl}
          onSave={handleSaveScriptUrl}
        />
      )}
    </div>
  );
};

const root = createRoot(document.getElementById("root")!);
root.render(<App />);