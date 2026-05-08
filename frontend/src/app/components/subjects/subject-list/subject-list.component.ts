import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { SubjectService } from '../../../services/subject.service';
import { SubjectUtilsService } from '../../../services/subject-utils.service';
import { subjectsManageNav } from '../subjects-manage-navigation';

@Component({
  selector: 'app-subject-list',
  templateUrl: './subject-list.component.html',
  styleUrls: ['./subject-list.component.css']
})
export class SubjectListComponent implements OnInit {
  subjects: any[] = [];
  filteredSubjects: any[] = [];
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
    private subjectService: SubjectService,
    private subjectUtils: SubjectUtilsService,
    private router: Router,
    private route: ActivatedRoute
  ) { }

  getCategoryLabel(category: string | null | undefined): string {
    return this.subjectUtils.getCategoryLabel(category);
  }

  /** Normalized tier for styling (handles legacy IGCSE / AS_A_LEVEL if present). */
  normalizedCategory(category: string | null | undefined): 'O_LEVEL' | 'A_LEVEL' {
    return this.subjectUtils.normalizeCategory(category);
  }

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
    // Load subjects on component initialization
    this.loadSubjects();
  }

  loadSubjects() {
    this.loading = true;
    this.error = '';
    this.subjectService.getSubjects({
      page: this.pagination.page,
      limit: this.pagination.limit,
      search: this.searchTerm || undefined
    }).subscribe({
      next: (data: any) => {
        if (Array.isArray(data)) {
          this.subjects = data;
          this.pagination.total = data.length;
          this.pagination.totalPages = 1;
        } else {
          this.subjects = data?.data || [];
          this.pagination.total = data?.total || this.subjects.length;
          this.pagination.totalPages = data?.totalPages || 1;
        }
        this.applyFilters();
        this.loading = false;
      },
      error: (err: any) => {
        console.error('Error loading subjects:', err);
        
        // Handle different types of errors
        let errorMessage = 'Failed to load subjects';
        
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
        this.subjects = []; // Clear subjects array on error
        this.filteredSubjects = [];
      }
    });
  }

  filterSubjects() {
    this.applyFilters();
  }

  private applyFilters() {
    this.filteredSubjects = this.subjects.filter(subject => {
      const matchesStatus = this.statusFilter === 'all' ||
        (this.statusFilter === 'active' && subject.isActive) ||
        (this.statusFilter === 'inactive' && !subject.isActive);
      return matchesStatus;
    });

    this.sortSubjects();
  }

  sortSubjects() {
    if (!this.sortBy) return;
    
    this.sortColumn = this.sortBy;
    this.filteredSubjects.sort((a, b) => {
      let aValue: any;
      let bValue: any;
      
      switch (this.sortBy) {
        case 'code':
          aValue = a.code?.toLowerCase() || '';
          bValue = b.code?.toLowerCase() || '';
          break;
        case 'name':
          aValue = a.name?.toLowerCase() || '';
          bValue = b.name?.toLowerCase() || '';
          break;
        case 'teachers':
          aValue = a.teachers?.length || 0;
          bValue = b.teachers?.length || 0;
          break;
        case 'classes':
          aValue = a.classes?.length || 0;
          bValue = b.classes?.length || 0;
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
    this.sortSubjects();
  }

  clearSearch() {
    this.searchTerm = '';
    this.pagination.page = 1;
    this.loadSubjects();
  }

  clearFilters() {
    this.searchTerm = '';
    this.statusFilter = 'all';
    this.pagination.page = 1;
    this.loadSubjects();
  }

  truncate(text: string, length: number): string {
    if (!text) return 'N/A';
    return text.length > length ? text.substring(0, length) + '...' : text;
  }

  editSubject(id: string) {
    const nav = subjectsManageNav(this.router.url);
    this.router.navigate(nav.editSegments(id));
  }

  goToNewSubject() {
    const nav = subjectsManageNav(this.router.url);
    this.router.navigate(nav.addNewSegments);
  }

  deleteSubject(id: string, subjectName: string, subjectCode: string) {
    if (!confirm(`Are you sure you want to delete subject "${subjectName}" (${subjectCode})? This action cannot be undone.`)) {
      return;
    }

    this.loading = true;
    this.error = '';
    this.success = '';

    this.subjectService.deleteSubject(id).subscribe({
      next: (data: any) => {
        this.success = data.message || 'Subject deleted successfully';
        this.loading = false;
        // Reload subjects list
        this.loadSubjects();
      },
      error: (err: any) => {
        console.error('Error deleting subject:', err);
        console.error('Error status:', err.status);
        console.error('Error response:', err.error);
        
        // Handle different error response formats
        let errorMessage = 'Failed to delete subject';
        
        if (err.status === 0 || err.status === undefined) {
          // Connection error (backend not running)
          errorMessage = 'Cannot connect to server. Please ensure the backend server is running on port 3001.';
        } else if (err.status === 400) {
          // Bad Request - usually means subject has associated records
          if (err.error) {
            if (typeof err.error === 'string') {
              errorMessage = err.error;
            } else if (err.error.message) {
              errorMessage = err.error.message;
            }
            
            // Add details if available
            if (err.error.details) {
              const details = err.error.details;
              const detailParts: string[] = [];
              if (details.teachers > 0) detailParts.push(`${details.teachers} teacher(s)`);
              if (details.classes > 0) detailParts.push(`${details.classes} class(es)`);
              if (details.exams > 0) detailParts.push(`${details.exams} exam(s)`);
              
              if (detailParts.length > 0) {
                errorMessage = `Cannot delete subject "${subjectName}". This subject has: ${detailParts.join(', ')}. Please remove or reassign these associations first.`;
              }
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
        
        // Clear error message after 8 seconds
        setTimeout(() => {
          this.error = '';
        }, 8000);
      }
    });
  }

  onSearchInput() {
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
    }
    this.searchDebounceTimer = setTimeout(() => {
      this.pagination.page = 1;
      this.loadSubjects();
    }, 400);
  }

  changePage(page: number) {
    if (page < 1 || page > this.pagination.totalPages || page === this.pagination.page) {
      return;
    }
    this.pagination.page = page;
    this.loadSubjects();
  }

  changePageSize(limit: string | number) {
    const parsedLimit = typeof limit === 'string' ? parseInt(limit, 10) : limit;
    if (!parsedLimit || parsedLimit === this.pagination.limit) return;
    this.pagination.limit = parsedLimit;
    this.pagination.page = 1;
    this.loadSubjects();
  }
}

