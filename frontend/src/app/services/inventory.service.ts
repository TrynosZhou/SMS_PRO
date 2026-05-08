import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class InventoryService {
  private readonly base = `${environment.apiUrl}/inventory`;

  constructor(private http: HttpClient) {}

  getSettings(): Observable<any> {
    return this.http.get(`${this.base}/settings`);
  }

  updateSettings(body: any): Observable<any> {
    return this.http.put(`${this.base}/settings`, body);
  }

  getStockOverview(): Observable<any> {
    return this.http.get(`${this.base}/stock/overview`);
  }

  listCatalog(): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/textbook-catalog`);
  }

  createCatalog(body: any): Observable<any> {
    return this.http.post(`${this.base}/textbook-catalog`, body);
  }

  updateCatalog(id: string, body: any): Observable<any> {
    return this.http.put(`${this.base}/textbook-catalog/${id}`, body);
  }

  deleteCatalog(id: string): Observable<any> {
    return this.http.delete(`${this.base}/textbook-catalog/${id}`);
  }

  addCopies(catalogId: string, body: { count: number; condition?: string; assetTagPrefix?: string }): Observable<any> {
    return this.http.post(`${this.base}/textbook-catalog/${catalogId}/copies`, body);
  }

  listCopies(q?: { catalogId?: string; status?: string }): Observable<any[]> {
    let params = new HttpParams();
    if (q?.catalogId) params = params.set('catalogId', q.catalogId);
    if (q?.status) params = params.set('status', q.status);
    return this.http.get<any[]>(`${this.base}/textbook-copies`, { params });
  }

  deleteTextbookCopy(id: string): Observable<any> {
    return this.http.delete(`${this.base}/textbook-copies/${id}`);
  }

  listFurniture(q?: { itemType?: string; status?: string }): Observable<any[]> {
    let params = new HttpParams();
    if (q?.itemType) params = params.set('itemType', q.itemType);
    if (q?.status) params = params.set('status', q.status);
    return this.http.get<any[]>(`${this.base}/furniture`, { params });
  }

  createFurniture(body: any): Observable<any> {
    return this.http.post(`${this.base}/furniture`, body);
  }

  updateFurniture(id: string, body: any): Observable<any> {
    return this.http.put(`${this.base}/furniture/${id}`, body);
  }

  permanentIssue(body: any): Observable<any> {
    return this.http.post(`${this.base}/transactions/permanent-issue`, body);
  }

  permanentReturn(body: any): Observable<any> {
    return this.http.post(`${this.base}/transactions/permanent-return`, body);
  }

  borrow(body: any): Observable<any> {
    return this.http.post(`${this.base}/transactions/borrow`, body);
  }

  returnLoan(body: { loanId: string }): Observable<any> {
    return this.http.post(`${this.base}/transactions/return-loan`, body);
  }

  issueFurniture(body: any): Observable<any> {
    return this.http.post(`${this.base}/transactions/furniture-issue`, body);
  }

  revokeFurniture(body: { assignmentId: string }): Observable<any> {
    return this.http.post(`${this.base}/transactions/furniture-revoke`, body);
  }

  /** Admin: allocate in-stock furniture to a class teacher's pool. */
  transferFurnitureAdminToClassTeacher(body: {
    teacherId: string;
    deskRefs?: string[];
    chairRefs?: string[];
    deskCount?: number;
    chairCount?: number;
  }): Observable<any> {
    return this.http.post(`${this.base}/furniture/transfer/admin-to-class-teacher`, body);
  }

  listClassTeachersForFurniture(): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/users/class-teachers-furniture`);
  }

  /** Class teacher: desks/chairs held in your pool (admin-allocated). */
  listMyFurniturePool(): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/furniture/me/pool`);
  }

  markTextbookLost(copyId: string, body?: { accountableStudentId?: string }): Observable<any> {
    return this.http.post(`${this.base}/items/textbook/${copyId}/mark-lost`, body || {});
  }

  markFurnitureLost(id: string, body?: { accountableStudentId?: string }): Observable<any> {
    return this.http.post(`${this.base}/items/furniture/${id}/mark-lost`, body || {});
  }

  damageFine(body: any): Observable<any> {
    return this.http.post(`${this.base}/fines/damage-furniture`, body);
  }

  lostItemFine(body: any): Observable<any> {
    return this.http.post(`${this.base}/fines/lost-item`, body);
  }

  markFinePaid(id: string): Observable<any> {
    return this.http.post(`${this.base}/fines/${id}/mark-paid`, {});
  }

  waiveFine(id: string): Observable<any> {
    return this.http.post(`${this.base}/fines/${id}/waive`, {});
  }

  studentSummary(studentId: string): Observable<any> {
    return this.http.get(`${this.base}/students/${studentId}/summary`);
  }

  mySummary(): Observable<any> {
    return this.http.get(`${this.base}/me/summary`);
  }

  reportLost(params: HttpParams): Observable<any> {
    return this.http.get(`${this.base}/reports/lost`, { params });
  }

  reportTextbookIssuance(params: HttpParams): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/reports/textbook-issuance`, { params });
  }

  reportFurnitureIssuance(params: HttpParams): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/reports/furniture-issuance`, { params });
  }

  /** Admin: furniture items in class-teacher pools (`with_teacher`). */
  reportFurnitureWithClassTeachers(): Observable<{ items: any[] }> {
    return this.http.get<{ items: any[] }>(`${this.base}/reports/furniture-with-class-teachers`);
  }

  /** Admin: textbook copies allocated to HODs (`with_hod`). */
  reportTextbooksAllocatedToHods(): Observable<{ items: any[] }> {
    return this.http.get<{ items: any[] }>(`${this.base}/reports/textbooks-allocated-to-hods`);
  }

  /** Admin: return invalid HOD holdings (no dept / no HOD name) to central stock. */
  clearInvalidHodTextbookHoldings(): Observable<{ cleared: number; copyIds: string[] }> {
    return this.http.post<{ cleared: number; copyIds: string[] }>(
      `${this.base}/textbooks/admin/clear-invalid-hod-holdings`,
      {}
    );
  }

  /** Teacher: textbooks with students where this teacher is the issuing holder. */
  reportTeacherTextbooksIssued(): Observable<{ textbooks: any[] }> {
    const params = new HttpParams().set('_', String(Date.now()));
    return this.http.get<{ textbooks: any[] }>(`${this.base}/reports/teacher-textbooks-issued`, { params });
  }

  /** Class teacher: active furniture assignments this user issued in their class-teacher classes. */
  reportTeacherClassFurniture(): Observable<{ furniture: any[] }> {
    return this.http.get<{ furniture: any[] }>(`${this.base}/reports/teacher-class-furniture`);
  }

  reportLoans(params: HttpParams): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/reports/loan-history`, { params });
  }

  reportFines(params: HttpParams): Observable<any> {
    return this.http.get(`${this.base}/reports/fines`, { params });
  }

  auditLog(params: HttpParams): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/audit`, { params });
  }

  applyAutoLoss(): Observable<any> {
    return this.http.post(`${this.base}/jobs/apply-auto-loss`, {});
  }

  transferAdminToHod(body: { hodUserId: string; copyIds?: string[]; catalogId?: string; count?: number }): Observable<any> {
    return this.http.post(`${this.base}/textbooks/transfer/admin-to-hod`, body);
  }

  transferHodToTeacher(body: { teacherId: string; copyIds?: string[]; bookNumbers?: string[] }): Observable<any> {
    return this.http.post(`${this.base}/textbooks/transfer/hod-to-teacher`, body);
  }

  transferTeacherToStudent(body: { studentId: string; copyIds?: string[]; bookNumbers?: string[] }): Observable<any> {
    return this.http.post(`${this.base}/textbooks/transfer/teacher-to-student`, body);
  }

  returnStudentToTeacher(body: { copyIds?: string[]; bookNumbers?: string[]; condition: 'good' | 'torn' | 'lost' }): Observable<any> {
    return this.http.post(`${this.base}/textbooks/return/student-to-teacher`, body);
  }

  listHods(): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/users/hods`);
  }

  listDepartmentTeachers(): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/users/department-teachers`);
  }

  listMyHeldTextbooks(): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/textbooks/me/held`);
  }

  /** HOD: count of textbook copies currently with teachers (transferred by this HOD, not yet to students). */
  getHodIssuedToTeachersCount(): Observable<{ issuedToTeachers: number }> {
    return this.http.get<{ issuedToTeachers: number }>(`${this.base}/textbooks/hod/issued-to-teachers-count`);
  }

  /** Students in class who already hold this catalog title (cannot receive a second copy). */
  getBlockedStudentsForTextbookIssue(classId: string, catalogId: string): Observable<{ blockedStudentIds: string[] }> {
    const params = new HttpParams().set('classId', classId).set('catalogId', catalogId);
    return this.http.get<{ blockedStudentIds: string[] }>(`${this.base}/textbooks/issue/blocked-students-in-class`, {
      params,
    });
  }
}
