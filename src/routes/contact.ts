import { Router, Request, Response } from 'express';
import prisma from '../prisma';
import { broadcastRealtimeEvent } from '../lib/supabase';

const router = Router();

// ─── POST /api/contact ────────────────────────────────────────────────────────
// Submit a customer support / contact message
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, email, phone, telegram, subject, message, txnId } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ error: 'A valid email address is required' });
    }

    if (!subject || typeof subject !== 'string' || !subject.trim()) {
      return res.status(400).json({ error: 'Subject is required' });
    }

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'Message content is required' });
    }

    const contactMessage = await prisma.contactMessage.create({
      data: {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone ? phone.trim() : null,
        telegram: telegram ? telegram.trim() : null,
        subject: subject.trim(),
        message: message.trim(),
        txnId: txnId ? txnId.trim() : null,
        status: 'PENDING',
      },
    });

    // Notify admins in realtime via Supabase broadcast if available
    try {
      await broadcastRealtimeEvent('contact_messages', 'INSERT', contactMessage);
    } catch (realtimeErr) {
      console.warn('Realtime event notification failed:', realtimeErr);
    }

    return res.status(201).json({
      success: true,
      message: 'Your message has been sent successfully! Our support team will review and respond promptly.',
      ticketId: contactMessage.id,
      data: contactMessage,
    });
  } catch (error: any) {
    console.error('Submit contact message error:', error);
    return res.status(500).json({
      error: 'Failed to submit contact message. Please try again or reach us directly on Telegram.',
    });
  }
});

// ─── GET /api/contact/ticket/:id ──────────────────────────────────────────────
// Check status of a specific support ticket
router.get('/ticket/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const ticket = await prisma.contactMessage.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        subject: true,
        status: true,
        reply: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!ticket) {
      return res.status(404).json({ error: 'Support ticket not found' });
    }

    return res.status(200).json({ success: true, ticket });
  } catch (error: any) {
    console.error('Fetch ticket status error:', error);
    return res.status(500).json({ error: 'Failed to fetch ticket status' });
  }
});

export default router;
