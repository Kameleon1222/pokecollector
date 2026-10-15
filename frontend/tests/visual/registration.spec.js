import { expect, test } from '@playwright/test'

async function mockRegistrationApi(page, { status = 201, detail, language = 'en' } = {}) {
  const signups = []
  let currentUser = null
  await page.route(url => url.pathname.startsWith('/api/'), async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path === '/api/auth/mode') {
      return route.fulfill({ json: { multi_user: true, locked: true } })
    }
    if (path === '/api/auth/register') {
      const payload = request.postDataJSON()
      signups.push({ payload, authorization: request.headers().authorization })
      if (status !== 201) return route.fulfill({ status, json: { detail } })
      currentUser = {
        id: 2, username: payload.username, role: 'trainer', avatar_id: null,
        must_change_password: false,
      }
      return route.fulfill({ status: 201, json: { access_token: 'signup-token', token_type: 'bearer', user: currentUser } })
    }
    if (path === '/api/auth/login') {
      const form = new URLSearchParams(request.postData())
      currentUser = {
        id: 1, username: form.get('username'), role: 'trainer', avatar_id: null,
        must_change_password: false,
      }
      return route.fulfill({ json: { access_token: 'login-token', token_type: 'bearer', user: currentUser } })
    }
    if (path === '/api/auth/me') {
      return currentUser
        ? route.fulfill({ json: currentUser })
        : route.fulfill({ status: 401, json: { detail: 'Not authenticated' } })
    }
    if (path === '/api/settings/') return route.fulfill({ json: { language, currency: 'EUR' } })
    if (path === '/api/settings/exchange-rate') return route.fulfill({ json: { rate: 1 } })
    if (path === '/api/dashboard/') return route.fulfill({ json: { recent_additions: [], top_cards: [] } })
    if (path === '/api/sync/status') return route.fulfill({ json: { is_running: false, is_price_sync_running: false } })
    if (path === '/api/cards/recognize/jobs') return route.fulfill({ json: { jobs: [] } })
    if (path === '/api/analytics/investment-tracker') return route.fulfill({ json: [] })
    return route.fulfill({ json: {} })
  })
  return signups
}

async function openRegistration(page) {
  await page.goto('/login')
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Join PokéCollector' })).toBeVisible()
}

async function fillRegistration(page, { username = 'Misty', password = 'trainer-password', confirmation = password } = {}) {
  await page.getByLabel('Username', { exact: true }).fill(username)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByLabel('Confirm password', { exact: true }).fill(confirmation)
}

test('creates an account, stores its session, and opens its collection home', async ({ page }) => {
  const signups = await mockRegistrationApi(page)
  await openRegistration(page)
  await fillRegistration(page, { username: '  Misty  ' })
  await page.getByRole('button', { name: 'Create account', exact: true }).click()

  await expect(page).toHaveURL('/')
  await expect(page.getByText('Misty', { exact: true })).toBeVisible()
  expect(signups).toEqual([{ payload: { username: 'Misty', password: 'trainer-password' }, authorization: undefined }])
  expect(await page.evaluate(() => localStorage.getItem('token'))).toBe('signup-token')
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('user')).role)).toBe('trainer')
  expect(await page.evaluate(() => localStorage.getItem('lastUser'))).toBe('Misty')
})

test('validates the name, password length, and confirmation before calling the API', async ({ page }) => {
  const signups = await mockRegistrationApi(page)
  await openRegistration(page)
  await fillRegistration(page, { username: ' ' })
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText('Use a username with 2-32 characters.')

  await fillRegistration(page, { password: 'short' })
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText('Use at least 8 characters for your password.')

  await fillRegistration(page, { confirmation: 'another-password' })
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText('The passwords do not match.')

  await fillRegistration(page, { password: '😀'.repeat(19) })
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText('This password is too long. Choose a shorter password.')
  expect(signups).toHaveLength(0)
})

test('shows a useful message for an occupied username and keeps the form editable', async ({ page }) => {
  await mockRegistrationApi(page, { status: 409, detail: { code: 'username_taken', message: 'Username is already taken' } })
  await openRegistration(page)
  await fillRegistration(page)
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText('This username is already taken. Choose another one.')
  await expect(page.getByLabel('Username', { exact: true })).toBeEnabled()
  expect(await page.evaluate(() => localStorage.getItem('token'))).toBeNull()
  await expect(page).toHaveURL('/login')
})

test('shows a useful message for a registration rate limit', async ({ page }) => {
  await mockRegistrationApi(page, { status: 429, detail: 'Rate limit exceeded' })
  await openRegistration(page)
  await fillRegistration(page)
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText('Too many registration attempts. Try again in a minute.')
})

test('renders structured validation errors as text instead of crashing React', async ({ page }) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await mockRegistrationApi(page, { status: 422, detail: [{ loc: ['body', 'username'], msg: 'Invalid username', type: 'value_error' }] })
  await openRegistration(page)
  await fillRegistration(page)
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('username: Invalid username')
  expect(errors).toEqual([])
})

test('a remembered user can create a new account or return to their existing login', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('lastUser', 'Brock')
  })
  await mockRegistrationApi(page)
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await expect(page.getByLabel('Username', { exact: true })).toHaveValue('')
  await fillRegistration(page)
  await page.getByRole('button', { name: 'Login', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
  await expect(page.getByText('Brock', { exact: true })).toBeVisible()
  await expect(page.locator('input[type="password"]')).toHaveValue('')
  await page.locator('input[type="password"]').fill('existing-password')
  await page.getByRole('button', { name: 'Login', exact: true }).click()
  await expect(page).toHaveURL('/')
  expect(await page.evaluate(() => localStorage.getItem('token'))).toBe('login-token')
})

test('the Polish registration form and errors fit a 320px phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await page.addInitScript(() => localStorage.setItem('app_language', 'pl'))
  await mockRegistrationApi(page, { language: 'pl' })
  await page.goto('/login')
  await page.getByRole('button', { name: 'Utwórz konto', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Dołącz do PokéCollector' })).toBeVisible()
  await page.getByLabel('Nazwa użytkownika', { exact: true }).fill('Misty')
  await page.getByLabel('Hasło', { exact: true }).fill('trainer-password')
  await page.getByLabel('Powtórz hasło', { exact: true }).fill('different-password')
  await page.getByRole('button', { name: 'Utwórz konto', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText('Podane hasła nie są takie same.')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
