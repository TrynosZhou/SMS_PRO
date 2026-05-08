import { Component, OnInit } from '@angular/core';
import { AttendanceService } from '../../../services/attendance.service';
import { ClassService } from '../../../services/class.service';
import { SettingsService } from '../../../services/settings.service';

@Component({
  selector: 'app-attendance-reports',
  templateUrl: './attendance-reports.component.html',
  styleUrls: ['./attendance-reports.component.css']
})
export class AttendanceReportsComponent implements OnInit {
  classes: any[] = [];
  selectedClassId: string = '';
  selectedTerm: string = '';
  startDate: string = '';
  endDate: string = '';
  report: any = null;
  rawReportRows: any[] = [];
  filteredReport: any[] = [];
  loading = false;
  error = '';
  availableTerms: string[] = [];
  searchTerm = '';
  minAttendance = 0;
  showOnlyConcerns = false;
  sortField: 'attendanceRateNumber' | 'firstName' | 'studentNumber' = 'attendanceRateNumber';
  sortDirection: 'asc' | 'desc' = 'desc';
  lastGeneratedAt: Date | null = null;
  concernThreshold = 75;
  topPerformer: any = null;
  lowestPerformer: any = null;
  averageAttendanceRate = 0;
  concernCount = 0;
  attendanceDistribution = {
    excellent: 0,
    good: 0,
    attention: 0
  };
  
  // Modern features
  dateRangePreset: string = '';
  showCharts = true;
  isPrintMode = false;
  weeklyTrend: any[] = [];
  monthlyTrend: any[] = [];
  attendanceByStatus = {
    present: 0,
    absent: 0,
    late: 0,
    excused: 0
  };
  previousPeriodAverage = 0;
  trendDirection: 'up' | 'down' | 'stable' = 'stable';
  viewMode: 'table' | 'cards' = 'table';

  constructor(
    private attendanceService: AttendanceService,
    private classService: ClassService,
    private settingsService: SettingsService
  ) {}

  ngOnInit() {
    this.loadClasses();
    this.loadAvailableTerms();
  }

  loadAvailableTerms() {
    const currentYear = new Date().getFullYear();
    const nextYear = currentYear + 1;
    this.availableTerms = [
      `Term 1 ${currentYear}`,
      `Term 2 ${currentYear}`,
      `Term 3 ${currentYear}`,
      `Term 1 ${nextYear}`,
      `Term 2 ${nextYear}`,
      `Term 3 ${nextYear}`
    ];

    // Load active term and set it as default
    this.settingsService.getActiveTerm().subscribe({
      next: (data: any) => {
        if (data.activeTerm) {
          this.selectedTerm = data.activeTerm;
          if (!this.availableTerms.includes(data.activeTerm)) {
            this.availableTerms.unshift(data.activeTerm);
          }
        } else if (data.currentTerm) {
          this.selectedTerm = data.currentTerm;
          if (!this.availableTerms.includes(data.currentTerm)) {
            this.availableTerms.unshift(data.currentTerm);
          }
        }
      },
      error: (err: any) => {
        console.error('Error loading active term:', err);
      }
    });
  }

  loadClasses() {
    this.classService.getClasses().subscribe({
      next: (data: any) => {
        const classesList = Array.isArray(data) ? data : (data?.data || []);
        const activeClasses = classesList.filter((c: any) => c.isActive);
        this.classes = this.classService.sortClasses(activeClasses);
      },
      error: (err: any) => {
        this.error = 'Failed to load classes';
        console.error(err);
      }
    });
  }

  generateReport() {
    if (!this.selectedClassId) {
      this.error = 'Please select a class';
      return;
    }

    this.loading = true;
    this.error = '';
    this.report = null;

    const params: any = { classId: this.selectedClassId };
    
    if (this.selectedTerm) {
      params.term = this.selectedTerm;
    }
    
    if (this.startDate) {
      params.startDate = this.startDate;
    }
    
    if (this.endDate) {
      params.endDate = this.endDate;
    }

    this.attendanceService.getAttendanceReport(params).subscribe({
      next: (response: any) => {
        this.report = response;
        this.lastGeneratedAt = new Date();
        this.loading = false;
        this.prepareReportData();
      },
      error: (err: any) => {
        this.error = err.error?.message || 'Failed to generate report';
        this.loading = false;
      }
    });
  }

  getClassName(classId: string): string {
    const cls = this.classes.find(c => c.id === classId);
    return cls ? cls.name : '';
  }

  get hasReportData(): boolean {
    return this.rawReportRows.length > 0;
  }

  onSearchChange() {
    this.applyFilters();
  }

  onMinAttendanceChange(value: number) {
    this.minAttendance = value;
    this.applyFilters();
  }

  toggleConcerns() {
    this.showOnlyConcerns = !this.showOnlyConcerns;
    this.applyFilters();
  }

  resetFilters() {
    this.searchTerm = '';
    this.minAttendance = 0;
    this.showOnlyConcerns = false;
    this.sortField = 'attendanceRateNumber';
    this.sortDirection = 'desc';
    this.applyFilters();
  }

  changeSort(field: 'attendanceRateNumber' | 'firstName' | 'studentNumber') {
    if (this.sortField === field) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortField = field;
      this.sortDirection = field === 'firstName' ? 'asc' : 'desc';
    }
    this.applyFilters();
  }

  getSortDirection(field: string): 'asc' | 'desc' | null {
    return this.sortField === field ? this.sortDirection : null;
  }

  exportToCSV() {
    if (!this.filteredReport.length) {
      return;
    }

    const headers = [
      'Student Number',
      'First Name',
      'Last Name',
      'Present',
      'Absent',
      'Late',
      'Excused',
      'Total',
      'Attendance Rate (%)'
    ];

    const rows = this.filteredReport.map(item => [
      item.studentNumber,
      item.firstName,
      item.lastName,
      item.present ?? 0,
      item.absent ?? 0,
      item.late ?? 0,
      item.excused ?? 0,
      item.total ?? 0,
      (item.attendanceRateNumber ?? 0).toFixed(2)
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(','))
    ].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const className = this.getClassName(this.selectedClassId) || 'Class';
    const fileName = `Attendance_Report_${className.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`;
    link.download = fileName;
    link.click();
    window.URL.revokeObjectURL(url);
  }

  trackByStudent(index: number, item: any) {
    return item.studentId || item.studentNumber || index;
  }

  getAttendanceBadgeClass(rate: number): string {
    if (rate >= 95) {
      return 'badge badge-excellent';
    }
    if (rate >= 85) {
      return 'badge badge-good';
    }
    if (rate >= this.concernThreshold) {
      return 'badge badge-average';
    }
    return 'badge badge-warning';
  }

  getAttendanceStatus(rate: number): string {
    if (rate >= 95) {
      return 'Excellent';
    }
    if (rate >= 85) {
      return 'Good';
    }
    if (rate >= this.concernThreshold) {
      return 'Needs Attention';
    }
    return 'Critical';
  }

  getProgressStyle(rate: number) {
    return { width: `${Math.min(rate, 100)}%` };
  }

  private prepareReportData() {
    const rows = Array.isArray(this.report?.report) ? [...this.report.report] : [];
    this.rawReportRows = rows.map(item => ({
      ...item,
      attendanceRateNumber: this.toNumber(item.attendanceRate),
      present: item.present ?? 0,
      absent: item.absent ?? 0,
      late: item.late ?? 0,
      excused: item.excused ?? 0,
      total: item.total ?? 0
    }));

    this.averageAttendanceRate = this.rawReportRows.length
      ? this.rawReportRows.reduce((sum, row) => sum + (row.attendanceRateNumber ?? 0), 0) / this.rawReportRows.length
      : 0;

    this.topPerformer = this.rawReportRows.length
      ? [...this.rawReportRows].sort((a, b) => (b.attendanceRateNumber ?? 0) - (a.attendanceRateNumber ?? 0))[0]
      : null;

    this.lowestPerformer = this.rawReportRows.length
      ? [...this.rawReportRows].sort((a, b) => (a.attendanceRateNumber ?? 0) - (b.attendanceRateNumber ?? 0))[0]
      : null;

    this.concernCount = this.rawReportRows.filter(row => (row.attendanceRateNumber ?? 0) < this.concernThreshold).length;

    this.attendanceDistribution = this.calculateDistribution(this.rawReportRows);

    // Calculate attendance by status totals
    this.attendanceByStatus = {
      present: this.rawReportRows.reduce((sum, row) => sum + (row.present ?? 0), 0),
      absent: this.rawReportRows.reduce((sum, row) => sum + (row.absent ?? 0), 0),
      late: this.rawReportRows.reduce((sum, row) => sum + (row.late ?? 0), 0),
      excused: this.rawReportRows.reduce((sum, row) => sum + (row.excused ?? 0), 0)
    };

    // Calculate trend (simplified - comparing with previous period)
    this.calculateTrend();

    this.applyFilters();
  }

  // Date range presets
  applyDateRangePreset(preset: string) {
    this.dateRangePreset = preset;
    const today = new Date();
    const endDate = new Date(today);
    endDate.setHours(23, 59, 59, 999);

    switch (preset) {
      case 'today':
        this.startDate = today.toISOString().split('T')[0];
        this.endDate = today.toISOString().split('T')[0];
        break;
      case 'last7days':
        const last7Days = new Date(today);
        last7Days.setDate(today.getDate() - 7);
        this.startDate = last7Days.toISOString().split('T')[0];
        this.endDate = today.toISOString().split('T')[0];
        break;
      case 'last30days':
        const last30Days = new Date(today);
        last30Days.setDate(today.getDate() - 30);
        this.startDate = last30Days.toISOString().split('T')[0];
        this.endDate = today.toISOString().split('T')[0];
        break;
      case 'thisMonth':
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
        this.startDate = firstDay.toISOString().split('T')[0];
        this.endDate = today.toISOString().split('T')[0];
        break;
      case 'lastMonth':
        const lastMonthFirst = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const lastMonthLast = new Date(today.getFullYear(), today.getMonth(), 0);
        this.startDate = lastMonthFirst.toISOString().split('T')[0];
        this.endDate = lastMonthLast.toISOString().split('T')[0];
        break;
      case 'thisTerm':
        this.startDate = '';
        this.endDate = '';
        break;
      case 'custom':
        // Keep current dates
        break;
      default:
        this.startDate = '';
        this.endDate = '';
    }
  }

  // Calculate trend direction
  private calculateTrend() {
    // Simplified trend calculation - in a real scenario, you'd compare with previous period
    // For now, we'll set it based on average attendance
    if (this.averageAttendanceRate >= 90) {
      this.trendDirection = 'up';
    } else if (this.averageAttendanceRate < 75) {
      this.trendDirection = 'down';
    } else {
      this.trendDirection = 'stable';
    }
  }

  // Export to PDF
  exportToPDF() {
    if (!this.filteredReport.length) {
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const className = this.getClassName(this.selectedClassId) || 'Class';
    const reportDate = new Date().toLocaleDateString();
    
    let htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Attendance Report - ${className}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          h1 { color: #1f2937; margin-bottom: 10px; }
          .meta { color: #6b7280; margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th { background: #f9fafb; padding: 10px; text-align: left; border-bottom: 2px solid #e5e7eb; }
          td { padding: 8px; border-bottom: 1px solid #e5e7eb; }
          .summary { margin: 20px 0; padding: 15px; background: #f9fafb; border-radius: 8px; }
          .summary-item { margin: 5px 0; }
        </style>
      </head>
      <body>
        <h1>Attendance Report - ${className}</h1>
        <div class="meta">
          <p>Generated: ${reportDate}</p>
          <p>Term: ${this.selectedTerm || 'All Terms'}</p>
          <p>Date Range: ${this.startDate || 'N/A'} to ${this.endDate || 'N/A'}</p>
        </div>
        <div class="summary">
          <div class="summary-item"><strong>Average Attendance:</strong> ${this.averageAttendanceRate.toFixed(2)}%</div>
          <div class="summary-item"><strong>Total Students:</strong> ${this.filteredReport.length}</div>
          <div class="summary-item"><strong>Students Needing Attention:</strong> ${this.concernCount}</div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Student #</th>
              <th>Name</th>
              <th>Present</th>
              <th>Absent</th>
              <th>Late</th>
              <th>Excused</th>
              <th>Total</th>
              <th>Attendance %</th>
            </tr>
          </thead>
          <tbody>
    `;

    this.filteredReport.forEach(item => {
      htmlContent += `
        <tr>
          <td>${item.studentNumber}</td>
          <td>${item.firstName} ${item.lastName}</td>
          <td>${item.present ?? 0}</td>
          <td>${item.absent ?? 0}</td>
          <td>${item.late ?? 0}</td>
          <td>${item.excused ?? 0}</td>
          <td>${item.total ?? 0}</td>
          <td>${(item.attendanceRateNumber ?? 0).toFixed(2)}%</td>
        </tr>
      `;
    });

    htmlContent += `
          </tbody>
        </table>
      </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 250);
  }

  // Print report
  printReport() {
    this.isPrintMode = true;
    setTimeout(() => {
      window.print();
      this.isPrintMode = false;
    }, 100);
  }

  // Toggle view mode
  toggleViewMode() {
    this.viewMode = this.viewMode === 'table' ? 'cards' : 'table';
  }

  // Get trend icon
  getTrendIcon(): string {
    switch (this.trendDirection) {
      case 'up':
        return '📈';
      case 'down':
        return '📉';
      default:
        return '➡️';
    }
  }

  // Get trend text
  getTrendText(): string {
    switch (this.trendDirection) {
      case 'up':
        return 'Improving';
      case 'down':
        return 'Declining';
      default:
        return 'Stable';
    }
  }

  // Get total attendance records
  getTotalRecords(): number {
    return this.attendanceByStatus.present + 
           this.attendanceByStatus.absent + 
           this.attendanceByStatus.late + 
           this.attendanceByStatus.excused;
  }

  // Get status percentage
  getStatusPercentage(status: 'present' | 'absent' | 'late' | 'excused'): number {
    const total = this.getTotalRecords();
    if (total === 0) return 0;
    return (this.attendanceByStatus[status] / total) * 100;
  }

  private applyFilters() {
    let data = [...this.rawReportRows];

    if (this.searchTerm.trim()) {
      const term = this.searchTerm.trim().toLowerCase();
      data = data.filter(item =>
        `${item.firstName} ${item.lastName}`.toLowerCase().includes(term) ||
        String(item.studentNumber).toLowerCase().includes(term)
      );
    }

    if (this.minAttendance > 0) {
      data = data.filter(item => (item.attendanceRateNumber ?? 0) >= this.minAttendance);
    }

    if (this.showOnlyConcerns) {
      data = data.filter(item => (item.attendanceRateNumber ?? 0) < this.concernThreshold);
    }

    data.sort((a, b) => {
      const aValue = this.getSortValue(a);
      const bValue = this.getSortValue(b);
      if (aValue < bValue) {
        return this.sortDirection === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return this.sortDirection === 'asc' ? 1 : -1;
      }
      return 0;
    });

    this.filteredReport = data;
  }

  private getSortValue(item: any): any {
    if (this.sortField === 'firstName') {
      return `${item.firstName ?? ''} ${item.lastName ?? ''}`.toLowerCase();
    }
    if (this.sortField === 'studentNumber') {
      return String(item.studentNumber ?? '');
    }
    return item.attendanceRateNumber ?? 0;
  }

  private calculateDistribution(rows: any[]) {
    if (!rows.length) {
      return { excellent: 0, good: 0, attention: 0 };
    }

    let excellent = 0;
    let good = 0;
    let attention = 0;

    rows.forEach(row => {
      const rate = row.attendanceRateNumber ?? 0;
      if (rate >= 95) {
        excellent++;
      } else if (rate >= this.concernThreshold) {
        good++;
      } else {
        attention++;
      }
    });

    const total = rows.length || 1;
    return {
      excellent: Math.round((excellent / total) * 100),
      good: Math.round((good / total) * 100),
      attention: Math.round((attention / total) * 100)
    };
  }

  private toNumber(value: any): number {
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = parseFloat(value);
      return isNaN(parsed) ? 0 : parsed;
    }
    return 0;
  }
}

