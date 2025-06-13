import { Document } from 'mongoose';

export interface IProduct extends Document {
  productId: string;
  name: string;
  alias: string;
  price: number;
  inventoryQuantity: number;
  lastChecked: Date;
  image?: string;
  brand?: string;
  wasOutOfStock: boolean;
  isLowStock: boolean;
  available: boolean;
}

export interface ISubscription extends Document {
  email: string;
  productId: string;
  telegramUsername?: string; // Optional telegram username
  subscribedAt: Date;
  isActive: boolean;
}

export interface AmulProductData {
  _id: string;
  name: string;
  alias: string;
  price: number;
  inventory_quantity: number;
  images?: Array<{ image: string }>;
  brand?: string;
  available: number;
  inventory_low_stock_quantity: number;
}

export interface SubscribeRequest {
  email: string;
  productId: string;
  telegramUsername?: string; // Optional telegram username
}

export interface UnsubscribeRequest {
  email: string;
  productId: string;
  telegramUsername?: string; // Optional telegram username
}

export interface SubscriptionWithProduct extends ISubscription {
  product: IProduct;
}

export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
}