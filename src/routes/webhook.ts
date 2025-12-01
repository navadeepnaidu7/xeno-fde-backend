import { Router, Request, Response } from 'express';
import { verifyHmac, findTenantByDomain, routeWebhook } from '../webhook';

const router = Router();

// POST /webhook/shopify - Handle Shopify webhooks
router.post('/shopify', async (req: Request, res: Response) => {
  try {
    const hmacHeader = req.get('X-Shopify-Hmac-Sha256');
    const topic = req.get('X-Shopify-Topic');
    const shopDomain = req.get('X-Shopify-Shop-Domain');

    // Validate required headers
    if (!hmacHeader || !topic || !shopDomain) {
      console.log('Missing required Shopify headers');
      return res.status(400).json({ error: 'Missing required headers' });
    }

    // Get raw body for HMAC verification
    const rawBody = req.rawBody;
    if (!rawBody) {
      console.log('Raw body not captured');
      return res.status(500).json({ error: 'Raw body not available' });
    }

    // Find tenant by shop domain
    const tenant = await findTenantByDomain(shopDomain);
    if (!tenant) {
      console.log(`Tenant not found for shop: ${shopDomain}`);
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Verify HMAC signature
    const isValid = verifyHmac(rawBody, hmacHeader, tenant.webhookSecret);
    if (!isValid) {
      console.log(`HMAC verification failed for shop: ${shopDomain}`);
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Process the webhook
    console.log(`Processing webhook: ${topic} for ${shopDomain}`);
    await routeWebhook(tenant.id, topic, req.body);

    // Shopify expects 200 OK response
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Webhook processing error:', error);
    // Return 200 to prevent Shopify retries on internal errors
    // Log the error for debugging but acknowledge receipt
    res.status(200).json({ success: false, error: 'Processing error logged' });
  }
});

export default router;
