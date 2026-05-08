import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

/** Preserves query params when redirecting old e-learning URLs into the hub. */
@Component({ template: '' })
export class TeacherElearningLegacyRedirectComponent implements OnInit {
  constructor(
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    const segment = this.route.snapshot.data['elearningSegment'] as string;
    this.router.navigate(['/teacher/elearning-manage', segment], {
      queryParams: this.route.snapshot.queryParams,
      replaceUrl: true,
    });
  }
}
