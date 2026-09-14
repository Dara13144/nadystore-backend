import { Router, Response } from 'express';
import prisma from '../prisma';
import { authenticateJWT, requireAdmin, AuthenticatedRequest } from '../middleware/auth';
import { broadcastRealtimeEvent } from '../lib/supabase';

const router = Router();

// 1. Get package by ID or slug identifier (Public)
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    let pkg = await prisma.package.findUnique({
      where: { id },
      include: { product: true },
    });

    if (!pkg) {
      // Try search by name or partial slug
      pkg = await prisma.package.findFirst({
        where: {
          OR: [
            { name: { equals: id, mode: 'insensitive' } },
            { id: { contains: id } },
          ],
        },
        include: { product: true },
      });
    }

    if (!pkg) {
      return res.status(404).json({ error: 'Package not found' });
    }

    return res.status(200).json(pkg);
  } catch (error: any) {
    console.error('Get package error:', error);
    return res.status(500).json({ error: 'Failed to fetch package' });
  }
});

// 2. Update package field (Admin Protected)
router.patch('/:id', authenticateJWT, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, amount, price, category, badge, isActive, image, productId } = req.body;

    // 1. Try exact ID lookup
    let existingPackage = await prisma.package.findUnique({
      where: { id },
    });

    // 2. Try lookup by productId + amount / name
    if (!existingPackage && productId) {
      existingPackage = await prisma.package.findFirst({
        where: {
          productId,
          OR: [
            name ? { name: { equals: name, mode: 'insensitive' } } : {},
            amount !== undefined ? { amount: parseInt(amount, 10) } : {},
          ],
        },
      });
    }

    // 3. Try lookup by slug format (e.g. 'free-fire-1')
    if (!existingPackage && id.includes('-')) {
      const parts = id.split('-');
      const possibleIndex = parseInt(parts[parts.length - 1], 10);
      const possibleProductSlug = parts.slice(0, -1).join('-');

      const matchedProduct = await prisma.product.findFirst({
        where: { OR: [{ slug: possibleProductSlug }, { slug: id }] },
        include: { packages: { orderBy: { price: 'asc' } } },
      });

      if (matchedProduct && matchedProduct.packages.length > 0) {
        if (!isNaN(possibleIndex) && possibleIndex > 0 && possibleIndex <= matchedProduct.packages.length) {
          existingPackage = matchedProduct.packages[possibleIndex - 1];
        } else {
          existingPackage = matchedProduct.packages[0];
        }
      }
    }

    // 4. Try lookup by name anywhere
    if (!existingPackage && name) {
      existingPackage = await prisma.package.findFirst({
        where: { name: { equals: name, mode: 'insensitive' } },
      });
    }

    const data: any = {};
    if (name !== undefined) data.name = name;
    if (amount !== undefined) data.amount = parseInt(amount, 10);
    if (price !== undefined) data.price = parseFloat(price);
    if (category !== undefined) data.category = category;
    if (badge !== undefined) data.badge = badge;
    if (isActive !== undefined) data.isActive = isActive;
    if (image !== undefined) data.image = image;

    let resultPackage;
    if (existingPackage) {
      resultPackage = await prisma.package.update({
        where: { id: existingPackage.id },
        data,
      });
      console.log(`[Packages API] Updated package: ${resultPackage.name} ($${resultPackage.price})`);
    } else {
      // Robust Product Resolution to guarantee Foreign Key validity
      let targetProduct = null;
      if (productId) {
        targetProduct = await prisma.product.findFirst({
          where: {
            OR: [
              { id: productId },
              { slug: productId },
              { name: { equals: productId, mode: 'insensitive' } },
            ],
          },
        });
      }

      if (!targetProduct && id) {
        const parts = id.split('-');
        const possibleProductSlug = parts.length > 1 ? parts.slice(0, -1).join('-') : id;
        targetProduct = await prisma.product.findFirst({
          where: {
            OR: [
              { id },
              { slug: id },
              { slug: possibleProductSlug },
            ],
          },
        });
      }

      if (!targetProduct) {
        targetProduct = await prisma.product.findFirst();
      }

      if (!targetProduct) {
        targetProduct = await prisma.product.create({
          data: {
            name: 'General Games',
            slug: 'general-games',
            image: '/images/games/freefire.png',
            category: 'MOBILE_GAME',
            isActive: true,
          },
        });
      }

      // Check if this product already has a matching package to update instead
      const duplicatePkg = await prisma.package.findFirst({
        where: {
          productId: targetProduct.id,
          OR: [
            name ? { name: { equals: name, mode: 'insensitive' } } : {},
            amount !== undefined ? { amount: parseInt(amount, 10) } : {},
          ],
        },
      });

      if (duplicatePkg) {
        resultPackage = await prisma.package.update({
          where: { id: duplicatePkg.id },
          data,
        });
        console.log(`[Packages API] Updated existing package: ${resultPackage.name} ($${resultPackage.price})`);
      } else {
        resultPackage = await prisma.package.create({
          data: {
            productId: targetProduct.id,
            name: name || 'New Package',
            amount: amount !== undefined ? parseInt(amount, 10) : 100,
            price: price !== undefined ? parseFloat(price) : 0.99,
            category: category || 'NORMAL',
            badge: badge || null,
            image: image || null,
            isActive: isActive !== undefined ? isActive : true,
          },
        });
        console.log(`[Packages API] Upserted package under ${targetProduct.name}: ${resultPackage.name} ($${resultPackage.price})`);
      }
    }

    broadcastRealtimeEvent('products-catalog-realtime', 'PACKAGE_UPDATED', { package: resultPackage });
    return res.status(200).json({ message: 'Package updated successfully', package: resultPackage });
  } catch (error: any) {
    console.error('Update package error:', error);
    return res.status(500).json({ error: 'Failed to update package' });
  }
});

// 3. Delete package (Admin Protected)
router.delete('/:id', authenticateJWT, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    let pkg = await prisma.package.findUnique({
      where: { id },
    });

    if (!pkg && id.includes('-')) {
      const parts = id.split('-');
      const possibleProductSlug = parts.slice(0, -1).join('-');
      const matchedProduct = await prisma.product.findFirst({
        where: { slug: possibleProductSlug },
        include: { packages: true },
      });
      if (matchedProduct && matchedProduct.packages.length > 0) {
        pkg = matchedProduct.packages[0];
      }
    }

    if (!pkg) {
      return res.status(404).json({ error: 'Package not found' });
    }

    // Clean up stocks and orders referencing this package
    await prisma.stock.deleteMany({ where: { packageId: pkg.id } });
    await prisma.order.deleteMany({ where: { packageId: pkg.id } });

    await prisma.package.delete({ where: { id: pkg.id } });

    broadcastRealtimeEvent('products-catalog-realtime', 'PACKAGE_DELETED', { id: pkg.id });
    return res.status(200).json({ message: 'Package deleted successfully', id: pkg.id });
  } catch (error: any) {
    console.error('Delete package error:', error);
    return res.status(500).json({ error: 'Failed to delete package' });
  }
});

export default router;
