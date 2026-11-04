import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { VendorProfileForm } from '@/components/forms/vendor-profile-form';
import { PRODUCT_LINKS_HEADING } from '@/components/forms/product-links-fields';
import { PRODUCT_LINK_REQUIRED_MESSAGE } from '@/lib/validations/product-links';

// spec 011 contracts/server-actions-and-ui.md §11 and §14 row 3

const mockUpdateVendorProfile = vi.fn();

vi.mock('@/lib/actions/vendors', () => ({
  updateVendorProfile: (...args: unknown[]) => mockUpdateVendorProfile(...args),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const DEFAULTS = {
  businessName: 'Jane Crafts',
  contactName: 'Jane Doe',
  description: '',
  link1: 'https://etsy.com/shop/x',
  link2: 'https://instagram.com/x',
  link3: '',
};

function renderForm(defaultValues = DEFAULTS) {
  return render(<VendorProfileForm defaultValues={defaultValues} email="jane@example.com" />);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUpdateVendorProfile.mockResolvedValue({ success: true });
});

describe('VendorProfileForm product links', () => {
  it('renders the three slots from the defaults and no phone or website', () => {
    renderForm();

    expect(screen.getByRole('heading', { name: PRODUCT_LINKS_HEADING })).toBeInTheDocument();
    expect(screen.getByLabelText('Link 1 *')).toHaveValue('https://etsy.com/shop/x');
    expect(screen.getByLabelText('Link 2')).toHaveValue('https://instagram.com/x');
    expect(screen.getByLabelText('Link 3')).toHaveValue('');
    expect(screen.queryByLabelText('Phone')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Website')).not.toBeInTheDocument();
  });

  it('refuses a blank Link 1 with the message and does not save', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.clear(screen.getByLabelText('Link 1 *'));
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(await screen.findByText(PRODUCT_LINK_REQUIRED_MESSAGE)).toBeInTheDocument();
    expect(mockUpdateVendorProfile).not.toHaveBeenCalled();
  });

  it('saves the trio and confirms with a toast', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText('Link 3'), 'shop.example');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(mockUpdateVendorProfile).toHaveBeenCalled());
    expect(mockUpdateVendorProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        link1: 'https://etsy.com/shop/x',
        link2: 'https://instagram.com/x',
        link3: 'https://shop.example',
      })
    );
    await waitFor(() => expect(vi.mocked(toast.success)).toHaveBeenCalledWith('Profile updated'));
  });
});
