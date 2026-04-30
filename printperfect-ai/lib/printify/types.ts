/** Trimmed Printify v1 types — only the fields we actually consume. */

export type PrintifyBlueprint = {
  id: number;
  title: string;
  brand?: string;
  model?: string;
  description?: string;
  images: string[];
};

export type PrintifyVariant = {
  id: number;
  title: string;
  options: Record<string, string | number>;
  /** Price in cents, in shop's currency. */
  price: number;
  is_enabled: boolean;
};

export type PrintifyPrintProvider = {
  id: number;
  title: string;
};

export type PrintifyImageUploadResponse = {
  id: string;
  file_name: string;
  height: number;
  width: number;
  size: number;
  mime_type: string;
  preview_url: string;
};

export type PrintifyAddress = {
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  country: string;
  region?: string;
  address1: string;
  address2?: string;
  city: string;
  zip: string;
};

export type PrintifyOrderRequest = {
  external_id: string;
  label?: string;
  line_items: Array<{
    print_provider_id: number;
    blueprint_id: number;
    variant_id: number;
    print_areas: { front: string }; // image upload id
    quantity: number;
  }>;
  shipping_method: number;
  send_shipping_notification: boolean;
  address_to: PrintifyAddress;
};
