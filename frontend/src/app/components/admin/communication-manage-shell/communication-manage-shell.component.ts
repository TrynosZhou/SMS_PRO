import { Component, OnDestroy, OnInit } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter, Subscription } from 'rxjs';

@Component({
  selector: 'app-communication-manage-shell',
  templateUrl: './communication-manage-shell.component.html',
  styleUrls: ['./communication-manage-shell.component.css']
})
export class CommunicationManageShellComponent implements OnInit, OnDestroy {
  showSectionTabs = true;
  private navSub?: Subscription;

  constructor(private router: Router) {}

  ngOnInit(): void {
    this.updateSectionTabs();
    this.navSub = this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(() => this.updateSectionTabs());
  }

  ngOnDestroy(): void {
    this.navSub?.unsubscribe();
  }

  private updateSectionTabs(): void {
    this.showSectionTabs = !this.router.url.includes('/communication_manage/send');
  }
}
