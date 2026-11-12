import { expect, test } from '@playwright/test';

test('retired routes show only the bilingual notice and never load models or demo resources', async ({
  page,
}) => {
  const requests: string[] = [];
  const errors: string[] = [];
  page.on('request', (request) => {
    if (/\/(api|examples)\//.test(request.url())) requests.push(request.url());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  for (const path of ['/', '/view/haven-components-v1', '/view/haven-components-v1/4']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: '旧测试界面已退役' })).toBeVisible();
    await expect(
      page.locator('haven-editor, haven-display, haven-renderer, haven-candidate-panel'),
    ).toHaveCount(0);
    await expect(page.locator('input, textarea')).toHaveCount(0);
  }
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'The testing workspace has been retired' }),
  ).toBeVisible();
  await page.setViewportSize({ width: 393, height: 852 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
});
