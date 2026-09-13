import { Router, Response } from 'express';
import prisma from '../prisma';
import { authenticateJWT, requireAdmin, AuthenticatedRequest } from '../middleware/auth';
import { broadcastRealtimeEvent } from '../lib/supabase';
import fs from 'fs';
import path from 'path';
import multer from 'multer';

const router = Router();
const BACKUPS_DIR = path.join(process.cwd(), 'backups');
if (!fs.existsSync(BACKUPS_DIR)) {
  try {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  } catch (e) {
    console.error('Failed to create backups dir:', e);
  }
}

const UPLOADS_DIR = path.join(process.cwd(), 'public', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  try {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  } catch (e) {
    console.error('Failed to create uploads dir:', e);
  }
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.png';
    const cleanName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `${cleanName}_${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp|gif|svg\+xml|svg/i;
    const isMimeValid = allowed.test(file.mimetype);
    const isExtValid = allowed.test(path.extname(file.originalname).toLowerCase());
    if (isMimeValid || isExtValid) {
      return cb(null, true);
    }
    cb(new Error('Only image files (PNG, JPG, WEBP, SVG) are permitted'));
  },
});

// Apply auth + admin restriction to all paths in this router
router.use(authenticateJWT, requireAdmin);

// 0. Image Upload Endpoint
router.post('/upload-image', (req: any, res: any) => {
  upload.single('image')(req, res, (err: any) => {
    if (err) {
      console.error('Image upload error:', err);
      return res.status(400).json({ error: err.message || 'Image upload failed' });
    }

    if (req.file) {
      const publicUrl = `/uploads/${req.file.filename}`;
      console.log(`[Admin Dashboard] Uploaded new image file: ${publicUrl}`);
      return res.status(200).json({
        message: 'Image uploaded successfully',
        url: publicUrl,
        filename: req.file.filename,
      });
    }

    // Base64 image payload fallback
    if (req.body?.imageBase64) {
      try {
        const matches = req.body.imageBase64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (matches && matches.length === 3) {
          const ext = matches[1].split('/')[1] || 'png';
          const filename = `uploaded_${Date.now()}.${ext}`;
          const filePath = path.join(UPLOADS_DIR, filename);
          fs.writeFileSync(filePath, Buffer.from(matches[2], 'base64'));
          const publicUrl = `/uploads/${filename}`;
          return res.status(200).json({
            message: 'Image uploaded successfully',
            url: publicUrl,
            filename,
          });
        }
      } catch (base64Err: any) {
        console.error('Base64 upload error:', base64Err);
      }
    }

    return res.status(400).json({ error: 'No image file or imageBase64 payload provided' });
  });
});

// 1. Fetch dashboard metric figures
router.get('/stats', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const totalOrdersCount = await prisma.order.count();
    const completedOrdersCount = await prisma.order.count({ 
      where: { status: { in: ['COMPLETED', 'SUCCESS'] } } 
    });
    const pendingOrdersCount = await prisma.order.count({ where: { status: 'PENDING' } });
    const failedOrdersCount = await prisma.order.count({ where: { status: 'FAILED' } });

    // Calculate sum of price for completed orders
    const revenueSum = await prisma.order.aggregate({
      where: { status: { in: ['COMPLETED', 'SUCCESS'] } },
      _sum: {
        price: true,
      },
    });

    // Recent orders
    const recentOrders = await prisma.order.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
        package: {
          include: { product: true },
        },
      },
    });

    // Game popularity distribution (Completed order counts per game product)
    const productStats = await prisma.product.findMany({
      include: {
        packages: {
          include: {
            _count: {
              select: { orders: { where: { status: { in: ['COMPLETED', 'SUCCESS'] } } } },
            },
          },
        },
      },
    });

    const popMap = new Map<string, { id: string; name: string; salesCount: number }>();
    for (const prod of productStats) {
      let salesCount = 0;
      prod.packages.forEach((pkg) => {
        salesCount += pkg._count.orders;
      });
      const existing = popMap.get(prod.name);
      if (existing) {
        existing.salesCount += salesCount;
      } else {
        popMap.set(prod.name, { id: prod.id, name: prod.name, salesCount });
      }
    }
    const popularity = Array.from(popMap.values()).sort((a, b) => b.salesCount - a.salesCount);

    return res.status(200).json({
      metrics: {
        totalRevenue: revenueSum._sum.price || 0,
        totalOrders: totalOrdersCount,
        completedOrders: completedOrdersCount,
        pendingOrders: pendingOrdersCount,
        failedOrders: failedOrdersCount,
      },
      recentOrders,
      popularity,
    });
  } catch (error) {
    console.error('Admin metrics error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// 2. Fetch all orders (Paginated / Filterable)
router.get('/orders', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const status = req.query.status as string;
    const search = req.query.search as string;

    const whereClause: any = {};
    if (status) {
      whereClause.status = status;
    }
    if (search) {
      whereClause.OR = [
        { playerId: { contains: search } },
        { playerNickname: { contains: search } },
        { paymentTxnId: { contains: search } },
      ];
    }

    const orders = await prisma.order.findMany({
      where: whereClause,
      include: {
        package: {
          include: { product: true },
        },
        user: {
          select: { email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.status(200).json(orders);
  } catch (error) {
    console.error('Admin fetch orders error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// 3. Manually edit order status (override for manual checks)
router.put('/orders/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { status, stockDeliveredCode } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    // Check if order exists
    const order = await prisma.order.findUnique({
      where: { id },
      include: { package: { include: { product: true } } },
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const previousStatus = order.status;

    // Save update
    const updatedOrder = await prisma.order.update({
      where: { id },
      data: {
        status,
        paymentStatus: (status === 'COMPLETED' || status === 'SUCCESS') ? 'PAID' : order.paymentStatus,
        stockDeliveredCode,
      },
    });

    console.log(`[Admin Override] Order ${order.paymentTxnId} status changed from ${previousStatus} to ${status}`);

    return res.status(200).json({
      message: 'Order updated successfully',
      order: updatedOrder,
    });
  } catch (error) {
    console.error('Admin update order error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// 4. Stock management: Get stock levels
router.get('/stock', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const stocks = await prisma.stock.findMany({
      include: {
        package: {
          include: { product: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Summary statistics
    const totals = await prisma.stock.groupBy({
      by: ['packageId', 'isUsed'],
      _count: {
        id: true,
      },
    });

    return res.status(200).json({ stocks, summary: totals });
  } catch (error) {
    console.error('Admin get stock error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// 5. Stock management: Add digital voucher serial codes
router.post('/stock', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { packageId, codes } = req.body; // codes is string[] or a single comma-separated list string

    if (!packageId || !codes) {
      return res.status(400).json({ error: 'Package ID and codes list are required' });
    }

    let codeList: string[] = [];
    if (Array.isArray(codes)) {
      codeList = codes;
    } else if (typeof codes === 'string') {
      codeList = codes.split('\n').map((c) => c.trim()).filter((c) => c.length > 0);
    }

    if (codeList.length === 0) {
      return res.status(400).json({ error: 'No valid codes provided' });
    }

    const createdRecords = await Promise.all(
      codeList.map((code) => {
        return prisma.stock.create({
          data: {
            packageId,
            code,
            isUsed: false,
          },
        });
      })
    );

    return res.status(201).json({
      message: `Successfully added ${createdRecords.length} codes to stock`,
      count: createdRecords.length,
    });
  } catch (error) {
    console.error('Admin add stock error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// 6. Product management: Add a new game product
router.post('/products', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, category, image } = req.body;

    if (!name || !category) {
      return res.status(400).json({ error: 'Product name and category are required' });
    }

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    // Check if slug already exists
    const existing = await prisma.product.findUnique({ where: { slug } });
    if (existing) {
      return res.status(400).json({ error: `A product with slug '${slug}' already exists` });
    }

    const newProduct = await prisma.product.create({
      data: {
        name,
        slug,
        category,
        image: image || `/images/games/${slug}.png`,
        isActive: true,
      },
    });

    console.log(`[Admin Dashboard] Product created: "${newProduct.name}" (Slug: ${slug})`);
    return res.status(201).json({
      message: 'Product created successfully',
      product: newProduct,
    });
  } catch (error: any) {
    console.error('Admin add product error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// 7. Product management: Add a new package under a product
router.post('/products/:productId/packages', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { productId } = req.params;
    const { name, amount, price, category, badge, image } = req.body;

    if (!name || amount === undefined || price === undefined) {
      return res.status(400).json({ error: 'Name, amount and price are required' });
    }

    // Verify product exists
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const newPackage = await prisma.package.create({
      data: {
        productId,
        name,
        amount: parseInt(amount, 10),
        price: parseFloat(price),
        image: image || null,
        isActive: true,
        category: category || 'NORMAL',
        badge: badge || null,
      },
    });

    console.log(`[Admin Dashboard] Package created under ${product.name}: "${newPackage.name}" ($${newPackage.price})`);
    return res.status(201).json({
      message: 'Package created successfully',
      package: newPackage,
    });
  } catch (error: any) {
    console.error('Admin add package error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// 7b. Product management: Update any product field (Name, Category, Image, Status, Slug)
router.patch('/products/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { image, name, category, isActive, slug } = req.body;
    const data: any = {};
    if (image !== undefined) data.image = image;
    if (name !== undefined) data.name = name;
    if (category !== undefined) data.category = category;
    if (isActive !== undefined) data.isActive = isActive;
    if (slug !== undefined) data.slug = slug;

    const updated = await prisma.product.update({ where: { id }, data });
    console.log(`[Admin Dashboard] Updated product: ${updated.name} (${updated.id})`);
    return res.status(200).json({ message: 'Product updated successfully', product: updated });
  } catch (error: any) {
    console.error('Admin update product error:', error);
    return res.status(500).json({ error: 'Internal server error: ' + (error.message || '') });
  }
});

// 7c. Package management: Update any package field (Name, Amount, Price, Category, Badge, Status, Image)
router.patch('/packages/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, amount, price, category, badge, isActive, image } = req.body;
    const data: any = {};
    if (name !== undefined) data.name = name;
    if (amount !== undefined) data.amount = parseInt(amount, 10);
    if (price !== undefined) data.price = parseFloat(price);
    if (category !== undefined) data.category = category;
    if (badge !== undefined) data.badge = badge;
    if (isActive !== undefined) data.isActive = isActive;
    if (image !== undefined) data.image = image;

    const updated = await prisma.package.update({ where: { id }, data });
    console.log(`[Admin Dashboard] Updated package: ${updated.name} ($${updated.price})`);
    return res.status(200).json({ message: 'Package updated successfully', package: updated });
  } catch (error: any) {
    console.error('Admin update package error:', error);
    return res.status(500).json({ error: 'Internal server error: ' + (error.message || '') });
  }
});

// 8. Product management: Delete a product
router.delete('/products/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    // Find target product by ID or slug
    const product = await prisma.product.findFirst({
      where: { OR: [{ id }, { slug: id }] },
      include: { packages: true },
    });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const packageIds = product.packages.map((p) => p.id);

    if (packageIds.length > 0) {
      // Delete associated digital stocks
      await prisma.stock.deleteMany({
        where: { packageId: { in: packageIds } },
      });

      // Delete associated orders to satisfy foreign key constraints
      await prisma.order.deleteMany({
        where: { packageId: { in: packageIds } },
      });

      // Delete all packages belonging to product
      await prisma.package.deleteMany({
        where: { productId: product.id },
      });
    }

    // Delete the product record
    await prisma.product.delete({
      where: { id: product.id },
    });

    console.log(`[Admin Dashboard] Successfully deleted product & all assets: ${product.name} (${product.slug})`);

    // Broadcast deletion via Supabase Realtime
    broadcastRealtimeEvent('products-catalog-realtime', 'PRODUCT_DELETED', {
      id: product.id,
      slug: product.slug,
    });

    return res.status(200).json({ message: 'Product deleted successfully', id: product.id });
  } catch (error: any) {
    console.error('Admin delete product error:', error);
    return res.status(500).json({ error: 'Failed to delete product: ' + (error.message || '') });
  }
});

// 9. Product management: Delete a package
router.delete('/packages/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    const pkg = await prisma.package.findUnique({
      where: { id },
    });

    if (!pkg) {
      return res.status(404).json({ error: 'Package not found' });
    }

    // Delete associated stock
    await prisma.stock.deleteMany({
      where: { packageId: id },
    });

    // Delete orders referencing this package to avoid foreign key failure
    await prisma.order.deleteMany({
      where: { packageId: id },
    });

    // Delete the package record
    await prisma.package.delete({
      where: { id },
    });

    console.log(`[Admin Dashboard] Successfully deleted package: ${pkg.name} (${pkg.id})`);

    // Broadcast update via Supabase Realtime
    broadcastRealtimeEvent('products-catalog-realtime', 'PACKAGE_DELETED', {
      id: pkg.id,
      productId: pkg.productId,
    });

    return res.status(200).json({ message: 'Package deleted successfully', id: pkg.id });
  } catch (error: any) {
    console.error('Admin delete package error:', error);
    return res.status(500).json({ error: 'Failed to delete package: ' + (error.message || '') });
  }
});

// 10. Database Backup: Full JSON export
router.get('/backup/export', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const products = await prisma.product.findMany({
      include: {
        packages: {
          include: {
            stocks: true,
          },
        },
      },
    });

    const orders = await prisma.order.findMany({
      include: {
        package: true,
      },
    });

    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    const backupData = {
      system: 'DARA-TOPUP',
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      counts: {
        products: products.length,
        packages: products.reduce((acc: number, p: any) => acc + (p.packages?.length || 0), 0),
        orders: orders.length,
        users: users.length,
      },
      data: {
        products,
        orders,
        users,
      },
    };

    const filename = `backup-dara-topup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(JSON.stringify(backupData, null, 2));
  } catch (error: any) {
    console.error('Backup export error:', error);
    return res.status(500).json({ error: 'Failed to export system backup' });
  }
});

// 11. Database Backup: Create Server Snapshot
router.post('/backup/create-snapshot', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const products = await prisma.product.findMany({
      include: {
        packages: {
          include: {
            stocks: true,
          },
        },
      },
    });

    const orders = await prisma.order.findMany({
      include: {
        package: true,
      },
    });

    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `snapshot-${timestamp}.json`;
    const filepath = path.join(BACKUPS_DIR, filename);

    const snapshotData = {
      system: 'DARA-TOPUP',
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      counts: {
        products: products.length,
        packages: products.reduce((acc: number, p: any) => acc + (p.packages?.length || 0), 0),
        orders: orders.length,
        users: users.length,
      },
      data: {
        products,
        orders,
        users,
      },
    };

    fs.writeFileSync(filepath, JSON.stringify(snapshotData, null, 2), 'utf-8');
    const stats = fs.statSync(filepath);

    return res.status(200).json({
      message: 'Server snapshot created successfully',
      snapshot: {
        filename,
        size: stats.size,
        createdAt: new Date().toISOString(),
        counts: snapshotData.counts,
      },
    });
  } catch (error: any) {
    console.error('Create snapshot error:', error);
    return res.status(500).json({ error: 'Failed to create server snapshot' });
  }
});

// 12. Database Backup: List all server snapshots
router.get('/backup/snapshots', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!fs.existsSync(BACKUPS_DIR)) {
      return res.status(200).json({ snapshots: [] });
    }

    const files = fs.readdirSync(BACKUPS_DIR).filter(f => f.endsWith('.json'));
    const snapshots = files.map(file => {
      const filepath = path.join(BACKUPS_DIR, file);
      const stats = fs.statSync(filepath);
      let counts = { products: 0, packages: 0, orders: 0, users: 0 };
      try {
        const content = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
        if (content.counts) counts = content.counts;
      } catch (e) {}

      return {
        filename: file,
        size: stats.size,
        createdAt: stats.birthtime.toISOString(),
        counts,
      };
    }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return res.status(200).json({ snapshots });
  } catch (error: any) {
    console.error('List snapshots error:', error);
    return res.status(500).json({ error: 'Failed to list snapshots' });
  }
});

// 13. Database Backup: Restore from snapshot or JSON
router.post('/backup/restore', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { filename, backupPayload } = req.body;
    let dataToRestore: any = null;

    if (filename) {
      const filepath = path.join(BACKUPS_DIR, filename);
      if (!fs.existsSync(filepath)) {
        return res.status(404).json({ error: 'Snapshot file not found' });
      }
      dataToRestore = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
    } else if (backupPayload) {
      dataToRestore = backupPayload;
    } else {
      return res.status(400).json({ error: 'Missing snapshot filename or backup payload' });
    }

    if (!dataToRestore.data || !Array.isArray(dataToRestore.data.products)) {
      return res.status(400).json({ error: 'Invalid backup file format' });
    }

    // Restore Products & Packages
    let restoredProductsCount = 0;
    let restoredPackagesCount = 0;

    for (const prod of dataToRestore.data.products) {
      const upsertedProduct = await prisma.product.upsert({
        where: { slug: prod.slug },
        update: {
          name: prod.name,
          category: prod.category,
          image: prod.image,
          isActive: prod.isActive ?? true,
        },
        create: {
          name: prod.name,
          slug: prod.slug,
          category: prod.category,
          image: prod.image,
          isActive: prod.isActive ?? true,
        },
      });
      restoredProductsCount++;

      if (Array.isArray(prod.packages)) {
        for (const pkg of prod.packages) {
          await prisma.package.upsert({
            where: { id: pkg.id },
            update: {
              name: pkg.name,
              amount: pkg.amount,
              price: pkg.price,
              isActive: pkg.isActive ?? true,
              category: pkg.category ?? 'NORMAL',
              badge: pkg.badge ?? null,
            },
            create: {
              id: pkg.id,
              productId: upsertedProduct.id,
              name: pkg.name,
              amount: pkg.amount,
              price: pkg.price,
              isActive: pkg.isActive ?? true,
              category: pkg.category ?? 'NORMAL',
              badge: pkg.badge ?? null,
            },
          });
          restoredPackagesCount++;
        }
      }
    }

    console.log(`[Backup System] Restored ${restoredProductsCount} products and ${restoredPackagesCount} packages`);
    return res.status(200).json({
      message: `System restored successfully: ${restoredProductsCount} products, ${restoredPackagesCount} packages.`,
      counts: {
        products: restoredProductsCount,
        packages: restoredPackagesCount,
      },
    });
  } catch (error: any) {
    console.error('Backup restore error:', error);
    return res.status(500).json({ error: 'Failed to restore backup: ' + (error.message || '') });
  }
});

// 14. Database Backup: Delete a server snapshot
router.delete('/backup/snapshots/:filename', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { filename } = req.params;
    const filepath = path.join(BACKUPS_DIR, filename);
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
    }
    return res.status(200).json({ message: 'Snapshot deleted successfully' });
  } catch (error: any) {
    console.error('Delete snapshot error:', error);
    return res.status(500).json({ error: 'Failed to delete snapshot' });
  }
});

export default router;
