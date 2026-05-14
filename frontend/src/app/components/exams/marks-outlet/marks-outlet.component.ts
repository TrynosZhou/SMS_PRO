import { Component } from '@angular/core';

/** Hosts child routes under `/marks/*` (e.g. `/marks/continuous`). */
@Component({
  selector: 'app-marks-outlet',
  template: '<router-outlet></router-outlet>',
})
export class MarksOutletComponent {}
