const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');

class ImageService {
    constructor() {
        this.uploadDir = path.join(__dirname, '../uploads/products');
        this.ensureUploadDir();
    }

    async ensureUploadDir() {
        try {
            await fs.mkdir(this.uploadDir, { recursive: true });
        } catch (error) {
            console.error('Error creating upload directory:', error);
        }
    }

    async optimizeImage(file, options = {}) {
        try {
            const {
                width = 800,
                height = 800,
                quality = 80,
                fit = 'inside'
            } = options;

            // Generate unique filename
            const filename = `${uuidv4()}.jpg`;
            const outputPath = path.join(this.uploadDir, filename);

            // Optimize image with sharp
            await sharp(file.path)
                .resize(width, height, {
                    fit: fit,
                    withoutEnlargement: true
                })
                .jpeg({ quality, mozjpeg: true })
                .toFile(outputPath);

            // Get file size for logging
            const stats = await fs.stat(outputPath);
            console.log(`Image optimized: ${filename} (${(stats.size / 1024).toFixed(2)}KB)`);

            // Delete original file
            await fs.unlink(file.path).catch(err => 
                console.error('Error deleting temp file:', err)
            );

            return {
                filename,
                path: `/uploads/products/${filename}`,
                size: stats.size
            };
        } catch (error) {
            console.error('Error optimizing image:', error);
            throw error;
        }
    }

    async optimizeMultipleImages(files, options = {}) {
        const optimizedImages = [];
        
        for (const file of files) {
            try {
                const optimized = await this.optimizeImage(file, options);
                optimizedImages.push(optimized.path);
            } catch (error) {
                console.error('Error processing image:', error);
            }
        }

        return optimizedImages;
    }

    async deleteImage(imagePath) {
        try {
            if (!imagePath) return;
            
            // Extract filename from path
            const filename = path.basename(imagePath);
            const fullPath = path.join(this.uploadDir, filename);
            
            // Check if file exists and delete
            await fs.access(fullPath);
            await fs.unlink(fullPath);
            console.log(`Deleted image: ${filename}`);
        } catch (error) {
            // File doesn't exist or other error, just log it
            console.log(`Could not delete image: ${imagePath}`, error.message);
        }
    }

    async deleteMultipleImages(imagePaths) {
        const deletePromises = imagePaths.map(path => this.deleteImage(path));
        await Promise.all(deletePromises);
    }
}

module.exports = new ImageService();