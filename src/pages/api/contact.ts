import type { APIRoute } from 'astro';

export const prerender = false;

const CONTACT_TO = 'info@vorasec.com';
const CONTACT_FROM = 'website@forms.vorasec.com';
const TEST_SECRET_KEY = '1x0000000000000000000000000000000AA';
const ALLOWED_INTERESTS = new Set([
  'Help me choose',
  'Essentials',
  'Account Protection',
  'Exposure Review',
  'Personal Protection Care',
  'Network Deployment',
  'Ongoing Home Security Care',
  'Group Cybersecurity Education',
  'Current Client - Scam Concierge',
  'Current Client - Breached or Compromised Account',
  'Current Client - Home Network Support',
  'General Inquiry',
]);
const ALLOWED_RETURN_PATHS = new Set([
  '/services',
  '/services/personal-protection',
  '/services/home-network-protection',
]);

interface TurnstileResult {
  success: boolean;
  hostname?: string;
  action?: string;
}

interface ContactEmailBinding {
  send(message: {
    to: string;
    from: { email: string; name: string };
    replyTo: { email: string; name: string };
    subject: string;
    text: string;
    html: string;
  }): Promise<{ messageId: string }>;
}

interface ContactEnv {
  CONTACT_EMAIL?: ContactEmailBinding;
  TURNSTILE_SECRET_KEY?: string;
}

const readField = (form: FormData, name: string) => {
  const value = form.get(name);
  return typeof value === 'string' ? value.trim() : '';
};

const escapeHtml = (value: string) => value.replace(/[&<>'"]/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  "'": '&#39;',
  '"': '&quot;',
})[character] ?? character);

const redirectToContact = (request: Request, status: string, requestedPath = '') => {
  const returnPath = ALLOWED_RETURN_PATHS.has(requestedPath) ? requestedPath : '/services';
  const destination = new URL(returnPath, request.url);
  destination.searchParams.set('contact', status);
  destination.hash = 'contact';
  return Response.redirect(destination, 303);
};

export const POST: APIRoute = async ({ request, locals }) => {
  const requestUrl = new URL(request.url);
  const origin = request.headers.get('Origin');
  if (origin && origin !== requestUrl.origin) {
    return new Response('Forbidden', { status: 403 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return redirectToContact(request, 'invalid');
  }

  const returnTo = readField(form, 'returnTo');

  // Silently accept automated submissions that fill the hidden field.
  if (readField(form, 'website')) {
    return redirectToContact(request, 'success', returnTo);
  }

  const name = readField(form, 'name');
  const email = readField(form, 'email').toLowerCase();
  const household = readField(form, 'household');
  const interest = readField(form, 'interest');
  const message = readField(form, 'message');
  const turnstileToken = readField(form, 'cf-turnstile-response');

  const emailIsValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const fieldsAreValid = name.length >= 2
    && name.length <= 120
    && email.length <= 254
    && emailIsValid
    && household.length <= 120
    && ALLOWED_INTERESTS.has(interest)
    && message.length >= 20
    && message.length <= 5000
    && turnstileToken.length > 0;

  if (!fieldsAreValid) {
    return redirectToContact(request, 'invalid', returnTo);
  }

  const env = locals.runtime.env as unknown as ContactEnv;
  const turnstileSecret = env.TURNSTILE_SECRET_KEY
    || (import.meta.env.DEV ? TEST_SECRET_KEY : '');

  if (!turnstileSecret || !env.CONTACT_EMAIL) {
    return redirectToContact(request, 'error', returnTo);
  }

  const verificationBody = new FormData();
  verificationBody.set('secret', turnstileSecret);
  verificationBody.set('response', turnstileToken);
  verificationBody.set('remoteip', request.headers.get('CF-Connecting-IP') ?? '');

  let verification: TurnstileResult;
  try {
    const verificationResponse = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      { method: 'POST', body: verificationBody },
    );
    verification = await verificationResponse.json() as TurnstileResult;
  } catch {
    return redirectToContact(request, 'verification', returnTo);
  }

  const usingTestSecret = turnstileSecret === TEST_SECRET_KEY;
  const hostnameMatches = verification.hostname === requestUrl.hostname;
  const productionMetadataMatches = hostnameMatches && verification.action === 'contact';
  if (!verification.success || (!usingTestSecret && !productionMetadataMatches)) {
    return redirectToContact(request, 'verification', returnTo);
  }

  const safeName = escapeHtml(name);
  const safeEmail = escapeHtml(email);
  const safeHousehold = escapeHtml(household || 'Not provided');
  const safeInterest = escapeHtml(interest);
  const safeMessage = escapeHtml(message).replace(/\n/g, '<br />');
  const householdLine = household || 'Not provided';

  try {
    await env.CONTACT_EMAIL.send({
      to: CONTACT_TO,
      from: { email: CONTACT_FROM, name: 'VoraSec Website' },
      replyTo: { email, name },
      subject: `VoraSec inquiry: ${interest}`,
      text: [
        `Name: ${name}`,
        `Email: ${email}`,
        `Household or group: ${householdLine}`,
        `Area of interest: ${interest}`,
        '',
        message,
      ].join('\n'),
      html: [
        '<h1>New VoraSec inquiry</h1>',
        `<p><strong>Name:</strong> ${safeName}<br />`,
        `<strong>Email:</strong> ${safeEmail}<br />`,
        `<strong>Household or group:</strong> ${safeHousehold}<br />`,
        `<strong>Area of interest:</strong> ${safeInterest}</p>`,
        `<p>${safeMessage}</p>`,
      ].join(''),
    });
  } catch {
    return redirectToContact(request, 'error', returnTo);
  }

  return redirectToContact(request, 'success', returnTo);
};

export const ALL: APIRoute = () => new Response('Method not allowed', {
  status: 405,
  headers: { Allow: 'POST' },
});
