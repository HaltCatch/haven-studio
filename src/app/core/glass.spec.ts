import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { HavenGlassSurface, provideHavenGlass } from '@haven/ui/glass';
import { HavenThemeDirective } from '@haven/ui/theme';
import type { HavenTheme } from '@haven/schema';

@Component({
  imports: [HavenGlassSurface, HavenThemeDirective],
  template: `<div [havenTheme]="theme()">
    <haven-glass-surface><input aria-label="Projected input" /></haven-glass-surface
    ><haven-glass-surface>Second</haven-glass-surface>
  </div>`,
})
class GlassHost {
  readonly theme = signal<HavenTheme>({
    preset: 'liquid-glass',
    mode: 'light',
    density: 'comfortable',
    tokens: { glassBlur: '8px' },
  });
}
afterEach(() => TestBed.resetTestingModule());
describe('packaged Angular glass integration', () => {
  it('isolates filter IDs and preserves projected DOM across theme changes', async () => {
    TestBed.configureTestingModule({ providers: [provideHavenGlass({ mode: 'polar' })] });
    const fixture = TestBed.createComponent(GlassHost);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const filters = Array.from(root.querySelectorAll('filter'));
    expect(filters).toHaveLength(2);
    expect(new Set(filters.map((filter) => filter.id)).size).toBe(2);
    expect(root.querySelectorAll('[data-haven-glass="polar"]')).toHaveLength(2);
    const input = root.querySelector('input')!;
    input.value = 'Keep input';
    fixture.componentInstance.theme.update((theme) => ({
      ...theme,
      mode: 'dark',
      tokens: { glassBlur: '4px' },
    }));
    await fixture.whenStable();
    expect(root.querySelector('input')).toBe(input);
    expect(input.value).toBe('Keep input');
    expect(
      root
        .querySelector<HTMLElement>('[data-haven-preset]')!
        .style.getPropertyValue('--haven-glass-blur'),
    ).toBe('4px');
    fixture.componentInstance.theme.update((theme) => ({ ...theme, preset: 'material' }));
    await fixture.whenStable();
    expect(root.querySelectorAll('filter')).toHaveLength(0);
    expect(root.querySelector('input')).toBe(input);
  });
});
