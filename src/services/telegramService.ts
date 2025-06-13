// services/telegramService.ts
import axios from 'axios';
import { IProduct } from '@/types';
import TelegramBot from 'node-telegram-bot-api';
import { Product } from '@/models/Product';
import { Subscription } from '@/models/Subscription';
import dotenv from 'dotenv';

dotenv.config();

interface TelegramUser {
  id: number;
  username: string;
  first_name: string;
  last_name?: string;
}

interface TelegramChat {
  id: number;
  type: string;
  username?: string;
}

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: TelegramUser;
    chat: TelegramChat;
    date: number;
    text: string;
  };
}

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN || '', { polling: true });

// Store user email addresses temporarily during email setting process
const pendingEmails = new Map<number, string>();

// Command handlers
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const username = msg.from?.username;
  
  if (username) {
    // Check if user already has an email in database
    const existingEmail = await Subscription.getUserEmail(username);
    if (existingEmail) {
      await bot.sendMessage(chatId, 
        '👋 Welcome back to Amul Product Notifier!\n\n' +
        'Your email is already set: ' + existingEmail + '\n\n' +
        'Available commands:\n' +
        '/setemail - Change your email\n' +
        '/products - Browse and subscribe to products\n' +
        '/mysubscriptions - View your subscriptions\n' +
        '/unsubscribeall - Unsubscribe from all products\n' +
        '/help - Show this help message\n\n' +
        '📧 For any support, contact: 423eeba1-805e-419d-b031-f2f038146513@persist.site'
      );
      return;
    }
  }

  await bot.sendMessage(chatId, 
    '👋 Welcome to Amul Product Notifier!\n\n' +
    'Available commands:\n' +
    '/setemail - Set your email for notifications\n' +
    '/products - Browse and subscribe to products\n' +
    '/mysubscriptions - View your subscriptions\n' +
    '/unsubscribeall - Unsubscribe from all products\n' +
    '/help - Show this help message\n\n' +
    '📧 For any support, contact: thakkarnisarg@gmail.com'
  );
});

// Helper function to get user email
async function getUserEmail(chatId: number, username?: string): Promise<string | null> {
  if (username) {
    const email = await Subscription.getUserEmail(username);
    if (email) return email;
  }
  return pendingEmails.get(chatId) || null;
}

bot.onText(/\/help/, async (msg) => {
  const chatId = msg.chat.id;
  await bot.sendMessage(chatId, 
    '📋 Available commands:\n\n' +
    '/setemail - Set your email for notifications\n' +
    '/products - Browse and subscribe to products\n' +
    '/mysubscriptions - View your subscriptions\n' +
    '/unsubscribeall - Unsubscribe from all products\n' +
    '/help - Show this help message\n\n' +
    '📧 For any support, contact: thakkarnisarg@gmail.com'
  );
});

bot.onText(/\/setemail/, async (msg) => {
  const chatId = msg.chat.id;
  await bot.sendMessage(chatId, 'Please enter your email address:');
  pendingEmails.set(chatId, 'waiting');
});

bot.onText(/\/products/, async (msg) => {
  const chatId = msg.chat.id;
  const username = msg.from?.username;
  const email = await getUserEmail(chatId, username);

  if (!email || email === 'waiting') {
    await bot.sendMessage(chatId, '❌ Please set your email first using /setemail');
    return;
  }

  try {
    const products = await Product.find({});
    if (products.length === 0) {
      await bot.sendMessage(chatId, 'No products available at the moment.');
      return;
    }

    // Create inline keyboard buttons for products
    const keyboard = products.map(product => [{
      text: `${product.name} - ₹${product.price} ${product.inventoryQuantity > 0 ? '🟢' : '🔴'}`,
      callback_data: `product_${product.productId}`
    }]);

    await bot.sendMessage(chatId, 
      '📋 Available Products:\n' +
      '🟢 - In Stock\n' +
      '🔴 - Out of Stock\n\n' +
      'Click on a product to view details and subscribe.',
      {
        reply_markup: {
          inline_keyboard: keyboard
        }
      }
    );
  } catch (error) {
    console.error('Error fetching products:', error);
    await bot.sendMessage(chatId, '❌ Error fetching products. Please try again later.');
  }
});

// Handle callback queries (button clicks)
bot.on('callback_query', async (callbackQuery) => {
  const chatId = callbackQuery.message?.chat.id;
  const username = callbackQuery.from.username;
  const data = callbackQuery.data;
  
  if (!chatId || !data) return;

  const email = await getUserEmail(chatId, username);
  if (!email || email === 'waiting') {
    await bot.answerCallbackQuery(callbackQuery.id, {
      text: '❌ Please set your email first using /setemail',
      show_alert: true
    });
    return;
  }

  if (data.startsWith('product_')) {
    const productId = data.replace('product_', '');

    try {
      const product = await Product.findOne({ productId });
      if (!product) {
        await bot.answerCallbackQuery(callbackQuery.id, {
          text: '❌ Product not found',
          show_alert: true
        });
        return;
      }

      const productUrl = `https://shop.amul.com/en/product/${product.alias}`;
      const existingSubscription = await Subscription.findOne({
        email,
        productId,
        isActive: true
      });

      if (product.inventoryQuantity > 0) {
        // Product is in stock - show direct link
        const keyboard = [[{
          text: '🛒 Buy Now',
          url: productUrl
        } as TelegramBot.InlineKeyboardButton]];

        if (!existingSubscription) {
          keyboard.push([{
            text: '🔔 Subscribe for Stock Updates',
            callback_data: `subscribe_${productId}`
          } as TelegramBot.InlineKeyboardButton]);
        }

        await bot.editMessageText(
          `📦 <b>${product.name}</b>\n\n` +
          `💰 Price: ₹${product.price}\n` +
          `📊 Stock: ${product.inventoryQuantity} units\n` +
          `\n${existingSubscription ? '✅ You are subscribed to this product' : 'Click below to subscribe for stock updates'}`,
          {
            chat_id: chatId,
            message_id: callbackQuery.message?.message_id,
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: keyboard
            }
          }
        );
      } else {
        // Product is out of stock - show subscription option
        const keyboard = [[{
          text: existingSubscription ? '✅ Subscribed' : '🔔 Subscribe for Stock Updates',
          callback_data: `subscribe_${productId}`
        }]];

        await bot.editMessageText(
          `📦 <b>${product.name}</b>\n\n` +
          `💰 Price: ₹${product.price}\n` +
          `📊 Stock: Out of Stock\n` +
          `\n${existingSubscription ? '✅ You are subscribed to this product' : 'Click below to subscribe for stock updates'}`,
          {
            chat_id: chatId,
            message_id: callbackQuery.message?.message_id,
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: keyboard
            }
          }
        );
      }
    } catch (error) {
      console.error('Error handling product selection:', error);
      await bot.answerCallbackQuery(callbackQuery.id, {
        text: '❌ Error processing request. Please try again later.',
        show_alert: true
      });
    }
  } else if (data.startsWith('subscribe_')) {
    const productId = data.replace('subscribe_', '');

    try {
      const product = await Product.findOne({ productId });
      if (!product) {
        await bot.answerCallbackQuery(callbackQuery.id, {
          text: '❌ Product not found',
          show_alert: true
        });
        return;
      }

      const existingSubscription = await Subscription.findOne({
        email,
        productId,
        isActive: true
      });

      if (existingSubscription) {
        await bot.answerCallbackQuery(callbackQuery.id, {
          text: '✅ You are already subscribed to this product!',
          show_alert: true
        });
        return;
      }

      await Subscription.create({
        email,
        productId,
        telegramUsername: username,
        isActive: true
      });

      await bot.answerCallbackQuery(callbackQuery.id, {
        text: `✅ Successfully subscribed to ${product.name}!`,
        show_alert: true
      });

      // Update the message to show subscription status
      const message = callbackQuery.message;
      if (message && message.reply_markup?.inline_keyboard) {
        const keyboard = message.reply_markup.inline_keyboard.map(row =>
          row.map(button => {
            if (button.callback_data === `subscribe_${productId}`) {
              return {
                ...button,
                text: '✅ Subscribed'
              };
            }
            return button;
          })
        );

        await bot.editMessageReplyMarkup(
          { inline_keyboard: keyboard },
          {
            chat_id: chatId,
            message_id: message.message_id
          }
        );
      }
    } catch (error) {
      console.error('Error subscribing to product:', error);
      await bot.answerCallbackQuery(callbackQuery.id, {
        text: '❌ Error subscribing to product. Please try again later.',
        show_alert: true
      });
    }
  } else if (data.startsWith('unsubscribe_')) {
    const productId = data.replace('unsubscribe_', '');

    try {
      const product = await Product.findOne({ productId });
      if (!product) {
        await bot.answerCallbackQuery(callbackQuery.id, {
          text: '❌ Product not found',
          show_alert: true
        });
        return;
      }

      const result = await Subscription.updateOne(
        { email, productId, isActive: true },
        { $set: { isActive: false } }
      );

      if (result.modifiedCount === 0) {
        await bot.answerCallbackQuery(callbackQuery.id, {
          text: '❌ No active subscription found for this product.',
          show_alert: true
        });
        return;
      }

      await bot.answerCallbackQuery(callbackQuery.id, {
        text: `✅ Successfully unsubscribed from ${product.name}!`,
        show_alert: true
      });

      // Update the message to remove the unsubscribed product
      const message = callbackQuery.message;
      if (message && message.reply_markup?.inline_keyboard) {
        const keyboard = message.reply_markup.inline_keyboard.filter(row => 
          !row[0].callback_data?.includes(`unsubscribe_${productId}`)
        );

        // If no subscriptions left, remove the unsubscribe all button
        if (keyboard.length === 1 && keyboard[0][0].callback_data === 'unsubscribe_all') {
          await bot.editMessageText(
            'You have no active subscriptions.',
            {
              chat_id: chatId,
              message_id: message.message_id
            }
          );
        } else {
          // Remove the product from the list
          const productText = `📦 <b>${product.name}</b>\n` +
                            `💰 Price: ₹${product.price}\n` +
                            `📊 Stock: ${product.inventoryQuantity > 0 ? 'In Stock' : 'Out of Stock'}\n` +
                            `🔗 <a href="https://shop.amul.com/en/product/${product.alias}">View Product</a>`;
          
          const newText = message.text?.replace(productText + '\n\n', '') || '';
          
          await bot.editMessageText(
            newText,
            {
              chat_id: chatId,
              message_id: message.message_id,
              parse_mode: 'HTML',
              disable_web_page_preview: true,
              reply_markup: {
                inline_keyboard: keyboard
              }
            }
          );
        }
      }
    } catch (error) {
      console.error('Error unsubscribing from product:', error);
      await bot.answerCallbackQuery(callbackQuery.id, {
        text: '❌ Error unsubscribing from product. Please try again later.',
        show_alert: true
      });
    }
  } else if (data === 'unsubscribe_all') {
    try {
      const result = await Subscription.updateMany(
        { email, isActive: true },
        { $set: { isActive: false } }
      );

      if (result.modifiedCount === 0) {
        await bot.answerCallbackQuery(callbackQuery.id, {
          text: 'You have no active subscriptions to unsubscribe from.',
          show_alert: true
        });
        return;
      }

      await bot.answerCallbackQuery(callbackQuery.id, {
        text: '✅ Successfully unsubscribed from all products!',
        show_alert: true
      });

      // Update the message to show no subscriptions
      const message = callbackQuery.message;
      if (message) {
        await bot.editMessageText(
          'You have no active subscriptions.',
          {
            chat_id: chatId,
            message_id: message.message_id
          }
        );
      }
    } catch (error) {
      console.error('Error unsubscribing from all products:', error);
      await bot.answerCallbackQuery(callbackQuery.id, {
        text: '❌ Error unsubscribing from products. Please try again later.',
        show_alert: true
      });
    }
  }
});

bot.onText(/\/mysubscriptions/, async (msg) => {
  const chatId = msg.chat.id;
  const username = msg.from?.username;
  const email = await getUserEmail(chatId, username);

  if (!email || email === 'waiting') {
    await bot.sendMessage(chatId, '❌ Please set your email first using /setemail');
    return;
  }

  try {
    const subscriptions = await Subscription.find({
      email,
      isActive: true
    });

    if (subscriptions.length === 0) {
      await bot.sendMessage(chatId, 'You have no active subscriptions.');
      return;
    }

    // Get all product details in one query
    const productIds = subscriptions.map(sub => sub.productId);
    const products = await Product.find({ productId: { $in: productIds } });
    
    // Create a map for quick product lookup
    const productMap = new Map(products.map(p => [p.productId, p]));

    const subscriptionList = subscriptions.map(sub => {
      const product = productMap.get(sub.productId);
      if (!product) return null;

      return `📦 <b>${product.name}</b>\n` +
             `💰 Price: ₹${product.price}\n` +
             `📊 Stock: ${product.inventoryQuantity > 0 ? 'In Stock' : 'Out of Stock'}\n` +
             `🔗 <a href="https://shop.amul.com/en/product/${product.alias}">View Product</a>`;
    }).filter(Boolean).join('\n\n');

    // Create inline keyboard with unsubscribe buttons
    const keyboard = subscriptions
      .map(sub => {
        const product = productMap.get(sub.productId);
        if (!product) return null;
        return [{
          text: `❌ Unsubscribe from ${product.name}`,
          callback_data: `unsubscribe_${sub.productId}`
        } as TelegramBot.InlineKeyboardButton];
      })
      .filter((row): row is TelegramBot.InlineKeyboardButton[] => row !== null);

    // Add unsubscribe all button
    keyboard.push([{
      text: '❌ Unsubscribe from All Products',
      callback_data: 'unsubscribe_all'
    } as TelegramBot.InlineKeyboardButton]);

    await bot.sendMessage(chatId, 
      '📋 Your Active Subscriptions:\n\n' + subscriptionList,
      { 
        parse_mode: 'HTML', 
        disable_web_page_preview: true,
        reply_markup: {
          inline_keyboard: keyboard
        }
      }
    );
  } catch (error) {
    console.error('Error fetching subscriptions:', error);
    await bot.sendMessage(chatId, '❌ Error fetching subscriptions. Please try again later.');
  }
});

bot.onText(/\/unsubscribe (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const productId = match?.[1];
  const username = msg.from?.username;
  const email = await getUserEmail(chatId, username);

  if (!email || email === 'waiting') {
    await bot.sendMessage(chatId, '❌ Please set your email first using /setemail');
    return;
  }

  if (!productId) {
    await bot.sendMessage(chatId, '❌ Please provide a product ID. Usage: /unsubscribe <product_id>');
    return;
  }

  try {
    const result = await Subscription.updateOne(
      { email, productId, isActive: true },
      { $set: { isActive: false } }
    );

    if (result.modifiedCount === 0) {
      await bot.sendMessage(chatId, '❌ No active subscription found for this product.');
      return;
    }

    const product = await Product.findOne({ productId });
    await bot.sendMessage(chatId, 
      `✅ Successfully unsubscribed from ${product?.name || 'the product'}!`
    );
  } catch (error) {
    console.error('Error unsubscribing from product:', error);
    await bot.sendMessage(chatId, '❌ Error unsubscribing from product. Please try again later.');
  }
});

bot.onText(/\/unsubscribeall/, async (msg) => {
  const chatId = msg.chat.id;
  const username = msg.from?.username;
  const email = await getUserEmail(chatId, username);

  if (!email || email === 'waiting') {
    await bot.sendMessage(chatId, '❌ Please set your email first using /setemail');
    return;
  }

  try {
    const result = await Subscription.updateMany(
      { email, isActive: true },
      { $set: { isActive: false } }
    );

    if (result.modifiedCount === 0) {
      await bot.sendMessage(chatId, 'You have no active subscriptions to unsubscribe from.');
      return;
    }

    await bot.sendMessage(chatId, 
      `✅ Successfully unsubscribed from all products!`
    );
  } catch (error) {
    console.error('Error unsubscribing from all products:', error);
    await bot.sendMessage(chatId, '❌ Error unsubscribing from products. Please try again later.');
  }
});

// Handle email input
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const username = msg.from?.username;
  const pendingEmail = pendingEmails.get(chatId);

  if (pendingEmail === 'waiting') {
    const newEmail = msg.text;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(newEmail || '')) {
      await bot.sendMessage(chatId, '❌ Invalid email format. Please try again:');
      return;
    }

    if (username) {
      // Update all existing subscriptions with the new email
      await Subscription.updateMany(
        { telegramUsername: username },
        { $set: { email: newEmail } }
      );
    }

    pendingEmails.set(chatId, newEmail || '');
    await bot.sendMessage(chatId, 
      `✅ Email set successfully: ${newEmail}\n` +
      'You can now use /products to view available products and /mysubscriptions to view your subscriptions.'
    );
  }
});

class TelegramService {
  private botToken: string;
  private baseUrl: string;
  private userChatIds: Map<string, number> = new Map(); // username -> chat_id mapping

  constructor() {
    this.botToken = process.env.TELEGRAM_BOT_TOKEN || '';
    this.baseUrl = `https://api.telegram.org/bot${this.botToken}`;
    
    if (!this.botToken) {
      console.warn('⚠️ TELEGRAM_BOT_TOKEN not found in environment variables');
    } else {
      // Initialize by getting updates to populate user chat IDs
      this.initializeUserMapping();
    }
  }

  private async initializeUserMapping(): Promise<void> {
    try {
      // Get recent updates to map usernames to chat IDs
      const updates = await this.getUpdates();
      for (const update of updates) {
        if (update.message?.from?.username && update.message?.chat?.id) {
          this.userChatIds.set(update.message.from.username, update.message.chat.id);
        }
      }
      console.log(`📱 Initialized Telegram user mapping for ${this.userChatIds.size} users`);
    } catch (error) {
      console.error('❌ Failed to initialize Telegram user mapping:', error);
    }
  }

  private async getUpdates(): Promise<TelegramUpdate[]> {
    try {
      const response = await axios.get(`${this.baseUrl}/getUpdates`);
      return response.data.result || [];
    } catch (error) {
      console.error('❌ Failed to get Telegram updates:', error);
      return [];
    }
  }

  private async getChatId(username: string): Promise<number | null> {
    // First check our cached mapping
    if (this.userChatIds.has(username)) {
      return this.userChatIds.get(username)!;
    }

    // If not found, try to get fresh updates
    await this.initializeUserMapping();
    return this.userChatIds.get(username) || null;
  }

  async sendProductNotification(username: string, product: IProduct, quantity: number): Promise<boolean> {
    try {
      const chatId = await this.getChatId(username);
      
      if (!chatId) {
        console.error(`❌ Chat ID not found for username: @${username}`);
        console.log(`💡 User @${username} needs to start a conversation with the bot first`);
        return false;
      }

      const message = this.generateProductMessage(product, quantity);
      
      const response = await axios.post(`${this.baseUrl}/sendMessage`, {
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
        disable_web_page_preview: false
      });

      if (response.data.ok) {
        console.log(`📱 Telegram notification sent to @${username} for product ${product.name}`);
        return true;
      } else {
        console.error(`❌ Failed to send Telegram message to @${username}:`, response.data);
        return false;
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error(`❌ Telegram API error for @${username}:`, error.response?.data || error.message);
      } else {
        console.error(`❌ Unexpected error sending Telegram message to @${username}:`, error);
      }
      return false;
    }
  }

  private generateProductMessage(product: IProduct, quantity: number): string {
    const productUrl = `https://shop.amul.com/en/product/${product.alias}`;
    
    return `🎉 <b>Great News!</b>

Your awaited product is back in stock!

📦 <b>${product.name}</b>
💰 <b>₹${product.price}</b>
🔥 <b>Only ${quantity} units available</b>

Don't wait too long - popular items like this tend to sell out fast!

<a href="${productUrl}">🛒 Order Now Before It's Gone!</a>

Happy Shopping! 🛍️

<i>Made with ❤️ by Nisarg & Harsh</i>`;
  }

  async sendTestMessage(username: string, product: IProduct): Promise<boolean> {
    return this.sendProductNotification(username, product, product.inventoryQuantity);
  }

  // Method to handle new users starting conversation with bot
  async handleBotStart(username: string, chatId: number): Promise<void> {
    this.userChatIds.set(username, chatId);
    console.log(`📱 New user registered: @${username} with chat ID: ${chatId}`);
  }
}

export const telegramService = new TelegramService();

// Export the bot instance and send functions
export const telegramServiceBot = {
  bot,
  sendProductNotification: async (username: string, product: any, quantity: number): Promise<boolean> => {
    try {
      const message = 
        `🎉 ${product.name} is Back in Stock!\n\n` +
        `💰 Price: ₹${product.price}\n` +
        `📦 Available Quantity: ${quantity}\n` +
        `🔗 https://shop.amul.com/en/product/${product.alias}`;

      await bot.sendMessage(username, message);
      return true;
    } catch (error) {
      console.error('Error sending Telegram notification:', error);
      return false;
    }
  },
  sendTestMessage: async (username: string, product: any): Promise<boolean> => {
    try {
      const message = 
        `🧪 Test Notification\n\n` +
        `📦 Product: ${product.name}\n` +
        `💰 Price: ₹${product.price}\n` +
        `🔗 https://shop.amul.com/en/product/${product.alias}`;

      await bot.sendMessage(username, message);
      return true;
    } catch (error) {
      console.error('Error sending test Telegram message:', error);
      return false;
    }
  }
};