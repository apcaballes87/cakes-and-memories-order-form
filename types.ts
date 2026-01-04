// FIX: Removed conflicting self-import of 'Product'. The type is defined in this file.
export interface Product {
  productType: string;
  productSubType: string;
  otherProduct: string;
  message: string;
  details: string;
  quantity: number;
  candle: string;
  images: File[];  // Multiple images per product
}

export interface OrderFormData {
  facebookname: string;
  name: string;
  contact: string;
  address: string;
  deliveryMethod: string;
  isDifferentReceiver: boolean;
  receiverName: string;
  receiverContact: string;
  dateEvent: string;
  timeEvent: string;
  products: Product[];
  paymentOption: string;
  instructions: string;
  paymentScreenshot: FileList | null;
}