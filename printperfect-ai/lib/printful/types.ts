/** Trimmed Printful API types — only the fields we consume. */

export type PrintfulProduct = {
  id: number;
  type: string;
  brand?: string | null;
  model?: string;
  title: string;
  image: string;
};

export type PrintfulVariant = {
  id: number;
  product_id: number;
  name: string;
  size?: string;
  color?: string;
  /** Price as a string in USD, e.g. "12.95". */
  price: string;
  image?: string;
  in_stock?: boolean;
};

export type PrintfulProductDetail = {
  product: PrintfulProduct;
  variants: PrintfulVariant[];
};

export type PrintfulFileUploadResponse = {
  /** File id used in subsequent order requests. */
  id: number;
  url?: string;
  filename: string;
  preview_url?: string;
};

export type PrintfulRecipient = {
  name: string;
  address1: string;
  address2?: string;
  city: string;
  state_code?: string;
  country_code: string;
  zip: string;
  email: string;
  phone?: string;
};

export type PrintfulOrderRequest = {
  external_id?: string;
  recipient: PrintfulRecipient;
  items: Array<{
    variant_id: number;
    quantity: number;
    files: Array<{ id: number; type?: 'default' | 'preview' }>;
  }>;
};
