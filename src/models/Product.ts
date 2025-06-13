import mongoose, { Schema } from 'mongoose';
import { IProduct } from '@/types';

const productSchema = new Schema<IProduct>({
  productId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  alias: { type: String, required: true },
  price: { type: Number, required: true },
  inventoryQuantity: { type: Number, default: 0 },
  lastChecked: { type: Date, default: Date.now },
  image: { type: String },
  brand: { type: String },
  wasOutOfStock: { type: Boolean, default: false }
}, {
  timestamps: true
});

// Indexes for better performance
productSchema.index({ inventoryQuantity: 1 });
productSchema.index({ lastChecked: 1 });

export const Product = mongoose.model<IProduct>('Product', productSchema);