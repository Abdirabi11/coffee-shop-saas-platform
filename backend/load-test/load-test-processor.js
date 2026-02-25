const crypto = require('crypto');

module.exports = {
    generateStripeSignature: function(context, events, done) {
      const payload = JSON.stringify(context.vars.$request.json);
      const secret = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_test';
      const timestamp = Math.floor(Date.now() / 1000);
      
      const signedPayload = `${timestamp}.${payload}`;
      const signature = crypto
        .createHmac('sha256', secret)
        .update(signedPayload)
        .digest('hex');
      
      context.vars.stripeSignature = `t=${timestamp},v1=${signature}`;
      return done();
    },
};