const TelegramBot = require("node-telegram-bot-api");
const fs = require("fs");
const fetch = require("node-fetch");
const sharp = require("sharp");
const ExifReader = require('exif-reader');
const heicConvert = require('heic-convert');

// Your bot token - make sure this is the latest token from BotFather
const TOKEN = "7939455355:AAGxSb6QUBT0jtQ4y8mzQVgvNi4MEK-utDc"; // Updated token
const bot = new TelegramBot(TOKEN, { 
    polling: true,
    // Add error handling for polling
    onlyFirstMatch: true,
    request: {
        timeout: 30000
    }
});

// Add error handlers
bot.on('polling_error', (error) => {
    console.log('Polling error:', error);
    if (error.code === 'ETELEGRAM' && error.message.includes('401')) {
        console.log('Invalid token. Please check your bot token with BotFather.');
        process.exit(1); // Exit the process to prevent continuous error messages
    }
});

bot.on('error', (error) => {
    console.log('General error:', error);
});

// Define commands for the menu
const commands = [
  { command: '/start', description: 'Start analyzing photos' },
  { command: '/help', description: 'Learn how to use the bot' },
  { command: '/about', description: 'About PhotoDataPro' }
];

// Set up commands menu
bot.setMyCommands(commands);

// Handle /start command
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 
    "📸 Welcome to PhotoDataPro!\n\n" +
    "I'm your professional photo analysis assistant. Send me any photo and I'll reveal:\n" +
    "• Detailed image specifications\n" +
    "• Camera settings & equipment info\n" +
    "• Date and location data\n" +
    "• Technical metadata\n\n" +
    "Supported formats:\n" +
    "• JPEG, PNG\n" +
    "• HEIC/HEIF (iPhone photos)\n" +
    "• Most Android camera formats\n\n" +
    "Just send a photo to start analyzing! 🔍"
  );
});

// Handle /help command
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId,
    "📱 How to Use PhotoDataPro:\n\n" +
    "1. Send any photo\n" +
    "2. Get instant analysis including:\n" +
    "   • Image quality & dimensions\n" +
    "   • Camera make & model\n" +
    "   • Shooting settings (ISO, aperture, etc.)\n" +
    "   • Location data (if available)\n\n" +
    "Pro Tips:\n" +
    "• Send original quality photos\n" +
    "• Works best with uncompressed images\n" +
    "• Supports both iOS and Android photos\n\n" +
    "Questions? Use /about for more information"
  );
});

// Add new /about command
bot.onText(/\/about/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId,
    "🔍 About PhotoDataPro\n\n" +
    "PhotoDataPro is your professional photography companion, designed to reveal the technical details behind every photo.\n\n" +
    "Features:\n" +
    "• Professional EXIF data extraction\n" +
    "• Detailed camera settings analysis\n" +
    "• GPS location mapping\n" +
    "• Support for multiple image formats\n\n" +
    "Perfect for:\n" +
    "• Photographers\n" +
    "• Photography enthusiasts\n" +
    "• Technical analysis\n" +
    "• Learning about your camera settings\n\n" +
    "Version: 1.0\n" +
    "Created with ❤️ for photography lovers"
  );
});

bot.on("photo", async (msg) => {
  const chatId = msg.chat.id;
  
  try {
    // Send processing message
    const processingMsg = await bot.sendMessage(chatId, "🔄 Processing your image...");

    // Get photo file
    const photo = msg.photo[msg.photo.length - 1];
    const file = await bot.getFile(photo.file_id);
    
    // Download image
    const response = await fetch(`https://api.telegram.org/file/bot${TOKEN}/${file.file_path}`);
    const buffer = await response.buffer();

    // Process image and get metadata
    let metadata;
    let imageBuffer = buffer;
    let exifData = {};

    try {
      // Try processing with Sharp first
      metadata = await sharp(buffer).metadata();
      
      if (metadata.exif) {
        try {
          exifData = ExifReader(metadata.exif);
        } catch (e) {
          console.log("EXIF reading error:", e);
        }
      }
    } catch (error) {
      // If Sharp fails, try HEIC conversion
      try {
        const outputBuffer = await heicConvert({
          buffer: buffer,
          format: 'JPEG',
          quality: 1
        });
        
        imageBuffer = outputBuffer;
        metadata = await sharp(outputBuffer).metadata();
        
        if (metadata.exif) {
          try {
            exifData = ExifReader(metadata.exif);
          } catch (e) {
            console.log("HEIC EXIF reading error:", e);
          }
        }
      } catch (heicError) {
        console.log("HEIC conversion error:", heicError);
      }
    }

    // Extract EXIF data
    const exif = exifData.exif || {};
    const image = exifData.image || {};
    const gps = exifData.gps || {};

    // Prepare the message
    let infoMessage = `📱 Image Information\n\n`;

    // Basic info (always available from metadata)
    infoMessage += `📊 Basic Details\n`;
    infoMessage += `• Format: ${(metadata?.format || 'Unknown').toUpperCase()}\n`;
    infoMessage += `• Size: ${Math.round(buffer.length / 1024)} KB\n`;
    if (metadata?.width && metadata?.height) {
        infoMessage += `• Resolution: ${metadata.width} × ${metadata.height}\n`;
    }
    infoMessage += '\n';

    // Camera info (if available)
    if (image.Make || image.Model || Object.keys(exif).length > 0) {
        infoMessage += `📸 Camera Info\n`;
        if (image.Make || image.Model) {
            infoMessage += `• Device: ${image.Make || ''} ${image.Model || ''}\n`;
        }
        if (exif.DateTimeOriginal) {
            try {
                const date = new Date(exif.DateTimeOriginal);
                infoMessage += `• Taken: ${date.toLocaleString()}\n`;
            } catch (e) {
                console.log("Date parsing error:", e);
            }
        }
        if (exif.ExposureTime) infoMessage += `• Shutter: ${exif.ExposureTime}s\n`;
        if (exif.FNumber) infoMessage += `• Aperture: f/${exif.FNumber}\n`;
        if (exif.ISO) infoMessage += `• ISO: ${exif.ISO}\n`;
        if (exif.FocalLength) infoMessage += `• Focal Length: ${exif.FocalLength}mm\n`;
        infoMessage += '\n';
    }

    // Location info (if available)
    if (gps.latitude && gps.longitude) {
        const mapsUrl = `https://www.google.com/maps?q=${gps.latitude},${gps.longitude}`;
        infoMessage += `📍 Location\n`;
        infoMessage += `• Coordinates: ${gps.latitude}, ${gps.longitude}\n`;
        infoMessage += `• View on Maps: ${mapsUrl}\n\n`;
    }

    // Delete processing message and send results
    await bot.deleteMessage(chatId, processingMsg.message_id);
    
    // Only send message if we have some information to show
    if (infoMessage.length > 30) { // More than just the header
        await bot.sendMessage(chatId, infoMessage);
    } else {
        throw new Error('No image data found');
    }

  } catch (error) {
    console.error("Error processing image:", error);
    
    let errorMessage = "⚠️ Please try sending the photo again:\n\n";
    errorMessage += "Tips for best results:\n";
    errorMessage += "• Send as original quality photo\n";
    errorMessage += "• Don't compress the image\n";
    errorMessage += "• For iPhone users: Select 'Actual Size'\n";
    errorMessage += "• For Android users: Select 'Original' quality";
    
    await bot.sendMessage(chatId, errorMessage);
  }
});

console.log("Bot is running...");
