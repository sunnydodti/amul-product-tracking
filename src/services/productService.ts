import axios from 'axios';
import { Product } from '@/models/Product';
import { AmulProductData } from '@/types';
import { notifySubscribers } from './emailService';

const AMUL_API_URL = 'https://shop.amul.com/api/1/entity/ms.products?fields%5Bname%5D=1&fields%5Bbrand%5D=1&fields%5Bcategories%5D=1&fields%5Bcollections%5D=1&fields%5Balias%5D=1&fields%5Bsku%5D=1&fields%5Bprice%5D=1&fields%5Bcompare_price%5D=1&fields%5Boriginal_price%5D=1&fields%5Bimages%5D=1&fields%5Bmetafields%5D=1&fields%5Bdiscounts%5D=1&fields%5Bcatalog_only%5D=1&fields%5Bis_catalog%5D=1&fields%5Bseller%5D=1&fields%5Bavailable%5D=1&fields%5Binventory_quantity%5D=1&fields%5Bnet_quantity%5D=1&fields%5Bnum_reviews%5D=1&fields%5Bavg_rating%5D=1&fields%5Binventory_low_stock_quantity%5D=1&fields%5Binventory_allow_out_of_stock%5D=1&fields%5Bdefault_variant%5D=1&fields%5Bvariants%5D=1&fields%5Blp_seller_ids%5D=1&filters%5B0%5D%5Bfield%5D=categories&filters%5B0%5D%5Bvalue%5D%5B0%5D=protein&filters%5B0%5D%5Boperator%5D=in&filters%5B0%5D%5Boriginal%5D=1&facets=true&facetgroup=default_category_facet&limit=24&total=1&start=0&cdc=1m&substore=66505ff0998183e1b1935c75';

export const fetchAndUpdateProducts = async (): Promise<void> => {
  try {
    console.log('🔄 Fetching products from Amul API...');
    const response = await axios.get<{ data: AmulProductData[] }>(AMUL_API_URL);
    const products: AmulProductData[] = response.data.data;

    let updatedCount = 0;
    let addedCount = 0;
    let restockedCount = 0;

    for (const productData of products) {
      const existingProduct = await Product.findOne({ productId: productData._id });
      if (productData._id == "63410e732677af79f687339b"){
        let a: number = 0;
        let b: number = 1;
      }
      // Determine availability status based on API data
      var isAvailable = productData.available === 1;
      var inventoryQuantity = isAvailable ? productData.inventory_quantity : 0;
      var isLowStock = isAvailable && inventoryQuantity <= productData.inventory_low_stock_quantity;
      
      if (existingProduct) {
        const wasOutOfStock = existingProduct.wasOutOfStock;
        const wasUnavailable = !existingProduct.inventoryQuantity;
        
        // Detect status changes that require notification
        const shouldNotify = (
          (wasOutOfStock && isAvailable) || // Product became available
          (wasUnavailable && inventoryQuantity > 0) || // Inventory restored
          (!wasOutOfStock && !isAvailable) // Product became unavailable
        );

        await Product.findOneAndUpdate(
          { productId: productData._id },
          {
            $set: {
              inventoryQuantity,
              lastChecked: new Date(),
              wasOutOfStock: !isAvailable,
              price: productData.price,
              name: productData.name,
              isLowStock,
              available: isAvailable
            }
          }
        );

        if (shouldNotify) {
          console.log(`📦 Product ${productData.name} status changed! Available: ${isAvailable}, Quantity: ${inventoryQuantity}`);
          await notifySubscribers(existingProduct, productData);
          restockedCount++;
        }
        
        updatedCount++;
      } else {
        // Create new product
        const newProduct = new Product({
          productId: productData._id,
          name: productData.name,
          alias: productData.alias,
          price: productData.price,
          inventoryQuantity,
          image: productData.images?.length ? 
            `https://shop.amul.com/s/62fa94df8c13af2e242eba16/${productData.images[0].image}` : undefined,
          brand: productData.brand,
          wasOutOfStock: !isAvailable,
          isLowStock,
          available: isAvailable
        });
        
        await newProduct.save();
        addedCount++;
        console.log(`➕ Added new product: ${productData.name}`);
      }
    }
    
    console.log(`✅ Products sync completed - Updated: ${updatedCount}, Added: ${addedCount}, Status Changes: ${restockedCount}`);
  } catch (error) {
    console.error('❌ Error fetching products:', error instanceof Error ? error.message : 'Unknown error');
    throw error;
  }
};