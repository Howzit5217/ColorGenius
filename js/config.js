/* Site settings that belong to whoever runs this copy of ColorGenius.

   EMAIL: the Email buttons can send the list straight from the site's own do-not-reply address, so nobody
   needs an email app (handy on a store kiosk). It uses EmailJS (free plan, about 200 emails a month) with a
   Gmail account made just for this. The three IDs below are public ones from the EmailJS dashboard, safe to
   keep here. While they're empty, the Email buttons open the device's own email app instead.
   Setup steps are in README.md under "Email". */
window.CG_CONFIG = {
  email: {
    serviceId: 'service_color6529',     // EmailJS → Email Services → the Gmail service → Service ID
    templateId: 'template_s0d3z6e',     // EmailJS → Email Templates → the template → Settings → Template ID
    publicKey: 'M1MNTNLwogTu7OrEJ',     // EmailJS → Account → General → Public Key
    fromName: 'ColorGenius (do not reply)',
  },
};
