import { render, screen } from '@testing-library/svelte'
import App from '../../src/App.svelte'

test('renders text and file compartments', () => {
  render(App)
  expect(screen.getByText(/Text Share/i)).toBeTruthy()
  expect(screen.getByText(/File Share/i)).toBeTruthy()
})
