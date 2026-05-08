import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { TransferService, StudentTransfer } from '../../../services/transfer.service';
import { StudentService } from '../../../services/student.service';
import { ClassService } from '../../../services/class.service';

@Component({
  selector: 'app-transfer-history',
  templateUrl: './transfer-history.component.html',
  styleUrls: ['./transfer-history.component.css']
})
export class TransferHistoryComponent implements OnInit {
  transfers: StudentTransfer[] = [];
  filteredTransfers: StudentTransfer[] = [];
  loading = false;
  error = '';
  
  // Pagination
  currentPage = 1;
  pageSize = 100;
  totalItems = 0;
  totalPages = 0;
  pageSizeOptions = [10, 20, 50, 100];
  
  // Filters
  transferTypeFilter: 'all' | 'internal' | 'external' = 'all';
  classFilter: string = '';
  studentFilter: string = '';
  studentNameSearch: string = '';
  startDate: string = '';
  endDate: string = '';
  
  // Options for filters
  classes: any[] = [];
  students: any[] = [];

  constructor(
    private transferService: TransferService,
    private studentService: StudentService,
    private classService: ClassService,
    private router: Router,
    private route: ActivatedRoute
  ) { }

  ngOnInit() {
    this.loadClasses();
    this.loadStudents();
    this.loadTransfers();
    
    // Check if filters are provided in query params
    const studentId = this.route.snapshot.queryParams['studentId'];
    if (studentId) {
      this.studentFilter = studentId;
    }
  }

  loadClasses() {
    this.classService.getClasses().subscribe({
      next: (data: any) => {
        const classesList = Array.isArray(data) ? data : (data?.data || []);
        this.classes = this.classService.sortClasses(classesList);
      },
      error: (err: any) => {
        console.error('Error loading classes:', err);
      }
    });
  }

  loadStudents() {
    this.studentService.getStudents({ limit: 500 }).subscribe({
      next: (data: any) => {
        this.students = data || [];
      },
      error: (err: any) => {
        console.error('Error loading students:', err);
      }
    });
  }

  loadTransfers() {
    this.loading = true;
    this.error = '';

    const filters: any = {
      page: this.currentPage,
      limit: this.pageSize
    };
    if (this.transferTypeFilter !== 'all') {
      filters.transferType = this.transferTypeFilter;
    }
    if (this.classFilter) {
      filters.classId = this.classFilter;
    }
    if (this.studentFilter) {
      filters.studentId = this.studentFilter;
    }
    if (this.studentNameSearch) {
      filters.studentName = this.studentNameSearch;
    }
    if (this.startDate) {
      filters.startDate = this.startDate;
    }
    if (this.endDate) {
      filters.endDate = this.endDate;
    }

    this.transferService.getAllTransfers(filters).subscribe({
      next: (response: any) => {
        // Check if response is paginated
        if (response && response.data && Array.isArray(response.data)) {
          this.transfers = response.data || [];
          this.filteredTransfers = this.transfers;
          this.currentPage = response.page || 1;
          this.pageSize = response.limit || 100;
          this.totalItems = response.total || 0;
          this.totalPages = response.totalPages || 0;
        } else {
          // Fallback for non-paginated response
          this.transfers = Array.isArray(response) ? response : [];
          this.filteredTransfers = this.transfers;
          this.totalItems = this.transfers.length;
          this.totalPages = Math.ceil(this.totalItems / this.pageSize);
        }
        this.loading = false;
      },
      error: (err: any) => {
        console.error('Error loading transfers:', err);
        this.error = 'Failed to load transfer history';
        this.loading = false;
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  applyFilters() {
    this.currentPage = 1; // Reset to first page when filters change
    this.loadTransfers();
  }

  clearFilters() {
    this.transferTypeFilter = 'all';
    this.classFilter = '';
    this.studentFilter = '';
    this.studentNameSearch = '';
    this.startDate = '';
    this.endDate = '';
    this.currentPage = 1;
    this.loadTransfers();
  }

  onPageChange(page: number) {
    this.currentPage = page;
    this.loadTransfers();
  }

  onPageSizeChange(pageSize: number) {
    this.pageSize = pageSize;
    this.currentPage = 1;
    this.loadTransfers();
  }

  getPageNumbers(): number[] {
    const pages: number[] = [];
    const maxPages = Math.min(this.totalPages, 10);
    const startPage = Math.max(1, this.currentPage - 5);
    const endPage = Math.min(this.totalPages, startPage + maxPages - 1);
    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }
    return pages;
  }

  getTransferTypeLabel(type: string): string {
    return type === 'internal' ? 'Internal' : 'External';
  }

  getTransferTypeClass(type: string): string {
    return type === 'internal' ? 'badge-internal' : 'badge-external';
  }

  getStudentName(transfer: StudentTransfer): string {
    if (transfer.student) {
      return `${transfer.student.firstName} ${transfer.student.lastName}`;
    }
    return 'Unknown Student';
  }

  getStudentNumber(transfer: StudentTransfer): string {
    return transfer.student?.studentNumber || 'N/A';
  }

  getPreviousClassName(transfer: StudentTransfer): string {
    return transfer.previousClass?.name || 'N/A';
  }

  getNewClassName(transfer: StudentTransfer): string {
    if (transfer.transferType === 'external') {
      return transfer.destinationSchool || 'N/A';
    }
    return transfer.newClass?.name || 'N/A';
  }

  getProcessedByName(transfer: StudentTransfer): string {
    if (transfer.processedBy) {
      return transfer.processedBy.username || transfer.processedBy.email || 'Unknown';
    }
    return 'Unknown';
  }

  formatDate(dateString: string): string {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  // Expose Math to template
  Math = Math;

  viewStudentHistory(studentId: string) {
    this.studentFilter = studentId;
    this.loadTransfers();
  }

  initiateTransfer() {
    this.router.navigate(['/transfers/new']);
  }

  initiateTransferForStudent(studentId: string) {
    this.router.navigate(['/transfers/new'], { queryParams: { studentId } });
  }
}

