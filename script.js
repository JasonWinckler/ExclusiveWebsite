const animatedElements = document.querySelectorAll('[data-animate]');

if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.16 });

  animatedElements.forEach((element) => observer.observe(element));
} else {
  animatedElements.forEach((element) => element.classList.add('is-visible'));
}

const ageGate = document.querySelector('[data-age-gate]');
const ageConfirmButton = document.querySelector('[data-age-confirm]');
const ageStorageKey = 'jason-shadow-exclusive-age-confirmed';

const unlockAdultSite = () => {
  document.body.classList.remove('is-age-locked');
  if (ageGate) ageGate.hidden = true;
};

if (window.localStorage.getItem(ageStorageKey) === 'true') {
  unlockAdultSite();
}

ageConfirmButton?.addEventListener('click', () => {
  window.localStorage.setItem(ageStorageKey, 'true');
  unlockAdultSite();
});
