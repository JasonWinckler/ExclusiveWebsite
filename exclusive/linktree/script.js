const animatedElements = document.querySelectorAll('[data-animate]');

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add('is-visible');
    }
  });
}, { threshold: 0.2 });

animatedElements.forEach((element) => observer.observe(element));


const sensitiveLink = document.querySelector('[data-sensitive-link]');
const sensitiveModal = document.querySelector('[data-sensitive-modal]');
const sensitiveDialog = sensitiveModal?.querySelector('.sensitive-modal__dialog');
const sensitiveContinueButton = sensitiveModal?.querySelector('[data-sensitive-continue]');
const sensitiveCancelButtons = sensitiveModal?.querySelectorAll('[data-sensitive-cancel]');
let pendingSensitiveUrl = '';

const openSensitiveModal = (event) => {
  if (!sensitiveModal) return;

  event.preventDefault();

  pendingSensitiveUrl = sensitiveLink?.href || '';
  sensitiveModal.hidden = false;
  document.body.classList.add('modal-open');
  sensitiveDialog?.focus();
};

const closeSensitiveModal = () => {
  if (!sensitiveModal) return;

  sensitiveModal.hidden = true;
  document.body.classList.remove('modal-open');
  pendingSensitiveUrl = '';
  sensitiveLink?.focus();
};

const continueToSensitiveContent = () => {
  if (!pendingSensitiveUrl) return;

  window.open(pendingSensitiveUrl, sensitiveLink?.target || '_self', 'noopener,noreferrer');
  closeSensitiveModal();
};

sensitiveLink?.addEventListener('click', openSensitiveModal);
sensitiveContinueButton?.addEventListener('click', continueToSensitiveContent);
sensitiveCancelButtons?.forEach((button) => button.addEventListener('click', closeSensitiveModal));

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && sensitiveModal && !sensitiveModal.hidden) {
    closeSensitiveModal();
  }
});

const openPaypalButton = document.querySelector('[data-paypal-open]');
const paypalDonateContainer = document.querySelector('#paypal-donate-button-container');
const paypalDonationUrl = 'https://www.paypal.com/donate/?hosted_button_id=U87BSM6V2TXLC';
const paypalHostedButtonId = 'U87BSM6V2TXLC';

const renderPaypalHostedButton = () => {
  if (!window.PayPal?.Donation || !paypalDonateContainer) return;

  window.PayPal.Donation.Button({
    env: 'production',
    hosted_button_id: paypalHostedButtonId,
    image: {
      src: 'https://www.paypalobjects.com/en_US/DK/i/btn/btn_donateCC_LG.gif',
      alt: 'Donate with PayPal button',
      title: 'PayPal - The safer, easier way to pay online!',
    },
  }).render('#paypal-donate-button-container');
};

const triggerPaypalHostedButton = () => {
  const sdkButton = paypalDonateContainer?.querySelector('button, input, img, a');

  if (sdkButton) {
    sdkButton.click();
    return;
  }

  window.location.href = paypalDonationUrl;
};

openPaypalButton?.addEventListener('click', triggerPaypalHostedButton);

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', renderPaypalHostedButton);
} else {
  renderPaypalHostedButton();
}
