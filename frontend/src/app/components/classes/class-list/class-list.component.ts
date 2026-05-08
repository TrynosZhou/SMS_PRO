import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { ClassService } from '../../../services/class.service';
import { classesManageNav } from '../classes-manage-navigation';

@Component({
  selector: 'app-class-list',
  templateUrl: './class-list.component.html',
  styleUrls: ['./class-list.component.css']
})
export class ClassListComponent implements OnInit {
  classes: any[] = [];
  filteredClasses: any[] = [];
  loading = false;
  error = '';
  success = '';
  
  // Search and filter properties
  searchTerm: string = '';
  statusFilter: string = 'all';
  sortBy: string = 'name';
  sortColumn: string = 'name';
  sortDirection: 'asc' | 'desc' = 'asc';
  pagination = {
    page: 1,
    limit: 100,
    total: 0,
    totalPages: 1
  };
  pageSizeOptions = [12, 24, 48, 100];
  private searchDebounceTimer: any = null;

  constructor(
    private classService: ClassService,
    private router: Router,
    private route: ActivatedRoute
  ) { }

  ngOnInit() {
    // Check for success message from query parameters
    this.route.queryParams.subscribe(params => {
      if (params['success']) {
        this.success = params['success'];
        // Clear the query parameter from URL
        this.router.navigate([], {
          relativeTo: this.route,
          queryParams: {},
          replaceUrl: true
        });
        // Auto-hide success message after 5 seconds
        setTimeout(() => {
          this.success = '';
        }, 5000);
      }
    });
    // Load classes on component initialization
    this.loadClasses();
  }

  loadClasses() {
    this.loading = true;
    this.error = '';
    // Note: success message is preserved if set from query params
    this.classService.getClasses({
      page: this.pagination.page,
      limit: this.pagination.limit,
      search: this.searchTerm || undefined
    }).subscribe({
      next: (data: any) => {
        if (Array.isArray(data)) {
          this.classes = data;
          this.pagination.total = data.length;
          this.pagination.totalPages = 1;
        } else {
          this.classes = data?.data || [];
          this.pagination.total = data?.total || this.classes.length;
          this.pagination.totalPages = data?.totalPages || 1;
        }
        this.applyFilters();
        this.loading = false;
      },
      error: (err: any) => {
        console.error('Error loading classes:', err);
        
        // Handle different types of errors
        let errorMessage = 'Failed to load classes';
        
        if (err.status === 0 || err.status === undefined) {
          // Connection error (backend not running)
          errorMessage = 'Cannot connect to server. Please ensure the backend server is running on port 3001.';
        } else if (err.error) {
          if (typeof err.error === 'string') {
            errorMessage = err.error;
          } else if (err.error.message) {
            errorMessage = err.error.message;
          }
        } else if (err.message) {
          errorMessage = err.message;
        }
        
        this.error = errorMessage;
        this.loading = false;
        this.classes = []; // Clear classes array on error
        this.filteredClasses = [];
      }
    });
  }

  filterClasses() {
    this.applyFilters();
  }

  private applyFilters() {
    this.filteredClasses = this.classes.filter(classItem => {
      const matchesStatus = this.statusFilter === 'all' ||
        (this.statusFilter === 'active' && classItem.isActive) ||
        (this.statusFilter === 'inactive' && !classItem.isActive);
      return matchesStatus;
    });

    this.sortClasses();
  }

  sortClasses() {
    if (!this.sortBy) return;
    
    this.sortColumn = this.sortBy;
    this.filteredClasses.sort((a, b) => {
      let aValue: any;
      let bValue: any;
      
      switch (this.sortBy) {
        case 'name':
          aValue = a.name?.toLowerCase() || '';
          bValue = b.name?.toLowerCase() || '';
          break;
        case 'students':
          aValue = a.students?.length || 0;
          bValue = b.students?.length || 0;
          break;
        case 'teachers':
          aValue = a.teachers?.length || 0;
          bValue = b.teachers?.length || 0;
          break;
        case 'classTr':
          aValue = this.getClassTeacherFullName(a).toLowerCase();
          bValue = this.getClassTeacherFullName(b).toLowerCase();
          break;
        default:
          return 0;
      }
      
      if (aValue < bValue) return this.sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return this.sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }

  sortByColumn(column: string) {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'asc';
    }
    this.sortBy = column;
    this.sortClasses();
  }

  clearSearch() {
    this.searchTerm = '';
    this.pagination.page = 1;
    this.loadClasses();
  }

  clearFilters() {
    this.searchTerm = '';
    this.statusFilter = 'all';
    this.pagination.page = 1;
    this.loadClasses();
  }

  truncate(text: string, length: number): string {
    if (!text) return 'N/A';
    return text.length > length ? text.substring(0, length) + '...' : text;
  }

  /** Home / class teacher from API relation `classTeacher`. */
  getClassTeacherFullName(classItem: any): string {
    const t = classItem?.classTeacher;
    if (!t) {
      return '—';
    }
    const name = `${t.firstName || ''} ${t.lastName || ''}`.trim();
    return name || '—';
  }

  editClass(id: string) {
    this.router.navigate(classesManageNav(this.router).editSegments(id));
  }

  goToNewClass(): void {
    this.router.navigateByUrl(classesManageNav(this.router).addNew);
  }

  deleteClass(id: string, className: string) {
    if (!confirm(`Are you sure you want to delete the class "${className}"? This action cannot be undone.`)) {
      return;
    }

    this.loading = true;
    this.error = '';
    this.success = '';

    this.classService.deleteClass(id).subscribe({
      next: (data: any) => {
        this.success = data.message || 'Class deleted successfully';
        this.loading = false;
        // Reload classes list
        this.loadClasses();
      },
      error: (err: any) => {
        // 400 = expected validation (class still in use); avoid noisy error logs in the console
        if (err.status !== 400) {
          console.error('Error deleting class:', err);
        }
        
        // Handle different error response formats
        let errorMessage = 'Failed to delete class';
        
        if (err.status === 0 || err.status === undefined) {
          // Connection error (backend not running)
          errorMessage = 'Cannot connect to server. Please ensure the backend server is running on port 3001.';
        } else if (err.status === 400) {
          if (typeof err.error === 'string') {
            errorMessage = err.error;
          } else if (err.error?.message) {
            errorMessage = err.error.message;
          } else if (err.error?.details) {
            const details = err.error.details;
            const detailParts: string[] = [];
            if (details.students > 0) detailParts.push(`${details.students} student(s)`);
            if (details.teachers > 0) detailParts.push(`${details.teachers} teacher link(s)`);
            if (details.exams > 0) detailParts.push(`${details.exams} exam(s)`);
            if (details.enrollments > 0) detailParts.push(`${details.enrollments} enrollment record(s)`);
            if (details.recordBooks > 0) detailParts.push(`${details.recordBooks} record book row(s)`);
            if (detailParts.length > 0) {
              errorMessage = `Cannot delete class "${className}". This class still has: ${detailParts.join(', ')}. Remove or reassign these first, then try again.`;
            }
          }
        } else if (err.error) {
          if (typeof err.error === 'string') {
            errorMessage = err.error;
          } else if (err.error.message) {
            errorMessage = err.error.message;
          }
        } else if (err.message) {
          errorMessage = err.message;
        }
        
        this.error = errorMessage;
        this.loading = false;

        setTimeout(() => {
          document.querySelector('.classes-container .alert-error')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 0);
        
        // Clear error message after 12 seconds (longer when message explains multiple blockers)
        setTimeout(() => {
          this.error = '';
        }, 12000);
      }
    });
  }

  onSearchInput() {
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
    }
    this.searchDebounceTimer = setTimeout(() => {
      this.pagination.page = 1;
      this.loadClasses();
    }, 400);
  }

  changePage(page: number) {
    if (page < 1 || page > this.pagination.totalPages || page === this.pagination.page) {
      return;
    }
    this.pagination.page = page;
    this.loadClasses();
  }

  changePageSize(limit: string | number) {
    const parsedLimit = typeof limit === 'string' ? parseInt(limit, 10) : limit;
    if (!parsedLimit || parsedLimit === this.pagination.limit) return;
    this.pagination.limit = parsedLimit;
    this.pagination.page = 1;
    this.loadClasses();
  }
}

