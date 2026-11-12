import type { Routes } from '@angular/router';
export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./retired-workspace').then((m) => m.RetiredWorkspace),
  },
  { path: '**', redirectTo: '' },
];
